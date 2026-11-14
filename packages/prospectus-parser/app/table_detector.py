"""Heuristic table detection for prospectus PDFs.

The editor already lets a user draw a rectangle around a table. This module
does the opposite: it reads the PDF text layer, groups glyphs into words and
lines, recognises a course-table header, and proposes table geometry (region,
column slices, and one row band per text line).

It is intentionally conservative. A proposal is only returned when the page
has a header line with several known column labels and the body below it
contains course-code-like lines. Anything ambiguous is left to the user.
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from typing import Any, Iterable

from .models import ColumnSpec, DetectedTable, RowSpec

# ── Data structures ────────────────────────────────────────────────


@dataclass
class Word:
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

    @property
    def width(self) -> float:
        return max(0.1, self.x1 - self.x0)


@dataclass
class Line:
    words: list[Word] = field(default_factory=list)

    @property
    def x0(self) -> float:
        return min(w.x0 for w in self.words)

    @property
    def x1(self) -> float:
        return max(w.x1 for w in self.words)

    @property
    def y0(self) -> float:
        return min(w.y0 for w in self.words)

    @property
    def y1(self) -> float:
        return max(w.y1 for w in self.words)

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def height(self) -> float:
        return max(0.1, self.y1 - self.y0)

    @property
    def text(self) -> str:
        return " ".join(w.text for w in sorted(self.words, key=lambda w: w.x0))


# ── Word / line reconstruction ─────────────────────────────────────


def _flush_word(buf: list[Word], out: list[Word]) -> None:
    if not buf:
        return
    text = "".join(w.text for w in buf).strip()
    if text:
        out.append(
            Word(
                text=text,
                x0=min(w.x0 for w in buf),
                y0=min(w.y0 for w in buf),
                x1=max(w.x1 for w in buf),
                y1=max(w.y1 for w in buf),
            )
        )
    buf.clear()


def extract_words(textpage: Any) -> list[Word]:
    """Rebuild words from pypdfium2 character boxes."""
    try:
        count = int(textpage.count_chars())
    except Exception:
        return []

    words: list[Word] = []
    buf: list[Word] = []

    for i in range(count):
        try:
            raw = textpage.get_text_range(i, 1)
        except Exception:
            continue
        if not raw:
            continue
        if raw.isspace():
            _flush_word(buf, words)
            continue

        try:
            left, bottom, right, top = textpage.get_charbox(i)
        except Exception:
            _flush_word(buf, words)
            continue

        char = Word(
            text=raw,
            x0=float(left),
            y0=float(bottom),
            x1=float(right),
            y1=float(top),
        )
        if char.x1 <= char.x0 or char.y1 <= char.y0:
            _flush_word(buf, words)
            continue

        if buf:
            prev = buf[-1]
            gap = char.x0 - prev.x1
            overlap = min(char.y1, prev.y1) - max(char.y0, prev.y0)
            min_height = min(char.height, prev.height)
            # A word ends at whitespace above, a large horizontal gap, or a
            # baseline change. 0.45 of the glyph height tolerates kerning.
            if gap > max(1.5, 0.45 * char.height) or overlap < 0.45 * min_height:
                _flush_word(buf, words)

        buf.append(char)

    _flush_word(buf, words)
    return words


def build_lines(words: Iterable[Word]) -> list[Line]:
    """Group words into text lines using vertical overlap."""
    lines: list[Line] = []
    for word in sorted(words, key=lambda w: (-w.y1, w.x0)):
        placed = False
        for line in lines:
            overlap = min(word.y1, line.y1) - max(word.y0, line.y0)
            min_height = min(word.height, line.height)
            if overlap >= 0.45 * min_height:
                line.words.append(word)
                placed = True
                break
        if not placed:
            lines.append(Line(words=[word]))

    for line in lines:
        line.words.sort(key=lambda w: w.x0)
    lines.sort(key=lambda l: (-l.y1, l.x0))
    return lines


# ── Header recognition ─────────────────────────────────────────────

ROLE_KEYWORDS: dict[str, set[str]] = {
    "code": {"code", "crs", "coursecode", "subjectcode"},
    "title": {"title", "descriptive", "description", "coursetitle"},
    "prereq": {
        "pre",
        "prereq",
        "prerequisite",
        "prerequisites",
        "requisite",
        "requisites",
    },
    "lec": {"lec", "lecture", "lectures", "theory"},
    "lab": {"lab", "laboratory", "labs"},
    "total": {"total", "units", "unit", "credits", "credit"},
}


def _normalise(token: str) -> str:
    return re.sub(r"[^a-z0-9]", "", token.lower())


def _role_for_token(token: str) -> str | None:
    key = _normalise(token)
    if not key:
        return None
    for role, words in ROLE_KEYWORDS.items():
        if key in words:
            return role
    # "Pre-requisite" sometimes arrives split into "Pre" + "requisite".
    if key.startswith("prereq") or key in {"prerequi", "requisit"}:
        return "prereq"
    return None


def header_roles(line: Line) -> dict[str, float]:
    """Return role -> x-centre for the labels found on a candidate header."""
    found: dict[str, list[float]] = {}
    words = sorted(line.words, key=lambda w: w.x0)

    for i, word in enumerate(words):
        role = _role_for_token(word.text)
        centre = word.cx

        # Two-word labels: "Course Code", "Subject Code", "Course Title".
        if role is None and _normalise(word.text) in {"course", "subject"}:
            nxt = words[i + 1] if i + 1 < len(words) else None
            if nxt is not None:
                pair = _normalise(nxt.text)
                if pair in {"code", "no", "number"}:
                    role = "code"
                    centre = (word.cx + nxt.cx) / 2
                elif pair in {"title", "description", "descriptive"}:
                    role = "title"
                    centre = (word.cx + nxt.cx) / 2

        # "Pre-requisite" split into "Pre" + "requisite".
        if role == "prereq" and _normalise(word.text) == "pre":
            nxt = words[i + 1] if i + 1 < len(words) else None
            if nxt is not None and _normalise(nxt.text).startswith("requis"):
                centre = (word.cx + nxt.cx) / 2

        if role is not None:
            found.setdefault(role, []).append(centre)

    return {role: sum(xs) / len(xs) for role, xs in found.items()}


def _default_columns(x0: float, x1: float) -> list[ColumnSpec]:
    weights = [0.12, 0.45, 0.15, 0.09, 0.09, 0.1]
    roles = ["code", "title", "prereq", "lec", "lab", "total"]
    total = max(1.0, x1 - x0)
    cursor = x0
    columns: list[ColumnSpec] = []
    for role, weight in zip(roles, weights):
        width = total * weight
        columns.append(
            ColumnSpec(
                role=role,  # type: ignore[arg-type]
                x_start_pt=cursor,
                x_end_pt=cursor + width,
            )
        )
        cursor += width
    return columns


def columns_from_header(
    anchors: dict[str, float],
    x0: float,
    x1: float,
) -> list[ColumnSpec]:
    """Build column slices from the labels found on the header line.

    Elective tables are not fixed to six roles. A total-only table names
    code/title/total, a lec+lab table names code/title/lec/lab/total, and an
    all-lecture or all-laboratory table names a single unit column. Use
    whatever labels exist instead of falling back to the six-column default.
    """
    # Two labels are the minimum needed to draw a boundary, and a course
    # table always has a title column.
    if len(anchors) < 2 or "title" not in anchors:
        return _default_columns(x0, x1)

    ordered = sorted(anchors.items(), key=lambda item: item[1])
    boundaries = [x0]
    for (_, left), (_, right) in zip(ordered, ordered[1:]):
        boundaries.append((left + right) / 2)
    boundaries.append(x1)

    columns: list[ColumnSpec] = []
    for index, (role, _) in enumerate(ordered):
        start = max(x0, min(x1, boundaries[index]))
        end = max(x0, min(x1, boundaries[index + 1]))
        # Collapsed boundaries can happen when two labels sit almost on top of
        # each other. Keep a 1pt slice so the layout stays valid.
        if end - start < 1:
            end = min(x1, start + 1)
        if end <= start:
            return _default_columns(x0, x1)
        columns.append(
            ColumnSpec(
                role=role,  # type: ignore[arg-type]
                x_start_pt=start,
                x_end_pt=end,
            )
        )
    return columns


# ── Body / year / semester ─────────────────────────────────────────

CODE_RE = re.compile(r"^[A-Z]{2,6}\d{2,4}[A-Z]?$")
CODE_SPLIT_RE = re.compile(r"^([A-Z]{2,6})[- ]?(\d{2,4}[A-Z]?)$")
YEAR_WORD_RE = re.compile(
    r"\b(first|second|third|fourth|fifth|sixth)\s+year\b", re.IGNORECASE
)
YEAR_NUM_RE = re.compile(r"\byear\s*(?:level\s*)?([1-6])\b", re.IGNORECASE)
YEAR_ORD_RE = re.compile(
    r"\b([1-6])(?:st|nd|rd|th)\s+year\b", re.IGNORECASE
)
SEM_FIRST_RE = re.compile(
    r"\b(first|1st)\s*(?:semester|sem)\b", re.IGNORECASE
)
SEM_SECOND_RE = re.compile(
    r"\b(second|2nd)\s*(?:semester|sem)\b", re.IGNORECASE
)
SEM_SUMMER_RE = re.compile(r"\b(summer|midyear|mid-year)\b", re.IGNORECASE)

YEAR_WORDS = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
}
SEMESTER_WORDS = {"first": "1st", "second": "2nd"}


def is_code_like(line: Line) -> bool:
    words = [w.text for w in sorted(line.words, key=lambda w: w.x0)]
    if not words:
        return False
    first = re.sub(r"[^A-Za-z0-9]", "", words[0])
    if CODE_RE.match(first):
        return True
    if CODE_SPLIT_RE.match(words[0]):
        return True
    if len(words) >= 2 and re.fullmatch(r"[A-Z]{2,6}", first):
        second = re.sub(r"[^A-Za-z0-9]", "", words[1])
        if re.fullmatch(r"\d{2,4}[A-Z]?", second):
            return True
        # Multi-word elective codes such as "CPE RPA 1" or "CPE SD 1".
        if (
            len(words) >= 3
            and re.fullmatch(r"[A-Z]{2,6}", second)
            and re.fullmatch(r"\d{1,4}[A-Z]?", words[2].strip())
        ):
            return True
    if (
        len(words) >= 3
        and re.search(r"\d", line.text)
        and any(
            "elective" in w.lower() or "free" in w.lower()
            for w in words[:3]
        )
    ):
        return True
    return False


def infer_year(text: str) -> int | None:
    match = YEAR_WORD_RE.search(text)
    if match:
        return YEAR_WORDS.get(match.group(1).lower())
    match = YEAR_NUM_RE.search(text)
    if match:
        return int(match.group(1))
    match = YEAR_ORD_RE.search(text)
    if match:
        return int(match.group(1))
    return None


def infer_semester(text: str) -> str | None:
    if SEM_SUMMER_RE.search(text):
        return "summer"
    match = SEM_FIRST_RE.search(text)
    if match:
        return "1st"
    match = SEM_SECOND_RE.search(text)
    if match:
        return "2nd"
    return None


def infer_year_semester(
    lines: list[Line],
    header: Line,
    region_x0: float,
    region_x1: float,
) -> tuple[int | None, str | None, str]:
    """Prefer the closest headings ABOVE the table; fall back to the page.

    PDF y grows upward, so a heading above the table has a larger y.
    Scanning below the header would pick up the next table's heading and
    mislabel every table after the first one on a page.
    """
    above = [
        line
        for line in lines
        if line is not header and line.y1 > header.y1 + 1
    ]
    above.sort(key=lambda line: line.y1 - header.y1)

    # Headings that horizontally overlap the table are the strongest signal;
    # wide page headers outside the table are only a fallback.
    overlapping = [
        line
        for line in above
        if line.x1 >= region_x0 - 80 and line.x0 <= region_x1 + 80
    ]
    outside = [line for line in above if line not in overlapping]
    candidates = overlapping + outside

    year: int | None = None
    semester: str | None = None
    label = ""

    for line in candidates[:12]:
        if year is None:
            found = infer_year(line.text)
            if found is not None:
                year = found
                label = label or line.text
        if semester is None:
            found = infer_semester(line.text)
            if found is not None:
                semester = found
                label = label or line.text
        if year is not None and semester is not None:
            break

    # A heading may only name one of the two; fill the rest from the page.
    if year is None or semester is None:
        page_text = "\n".join(line.text for line in lines)
        if year is None:
            year = infer_year(page_text)
        if semester is None:
            semester = infer_semester(page_text)

    return year, semester, label


# ── Main detection ─────────────────────────────────────────────────


def _is_section_heading(line: Line) -> bool:
    """True for year/term headings and all-caps elective group headings."""
    text = line.text.strip()
    if not text:
        return False
    if infer_year(text) is not None or infer_semester(text) is not None:
        return True

    # "ROBOTICS PROCESS AUTOMATION (RPA)", "SOFTWARE DEVELOPMENT", etc.
    # Course codes and rows with units contain digits, so they are excluded.
    if re.search(r"\d", text) or is_code_like(line):
        return False
    words = text.split()
    if len(words) < 2 or len(words) > 10:
        return False
    if not re.search(r"[A-Za-z]", text):
        return False
    return text == text.upper()


def _line_has_units(line: Line, columns: list[ColumnSpec]) -> bool:
    """True when a numeric word sits inside a lec/lab/total column."""
    unit_columns = [
        column
        for column in columns
        if column.role in {"lec", "lab", "total"}
    ]
    if not unit_columns:
        return False
    for word in line.words:
        if not re.search(r"\d", word.text):
            continue
        if any(
            column.x_start_pt <= word.cx <= column.x_end_pt
            for column in unit_columns
        ):
            return True
    return False


def _line_starts_row(line: Line, columns: list[ColumnSpec]) -> bool:
    """A subject row starts with a code or with units, never with prose."""
    if is_code_like(line):
        return True
    if _line_has_units(line, columns):
        return True
    # Fallback for slightly misaligned columns: a line ending in two numeric
    # values is a lec/lab/total row, while a wrapped title ends in a word.
    return bool(
        re.search(r"\d+(?:[./]\d+)*\s+\d+(?:[./]\d+)*\s*$", line.text)
    )


def _median_line_height(lines: list[Line]) -> float:
    heights = [line.height for line in lines if line.height > 0]
    return statistics.median(heights) if heights else 10.0


def _detect_on_page(
    page_index: int,
    lines: list[Line],
) -> list[DetectedTable]:
    proposals: list[DetectedTable] = []
    cursor = 0
    median_height = _median_line_height(lines)
    max_gap = max(20.0, median_height * 3.2)

    while cursor < len(lines):
        header_index: int | None = None
        anchors: dict[str, float] = {}
        for i in range(cursor, len(lines)):
            line = lines[i]
            if len(line.words) < 2:
                continue
            roles = header_roles(line)
            # A three-label header is a strong signal. Elective tables may
            # print only code + title, so a title-bearing two-label header is
            # accepted too. Data rows never name a "title" column.
            if len(roles) >= 3 or (len(roles) == 2 and "title" in roles):
                header_index = i
                anchors = roles
                break

        if header_index is None:
            break

        header = lines[header_index]
        header_lines = [header]
        header_bottom = header.y0
        consumed_headers = 1

        # Multi-line headers put a second batch of labels on the next
        # baseline (for example "Lec Lab" above "Total"). Merge those labels
        # before the body starts so they do not become a subject row.
        for candidate in lines[header_index + 1 :]:
            if candidate.y1 > header_bottom + 1:
                continue
            gap = header_bottom - candidate.y1
            if gap > max(6.0, median_height * 1.5):
                break
            if re.search(r"\d", candidate.text) or is_code_like(candidate):
                break
            extra = header_roles(candidate)
            if not extra:
                break
            added = False
            for role, x in extra.items():
                if role not in anchors:
                    anchors[role] = x
                    added = True
            if not added:
                break
            header_bottom = candidate.y0
            header_lines.append(candidate)
            consumed_headers += 1

        body: list[Line] = []
        last_bottom = header_bottom

        for line in lines[header_index + consumed_headers :]:
            if line.y1 > header_bottom - 1:
                continue
            if body:
                gap = last_bottom - line.y1
                if gap > max_gap:
                    break
                # A second header directly below means a new table.
                second_roles = header_roles(line)
                if len(line.words) >= 2 and (
                    len(second_roles) >= 3
                    or (len(second_roles) == 2 and "title" in second_roles)
                ):
                    break
                # A "SECOND YEAR / 1st SEMESTER" heading below the rows
                # belongs to the next table on the page, not this one.
                if (
                    len(body) >= 2
                    and not is_code_like(line)
                    and len(line.words) <= 8
                    and (
                        infer_year(line.text) is not None
                        or infer_semester(line.text) is not None
                    )
                ):
                    break
            else:
                # Skip section headings ("FIRST YEAR", "SECOND SEMESTER")
                # between the header and the first real course row.
                if not is_code_like(line) and (
                    infer_year(line.text) is not None
                    or infer_semester(line.text) is not None
                    or len(line.words) <= 3
                ):
                    last_bottom = line.y0
                    continue
            body.append(line)
            last_bottom = line.y0
            if len(body) >= 80:
                break

        # Region is the union of the header line(s) and the accepted body.
        all_words = [
            w for line in [*header_lines, *body] for w in line.words
        ]
        x0 = min(w.x0 for w in all_words) - 2.0
        x1 = max(w.x1 for w in all_words) + 2.0
        y_top = header.y1 + 2.0
        y_bottom = min(line.y0 for line in body) - 2.0

        if x1 - x0 < 100 or y_top - y_bottom < 40:
            cursor = header_index + 1
            continue

        columns = columns_from_header(anchors, x0, x1)

        # Group body lines into subject rows. A line starts a new row when it
        # carries a course code or units in the lec/lab/total columns; wrapped
        # title lines stay with the row above. Section headings bound rows but
        # never become rows themselves.
        groups: list[list[Line]] = []
        current: list[Line] | None = None
        for line in body:
            if _is_section_heading(line):
                if current:
                    groups.append(current)
                    current = None
                continue
            if _line_starts_row(line, columns) or current is None:
                if current:
                    groups.append(current)
                current = [line]
            else:
                current.append(line)
        if current:
            groups.append(current)

        code_like = sum(1 for group in groups if is_code_like(group[0]))
        code_ratio = code_like / len(groups) if groups else 0.0

        if len(groups) < 2 or code_ratio < 0.2:
            cursor = header_index + 1
            continue

        positions = {id(line): index for index, line in enumerate(body)}
        y_bottom = min(group[-1].y0 for group in groups) - 2.0

        rows: list[RowSpec] = []
        for i, group in enumerate(groups):
            first = group[0]
            last = group[-1]
            first_index = positions.get(id(first), 0)
            last_index = positions.get(id(last), first_index)

            if first_index > 0:
                above = body[first_index - 1]
                top = (first.y1 + above.y0) / 2
            else:
                top = (first.y1 + header_bottom) / 2

            if last_index + 1 < len(body):
                below = body[last_index + 1]
                bottom = (last.y0 + below.y1) / 2
            else:
                bottom = last.y0 - 2.0

            if bottom >= top:
                continue
            rows.append(
                RowSpec(
                    row_id=f"d{page_index}_{i}",
                    y_top_pt=round(top, 3),
                    y_bottom_pt=round(bottom, 3),
                )
            )

        if len(rows) < 2:
            cursor = header_index + 1
            continue

        year, semester, label_line = infer_year_semester(
            lines, header, x0, x1
        )

        confidence = 0.35
        confidence += 0.35 * min(1.0, code_ratio / 0.7)
        confidence += 0.15 if len(anchors) >= 6 else 0.0
        confidence += 0.15 if year is not None and semester is not None else 0.0
        confidence = round(min(1.0, confidence), 3)

        signals = [
            f"{len(anchors)} column label{'s' if len(anchors) != 1 else ''}",
            f"{code_like} course-like row{'s' if code_like != 1 else ''}",
        ]
        if year is not None:
            signals.append(f"year {year}")
        if semester is not None:
            signals.append(f"semester {semester}")

        label = " · ".join(
            part
            for part in [
                f"Year {year}" if year is not None else "",
                semester or "",
                label_line if label_line and len(label_line) <= 80 else "",
            ]
            if part
        ).strip()

        proposals.append(
            DetectedTable(
                page_index=page_index,
                year_level=year,
                semester=semester,  # type: ignore[arg-type]
                confidence=confidence,
                label=label or header.text[:120],
                header_text=header.text[:200],
                signals=signals,
                region_x_start_pt=round(x0, 3),
                region_x_end_pt=round(x1, 3),
                region_y_start_pt=round(y_bottom, 3),
                region_y_end_pt=round(y_top, 3),
                columns=columns,
                rows=rows,
            )
        )

        cursor = header_index + 1 + len(body)

    return proposals


def detect_tables(
    textpages: dict[int, Any],
    page_sizes: dict[int, tuple[float, float]],
    page_indices: list[int] | None,
    max_tables: int,
) -> tuple[list[DetectedTable], list[str]]:
    proposals: list[DetectedTable] = []
    warnings: list[str] = []

    requested = page_indices if page_indices is not None else sorted(textpages)
    for page_index in requested:
        textpage = textpages.get(page_index)
        if textpage is None:
            continue
        words = extract_words(textpage)
        if not words:
            warnings.append(
                f"Page {page_index + 1} has no selectable text; "
                "it may be a scan or an image."
            )
            continue
        lines = build_lines(words)
        page_proposals = _detect_on_page(page_index, lines)
        proposals.extend(page_proposals)
        if len(proposals) >= max_tables:
            proposals = proposals[:max_tables]
            break

    if not proposals:
        warnings.append(
            "No course table was recognised. The header may use unusual "
            "labels, or the page may be an image. Draw a table manually "
            "instead."
        )

    return proposals, warnings
