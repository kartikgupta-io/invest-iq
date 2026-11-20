"""PDF text extraction and deterministic chunking via pypdf."""

from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader

from app.data.contract import DocumentChunk

_WINDOW = 500
_OVERLAP = 100


def _split_text(text: str, window: int = _WINDOW, overlap: int = _OVERLAP) -> list[str]:
    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    if len(cleaned) <= window:
        return [cleaned]
    step = window - overlap
    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        chunk = cleaned[start : start + window]
        if chunk:
            chunks.append(chunk)
        if start + window >= len(cleaned):
            break
        start += step
    return chunks


def chunk_pdf(path: str | Path, section: str | None = None) -> list[DocumentChunk]:
    """Read a PDF per page and split its text into overlapping chunks.

    Empty or missing pages are skipped; an unreadable or missing file yields an empty list.
    """
    try:
        reader = PdfReader(str(path))
    except Exception:
        return []
    chunks: list[DocumentChunk] = []
    counter = 1
    for page_no, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        for piece in _split_text(text):
            chunks.append(
                DocumentChunk(
                    id=f"{Path(path).stem}:page{page_no}:chunk{counter}",
                    documentId=Path(path).stem,
                    page=page_no,
                    section=section or "",
                    text=piece,
                )
            )
            counter += 1
    return chunks