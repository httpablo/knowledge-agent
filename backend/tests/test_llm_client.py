from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from openai import APIConnectionError, OpenAIError

from services import llm_client
from services.llm_client import (
    GroundedAnswer,
    LLMError,
    TransientLLMError,
    generate_grounded_answer,
)


def _completion(
    *,
    finish_reason: str = 'stop',
    refusal: str | None = None,
    parsed: GroundedAnswer | None = None,
) -> Any:
    message = SimpleNamespace(refusal=refusal, parsed=parsed)
    choice = SimpleNamespace(finish_reason=finish_reason, message=message)
    return SimpleNamespace(choices=[choice])


async def test_transient_openai_error_is_mapped_to_transient_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = httpx.Request('POST', 'https://api.openai.com')

    async def failing(*args: object, **kwargs: object) -> None:
        raise APIConnectionError(request=request)

    monkeypatch.setattr(llm_client, '_request_answer', failing)

    with pytest.raises(TransientLLMError):
        await generate_grounded_answer(None, 'system', 'question')


async def test_other_openai_errors_are_mapped_to_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RejectedError(OpenAIError):
        pass

    async def failing(*args: object, **kwargs: object) -> None:
        raise RejectedError('rejected')

    monkeypatch.setattr(llm_client, '_request_answer', failing)

    with pytest.raises(LLMError):
        await generate_grounded_answer(None, 'system', 'question')


async def test_truncated_answer_raises_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def truncated(*args: object, **kwargs: object) -> Any:
        return _completion(finish_reason='length')

    monkeypatch.setattr(llm_client, '_request_answer', truncated)

    with pytest.raises(LLMError, match='token limit'):
        await generate_grounded_answer(None, 'system', 'question')


async def test_refusal_raises_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def refused(*args: object, **kwargs: object) -> Any:
        return _completion(refusal='cannot help with that')

    monkeypatch.setattr(llm_client, '_request_answer', refused)

    with pytest.raises(LLMError, match='refused'):
        await generate_grounded_answer(None, 'system', 'question')


async def test_missing_parsed_payload_raises_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unparsed(*args: object, **kwargs: object) -> Any:
        return _completion(parsed=None)

    monkeypatch.setattr(llm_client, '_request_answer', unparsed)

    with pytest.raises(LLMError, match='refused'):
        await generate_grounded_answer(None, 'system', 'question')


async def test_successful_completion_returns_parsed_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    answer = GroundedAnswer(
        answerable=True, answer='30 days', source_ids=['S1']
    )

    async def succeeding(*args: object, **kwargs: object) -> Any:
        return _completion(parsed=answer)

    monkeypatch.setattr(llm_client, '_request_answer', succeeding)

    result = await generate_grounded_answer(None, 'system', 'question')

    assert result == answer
