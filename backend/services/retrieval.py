from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from models import Document, DocumentChunk, DocumentStatus
from services.embeddings import embed_texts, embedding_client

TOP_K = 5


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: UUID
    document_id: UUID
    filename: str
    page_number: int | None
    content: str
    distance: float


async def search_chunks(
    session: AsyncSession,
    organization_id: UUID,
    question: str,
    top_k: int = TOP_K,
) -> list[RetrievedChunk]:
    async with embedding_client() as client:
        [question_embedding] = await embed_texts(client, [question])

    distance = DocumentChunk.embedding.cosine_distance(question_embedding)
    async with session.begin():
        await session.execute(
            text("SET LOCAL hnsw.iterative_scan = 'strict_order'")
        )
        rows = (
            await session.execute(
                select(
                    DocumentChunk.id,
                    DocumentChunk.document_id,
                    Document.filename,
                    DocumentChunk.page_number,
                    DocumentChunk.content,
                    distance.label('distance'),
                )
                .join(
                    Document,
                    and_(
                        Document.id == DocumentChunk.document_id,
                        Document.organization_id
                        == DocumentChunk.organization_id,
                    ),
                )
                .where(
                    DocumentChunk.organization_id == organization_id,
                    Document.status == DocumentStatus.READY,
                )
                .order_by(distance)
                .limit(top_k)
            )
        ).all()

    return [RetrievedChunk(*row) for row in rows]
