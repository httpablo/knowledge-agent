from io import BytesIO
from pathlib import Path

import pytest
from pypdf import PdfReader, PdfWriter

from services import parsing
from services.parsing import (
    DocumentParsingError,
    ExtractedSection,
    extract_sections,
)

FIXTURES = Path(__file__).parent / 'fixtures'


def _fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_pdf_keeps_one_section_per_page_with_page_number() -> None:
    sections = extract_sections('policy.pdf', _fixture('policy.pdf'))

    assert [section.page_number for section in sections] == [1, 2]
    assert 'direito a 30 dias de férias' in sections[0].text
    assert '45 dias de antecedência' in sections[0].text
    assert 'reembolsadas em até 10 dias úteis' in sections[1].text


def test_txt_strips_utf8_bom() -> None:
    content = _fixture('security.txt')
    assert content.startswith(b'\xef\xbb\xbf')

    sections = extract_sections('security.txt', content)

    assert sections == [
        ExtractedSection(
            'Guia de Segurança\n\n'
            'O crachá deve ser usado em todas as áreas do escritório.\n'
            'Visitantes precisam de acompanhamento.',
            None,
        )
    ]


def test_docx_keeps_paragraphs_and_tables_in_order() -> None:
    sections = extract_sections('handbook.docx', _fixture('handbook.docx'))

    assert sections == [
        ExtractedSection(
            'Manual do Colaborador\n\n'
            'Benefício | Valor\n'
            'Vale-refeição | R$ 40 por dia\n\n'
            'O plano de saúde cobre dependentes diretos.',
            None,
        )
    ]


def test_extension_is_case_insensitive() -> None:
    sections = extract_sections('HANDBOOK.DOCX', _fixture('handbook.docx'))

    assert sections[0].text.startswith('Manual do Colaborador')


def test_null_characters_are_removed() -> None:
    sections = extract_sections('notes.txt', b'first\x00 line')

    assert sections == [ExtractedSection('first line', None)]


@pytest.mark.parametrize(
    ('filename', 'content'),
    [
        ('blank.pdf', _fixture('blank.pdf')),
        ('spaces.txt', b'  \n\t  '),
    ],
)
def test_document_without_text_fails(filename: str, content: bytes) -> None:
    with pytest.raises(
        DocumentParsingError, match='The document has no extractable text'
    ):
        extract_sections(filename, content)


@pytest.mark.parametrize(
    ('filename', 'content'),
    [
        ('corrupt.pdf', b'%PDF-1.7\nnot really a pdf'),
        ('corrupt.docx', b'PK\x03\x04not really a docx'),
        ('latin1.txt', 'férias'.encode('latin-1')),
    ],
)
def test_unparseable_file_fails(filename: str, content: bytes) -> None:
    with pytest.raises(
        DocumentParsingError, match='The file could not be parsed'
    ):
        extract_sections(filename, content)


def test_encrypted_pdf_fails() -> None:
    writer = PdfWriter(clone_from=PdfReader(BytesIO(_fixture('policy.pdf'))))
    writer.encrypt('secret')
    buffer = BytesIO()
    writer.write(buffer)

    with pytest.raises(
        DocumentParsingError, match='Encrypted PDFs are not supported'
    ):
        extract_sections('locked.pdf', buffer.getvalue())


def test_docx_with_excessive_uncompressed_size_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(parsing, 'MAX_DOCX_UNCOMPRESSED_BYTES', 1024)

    with pytest.raises(
        DocumentParsingError, match='The DOCX file expands to an unsafe size'
    ):
        extract_sections('handbook.docx', _fixture('handbook.docx'))
