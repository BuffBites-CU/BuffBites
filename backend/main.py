import asyncio
import contextlib
import os
import time
import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from body_limit import BodySizeLimitMiddleware

load_dotenv()

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    from database import client, ensure_indexes
    from menu_store import refresh_loop

    # Pull the latest scraped menus from GitHub so the API doesn't depend on a
    # redeploy to see the daily scrape.
    app.state.menu_refresh_task = asyncio.create_task(refresh_loop())
    try:
        await ensure_indexes()
        logger.info("startup_indexes_ready")
    except Exception as e:
        logger.warning("startup_indexes_failed", error=str(e))

    yield

    app.state.menu_refresh_task.cancel()
    # A loop that already died re-raises its error here; shutdown goes on regardless.
    with contextlib.suppress(asyncio.CancelledError, Exception):
        await app.state.menu_refresh_task
    client.close()


app = FastAPI(title="BuffBites API", lifespan=lifespan)


_WEBHOOK_PREFIX = "/api/strava/webhook/"


def _loggable_path(path: str) -> str:
    """The Strava webhook's callback URL ends in its secret; keep it out of logs."""
    return _WEBHOOK_PREFIX + "<redacted>" if path.startswith(_WEBHOOK_PREFIX) else path


@app.middleware("http")
async def log_request(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    logger.info(
        "request",
        method=request.method,
        path=_loggable_path(request.url.path),
        status=response.status_code,
        duration_ms=duration_ms,
    )
    return response

# Routers
from routers.users import router as users_router
from routers.community import router as community_router
from routers.combos import router as combos_router
from routers.comments import router as comments_router
from routers.vision import router as vision_router
from routers.strava import router as strava_router
from routers.strava_webhook import router as strava_webhook_router
from routers.coach import router as coach_router


app.include_router(users_router)
app.include_router(community_router)
app.include_router(combos_router)
app.include_router(comments_router)
app.include_router(vision_router)
app.include_router(strava_router)
app.include_router(strava_webhook_router)
app.include_router(coach_router)

# CORS — lock to known origins in production via ALLOWED_ORIGINS (comma-separated).
# Falls back to "*" with a loud warning so existing deploys keep working, but you
# should set ALLOWED_ORIGINS to your real frontend domains.
_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
if _origins_env:
    _allow_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]
else:
    logger.warning(
        "cors_wildcard",
        msg="ALLOWED_ORIGINS not set — allowing all origins. Set it to your frontend domains in production.",
    )
    _allow_origins = ["*"]

# Added before CORS so CORS stays the outer layer and 413s still carry CORS
# headers. 8 MB fits a 5 MB photo as base64 plus JSON; nothing else is close.
app.add_middleware(BodySizeLimitMiddleware, max_bytes=8 * 1024 * 1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    # Vercel preview/prod deployments get rotating subdomains; allow them by regex.
    allow_origin_regex=r"https://.*\.vercel\.app",
    # Auth is a bearer header, never cookies, so cross-site credentials stay off.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "BuffBites API is running"}


@app.get("/healthz")
def healthz():
    """Liveness only: no DB call, so a Mongo blip doesn't get the machine restarted."""
    return {"status": "ok"}


@app.get("/health")
async def health():
    from database import client
    try:
        await client.admin.command("ping")
        db_status = "ok"
    except Exception as e:
        logger.warning("health_check_db_failure", error=str(e))
        return JSONResponse(status_code=503, content={"status": "degraded", "db": "unreachable"})
    return {"status": "ok", "db": db_status}
