import os
from dataclasses import dataclass

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from services import chat, retrieval
from services.embeddings import embed_texts, embedding_client
from tests.conftest import RegisteredUser, make_document

pytestmark = pytest.mark.skipif(
    not os.environ.get('RAG_EVALUATION'),
    reason='set RAG_EVALUATION=1 to evaluate against the OpenAI API',
)

CORPUS = {
    'policy.pdf': [
        'Política de Férias. Cada colaborador tem direito a 30 dias de '
        'férias por ano.',
        'O pedido de férias deve ser feito com 45 dias de antecedência.',
        'Reembolso de Despesas. Despesas de viagem são reembolsadas em até '
        '10 dias úteis.',
    ],
    'handbook.docx': [
        'Manual do Colaborador. O vale-refeição é de R$ 40 por dia.',
        'O plano de saúde cobre dependentes diretos.',
    ],
    'security.txt': [
        'Guia de Segurança. O crachá deve ser usado em todas as áreas do '
        'escritório.',
    ],
}

EDITAL_CHUNKS = [
    'Edital do Concurso Público. 1. DAS DISPOSIÇÕES PRELIMINARES. O '
    'presente edital regula a realização do concurso público para '
    'provimento de vagas em cargos efetivos, sob responsabilidade da '
    'banca organizadora.',
    '4. DA INSCRIÇÃO. As inscrições deverão ser realizadas exclusivamente '
    'pela internet, mediante pagamento de taxa, no período estabelecido '
    'neste edital, sendo vedada a inscrição condicional ou por '
    'correspondência.',
    '5. DA ISENÇÃO DA TAXA. Poderá ser concedida isenção do pagamento da '
    'taxa de inscrição aos candidatos que comprovarem hipossuficiência '
    'financeira, mediante requerimento e documentação comprobatória.',
    '11. DA PROVA OBJETIVA. A Prova Objetiva, de caráter eliminatório e '
    'classificatório, será aplicada aos candidatos regularmente '
    'inscritos, e será realizada no dia 1º de novembro de 2026, em dois '
    'turnos de aplicação, conforme o cargo a que o candidato concorre.',
]

EDITAL_EXAM_DATE_PAGE = 4


@dataclass(frozen=True)
class EvaluationCase:
    question: str
    expected: str | None


CASES = [
    EvaluationCase('Quantos dias de férias eu tenho por ano?', '30 dias'),
    EvaluationCase('Com quanta antecedência devo pedir férias?', '45 dias'),
    EvaluationCase('Em quantos dias recebo o reembolso?', '10 dias úteis'),
    EvaluationCase('Qual o valor do vale-refeição?', 'R$ 40'),
    EvaluationCase('How many vacation days do I get?', '30 dias'),
    EvaluationCase('Wie viele Urlaubstage habe ich?', '30 dias'),
    EvaluationCase('Do I need to wear a badge in the office?', 'crachá'),
    EvaluationCase('Qual é a política de home office?', None),
    EvaluationCase('Quanto é o bônus anual de desempenho?', None),
    EvaluationCase('What is the capital of France?', None),
]


EDITAL_CASES = [
    EvaluationCase(
        'qual a data da prova do concurso?', '1º de novembro de 2026'
    ),
    EvaluationCase(
        'quando os candidatos vão fazer a prova?', '1º de novembro de 2026'
    ),
    EvaluationCase('qual o valor da taxa de inscrição?', None),
]


@pytest.fixture
def embeddings() -> None:
    """Overrides the fake from conftest: this suite calls the real API."""


@pytest.fixture
def llm() -> None:
    """Overrides the fake from conftest: this suite calls the real API."""


@pytest.fixture
async def corpus(session: AsyncSession, user: RegisteredUser) -> None:
    async with embedding_client() as client:
        for filename, chunks in CORPUS.items():
            vectors = await embed_texts(client, chunks)
            await make_document(
                session,
                user.organization_id,
                filename,
                chunks,
                embeddings=vectors,
            )


@pytest.fixture
async def edital_corpus(session: AsyncSession, user: RegisteredUser) -> None:
    async with embedding_client() as client:
        vectors = await embed_texts(client, EDITAL_CHUNKS)
    await make_document(
        session,
        user.organization_id,
        'edital.pdf',
        EDITAL_CHUNKS,
        embeddings=vectors,
    )


async def test_answerable_questions_retrieve_the_expected_chunk(
    session: AsyncSession, user: RegisteredUser, corpus: None
) -> None:
    for case in CASES:
        if case.expected is None:
            continue
        results = await retrieval.search_chunks(
            session, user.organization_id, case.question
        )
        assert case.expected in results[0].content, case.question


async def test_reports_distances_for_threshold_tuning(
    session: AsyncSession,
    user: RegisteredUser,
    corpus: None,
    capsys: pytest.CaptureFixture[str],
) -> None:
    rows = []
    for case in CASES:
        results = await retrieval.search_chunks(
            session, user.organization_id, case.question
        )
        assert results
        best = results[0].distance
        kind = 'answerable' if case.expected else 'unanswerable'
        rows.append(
            f'{kind:<13} {best:.4f} {results[-1].distance:.4f}  '
            f'{case.question}'
        )

    with capsys.disabled():
        print('\nkind          best   worst   question')
        print('\n'.join(rows))


async def test_edital_questions_are_answered_and_grounded_correctly(
    session: AsyncSession, user: RegisteredUser, edital_corpus: None
) -> None:
    for case in EDITAL_CASES:
        answer = await chat.answer_question(
            session, user.organization_id, case.question
        )

        if case.expected is None:
            assert answer.answerable is False, case.question
            assert answer.citations == [], case.question
            continue

        assert answer.answerable is True, case.question
        assert case.expected in answer.answer, case.question
        assert answer.citations, case.question
        assert all(
            citation.filename == 'edital.pdf' for citation in answer.citations
        ), case.question
        assert any(
            citation.page_number == EDITAL_EXAM_DATE_PAGE
            for citation in answer.citations
        ), case.question


FOLLOW_UPS = [
    EvaluationCase('E qual o prazo para pedir?', '45 dias'),
    EvaluationCase('E o prazo?', '45 dias'),
    EvaluationCase('Quanto tempo antes?', '45 dias'),
    EvaluationCase('E quanto é por dia?', 'R$ 40'),
    EvaluationCase('E os dependentes?', 'dependentes'),
]


async def test_reports_follow_up_retrieval(
    session: AsyncSession,
    user: RegisteredUser,
    corpus: None,
    capsys: pytest.CaptureFixture[str],
) -> None:
    rows = []
    for case in FOLLOW_UPS:
        results = await retrieval.search_chunks(
            session, user.organization_id, case.question
        )
        best = results[0]
        hit = 'HIT ' if case.expected in best.content else 'MISS'
        kept = best.distance <= 0.85
        rows.append(
            f'{hit} best={best.distance:.4f} kept={kept}  '
            f'{case.question}  ->  {best.content[:45]}'
        )

    with capsys.disabled():
        print('\nfollow-up retrieval without query rewriting')
        print('\n'.join(rows))
