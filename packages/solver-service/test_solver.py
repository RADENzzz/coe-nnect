import unittest

from solver import SolveRequest, solve_schedule


class ExistingSubjectLoadCountTests(unittest.TestCase):
    def test_existing_published_subject_is_not_generated_again(self):
        request = SolveRequest(
            termId="term-1",
            deptId="dept-1",
            sections=[
                {
                    "sectionId": "section-1",
                    "sectionCode": "CPE 1-A",
                    "programId": "program-1",
                    "yearLevel": 1,
                },
                {
                    "sectionId": "section-2",
                    "sectionCode": "CPE 1-B",
                    "programId": "program-1",
                    "yearLevel": 1,
                },
            ],
            subjects=[
                {
                    "subjectId": "subject-1",
                    "subjectCode": "CPE 115",
                    "title": "Test Subject",
                    "totalUnits": 3,
                    "lectureUnits": 3,
                    "labUnits": 0,
                    "deptId": "dept-1",
                }
            ],
            prospectus=[
                {
                    "prospectusId": "prospectus-1",
                    "programId": "program-1",
                    "subjectId": "subject-1",
                    "yearLevel": 1,
                    "semester": "1st",
                    "lecture_sessions_per_week": 1,
                    "lecture_minutes_per_session": 60,
                }
            ],
            faculty=[
                {
                    "facultyId": "faculty-1",
                    "firstName": "Test",
                    "lastName": "Faculty",
                    "deptId": "dept-1",
                }
            ],
            qualifications=[
                {"facultyId": "faculty-1", "subjectId": "subject-1"}
            ],
            rooms=[
                {
                    "roomId": "room-1",
                    "roomNumber": "101",
                    "roomType": "lecture_room",
                }
            ],
            timeSlots=[
                {"day": "Monday", "startTime": "07:00", "endTime": "08:00"},
                {"day": "Tuesday", "startTime": "07:00", "endTime": "08:00"},
            ],
            config={},
            existingSchedule=[
                {
                    "scheduleId": "schedule-1",
                    "facultyId": "faculty-1",
                    "roomId": "room-1",
                    "sectionId": "section-1",
                    "day": "Monday",
                    "startTime": "07:00",
                    "endTime": "08:00",
                }
            ],
            existingSubjectLoadCounts=[
                {
                    "sectionId": "section-1",
                    "subjectId": "subject-1",
                    "loadType": "lecture",
                    "count": 1,
                }
            ],
        )

        result = solve_schedule(request)

        self.assertEqual(result["status"], "success")
        self.assertEqual(
            [row["sectionId"] for row in result["schedule"]], ["section-2"]
        )

    def test_fully_plotted_subject_returns_empty_success(self):
        request = SolveRequest(
            termId="term-1",
            deptId="dept-1",
            sections=[
                {
                    "sectionId": "section-1",
                    "sectionCode": "CPE 1-A",
                    "programId": "program-1",
                    "yearLevel": 1,
                }
            ],
            subjects=[
                {
                    "subjectId": "subject-1",
                    "subjectCode": "CPE 115",
                    "title": "Test Subject",
                    "totalUnits": 3,
                    "lectureUnits": 3,
                    "labUnits": 0,
                    "deptId": "dept-1",
                }
            ],
            prospectus=[
                {
                    "prospectusId": "prospectus-1",
                    "programId": "program-1",
                    "subjectId": "subject-1",
                    "yearLevel": 1,
                    "semester": "1st",
                }
            ],
            faculty=[],
            qualifications=[],
            rooms=[],
            timeSlots=[],
            config={},
            existingSubjectLoadCounts=[
                {
                    "sectionId": "section-1",
                    "subjectId": "subject-1",
                    "loadType": "lecture",
                    "count": 1,
                }
            ],
        )

        result = solve_schedule(request)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["schedule"], [])
        self.assertEqual(result["unscheduled"], [])

    def test_existing_meetings_only_reduce_the_matching_load_type(self):
        request = SolveRequest(
            termId="term-1",
            deptId="dept-1",
            sections=[
                {
                    "sectionId": "section-1",
                    "sectionCode": "CPE 1-A",
                    "programId": "program-1",
                    "yearLevel": 1,
                }
            ],
            subjects=[
                {
                    "subjectId": "subject-1",
                    "subjectCode": "CPE 115",
                    "title": "Test Subject",
                    "totalUnits": 4,
                    "lectureUnits": 1,
                    "labUnits": 3,
                    "deptId": "dept-1",
                }
            ],
            prospectus=[
                {
                    "prospectusId": "prospectus-1",
                    "programId": "program-1",
                    "subjectId": "subject-1",
                    "yearLevel": 1,
                    "semester": "1st",
                    "lecture_sessions_per_week": 1,
                    "lecture_minutes_per_session": 60,
                    "lab_sessions_per_week": 1,
                    "lab_minutes_per_session": 60,
                }
            ],
            faculty=[
                {
                    "facultyId": "faculty-1",
                    "firstName": "Test",
                    "lastName": "Faculty",
                    "deptId": "dept-1",
                }
            ],
            qualifications=[
                {"facultyId": "faculty-1", "subjectId": "subject-1"}
            ],
            rooms=[
                {
                    "roomId": "room-1",
                    "roomNumber": "101",
                    "roomType": "lecture_room",
                },
                {
                    "roomId": "room-2",
                    "roomNumber": "Lab 1",
                    "roomType": "laboratory",
                },
            ],
            timeSlots=[
                {"day": "Monday", "startTime": "07:00", "endTime": "08:00"},
                {"day": "Tuesday", "startTime": "07:00", "endTime": "08:00"},
            ],
            config={},
            existingSubjectLoadCounts=[
                {
                    "sectionId": "section-1",
                    "subjectId": "subject-1",
                    "loadType": "laboratory",
                    "count": 1,
                }
            ],
        )

        result = solve_schedule(request)

        self.assertEqual(result["status"], "success")
        self.assertEqual(len(result["schedule"]), 1)
        self.assertEqual(result["schedule"][0]["loadType"], "lecture")


if __name__ == "__main__":
    unittest.main()
