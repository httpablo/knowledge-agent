from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    StringConstraints,
)

from models import MessageRole

Question = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2000),
]


class ChatRequest(BaseModel):
    question: Question
    conversation_id: UUID | None = None


class SourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    chunk_id: UUID
    document_id: UUID
    filename: str
    page_number: int | None
    content: str


Sources = Annotated[
    list[SourceResponse], BeforeValidator(lambda value: value or [])
]


class ChatResponse(BaseModel):
    conversation_id: UUID
    message_id: UUID
    answerable: bool
    answer: str
    sources: Sources


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: MessageRole
    content: str
    sources: Sources
    created_at: datetime
