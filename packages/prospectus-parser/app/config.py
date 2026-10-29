"""Environment-driven configuration."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Service
    port: int = 8001
    log_level: str = "info"
    service_name: str = "prospectus-parser"

    # Upload limit (bytes) — matches backend multer config
    max_upload_bytes: int = 20 * 1024 * 1024  # 20 MB

    # Extraction
    # Right edge is clipped by this amount to prevent bleed into the next
    # column. Left edge is NOT clipped (see text_extractor._clip_rect) so
    # short codes like "BEM 111" starting exactly at the column boundary
    # are still captured.
    min_cell_padding_pt: float = 2.5
    strip_whitespace: bool = True

    # OCR (optional fallback for scanned / image-only pages)
    ocr_dpi: int = 300
    ocr_lang: str = "eng"
    # --psm 6 = "assume a single uniform block of text", which suits
    # table rows better than the default page-segmentation heuristics.
    ocr_config: str = "--oem 3 --psm 6"
    # Tesseract reports -1 for non-text boxes; drop anything below this.
    ocr_min_confidence: float = 30.0


settings = Settings()