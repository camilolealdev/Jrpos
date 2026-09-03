import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from auth import auth_router, seed_admin
from db import SessionLocal
from routers.products import products_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with SessionLocal() as session:
        await seed_admin(session)
    yield


app = FastAPI(title="JRPOS API", lifespan=lifespan)

app.include_router(auth_router)
app.include_router(products_router)

_frontend_origins = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_URL", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_frontend_origins,
    allow_origin_regex=os.environ.get("FRONTEND_URL_REGEX") or r"^https://.*\.vercel\.app$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/")
async def root():
    return {"message": "JRPOS API", "status": "ok"}
