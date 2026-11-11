"""Pydantic schemas for /extract and /info."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

ColumnRole = Literal["code", "title", "prereq", "lec", "lab", "total"]


class ColumnSpec(BaseModel):
    role: ColumnRole
    x_start_pt: float = Field(..., ge=0)
    x_end_pt: float = Field(..., ge=0)

    @field_validator("x_end_pt")
    @classmethod
    def end_after_start(cls, v: float, info):
        start = info.data.get("x_start_pt")
        if start is not None and v <= start:
            raise ValueError("x_end_pt must be greater than x_start_pt")
        return v


class RowSpec(BaseModel):
    row_id: str = Field(..., min_length=1, max_length=64)
    y_top_pt: float = Field(..., ge=0)
    y_bottom_pt: float = Field(..., ge=0)
    # Optional per-cell text overrides (column role -> text). The editor uses
    # these for duplicated rows and direct cell edits; when present they win
    # over reading the PDF at that geometry.
    cells: dict[str, str] | None = None

    @field_validator("y_bottom_pt")
    @classmethod
    def bottom_below_top(cls, v: float, info):
        top = info.data.get("y_top_pt")
        if top is not None and v >= top:
            raise ValueError("y_bottom_pt must be less than y_top_pt")
        return v


class RegionSpec(BaseModel):
    table_id: int
    page_index: int = Field(..., ge=0)
    x_start_pt: float = Field(..., ge=0)
    x_end_pt: float = Field(..., ge=0)
    y_start_pt: float = Field(..., ge=0)
    y_end_pt: float = Field(..., ge=0)
    columns: list[ColumnSpec]
    rows: list[RowSpec]

    @field_validator("columns")
    @classmethod
    def has_all_roles(cls, v: list[ColumnSpec]):
        roles = {c.role for c in v}
        required = {"code", "title", "prereq", "lec", "lab", "total"}
        missing = required - roles
        if missing:
            raise ValueError(f"columns missing roles: {sorted(missing)}")
        return v


class ExtractRequest(BaseModel):
    """
    The PDF is transmitted as a base64-encoded string because the
    parser runs in its own container and can't read the backend's
    temp files. The parser decodes to a temp file, extracts, deletes.
    """
    pdf_base64: str = Field(..., min_length=1)
    regions: list[RegionSpec]
    # When true, blank text-layer cells fall back to OCR (slower). Used for
    # scans / screenshots pasted into a document and exported to PDF.
    ocr: bool = False

    @field_validator("regions")
    @classmethod
    def non_empty(cls, v: list[RegionSpec]):
        if not v:
            raise ValueError("regions must not be empty")
        return v


class ExtractedSubject(BaseModel):
    code: str = ""
    title: str = ""
    prereq: str = ""
    lec: str = ""
    lab: str = ""
    total: str = ""


class ExtractedRegion(BaseModel):
    table_id: int
    subjects: list[ExtractedSubject]


class ExtractResponse(BaseModel):
    regions: list[ExtractedRegion]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str


class InfoRequest(BaseModel):
    pdf_base64: str = Field(..., min_length=1)


class PageSize(BaseModel):
    page_index: int
    width_pt: float
    height_pt: float


class InfoResponse(BaseModel):
    page_count: int
    page_sizes_pt: list[PageSize]


class DetectRequest(BaseModel):
    pdf_base64: str = Field(..., min_length=1)
    # None scans every page. The backend caps this to keep latency sane.
    page_indices: list[int] | None = None
    max_tables: int = Field(default=30, ge=1, le=100)

    @field_validator("page_indices")
    @classmethod
    def valid_pages(cls, v: list[int] | None):
        if v is not None and any(p < 0 for p in v):
            raise ValueError("page_indices must be non-negative")
        return v


class DetectedTable(BaseModel):
    page_index: int = Field(..., ge=0)
    year_level: int | None = Field(default=None, ge=1, le=6)
    semester: Literal["1st", "2nd", "summer"] | None = None
    confidence: float = Field(..., ge=0, le=1)
    label: str = ""
    header_text: str = ""
    signals: list[str] = Field(default_factory=list)
    region_x_start_pt: float = Field(..., ge=0)
    region_x_end_pt: float = Field(..., ge=0)
    region_y_start_pt: float = Field(..., ge=0)
    region_y_end_pt: float = Field(..., ge=0)
    columns: list[ColumnSpec]
    rows: list[RowSpec]


class DetectResponse(BaseModel):
    page_count: int
    proposals: list[DetectedTable]
    warnings: list[str] = Field(default_factory=list)