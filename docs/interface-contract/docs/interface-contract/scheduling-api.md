# Scheduling API reference

This is a route-level guide to the schedule endpoints implemented by [`SchedulingController`](../../../../apps/backend/src/modules/scheduling/scheduling.controller.ts). The API prefix defaults to `/api`; the routes below use `/api/v1/schedules`. The prefix can be changed with `API_PREFIX`.

Requests require a valid authenticated session. Individual route roles and department ownership are enforced by the controller and service. For exact DTO validation and response fields, consult the linked controller, DTOs, service, and frontend API client; this page is an overview, not a generated OpenAPI schema.

## Listing and inspection

| Method and path                               | Purpose                                     | Query                                                   |
| --------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `GET /api/v1/schedules`                       | List schedules; returns `{ "data": [...] }` | `termId` is optional; when omitted, lists all schedules |
| `GET /api/v1/schedules/active-term`           | Get the active term                         | —                                                       |
| `GET /api/v1/schedules/unscheduled`           | Get unscheduled records                     | `termId`                                                |
| `GET /api/v1/schedules/flagged`               | List flagged schedule entries               | `termId`                                                |
| `GET /api/v1/schedules/room-sufficiency`      | Get room sufficiency information            | Optional `deptId`, `termId`                             |
| `GET /api/v1/schedules/versions`              | List saved versions                         | `termId`                                                |
| `GET /api/v1/schedules/versions/:versionId`   | Read a saved version                        | —                                                       |
| `GET /api/v1/schedules/versions/compare`      | Compare two versions                        | `a`, `b` version IDs                                    |
| `GET /api/v1/schedules/auto-generate/pending` | Read the current auto-generation state      | `termId`                                                |

Static paths such as `versions/compare` and `active-term` are declared before parameterized schedule-ID routes in the controller.

## Create, validate, and generate

| Method and path                                   | Purpose                                    |
| ------------------------------------------------- | ------------------------------------------ |
| `POST /api/v1/schedules/validate`                 | Validate a proposed plot without saving it |
| `POST /api/v1/schedules/plot`                     | Create a schedule entry                    |
| `POST /api/v1/schedules/plot-multi`               | Create multiple schedule entries           |
| `POST /api/v1/schedules/auto-generate`            | Generate candidate schedule entries        |
| `POST /api/v1/schedules/auto-generate/confirm`    | Confirm generated entries                  |
| `POST /api/v1/schedules/auto-generate/discard`    | Discard generated entries                  |
| `POST /api/v1/schedules/auto-generate/abandon`    | Release an auto-generation attempt         |
| `DELETE /api/v1/schedules/auto-drafts?termId=...` | Clear auto-generated drafts for a term     |

`POST /plot` uses `PlotSubjectDto`. Its ID fields are numeric strings; `dayOfWeek` is a full weekday name, `startTime` and `endTime` use `HH:MM` or `HH:MM:SS`, and `loadType` may be `lecture`, `laboratory`, or `other`.

Example:

```json
{
  "termId": "1",
  "subjectId": "12",
  "facultyId": "7",
  "roomId": "3",
  "section": "1A",
  "loadType": "lecture",
  "dayOfWeek": "Monday",
  "startTime": "08:30",
  "endTime": "10:00"
}
```

The validation request is defined separately in `ValidatePlotDto`; for example, `facultyId` and `roomId` are optional there.

## Update and delete

| Method and path                       | Purpose                     |
| ------------------------------------- | --------------------------- |
| `PATCH /api/v1/schedules/:id`         | Update a schedule entry     |
| `PATCH /api/v1/schedules/:id/status`  | Change schedule status      |
| `PATCH /api/v1/schedules/:id/remarks` | Update remarks              |
| `POST /api/v1/schedules/:id/flag`     | Flag an entry with a reason |
| `DELETE /api/v1/schedules/:id/flag`   | Remove a flag               |
| `DELETE /api/v1/schedules/:id`        | Delete a schedule entry     |

Most controller methods wrap their result in a `data` property. Check the specific controller method for operations with different response shapes.

## Sources

- [Scheduling controller](../../../../apps/backend/src/modules/scheduling/scheduling.controller.ts)
- [Plot DTO](../../../../apps/backend/src/modules/scheduling/dto/plot-subject.dto.ts)
- [Validation DTO](../../../../apps/backend/src/modules/scheduling/dto/validate-plot.dto.ts)
- [Scheduling service](../../../../apps/backend/src/modules/scheduling/scheduling.service.ts)
- [Frontend schedule API](../../../../apps/frontend/src/api/schedule.api.ts)
