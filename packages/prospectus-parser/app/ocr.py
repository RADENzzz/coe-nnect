"""OCR fallback for pages with no text layer.

The text-layer extractor can only read glyphs that exist in the PDF.
A page that is a scan, or a screenshot pasted into Word and exported to
PDF, has no glyphs at all — only pixels. This module renders the page and
runs Tesseract over it, returning word boxes converted back into PDF
points so the caller can bin them into the exact same table cells.

Dark pages (white text on a black background) are inverted before OCR;
Tesseract reads white-on-black as noise otherwise.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from .config import settings

log = logging.getLogger(__name__)

try:  # pragma: no cover - import guard for environments without OCR
    import pytesseract
    from pytesseract import Output

    # Pillow is only needed for OCR (pypdfium2 hands back a bitmap).
    from PIL import ImageOps, ImageStat

    _IMPORT_ERROR: str | None = None
except Exception as exc:  # pragma: no cover
    pytesseract = None  # type: ignore[assignment]
    Output = None  # type: ignore[assignment]
    ImageOps = None  # type: ignore[assignment]
    ImageStat = None  # type: ignore[assignment]
    _IMPORT_ERROR = str(exc)


class OcrUnavailable(RuntimeError):
    """Tesseract is not installed or cannot be executed."""


@dataclass
class OcrWord:
    """One OCR word, positioned in PDF points (origin bottom-left)."""

    text: str
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def height(self) -> float:
        return max(0.1, self.y1 - self.y0)


_AVAILABLE: bool | None = None


def ocr_available() -> bool:
    """True when pytesseract is importable AND the binary runs."""
    global _AVAILABLE
    if _AVAILABLE is not None:
        return _AVAILABLE
    if pytesseract is None or ImageOps is None:
        _AVAILABLE = False
        return _AVAILABLE
    try:
        pytesseract.get_tesseract_version()
        _AVAILABLE = True
    except Exception:  # pragma: no cover - depends on host
        _AVAILABLE = False
    return _AVAILABLE


def _prepare(image):
    """
    Grayscale, invert dark pages, and normalise contrast.

    Returns a mode-"L" PIL image ready for Tesseract.
    """
    gray = image.convert("L")
    try:
        mean = ImageStat.Stat(gray).mean[0]
    except Exception:  # pragma: no cover - empty image
        return gray
    if mean < 128:
        # White-on-dark: flip to black-on-white or the detector finds nothing.
        gray = ImageOps.invert(gray)
    return ImageOps.autocontrast(gray)


def ocr_page(page, dpi: int | None = None) -> list[OcrWord]:
    """
    OCR a pypdfium2 page.

    `page` must be a live PdfPage object (caller owns its lifetime).
    Returns words in PDF points so they line up with the rows/columns the
    user drew on the canvas.
    """
    if pytesseract is None:
        raise OcrUnavailable(_IMPORT_ERROR or "pytesseract is not installed")
    if not ocr_available():
        raise OcrUnavailable(
            "Tesseract binary not found. Install it (apt: tesseract-ocr) "
            "or set TESSERACT_CMD."
        )

    scale = (dpi or settings.ocr_dpi) / 72.0
    bitmap = page.render(scale=scale)
    # Keep the bitmap alive until OCR is done — to_pil() may share its buffer.
    image = _prepare(bitmap.to_pil())

    try:
        data = pytesseract.image_to_data(
            image,
            lang=settings.ocr_lang,
            config=settings.ocr_config,
            output_type=Output.DICT,
        )
    finally:
        try:
            bitmap.close()
        except Exception:
            pass

    width_pt, height_pt = page.get_size()
    words: list[OcrWord] = []
    for i, raw in enumerate(data.get("text", [])):
        text = (raw or "").strip()
        if not text:
            continue
        try:
            confidence = float(data["conf"][i])
        except (KeyError, TypeError, ValueError):
            continue
        if confidence < settings.ocr_min_confidence:
            continue

        px = float(data["left"][i])
        py = float(data["top"][i])
        pw = float(data["width"][i])
        ph = float(data["height"][i])

        words.append(
            OcrWord(
                text=text,
                x0=px / scale,
                x1=(px + pw) / scale,
                # PDF space grows upward; image space grows downward.
                y0=height_pt - (py + ph) / scale,
                y1=height_pt - py / scale,
            )
        )

    log.info(
        "OCR page: %d words @ %ddpi (page %.0fx%.0fpt)",
        len(words),
        int(dpi or settings.ocr_dpi),
        width_pt,
        height_pt,
    )
    return words


def words_in_rect(
    words: list[OcrWord],
    rect: tuple[float, float, float, float],
) -> str:
    """
    Join every OCR word whose centre falls inside `rect`.

    Words are grouped into visual lines (by vertical centre) so a cell
    that wraps over two lines comes back as one readable title.
    """
    left, bottom, right, top = rect
    hits = [
        w
        for w in words
        if left <= w.cx <= right and bottom <= w.cy <= top
    ]
    if not hits:
        return ""

    hits.sort(key=lambda w: (-w.cy, w.x0))

    lines: list[tuple[float, list[OcrWord]]] = []
    for word in hits:
        if lines:
            line_cy, line_words = lines[-1]
            tolerance = max(2.0, word.height * 0.6)
            if abs(line_cy - word.cy) <= tolerance:
                line_words.append(word)
                continue
        lines.append((word.cy, [word]))

    parts: list[str] = []
    for _, line_words in lines:
        line_words.sort(key=lambda w: w.x0)
        parts.append(" ".join(w.text for w in line_words))

    return " ".join(parts).strip()
