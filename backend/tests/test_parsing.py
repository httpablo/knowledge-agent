from io import BytesIO
from pathlib import Path

import pytest
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from services import parsing
from services.parsing import (
    DocumentParsingError,
    ExtractedSection,
    extract_sections,
)

FIXTURES = Path(__file__).parent / 'fixtures'

TABLE_ROWS = [
    (
        'Álgebra Linear',
        'segunda-feira',
        '08:00-11:40',
        'Bloco A',
        'Marcos Lima',
    ),
    (
        'Cálculo Diferencial e Integral II',
        'quarta-feira',
        '14:00-17:40',
        'Bloco J',
        'Rogério Azevedo',
    ),
]
TABLE_COLUMN_X = [50, 250, 340, 420, 500]


def _fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _text_operator(x: int, y: int, text: str) -> bytes:
    escaped = (
        text.encode('latin-1').replace(b'(', rb'\(').replace(b')', rb'\)')
    )
    return b'BT /F1 9 Tf 1 0 0 1 %d %d Tm (%s) Tj ET\n' % (x, y, escaped)


def _table_pdf() -> bytes:
    content = b''.join(
        _text_operator(x, 700 - row_index * 20, cell)
        for x, column_cells in zip(
            TABLE_COLUMN_X, zip(*TABLE_ROWS), strict=True
        )
        for row_index, cell in enumerate(column_cells)
    )

    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    stream = DecodedStreamObject()
    stream.set_data(content)
    font = DictionaryObject({
        NameObject('/Type'): NameObject('/Font'),
        NameObject('/Subtype'): NameObject('/Type1'),
        NameObject('/BaseFont'): NameObject('/Helvetica'),
        NameObject('/Encoding'): NameObject('/WinAnsiEncoding'),
    })
    page[NameObject('/Contents')] = writer._add_object(stream)
    page[NameObject('/Resources')] = DictionaryObject({
        NameObject('/Font'): DictionaryObject({
            NameObject('/F1'): writer._add_object(font)
        })
    })

    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def test_pdf_keeps_one_section_per_page_with_page_number() -> None:
    sections = extract_sections('policy.pdf', _fixture('policy.pdf'))

    assert [section.page_number for section in sections] == [1, 2]
    assert sections[0].text == (
        'Política de Férias\n\n'
        'Cada colaborador tem direito a 30 dias de férias por ano.\n\n'
        'O pedido de férias deve ser feito com 45 dias de antecedência.'
    )
    assert sections[1].text == (
        'Reembolso de Despesas\n\n'
        'Despesas de viagem são reembolsadas em até 10 dias úteis.'
    )


def test_pdf_table_row_survives_extraction_as_one_line() -> None:
    sections = extract_sections('schedule_table.pdf', _table_pdf())
    assert len(sections) == 1

    row = next(
        line
        for line in sections[0].text.splitlines()
        if 'Cálculo Diferencial e Integral II' in line
    )
    assert 'quarta-feira' in row
    assert '14:00-17:40' in row
    assert 'Bloco J' in row
    assert 'Rogério Azevedo' in row


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


def test_pdf_without_text_explains_scans_are_not_supported() -> None:
    with pytest.raises(
        DocumentParsingError,
        match='scanned or image-only PDFs are not supported',
    ):
        extract_sections('blank.pdf', _fixture('blank.pdf'))


def test_txt_without_text_fails() -> None:
    with pytest.raises(
        DocumentParsingError, match='The document has no extractable text'
    ):
        extract_sections('spaces.txt', b'  \n\t  ')


@pytest.mark.parametrize(
    ('filename', 'content'),
    [
        ('corrupt.pdf', b'%PDF-1.7\nnot really a pdf'),
        ('latin1.txt', 'férias'.encode('latin-1')),
    ],
)
def test_unparseable_file_fails(filename: str, content: bytes) -> None:
    with pytest.raises(
        DocumentParsingError, match='The file could not be parsed'
    ) as error:
        extract_sections(filename, content)

    assert error.value.__cause__ is not None


def test_docx_that_is_not_a_package_fails() -> None:
    with pytest.raises(
        DocumentParsingError, match='File content does not match its extension'
    ):
        extract_sections('corrupt.docx', b'PK\x03\x04not really a docx')


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
