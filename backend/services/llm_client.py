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
from openai.types.chat import ParsedChatCompletion
from pydantic import BaseModel
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from core.settings import settings

CHAT_TIMEOUT_SECONDS = 60.0
CHAT_MAX_ATTEMPTS = 3
MAX_OUTPUT_TOKENS = 2000
REASONING_EFFORT = 'low'

TRANSIENT_ERRORS = (
    APIConnectionError,
    APITimeoutError,
    InternalServerError,
    RateLimitError,
)


class GroundedAnswer(BaseModel):
    answerable: bool
    answer: str
    source_ids: list[str]


class LLMError(Exception):
    pass


class TransientLLMError(LLMError):
    pass


@asynccontextmanager
async def chat_client() -> AsyncIterator[AsyncOpenAI]:
    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY.get_secret_value(),
        timeout=CHAT_TIMEOUT_SECONDS,
        max_retries=0,
    )
    try:
        yield client
    finally:
        await client.close()


async def generate_grounded_answer(
    client: AsyncOpenAI, system_prompt: str, user_prompt: str
) -> GroundedAnswer:
    try:
        completion = await _request_answer(client, system_prompt, user_prompt)
    except TRANSIENT_ERRORS as exc:
        raise TransientLLMError('The model is unavailable') from exc
    except OpenAIError as exc:
        raise LLMError('The model request was rejected') from exc

    choice = completion.choices[0]
    if choice.finish_reason == 'length':
        raise LLMError('The model answer exceeded the token limit')
    if choice.message.refusal or choice.message.parsed is None:
        raise LLMError('The model refused to answer')
    return choice.message.parsed


@retry(
    retry=retry_if_exception_type(TRANSIENT_ERRORS),
    stop=stop_after_attempt(CHAT_MAX_ATTEMPTS),
    wait=wait_exponential(multiplier=1, max=8),
    reraise=True,
)
async def _request_answer(
    client: AsyncOpenAI, system_prompt: str, user_prompt: str
) -> ParsedChatCompletion[GroundedAnswer]:
    return await client.chat.completions.parse(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt},
        ],
        response_format=GroundedAnswer,
        max_completion_tokens=MAX_OUTPUT_TOKENS,
        reasoning_effort=REASONING_EFFORT,
    )
