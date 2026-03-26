import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(title="BuffBites API")


@app.middleware("http")
async def log_response(request: Request, call_next):
    response = await call_next(request)
    body = b""
    async for chunk in response.body_iterator:
        body += chunk
    try:
        parsed = json.loads(body)
        print(f"\n--- {request.method} {request.url} ---")
        print(json.dumps(parsed, indent=2))
    except Exception:
        pass
    return Response(content=body, status_code=response.status_code,
                    headers=dict(response.headers), media_type=response.media_type)

# Routers
from routers.users import router as users_router
from routers.community import router as community_router
from routers.combos import router as combos_router

app.include_router(users_router)
app.include_router(community_router)
app.include_router(combos_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "BuffBites API is running"}
