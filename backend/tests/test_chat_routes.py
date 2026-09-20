from http import HTTPStatus
from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Conversation, Message, MessageRole
from services.llm_client import GroundedAnswer, TransientLLMError
from tests.conftest import FakeLLM, MakeUser, RegisteredUser, make_document

QUESTION = 'Quantos dias de férias por ano?'
CHUNK = 'Cada colaborador tem 30 dias de férias por ano.'


async def _messages(
    session: AsyncSession, conversation_id: UUID
) -> list[Message]:
    async with session.begin():
        return list(
            await session.scalars(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at, Message.role)
            )
        )


async def test_chat_creates_a_conversation_and_persists_both_messages(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    llm: FakeLLM,
) -> None:
    await make_document(session, user.organization_id, 'policy.pdf', [CHUNK])
    llm.answers(
        GroundedAnswer(
            answerable=True, answer='São 30 dias.', source_ids=['S1']
        )
    )

    response = await client.post(
        '/chat', headers=user.headers, json={'question': QUESTION}
    )

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body['answerable'] is True
    assert body['answer'] == 'São 30 dias.'
    [source] = body['sources']
    assert source['filename'] == 'policy.pdf'
    assert source['content'] == CHUNK

    conversation_id = UUID(body['conversation_id'])
    async with session.begin():
        conversation = await session.get(Conversation, conversation_id)
    assert conversation.organization_id == user.organization_id
    assert conversation.user_id == user.id

    question, answer = await _messages(session, conversation_id)
    assert question.role == MessageRole.USER
    assert question.content == QUESTION
    assert answer.role == MessageRole.ASSISTANT
    assert answer.content == 'São 30 dias.'
    assert answer.sources == body['sources']
    assert str(answer.id) == body['message_id']


async def test_chat_appends_to_an_existing_conversation(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    llm: FakeLLM,
) -> None:
    await make_document(session, user.organization_id, 'policy.pdf', [CHUNK])
    first = await client.post(
        '/chat', headers=user.headers, json={'question': QUESTION}
    )
    conversation_id = first.json()['conversation_id']

    second = await client.post(
        '/chat',
        headers=user.headers,
        json={'question': QUESTION, 'conversation_id': conversation_id},
    )

    assert second.json()['conversation_id'] == conversation_id
    assert len(await _messages(session, UUID(conversation_id))) == 4


async def test_unanswerable_question_is_persisted_without_sources(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    llm: FakeLLM,
) -> None:
    await make_document(session, user.organization_id, 'policy.pdf', [CHUNK])
    llm.answers(GroundedAnswer(answerable=False, answer='', source_ids=[]))

    response = await client.post(
        '/chat', headers=user.headers, json={'question': QUESTION}
    )

    body = response.json()
    assert body['answerable'] is False
    assert not body['answer']
    assert body['sources'] == []

    _, answer = await _messages(session, UUID(body['conversation_id']))
    assert not answer.content
    assert answer.sources == []


async def test_model_failure_returns_503_without_persisting_an_answer(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    llm: FakeLLM,
) -> None:
    await make_document(session, user.organization_id, 'policy.pdf', [CHUNK])
    llm.answers(TransientLLMError('unavailable'))

    response = await client.post(
        '/chat', headers=user.headers, json={'question': QUESTION}
    )

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    async with session.begin():
        conversation_id = await session.scalar(select(Conversation.id))
    messages = await _messages(session, conversation_id)
    assert [message.role for message in messages] == [MessageRole.USER]


async def test_chat_rejects_a_conversation_from_another_organization(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    make_user: MakeUser,
) -> None:
    other = await make_user(name='Bob', email='bob@example.com')
    conversation = Conversation(
        organization_id=other.organization_id, user_id=other.id
    )
    async with session.begin():
        session.add(conversation)

    response = await client.post(
        '/chat',
        headers=user.headers,
        json={
            'question': QUESTION,
            'conversation_id': str(conversation.id),
        },
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


async def test_chat_rejects_a_conversation_from_another_user(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    make_user: MakeUser,
) -> None:
    other = await make_user(name='Bob', email='bob@example.com')
    conversation = Conversation(
        organization_id=user.organization_id, user_id=other.id
    )
    async with session.begin():
        session.add(conversation)

    response = await client.post(
        '/chat',
        headers=user.headers,
        json={
            'question': QUESTION,
            'conversation_id': str(conversation.id),
        },
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


async def test_chat_rejects_an_unknown_conversation(
    client: AsyncClient, user: RegisteredUser
) -> None:
    response = await client.post(
        '/chat',
        headers=user.headers,
        json={'question': QUESTION, 'conversation_id': str(uuid4())},
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


async def test_chat_validates_the_question(
    client: AsyncClient, user: RegisteredUser
) -> None:
    response = await client.post(
        '/chat', headers=user.headers, json={'question': '   '}
    )

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


async def test_history_returns_messages_with_the_same_citations(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    llm: FakeLLM,
) -> None:
    await make_document(session, user.organization_id, 'policy.pdf', [CHUNK])
    posted = (
        await client.post(
            '/chat', headers=user.headers, json={'question': QUESTION}
        )
    ).json()

    response = await client.get(
        f'/conversations/{posted["conversation_id"]}/messages',
        headers=user.headers,
    )

    assert response.status_code == HTTPStatus.OK
    question, answer = response.json()
    assert question['role'] == MessageRole.USER
    assert question['content'] == QUESTION
    assert question['sources'] == []
    assert answer['role'] == MessageRole.ASSISTANT
    assert answer['id'] == posted['message_id']
    assert answer['content'] == posted['answer']
    assert answer['sources'] == posted['sources']


async def test_history_of_another_user_is_not_found(
    client: AsyncClient,
    session: AsyncSession,
    user: RegisteredUser,
    make_user: MakeUser,
) -> None:
    other = await make_user(name='Bob', email='bob@example.com')
    conversation = Conversation(
        organization_id=other.organization_id, user_id=other.id
    )
    async with session.begin():
        session.add(conversation)

    response = await client.get(
        f'/conversations/{conversation.id}/messages', headers=user.headers
    )

    assert response.status_code == HTTPStatus.NOT_FOUND


async def test_chat_requires_authentication(client: AsyncClient) -> None:
    ask = await client.post('/chat', json={'question': QUESTION})
    history = await client.get(f'/conversations/{uuid4()}/messages')

    assert ask.status_code == HTTPStatus.UNAUTHORIZED
    assert history.status_code == HTTPStatus.UNAUTHORIZED
