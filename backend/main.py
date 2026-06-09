import os
import time
import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

app = FastAPI(title="BuffBites API")


@app.middleware("http")
async def log_request(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    logger.info(
        "request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms,
    )
    return response

# Routers
from routers.users import router as users_router
from routers.community import router as community_router
from routers.combos import router as combos_router
from routers.drafts import router as drafts_router
from routers.comments import router as comments_router


app.include_router(users_router)
app.include_router(community_router)
app.include_router(combos_router)
app.include_router(drafts_router)
app.include_router(comments_router)

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    # Vercel preview/prod deployments get rotating subdomains; allow them by regex.
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    from database import ensure_indexes
    try:
        await ensure_indexes()
        logger.info("startup_indexes_ready")
    except Exception as e:
        logger.warning("startup_indexes_failed", error=str(e))


@app.get("/")
def root():
    return {"message": "BuffBites API is running"}


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
