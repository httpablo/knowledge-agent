import asyncio
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from core.settings import settings
from services import ingestion
from services.storage import storage
from tasks.celery_app import celery_app

engine = create_async_engine(
    settings.DATABASE_URL.get_secret_value(), poolclass=NullPool
)


@celery_app.task
def process_document(document_id: str) -> None:
    asyncio.run(_process_document(UUID(document_id)))


async def _process_document(document_id: UUID) -> None:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        await ingestion.process_document(session, storage, document_id)
