import re
from dataclasses import dataclass

from services.parsing import ExtractedSection

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200

SEPARATOR_GROUPS = (('\n\n',), ('\n',), ('. ', '? ', '! '), (' ',))
WHITESPACE = re.compile(r'\s')


@dataclass(frozen=True)
class TextChunk:
    text: str
    page_number: int | None
    chunk_index: int


def chunk_sections(
    sections: list[ExtractedSection],
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[TextChunk]:
    if not 0 < overlap < chunk_size // 2:
        raise ValueError('overlap must be positive and below half the size')

    texts = [
        (text, section.page_number)
        for section in sections
        for text in _split(section.text, chunk_size, overlap)
    ]
    return [
        TextChunk(text, page_number, index)
        for index, (text, page_number) in enumerate(texts)
    ]


def _split(text: str, chunk_size: int, overlap: int) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = _chunk_end(text, start, chunk_size)
        if chunk := text[start:end].strip():
            chunks.append(chunk)
        if end == len(text):
            break
        start = _next_start(text, end - overlap, end)
    return chunks


def _chunk_end(text: str, start: int, chunk_size: int) -> int:
    limit = start + chunk_size
    if limit >= len(text):
        return len(text)

    earliest = start + chunk_size // 2
    for group in SEPARATOR_GROUPS:
        ends = [
            position + len(separator)
            for separator in group
            if (position := text.rfind(separator, earliest, limit)) != -1
        ]
        if ends:
            return max(ends)
    return limit


def _next_start(text: str, position: int, end: int) -> int:
    if text[position - 1].isspace():
        return position
    boundary = WHITESPACE.search(text, position, end)
    return boundary.end() if boundary else position
