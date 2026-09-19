from pathlib import Path

import pytest

from services.chunking import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    TextChunk,
    chunk_sections,
)
from services.parsing import ExtractedSection, extract_sections

FIXTURES = Path(__file__).parent / 'fixtures'
SIZE = 60
OVERLAP = 15


def _sections(name: str) -> list[ExtractedSection]:
    return extract_sections(name, (FIXTURES / name).read_bytes())


def _words(text: str) -> set[str]:
    return set(text.split())


def _assert_valid_chunks(
    chunks: list[TextChunk], sections: list[ExtractedSection], size: int
) -> None:
    assert [chunk.chunk_index for chunk in chunks] == list(range(len(chunks)))
    assert all(chunk.text and len(chunk.text) <= size for chunk in chunks)
    assert all(chunk.text == chunk.text.strip() for chunk in chunks)
    for section in sections:
        section_chunks = [
            c for c in chunks if c.page_number == section.page_number
        ]
        assert all(c.text in section.text for c in section_chunks)
        assert _words(section.text) == set().union(
            *(_words(c.text) for c in section_chunks)
        )


def _assert_consecutive_chunks_overlap(chunks: list[TextChunk]) -> None:
    for previous, current in zip(chunks, chunks[1:]):
        if previous.page_number == current.page_number:
            first_word = current.text.split()[0]
            assert first_word in previous.text


def test_pdf_chunks_never_cross_pages_and_keep_page_number() -> None:
    sections = _sections('policy.pdf')

    chunks = chunk_sections(sections, SIZE, OVERLAP)

    _assert_valid_chunks(chunks, sections, SIZE)
    _assert_consecutive_chunks_overlap(chunks)
    assert {chunk.page_number for chunk in chunks} == {1, 2}
    first_of_page_two = next(c for c in chunks if c.page_number == 2)
    assert first_of_page_two.text.startswith('Reembolso de Despesas')


@pytest.mark.parametrize('name', ['security.txt', 'handbook.docx'])
def test_txt_and_docx_chunks_have_no_page_number(name: str) -> None:
    sections = _sections(name)

    chunks = chunk_sections(sections, SIZE, OVERLAP)

    _assert_valid_chunks(chunks, sections, SIZE)
    _assert_consecutive_chunks_overlap(chunks)
    assert len(chunks) > 1
    assert {chunk.page_number for chunk in chunks} == {None}


def test_chunk_index_continues_across_sections() -> None:
    sections = [
        ExtractedSection('first page', 1),
        ExtractedSection('second page', 2),
    ]

    assert chunk_sections(sections, SIZE, OVERLAP) == [
        TextChunk('first page', 1, 0),
        TextChunk('second page', 2, 1),
    ]


def test_text_exactly_at_limit_is_a_single_chunk() -> None:
    text = 'x' * SIZE

    chunks = chunk_sections([ExtractedSection(text, None)], SIZE, OVERLAP)

    assert chunks == [TextChunk(text, None, 0)]


def test_text_one_character_over_limit_is_split() -> None:
    text = 'word ' * 12 + 'x'

    chunks = chunk_sections([ExtractedSection(text, None)], SIZE, OVERLAP)

    assert len(chunks) == 2
    assert chunks[-1].text.endswith('x')


def test_split_prefers_paragraph_boundary() -> None:
    text = 'a' * 40 + '\n\n' + 'b ' * 20

    chunks = chunk_sections([ExtractedSection(text, None)], SIZE, OVERLAP)

    assert chunks[0].text == 'a' * 40


def test_text_without_whitespace_is_hard_cut_with_exact_overlap() -> None:
    text = ''.join(chr(ord('a') + i % 26) for i in range(150))

    chunks = chunk_sections([ExtractedSection(text, None)], SIZE, OVERLAP)

    assert [c.text for c in chunks] == [text[0:60], text[45:105], text[90:]]


def test_overlap_starts_at_a_word_boundary() -> None:
    text = ' '.join(f'word{i:02d}' for i in range(20))

    chunks = chunk_sections([ExtractedSection(text, None)], SIZE, OVERLAP)

    for chunk in chunks:
        assert chunk.text.split()[0] in text.split()


def test_whitespace_only_sections_produce_no_chunks() -> None:
    assert chunk_sections([ExtractedSection('   \n  ', None)]) == []
    assert chunk_sections([]) == []


def test_default_limits_are_used() -> None:
    text = 'palavra ' * 400

    chunks = chunk_sections([ExtractedSection(text, None)])

    assert all(len(chunk.text) <= CHUNK_SIZE for chunk in chunks)
    assert len(chunks) == 4
    assert 0 < CHUNK_OVERLAP < CHUNK_SIZE // 2


@pytest.mark.parametrize(
    ('size', 'overlap'), [(60, 0), (60, -1), (60, 30), (60, 60)]
)
def test_invalid_limits_are_rejected(size: int, overlap: int) -> None:
    with pytest.raises(ValueError, match='overlap must be positive'):
        chunk_sections([ExtractedSection('text', None)], size, overlap)


@pytest.mark.parametrize('mark', ['.', '?', '!'])
def test_split_prefers_sentence_boundary(mark: str) -> None:
    text = 'a' * 40 + mark + ' ' + 'b' * 40

    chunks = chunk_sections([ExtractedSection(text, None)], SIZE, OVERLAP)

    assert chunks[0].text == 'a' * 40 + mark


def test_latest_sentence_boundary_wins() -> None:
    text = 'a' * 30 + ' one. two! three? ' + 'b' * 40

    chunks = chunk_sections([ExtractedSection(text, None)], SIZE, OVERLAP)

    assert chunks[0].text == 'a' * 30 + ' one. two! three?'
