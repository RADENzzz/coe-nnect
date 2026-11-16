"""Synthetic layout checks for the prospectus table detector.

Run from `packages/prospectus-parser`:

    python -m unittest discover -s tests -p "test_*.py"

These construct text baselines directly instead of rendering a PDF, so they
exercise the header/column/row heuristics without any external dependency.
"""
from __future__ import annotations

import unittest

from app.table_detector import Line, Word, _detect_on_page


def word(text: str, x0: float, x1: float, y0: float, y1: float) -> Word:
    return Word(text=text, x0=x0, y0=y0, x1=x1, y1=y1)


def line(y: float, entries: list[tuple[str, float, float]]) -> Line:
    return Line(
        words=[
            word(text, x0, x1, y - 5, y + 5) for text, x0, x1 in entries
        ]
    )


def role_list(proposal) -> list[str]:
    return [column.role for column in proposal.columns]


class ScreenshotElectiveLayoutTest(unittest.TestCase):
    """`Course Code | Course Title | No. Units` over `Lec Lab Total`."""

    def setUp(self) -> None:
        self.lines = [
            line(
                705,
                [
                    ("Course", 40, 80),
                    ("Code", 82, 110),
                    ("Course", 130, 170),
                    ("Title", 172, 205),
                    ("No.", 400, 420),
                    ("Units", 422, 455),
                ],
            ),
            line(
                692,
                [
                    ("Lec", 330, 352),
                    ("Lab", 372, 394),
                    ("Total", 412, 442),
                ],
            ),
            line(670, [("ROBOTICS", 40, 95), ("PROCESS", 97, 150),
                       ("AUTOMATION", 152, 220), ("(RPA)", 222, 258)]),
            line(
                650,
                [
                    ("CPE", 40, 62),
                    ("RPA", 64, 88),
                    ("1", 90, 98),
                    ("Robotics", 130, 175),
                    ("Process", 177, 220),
                    ("Automation", 222, 280),
                    ("3", 425, 433),
                ],
            ),
            line(630, [("SOFTWARE", 40, 100), ("DEVELOPMENT", 102, 185)]),
            line(
                610,
                [
                    ("CPE", 40, 62),
                    ("SD", 64, 84),
                    ("1", 86, 94),
                    ("Software", 130, 175),
                    ("Development", 177, 245),
                    ("3", 425, 433),
                ],
            ),
            line(
                590,
                [
                    ("MST", 40, 65),
                    ("101", 67, 92),
                    ("Mathematics", 130, 195),
                    ("for", 197, 210),
                    ("Computing", 212, 270),
                    ("3", 425, 433),
                ],
            ),
        ]

    def test_detects_five_columns_and_one_row_per_subject(self) -> None:
        proposals = _detect_on_page(0, self.lines)
        self.assertEqual(len(proposals), 1)
        proposal = proposals[0]

        self.assertEqual(
            role_list(proposal),
            ["code", "title", "lec", "lab", "total"],
        )
        # The two all-caps group headings bound rows but are not subjects.
        self.assertEqual(len(proposal.rows), 3)


class ThreeColumnElectiveTest(unittest.TestCase):
    def test_total_only_layout(self) -> None:
        lines = [
            line(
                700,
                [
                    ("Course", 40, 80),
                    ("Code", 82, 110),
                    ("Course", 130, 170),
                    ("Title", 172, 205),
                    ("No.", 400, 420),
                    ("Units", 422, 455),
                ],
            ),
            line(
                680,
                [
                    ("MST", 40, 65),
                    ("101", 67, 92),
                    ("Mathematics", 130, 195),
                    ("3", 425, 433),
                ],
            ),
            line(
                660,
                [
                    ("SSP", 40, 65),
                    ("103", 67, 92),
                    ("Social", 130, 175),
                    ("Science", 177, 225),
                    ("3", 425, 433),
                ],
            ),
        ]

        proposals = _detect_on_page(0, lines)
        self.assertEqual(len(proposals), 1)
        self.assertEqual(role_list(proposals[0]), ["code", "title", "total"])
        self.assertEqual(len(proposals[0].rows), 2)


