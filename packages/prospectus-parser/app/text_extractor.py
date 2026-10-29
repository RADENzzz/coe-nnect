"""Extract text inside PDF-space rectangles."""
from __future__ import annotations

from .config import settings
from .models import ColumnSpec, ExtractedSubject, RegionSpec, RowSpec
from .ocr import OcrWord, words_in_rect


def _clip_rect(rect: tuple[float, float, float, float], padding: float):
    """
    Asymmetric clip: only right, bottom, top are shrunk.
    Left is preserved so short codes at the column edge aren't lost.
    """
    left, bottom, right, top = rect
    return (left, bottom + padding, right - padding, top - padding)


def extract_cell(textpage, rect: tuple[float, float, float, float]) -> str:
    left, bottom, right, top = _clip_rect(rect, settings.min_cell_padding_pt)
    if right <= left or top <= bottom:
        return ""
    raw = textpage.get_text_bounded(left, bottom, right, top)
    if settings.strip_whitespace:
        return raw.strip()
    return raw


def extract_region(
    textpage,
    region: RegionSpec,
    ocr_words: list[OcrWord] | None = None,
) -> list[ExtractedSubject]:
    """
    Extract every cell of `region`.

    When `ocr_words` is supplied, cells that are blank in the PDF's text
    layer fall back to the OCR words that fall inside the same rectangle.
    That covers image-only pages while never overriding real text.
    """
    cols_sorted = sorted(region.columns, key=lambda c: c.x_start_pt)

    subjects: list[ExtractedSubject] = []
    for row in region.rows:
        subject = ExtractedSubject()
        for col in cols_sorted:
            rect = (
                col.x_start_pt,
                row.y_bottom_pt,
                col.x_end_pt,
                row.y_top_pt,
            )
            text = extract_cell(textpage, rect)
            if not text.strip() and ocr_words:
                text = words_in_rect(
                    ocr_words,
                    _clip_rect(rect, settings.min_cell_padding_pt),
                )
            setattr(subject, col.role, text)
        subjects.append(subject)
    return subjects


def column_at_x(region: RegionSpec, x: float) -> ColumnSpec | None:
    for col in region.columns:
        if col.x_start_pt <= x <= col.x_end_pt:
            return col
    return None


def row_at_y(region: RegionSpec, y: float) -> RowSpec | None:
    for row in region.rows:
        if row.y_bottom_pt <= y <= row.y_top_pt:
            return row
    return None