"""Wraps pypdfium2 for page access + dimension queries."""
from __future__ import annotations

from pathlib import Path

import pypdfium2 as pdfium

class PdfDocument:
    """Context-managed PDF wrapper."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        if not self.path.is_file():
            raise FileNotFoundError(f"PDF not found: {self.path}")
        self._pdf = pdfium.PdfDocument(str(self.path))
        self._page_count = len(self._pdf)

    def __enter__(self) -> "PdfDocument":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def close(self) -> None:
        try:
            self._pdf.close()
        except Exception:
            pass

    @property
    def page_count(self) -> int:
        return self._page_count

    def page_size_pt(self, page_index: int) -> tuple[float, float]:
        """Returns (width_pt, height_pt) for the given page."""
        page = self._pdf[page_index]
        try:
            w, h = page.get_size()
            return float(w), float(h)
        finally:
            page.close()

    def textpage(self, page_index: int):
        """Returns a pypdfium2 textpage object. Caller must close."""
        page = self._pdf[page_index]
        textpage = page.get_textpage()
        # Close page object but keep textpage alive
        # (textpage holds its own reference to underlying page data)
        return textpage, page

    def all_page_sizes_pt(self) -> list[tuple[float, float]]:
        """Returns [(width_pt, height_pt), ...] for all pages."""
        out: list[tuple[float, float]] = []
        for i in range(self.page_count):
            out.append(self.page_size_pt(i))
        return out