class TwoColumnElectiveTest(unittest.TestCase):
    def test_code_and_title_without_units(self) -> None:
        lines = [
            line(
                700,
                [
                    ("Course", 40, 80),
                    ("Code", 82, 110),
                    ("Course", 130, 170),
                    ("Title", 172, 205),
                ],
            ),
            line(
                680,
                [
                    ("A&H", 40, 65),
                    ("101", 67, 92),
                    ("Art", 130, 160),
                    ("Appreciation", 162, 225),
                ],
            ),
            line(
                660,
                [
                    ("SSP", 40, 65),
                    ("103", 67, 92),
                    ("Social", 130, 175),
                    ("Science", 177, 225),
                ],
            ),
        ]

        proposals = _detect_on_page(0, lines)
        self.assertEqual(len(proposals), 1)
        self.assertEqual(role_list(proposals[0]), ["code", "title"])
        self.assertEqual(len(proposals[0].rows), 2)


class SideBySideSemesterTest(unittest.TestCase):
    """Two full semester tables printed side by side on one page."""

    def setUp(self) -> None:
        self.lines = [
            line(772, [("FIRST", 270, 300), ("YEAR", 302, 330)]),
            line(
                752,
                [
                    ("First", 110, 135),
                    ("Semester", 137, 175),
                    ("Second", 420, 455),
                    ("Semester", 457, 495),
                ],
            ),
            line(740, [("Units", 250, 270), ("Units", 530, 550)]),
            line(
                735,
                [
                    ("Grade", 40, 60),
                    ("Code", 62, 80),
                    ("Descriptive", 100, 140),
                    ("Title", 142, 160),
                    ("Prereq", 190, 210),
                    ("Grade", 320, 340),
                    ("Code", 342, 360),
                    ("Descriptive", 380, 420),
                    ("Title", 422, 440),
                    ("Prereq", 470, 495),
                ],
            ),
            line(
                731,
                [
                    ("Lec", 220, 235),
                    ("Lab", 240, 255),
                    ("Total", 260, 280),
                    ("Lec", 500, 515),
                    ("Lab", 520, 535),
                    ("Total", 540, 560),
                ],
            ),
            line(
                720,
                [
                    ("BEM", 40, 62),
                    ("111", 64, 80),
                    ("Engineering", 100, 140),
                    ("Calculus", 142, 175),
                    ("1", 177, 183),
                    ("None", 190, 210),
                    ("3", 220, 225),
                    ("0", 240, 245),
                    ("3", 260, 265),
                    ("BEM", 320, 342),
                    ("112", 344, 360),
                    ("Engineering", 380, 420),
                    ("Calculus", 422, 455),
                    ("2", 457, 463),
                    ("BEM", 470, 485),
                    ("111", 487, 495),
                    ("3", 500, 505),
                    ("0", 520, 525),
                    ("3", 540, 545),
                ],
            ),
            line(
                700,
                [
                    ("BES", 40, 62),
                    ("111", 64, 80),
                    ("Chemistry", 100, 145),
                    ("for", 147, 160),
                    ("Engineers", 162, 205),
                    ("None", 190, 210),
                    ("3", 220, 225),
                    ("1", 240, 245),
                    ("4", 260, 265),
                    ("BES", 320, 342),
                    ("112", 344, 360),
                    ("Physics", 380, 415),
                    ("for", 417, 430),
                    ("Engineers", 432, 475),
                    ("BEM", 470, 485),
                    ("111", 487, 495),
                    ("3", 500, 505),
                    ("1", 520, 525),
                    ("4", 540, 545),
                ],
            ),
        ]

    def test_splits_into_one_proposal_per_semester(self) -> None:
        proposals = _detect_on_page(0, self.lines)
        self.assertEqual(len(proposals), 2)

        left, right = proposals
        self.assertEqual((left.year_level, left.semester), (1, "1st"))
        self.assertEqual((right.year_level, right.semester), (1, "2nd"))
        self.assertEqual(
            role_list(left),
            ["code", "title", "prereq", "lec", "lab", "total"],
        )
        self.assertEqual(role_list(right), role_list(left))
        self.assertEqual(len(left.rows), 2)
        self.assertEqual(len(right.rows), 2)
        self.assertLess(left.region_x_end_pt, right.region_x_start_pt)


