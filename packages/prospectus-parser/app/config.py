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
    # Left/right edge is clipped by this amount to prevent bleed into the
    # next column. Left edge is NOT clipped (see text_extractor._clip_rect)
    # so short codes like "BEM 111" starting exactly at the column boundary
    # are still captured.
    min_cell_padding_pt: float = 2.5
    
    # Row-boundary padding for top/bottom. Kept separate from the left/right
    # padding because tight rows would otherwise clip descenders.
    row_padding_pt: float = 1.0

    strip_whitespace: bool = True

    # OCR (optional fallback for scanned / image-only pages)
    ocr_dpi: int = 300
    ocr_lang: str = "eng"
    ocr_config: str = "--oem 3 --psm 6"
    ocr_min_confidence: float = 30.0


settings = Settings()