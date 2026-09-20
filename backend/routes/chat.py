from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from core.database import SessionDep
from core.dependencies import Auth
from schemas.chat import ChatRequest, ChatResponse, MessageResponse
from services import chat as chat_service
from services.llm_client import LLMError

router = APIRouter(tags=['chat'])

CONVERSATION_NOT_FOUND = 'Conversation not found'
ASSISTANT_UNAVAILABLE = 'The assistant is temporarily unavailable'


@router.post('/chat', response_model=ChatResponse)
async def ask(
    data: ChatRequest, auth: Auth, session: SessionDep
) -> ChatResponse:
    try:
        answered = await chat_service.answer_in_conversation(
            session,
            auth.organization.id,
            auth.user.id,
            data.question,
            data.conversation_id,
        )
    except chat_service.ConversationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=CONVERSATION_NOT_FOUND,
        ) from exc
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ASSISTANT_UNAVAILABLE,
        ) from exc

    return ChatResponse(
        conversation_id=answered.conversation_id,
        message_id=answered.message_id,
        answerable=answered.answer.answerable,
        answer=answered.answer.answer,
        sources=answered.answer.citations,
    )


@router.get(
    '/conversations/{conversation_id}/messages',
    response_model=list[MessageResponse],
)
async def list_messages(
    conversation_id: UUID, auth: Auth, session: SessionDep
) -> list[MessageResponse]:
    try:
        messages = await chat_service.list_messages(
            session, auth.organization.id, auth.user.id, conversation_id
        )
    except chat_service.ConversationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=CONVERSATION_NOT_FOUND,
        ) from exc

    return [MessageResponse.model_validate(message) for message in messages]
