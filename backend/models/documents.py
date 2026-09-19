from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base

EMBEDDING_DIMENSIONS = 1536


class DocumentStatus(StrEnum):
    PENDING = 'PENDING'
    PROCESSING = 'PROCESSING'
    READY = 'READY'
    FAILED = 'FAILED'


class Document(Base):
    __tablename__ = 'documents'
    __table_args__ = (UniqueConstraint('id', 'organization_id'),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey('organizations.id', ondelete='CASCADE'), index=True
    )
    uploaded_by: Mapped[UUID | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL')
    )
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name='document_status')
    )
    storage_key: Mapped[str | None] = mapped_column(String(1024))
    processing_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DocumentChunk(Base):
    __tablename__ = 'document_chunks'
    __table_args__ = (
        ForeignKeyConstraint(
            ['document_id', 'organization_id'],
            ['documents.id', 'documents.organization_id'],
            ondelete='CASCADE',
        ),
        UniqueConstraint('document_id', 'chunk_index'),
        Index(
            'ix_document_chunks_embedding',
            'embedding',
            postgresql_using='hnsw',
            postgresql_ops={'embedding': 'vector_cosine_ops'},
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(index=True)
    document_id: Mapped[UUID]
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(
        Vector(EMBEDDING_DIMENSIONS)
    )
    chunk_index: Mapped[int]
    page_number: Mapped[int | None]
