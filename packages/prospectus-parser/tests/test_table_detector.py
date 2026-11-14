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


if __name__ == "__main__":
    unittest.main()