class AmbiguousPageFallbackTest(unittest.TestCase):
    def _table(self, heading_entries: list[tuple[str, float, float]]):
        return [
            line(
                700,
                [
                    ("Grade", 40, 60),
                    ("Code", 62, 80),
                    ("Descriptive", 100, 140),
                    ("Title", 142, 160),
                    ("Prereq", 190, 210),
                    ("Lec", 220, 235),
                    ("Lab", 240, 255),
                    ("Total", 260, 280),
                ],
            ),
            line(
                680,
                [
                    ("BEM", 40, 62),
                    ("111", 64, 80),
                    ("Engineering", 100, 140),
                    ("Calculus", 142, 175),
                    ("1", 177, 183),
                    ("None", 190, 210),
                    ("3", 220, 225),
                    ("0", 240, 245),
                    ("3", 260, 265),
                ],
            ),
            line(
                660,
                [
                    ("BES", 40, 62),
                    ("111", 64, 80),
                    ("Chemistry", 100, 145),
                    ("for", 147, 160),
                    ("Engineers", 162, 205),
                    ("None", 190, 210),
                    ("3", 220, 225),
                    ("1", 240, 245),
                    ("4", 260, 265),
                ],
            ),
            line(600, heading_entries),
        ]

    def test_leaves_semester_null_when_page_names_both(self) -> None:
        proposals = _detect_on_page(
            0,
            self._table(
                [
                    ("First", 100, 130),
                    ("Semester", 132, 170),
                    ("Second", 400, 440),
                    ("Semester", 442, 480),
                ]
            ),
        )
        self.assertEqual(len(proposals), 1)
        self.assertIsNone(proposals[0].semester)

    def test_uses_page_semester_when_only_one_is_named(self) -> None:
        proposals = _detect_on_page(
            0,
            self._table(
                [
                    ("Second", 400, 440),
                    ("Semester", 442, 480),
                ]
            ),
        )
        self.assertEqual(len(proposals), 1)
        self.assertEqual(proposals[0].semester, "2nd")


class OneRowTableBeforeHeadingTest(unittest.TestCase):
    def test_heading_after_a_single_row_starts_the_next_table(self) -> None:
        lines = [
            line(
                700,
                [
                    ("Grade", 40, 60),
                    ("Code", 62, 80),
                    ("Descriptive", 100, 140),
                    ("Title", 142, 160),
                    ("Prereq", 190, 210),
                    ("Lec", 220, 235),
                    ("Lab", 240, 255),
                    ("Total", 260, 280),
                ],
            ),
            line(
                680,
                [
                    ("BEM", 40, 62),
                    ("111", 64, 80),
                    ("Engineering", 100, 140),
                    ("Calculus", 142, 175),
                    ("1", 177, 183),
                    ("None", 190, 210),
                    ("3", 220, 225),
                    ("0", 240, 245),
                    ("3", 260, 265),
                ],
            ),
            line(660, [("Second", 240, 280), ("Semester", 282, 320)]),
            line(
                640,
                [
                    ("Grade", 40, 60),
                    ("Code", 62, 80),
                    ("Descriptive", 100, 140),
                    ("Title", 142, 160),
                    ("Prereq", 190, 210),
                    ("Lec", 220, 235),
                    ("Lab", 240, 255),
                    ("Total", 260, 280),
                ],
            ),
            line(
                620,
                [
                    ("BES", 40, 62),
                    ("111", 64, 80),
                    ("Chemistry", 100, 145),
                    ("for", 147, 160),
                    ("Engineers", 162, 205),
                    ("None", 190, 210),
                    ("3", 220, 225),
                    ("1", 240, 245),
                    ("4", 260, 265),
                ],
            ),
            line(
                600,
                [
                    ("CPE", 40, 62),
                    ("111", 64, 80),
                    ("Programming", 100, 150),
                    ("Logic", 152, 180),
                    ("None", 190, 210),
                    ("0", 220, 225),
                    ("2", 240, 245),
                    ("2", 260, 265),
                ],
            ),
        ]

        proposals = _detect_on_page(0, lines)
        # The one-row table is too small to propose, but its single row must
        # not leak into the second table's body.
        self.assertEqual(len(proposals), 1)
        self.assertEqual(proposals[0].semester, "2nd")
        self.assertEqual(len(proposals[0].rows), 2)


if __name__ == "__main__":
    unittest.main()
