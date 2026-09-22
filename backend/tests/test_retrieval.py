from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from models import DocumentStatus
from services import retrieval
from tests.conftest import (
    MakeUser,
    RegisteredUser,
    fixed_query_embedding,
    make_document,
    vector_at_distance,
)

VACATION_QUESTION = 'Quantos dias de férias por ano?'


async def test_search_returns_the_closest_chunk_first(
    session: AsyncSession, user: RegisteredUser
) -> None:
    await make_document(
        session,
        user.organization_id,
        'policy.pdf',
        [
            'Cada colaborador tem 30 dias de férias por ano.',
            'Despesas de viagem são reembolsadas em 10 dias úteis.',
        ],
    )

    results = await retrieval.search_chunks(
        session, user.organization_id, VACATION_QUESTION
    )

    assert len(results) == 2
    assert '30 dias de férias' in results[0].content
    assert results[0].distance < results[1].distance


async def test_search_returns_the_metadata_needed_for_citations(
    session: AsyncSession, user: RegisteredUser
) -> None:
    document = await make_document(
        session,
        user.organization_id,
        'policy.pdf',
        ['Cada colaborador tem 30 dias de férias por ano.'],
    )

    [result] = await retrieval.search_chunks(
        session, user.organization_id, VACATION_QUESTION
    )

    assert result.document_id == document.id
    assert result.filename == 'policy.pdf'
    assert result.page_number == 1
    assert isinstance(result.chunk_id, UUID)
    assert 0 <= result.distance <= 2


async def test_search_is_limited_to_top_k(
    session: AsyncSession, user: RegisteredUser
) -> None:
    await make_document(
        session,
        user.organization_id,
        'policy.pdf',
        [
            f'Regra número {index} sobre férias.'
            for index in range(retrieval.TOP_K + 3)
        ],
    )

    results = await retrieval.search_chunks(
        session, user.organization_id, VACATION_QUESTION
    )
    limited = await retrieval.search_chunks(
        session, user.organization_id, VACATION_QUESTION, top_k=2
    )

    assert len(results) == retrieval.TOP_K
    assert len(limited) == 2
    assert [chunk.chunk_id for chunk in limited] == [
        chunk.chunk_id for chunk in results[:2]
    ]


@pytest.mark.parametrize(
    'status',
    [DocumentStatus.PENDING, DocumentStatus.PROCESSING, DocumentStatus.FAILED],
)
async def test_search_ignores_documents_that_are_not_ready(
    session: AsyncSession, user: RegisteredUser, status: DocumentStatus
) -> None:
    await make_document(
        session,
        user.organization_id,
        'draft.pdf',
        ['Cada colaborador tem 30 dias de férias por ano.'],
        status=status,
    )

    results = await retrieval.search_chunks(
        session, user.organization_id, VACATION_QUESTION
    )

    assert results == []


async def test_search_without_documents_returns_nothing(
    session: AsyncSession, user: RegisteredUser
) -> None:
    results = await retrieval.search_chunks(
        session, user.organization_id, VACATION_QUESTION
    )

    assert results == []


async def test_organization_filter_applies_before_ranking_and_limiting(
    session: AsyncSession,
    make_user: MakeUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(retrieval, 'embed_texts', fixed_query_embedding)
    alice = await make_user(name='Alice', email='alice@example.com')
    bob = await make_user(name='Bob', email='bob@example.com')
    await make_document(
        session,
        alice.organization_id,
        'alice-policy.pdf',
        ['Regra da Alice'],
        embeddings=[vector_at_distance(0.30)],
    )
    await make_document(
        session,
        bob.organization_id,
        'bob-secret.pdf',
        ['Segredo do Bob'],
        embeddings=[vector_at_distance(0.01)],
    )

    results = await retrieval.search_chunks(
        session, alice.organization_id, 'pergunta'
    )

    assert [chunk.filename for chunk in results] == ['alice-policy.pdf']


async def test_each_organization_retrieves_only_its_own_answer(
    session: AsyncSession, make_user: MakeUser
) -> None:
    alice = await make_user(name='Alice', email='alice@example.com')
    bob = await make_user(name='Bob', email='bob@example.com')
    await make_document(
        session,
        alice.organization_id,
        'alice-policy.pdf',
        ['Cada colaborador tem 30 dias de férias por ano.'],
    )
    await make_document(
        session,
        bob.organization_id,
        'bob-policy.pdf',
        ['Cada colaborador tem 15 dias de férias por ano.'],
    )

    alice_results = await retrieval.search_chunks(
        session, alice.organization_id, VACATION_QUESTION
    )
    bob_results = await retrieval.search_chunks(
        session, bob.organization_id, VACATION_QUESTION
    )

    assert [chunk.filename for chunk in alice_results] == ['alice-policy.pdf']
    assert '30 dias' in alice_results[0].content
    assert [chunk.filename for chunk in bob_results] == ['bob-policy.pdf']
    assert '15 dias' in bob_results[0].content
