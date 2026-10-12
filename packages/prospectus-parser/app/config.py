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


settings = Settings()