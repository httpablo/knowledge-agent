from collections.abc import Callable
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from docx import Document as DocxDocument
from docx.table import Table
from pypdf import PdfReader

DOCX_REQUIRED_PARTS = {
    '[Content_Types].xml',
    '_rels/.rels',
    'word/document.xml',
}

MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024


@dataclass(frozen=True)
class ExtractedSection:
    text: str
    page_number: int | None


class DocumentParsingError(Exception):
    pass


def extract_sections(filename: str, content: bytes) -> list[ExtractedSection]:
    extractor = _EXTRACTORS[Path(filename).suffix.lower()]
    try:
        sections = extractor(content)
    except DocumentParsingError:
        raise
    except Exception as exc:
        raise DocumentParsingError('The file could not be parsed') from exc

    if not sections:
        raise DocumentParsingError('The document has no extractable text')
    return sections


def _extract_pdf(content: bytes) -> list[ExtractedSection]:
    reader = PdfReader(BytesIO(content))
    if reader.is_encrypted:
        raise DocumentParsingError('Encrypted PDFs are not supported')

    sections = []
    for page_number, page in enumerate(reader.pages, start=1):
        text = _clean(page.extract_text() or '')
        if text:
            sections.append(ExtractedSection(text, page_number))
    if not sections:
        raise DocumentParsingError(
            'The PDF has no extractable text; scanned or image-only PDFs '
            'are not supported'
        )
    return sections


def _extract_txt(content: bytes) -> list[ExtractedSection]:
    text = _clean(content.decode('utf-8-sig'))
    return [ExtractedSection(text, None)] if text else []


def _extract_docx(content: bytes) -> list[ExtractedSection]:
    validate_docx_package(content)
    document = DocxDocument(BytesIO(content))

    blocks = []
    for block in document.iter_inner_content():
        text = _table_text(block) if isinstance(block, Table) else block.text
        if text := _clean(text):
            blocks.append(text)

    return [ExtractedSection('\n\n'.join(blocks), None)] if blocks else []


def _table_text(table: Table) -> str:
    return '\n'.join(
        ' | '.join(cell.text.strip() for cell in row.cells)
        for row in table.rows
    )


def validate_docx_package(content: bytes) -> None:
    try:
        with ZipFile(BytesIO(content)) as package:
            parts = package.infolist()
    except BadZipFile as exc:
        raise DocumentParsingError(
            'File content does not match its extension'
        ) from exc

    if not DOCX_REQUIRED_PARTS <= {part.filename for part in parts}:
        raise DocumentParsingError('File content does not match its extension')
    if sum(part.file_size for part in parts) > MAX_DOCX_UNCOMPRESSED_BYTES:
        raise DocumentParsingError('The DOCX file expands to an unsafe size')


def _clean(text: str) -> str:
    return text.replace('\x00', '').strip()


_EXTRACTORS: dict[str, Callable[[bytes], list[ExtractedSection]]] = {
    '.pdf': _extract_pdf,
    '.txt': _extract_txt,
    '.docx': _extract_docx,
}
