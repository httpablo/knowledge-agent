from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
)

from models import MessageRole

Question = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2000),
]


class ChatRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            'examples': [
                {'question': "What is Project Orion's launch code?"},
                {
                    'question': 'And what about the backup code?',
                    'conversation_id': (
                        'c1b1c6f0-6a3b-4f8e-9c9a-2f6a1e7d9b2a'
                    ),
                },
            ]
        }
    )

    question: Question
    conversation_id: UUID | None = Field(
        default=None,
        description=(
            'Omit on the first message of a conversation. On follow-up '
            'questions, send the conversation_id returned by the previous '
            'response.'
        ),
    )


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
