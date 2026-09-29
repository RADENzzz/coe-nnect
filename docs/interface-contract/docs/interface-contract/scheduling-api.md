# Scheduling API Contract (Frontend ↔ Backend)

## GET /api/v1/schedules
Returns all schedule entries for a term.

Query params:
- termId (required): string
- sectionId (optional): string
- facultyId (optional): string
- roomId (optional): string

Response:
```json
{
  "data": [
    {
      "id": "sch-001",
      "subjectId": "sub-1",
      "subjectCode": "CPE 101",
      "subjectTitle": "Programming Logic & Design",
      "sectionId": "sec-1",
      "sectionCode": "1A",
      "facultyId": "fac-1",
      "facultyName": "Prof. A",
      "roomId": "rm-206",
      "roomNumber": "206",
      "day": "MON",
      "startTime": "08:30",
      "endTime": "10:00",
      "loadType": "lecture",
      "deptId": "cpe",
      "deptColor": "#800000"
    }
  ]
}