import asyncio
import math
import os
import re
from binascii import crc32
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import make_url, select, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
)
from sqlalchemy.pool import NullPool


def _get_test_database_url() -> str:
    url = os.environ.get('TEST_DATABASE_URL', '')
    database = make_url(url).database if url else None
    if not database or not database.endswith('_test'):
        pytest.exit(
            'TEST_DATABASE_URL must point to a database whose name ends '
            "with '_test'; the suite truncates every table between tests.",
            returncode=1,
        )
    return url


TEST_DATABASE_URL = _get_test_database_url()

os.environ['DATABASE_URL'] = TEST_DATABASE_URL

from core.database import get_session
from core.security import decode_access_token
from main import app
from models import (
    EMBEDDING_DIMENSIONS,
    Document,
    DocumentChunk,
    DocumentStatus,
    OrganizationMembership,
)
from schemas.auth import RegisterRequest
from services import auth as auth_service
from services import chat as chat_service
from services import documents as documents_service
from services import ingestion as ingestion_service
from services import retrieval as retrieval_service
from services.llm_client import GroundedAnswer
from services.storage import get_storage

ALEMBIC_INI = Path(__file__).resolve().parents[1] / 'alembic.ini'


MakeUser = Callable[..., Awaitable['RegisteredUser']]


@dataclass(frozen=True)
class RegisteredUser:
    id: UUID
    organization_id: UUID
    email: str
    password: str
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return {'Authorization': f'Bearer {self.token}'}


class InMemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.downloaded: list[str] = []

    async def upload(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data

    async def download(self, key: str) -> bytes:
        self.downloaded.append(key)
        return self.objects[key]

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)


@asynccontextmanager
async def fake_embedding_client() -> AsyncIterator[None]:
    yield None


def fake_embedding(text: str) -> list[float]:
    vector = [0.001] * EMBEDDING_DIMENSIONS
    for word in re.findall(r'\w+', text.lower()):
        vector[crc32(word.encode()) % EMBEDDING_DIMENSIONS] += 1.0
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector]


class FakeEmbeddings:
    def __init__(self) -> None:
        self.batches: list[list[str]] = []
        self.error: Exception | None = None

    async def __call__(
        self, client: None, texts: list[str]
    ) -> list[list[float]]:
        self.batches.append(texts)
        if self.error:
            raise self.error
        return [fake_embedding(text) for text in texts]


@pytest.fixture(autouse=True)
def embeddings(monkeypatch: pytest.MonkeyPatch) -> FakeEmbeddings:
    fake = FakeEmbeddings()
    monkeypatch.setattr(ingestion_service, 'embed_batch', fake)
    monkeypatch.setattr(
        ingestion_service, 'embedding_client', fake_embedding_client
    )
    monkeypatch.setattr(retrieval_service, 'embed_texts', fake)
    monkeypatch.setattr(
        retrieval_service, 'embedding_client', fake_embedding_client
    )
    return fake


class FakeLLM:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.system_prompts: list[str] = []
        self.responses: list[GroundedAnswer | Exception] = []

    def answers(self, *responses: GroundedAnswer | Exception) -> None:
        self.responses = list(responses)

    @property
    def prompt(self) -> str:
        return self.calls[-1]

    @property
    def system_prompt(self) -> str:
        return self.system_prompts[-1]

    async def __call__(
        self, client: None, system_prompt: str, user_prompt: str
    ) -> GroundedAnswer:
        self.calls.append(user_prompt)
        self.system_prompts.append(system_prompt)
        if not self.responses:
            return GroundedAnswer(
                answerable=True, answer='An answer', source_ids=['S1']
            )
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.fixture(autouse=True)
def llm(monkeypatch: pytest.MonkeyPatch) -> FakeLLM:
    fake = FakeLLM()
    monkeypatch.setattr(chat_service, 'generate_grounded_answer', fake)
    monkeypatch.setattr(chat_service, 'chat_client', fake_embedding_client)
    return fake


async def make_document(
    session: AsyncSession,
    organization_id: UUID,
    filename: str,
    texts: list[str],
    status: DocumentStatus = DocumentStatus.READY,
    embeddings: list[list[float]] | None = None,
) -> Document:
    vectors = embeddings or [fake_embedding(text) for text in texts]
    document = Document(
        id=uuid4(),
        organization_id=organization_id,
        filename=filename,
        status=status,
    )
    async with session.begin():
        session.add(document)
        session.add_all([
            DocumentChunk(
                organization_id=organization_id,
                document_id=document.id,
                content=text,
                embedding=vectors[index],
                chunk_index=index,
                page_number=index + 1,
            )
            for index, text in enumerate(texts)
        ])
    return document


@pytest.fixture(scope='session', autouse=True)
def migrated_database() -> None:
    asyncio.run(_create_test_database())
    config = Config(str(ALEMBIC_INI))
    command.downgrade(config, 'base')
    command.upgrade(config, 'head')


async def _create_test_database() -> None:
    url = make_url(TEST_DATABASE_URL)
    engine = create_async_engine(
        url.set(database='postgres'),
        isolation_level='AUTOCOMMIT',
        poolclass=NullPool,
    )
    async with engine.connect() as conn:
        exists = await conn.scalar(
            text('SELECT 1 FROM pg_database WHERE datname = :name'),
            {'name': url.database},
        )
        if not exists:
            await conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    await engine.dispose()


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    yield engine
    async with engine.begin() as conn:
        await conn.execute(text('TRUNCATE users, organizations CASCADE'))
    await engine.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def storage() -> InMemoryStorage:
    return InMemoryStorage()


@pytest.fixture(autouse=True)
def processing_queue(monkeypatch: pytest.MonkeyPatch) -> list[UUID]:
    queued: list[UUID] = []

    async def enqueue(document_id: UUID) -> None:
        queued.append(document_id)

    monkeypatch.setattr(documents_service, '_enqueue_processing', enqueue)
    return queued


@pytest.fixture
async def client(
    engine: AsyncEngine, storage: InMemoryStorage
) -> AsyncIterator[AsyncClient]:
    async def get_test_session() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    app.dependency_overrides[get_storage] = lambda: storage
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(engine: AsyncEngine) -> MakeUser:
    async def _make_user(
        name: str = 'Alice',
        email: str = 'alice@example.com',
        password: str = 'correct-password',
    ) -> RegisteredUser:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            token = await auth_service.register(
                session,
                RegisterRequest(name=name, email=email, password=password),
            )
            user_id = UUID(decode_access_token(token))
            async with session.begin():
                organization_id = await session.scalar(
                    select(OrganizationMembership.organization_id).where(
                        OrganizationMembership.user_id == user_id
                    )
                )
        return RegisteredUser(
            id=user_id,
            organization_id=organization_id,
            email=email,
            password=password,
            token=token,
        )

    return _make_user


@pytest.fixture
async def user(make_user: MakeUser) -> RegisteredUser:
    return await make_user()
