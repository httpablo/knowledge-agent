import httpx
import pytest
from openai import APITimeoutError, OpenAIError
from openai.types import CreateEmbeddingResponse, Embedding
from openai.types.create_embedding_response import Usage
from tenacity import wait_none

from models import EMBEDDING_DIMENSIONS
from services import embeddings
from services.embeddings import (
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_MAX_ATTEMPTS,
    EMBEDDING_TIMEOUT_SECONDS,
    EmbeddingError,
    TransientEmbeddingError,
    embed_texts,
    embedding_client,
)


def _response(count: int, dimensions: int = EMBEDDING_DIMENSIONS) -> object:
    return CreateEmbeddingResponse(
        data=[
            Embedding(
                embedding=[0.1] * dimensions, index=index, object='embedding'
            )
            for index in range(count)
        ],
        model='text-embedding-3-small',
        object='list',
        usage=Usage(prompt_tokens=1, total_tokens=1),
    )


class FakeEmbeddingsApi:
    def __init__(self, responses: list[object]) -> None:
        self.responses = responses
        self.batches: list[list[str]] = []
        self.dimensions: list[int] = []

    async def create(
        self, *, model: str, input: list[str], dimensions: int
    ) -> object:
        self.batches.append(input)
        self.dimensions.append(dimensions)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class FakeClient:
    def __init__(self, responses: list[object]) -> None:
        self.embeddings = FakeEmbeddingsApi(responses)


@pytest.fixture(autouse=True)
def no_retry_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        embeddings._request_embeddings.retry, 'wait', wait_none()
    )


def _timeout() -> APITimeoutError:
    return APITimeoutError(request=httpx.Request('POST', 'http://openai'))


async def test_texts_are_embedded_in_batches() -> None:
    texts = [f'chunk {index}' for index in range(EMBEDDING_BATCH_SIZE + 3)]
    client = FakeClient([_response(EMBEDDING_BATCH_SIZE), _response(3)])

    vectors = await embed_texts(client, texts)

    assert len(vectors) == len(texts)
    assert [len(batch) for batch in client.embeddings.batches] == [
        EMBEDDING_BATCH_SIZE,
        3,
    ]
    assert client.embeddings.dimensions == [
        EMBEDDING_DIMENSIONS,
        EMBEDDING_DIMENSIONS,
    ]


async def test_vectors_follow_the_response_index() -> None:
    response = _response(3)
    response.data[0].embedding = [0.3] * EMBEDDING_DIMENSIONS
    response.data.reverse()
    client = FakeClient([response])

    vectors = await embed_texts(client, ['a', 'b', 'c'])

    assert vectors[0][0] == 0.3


async def test_missing_embeddings_are_rejected() -> None:
    client = FakeClient([_response(2)])

    with pytest.raises(EmbeddingError, match='Expected 3 embeddings, got 2'):
        await embed_texts(client, ['a', 'b', 'c'])


async def test_wrong_dimensions_are_rejected() -> None:
    client = FakeClient([_response(1, dimensions=512)])

    with pytest.raises(EmbeddingError, match='must have 1536 dimensions'):
        await embed_texts(client, ['a'])


async def test_transient_errors_are_retried_before_succeeding() -> None:
    client = FakeClient([_timeout(), _response(1)])

    vectors = await embed_texts(client, ['a'])

    assert len(vectors) == 1
    assert len(client.embeddings.batches) == 2


async def test_transient_errors_stop_after_the_last_attempt() -> None:
    client = FakeClient([_timeout() for _ in range(EMBEDDING_MAX_ATTEMPTS)])

    with pytest.raises(TransientEmbeddingError) as error:
        await embed_texts(client, ['a'])

    assert isinstance(error.value.__cause__, APITimeoutError)
    assert len(client.embeddings.batches) == EMBEDDING_MAX_ATTEMPTS


async def test_permanent_errors_are_not_retried() -> None:
    client = FakeClient([OpenAIError('invalid api key')])

    with pytest.raises(EmbeddingError) as error:
        await embed_texts(client, ['a'])

    assert not isinstance(error.value, TransientEmbeddingError)
    assert len(client.embeddings.batches) == 1


async def test_client_disables_sdk_retries_and_sets_a_timeout() -> None:
    async with embedding_client() as client:
        assert client.max_retries == 0
        assert client.timeout == EMBEDDING_TIMEOUT_SECONDS
        assert client.is_closed() is False
    assert client.is_closed() is True
