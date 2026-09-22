from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from openai import (
    APIConnectionError,
    APITimeoutError,
    AsyncOpenAI,
    InternalServerError,
    OpenAIError,
    RateLimitError,
)
from openai.types import CreateEmbeddingResponse
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from core.settings import settings
from models import EMBEDDING_DIMENSIONS

EMBEDDING_BATCH_SIZE = 64
EMBEDDING_TIMEOUT_SECONDS = 30.0
EMBEDDING_MAX_ATTEMPTS = 3

TRANSIENT_ERRORS = (
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
    RateLimitError,
)


class EmbeddingError(Exception):
    pass


class TransientEmbeddingError(EmbeddingError):
    pass


@asynccontextmanager
async def embedding_client() -> AsyncIterator[AsyncOpenAI]:
    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY.get_secret_value(),
        timeout=EMBEDDING_TIMEOUT_SECONDS,
        max_retries=0,
    )
    try:
        yield client
    finally:
        await client.close()


async def embed_texts(
    client: AsyncOpenAI, texts: list[str]
) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[start : start + EMBEDDING_BATCH_SIZE]
        vectors.extend(await embed_batch(client, batch))
    return vectors


async def embed_batch(
    client: AsyncOpenAI, batch: list[str]
) -> list[list[float]]:
    try:
        response = await _request_embeddings(client, batch)
    except TRANSIENT_ERRORS as exc:
        raise TransientEmbeddingError(
            'The embedding service is unavailable'
        ) from exc
    except OpenAIError as exc:
        raise EmbeddingError('The embedding request was rejected') from exc

    return _vectors_from(response, len(batch))


@retry(
    retry=retry_if_exception_type(TRANSIENT_ERRORS),
    stop=stop_after_attempt(EMBEDDING_MAX_ATTEMPTS),
    wait=wait_exponential(multiplier=1, max=8),
    reraise=True,
)
async def _request_embeddings(
    client: AsyncOpenAI, batch: list[str]
) -> CreateEmbeddingResponse:
    return await client.embeddings.create(
        model=settings.OPENAI_EMBEDDING_MODEL,
        input=batch,
        dimensions=EMBEDDING_DIMENSIONS,
    )


def _vectors_from(
    response: CreateEmbeddingResponse, expected: int
) -> list[list[float]]:
    if len(response.data) != expected:
        raise EmbeddingError(
            f'Expected {expected} embeddings, got {len(response.data)}'
        )

    ordered = sorted(response.data, key=lambda item: item.index)
    vectors = [item.embedding for item in ordered]
    if any(len(vector) != EMBEDDING_DIMENSIONS for vector in vectors):
        raise EmbeddingError(
            f'Embeddings must have {EMBEDDING_DIMENSIONS} dimensions'
        )
    return vectors
