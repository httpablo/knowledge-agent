from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from core.database import engine
from routes import api_router
from services.storage import storage


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await storage.ensure_bucket()
    yield
    await engine.dispose()


app = FastAPI(title='Knowledge Agent', lifespan=lifespan)

app.include_router(api_router)
