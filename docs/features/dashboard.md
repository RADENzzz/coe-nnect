# Dashboard

CoE-NNECT has two dashboards: a department-scoped dashboard for department heads and a college-wide dashboard for the dean and college secretary. Both are built from live API queries and use rolling number/text animations for changing values.

## Department head dashboard

Route: `/dashboard`

The department head dashboard summarizes the signed-in head's department for the active term. It is the first screen after sign-in and links into the planner, faculty directory, room reports, and approvals.

### Header

- Greeting and department name.
- Live clock, date, and "last refreshed" label rendered with rolling animations.
- **Refresh dashboard** action that invalidates the dashboard queries.
- Links to the timetable and other primary actions.

### Summary cards

| Card | Value | Hint/behavior |
| --- | --- | --- |
| **Class blocks** | Total schedule rows for the active term | Finalized/published count or "Nothing plotted yet". Opens the timetable. |
| **Faculty** | Active faculty in the department | Qualification/sync status summary. Opens the faculty directory. |
| **Room sufficiency** | Whether projected demand fits room capacity | Shows room and block counts, or a prompt to activate a term. Opens the room report. |
| **Needs attention** | Flagged classes, unassigned blocks, pending requests | Opens the attention section or relevant page. |

### Faculty workload

Compares assigned teaching load with required hours for each faculty member. The card shows the highest-load cases first and links to the workload report. Data comes from `GET /api/v1/faculty/status-summary` and the faculty list.

### Room sufficiency

Compares projected demand with room capacity by room type. When demand exceeds capacity, the card lists the largest deficits and links to the full room-sufficiency report (`GET /api/v1/schedules/room-sufficiency`).

### Schedules

Shows the active term's class blocks by status: draft, review, finalized, and published. It includes a total and a short status hint, with a link to the timetable.

### Needs attention

Collects the items a department head should review:

- flagged schedule rows;
- unscheduled sessions;
- pending cross-department faculty requests;
- schedule rows in review.

Each item links to the page where it can be resolved.

### Recent activity

Lists the latest faculty requests in the department with status, reason, and relative time. The **View all** link opens the approvals page.

## Dean dashboard

Route: `/dean/dashboard`

The dean dashboard is college-wide. `college_secretary` shares the same shell and dashboard, but approval actions and some report links are read-only or hidden.

### Header and attention banner

- Greeting, role label, active term, and a refresh action.
- A **Needs attention** banner appears when there are schedules in review, pending faculty requests, inactive departments, or other items requiring follow-up. It provides direct actions such as **Review** or **Manage departments**.

### Stat cards

| Card | Value | Notes |
| --- | --- | --- |
| **Active Departments** | Active department count | Shows total and inactive counts. |
| **Pending Approvals** / **Schedules in Review** | Schedules waiting for review | The label and action depend on whether the viewer can approve. |
| **Finalized Schedules** | Finalized schedules for the active term | Links to the approvals report. |
| **Published Schedules** | Published schedules | Visible on the public portal. |
| **Active Faculty** | College-wide active faculty | Includes the active department count. |
| **Faculty Requests** | Pending cross-department requests | Links to the requests page. |

### Schedule progress

Breaks the active term's class blocks down by published, finalized, in review, and draft, with counts and percentages. It also shows:

- total class blocks;
- classes scheduled today;
- the busiest day and its class count;
- overall completion rate.

### Active departments

Lists active departments with their department head and online status. The presence dot comes from the shared Supabase Realtime channel; the list also uses persisted last-seen timestamps when a head is offline. Each row shows the department's schedule completion progress and links to its records.

### Quick links

Role-aware shortcuts to common college-level tasks. For the secretary, the list emphasizes operational pages rather than approvals, audit, and reports.

## Data sources

| Dashboard area | API |
| --- | --- |
| Active term | `GET /api/v1/terms/active` |
| Schedule rows and statuses | `GET /api/v1/schedules?termId=` |
| Flagged rows | `GET /api/v1/schedules/flagged` |
| Room sufficiency | `GET /api/v1/schedules/room-sufficiency` |
| Faculty list | `GET /api/v1/faculty` |
| Faculty status summary | `GET /api/v1/faculty/status-summary` |
| Faculty requests | `GET /api/v1/faculty-requests` |
| Departments | `GET /api/v1/departments` |
| User directory | `GET /api/v1/users/directory` |
| College statistics | `GET /api/v1/stats/overview` |
| Presence | Supabase Realtime `presence:online-users` + `user_presence.last_seen_at` |

The dean dashboard refetches the user directory every 60 seconds so online/offline labels stay reasonably fresh. The shared presence channel updates the live dots immediately.

## Rolling animations

`RollingValue`, `RollingNumber`, and `RollingText` in `src/components/ui/RollingValue.tsx` animate values when they change. They are used for:

- the clock, date, and refresh label;
- summary-card values and hints;
- workload and room-sufficiency labels;
- schedule totals;
- attention counts.

The animation is presentational only. Values are still plain text in the DOM and remain readable by assistive technology.

## Access and failure behavior

- Department heads must have an active department. `DepartmentActiveGate` redirects deactivated departments to `/department-deactivated` before the dashboard shell mounts.
- The dean dashboard is available to `college_dean`, `college_secretary`, and the hidden administrator. The administrator is redirected to Dev Tools.
- Missing data renders empty states rather than errors: "Nothing plotted yet", "No recent activity", "The room report will appear once a term is active", and similar messages.
- The dashboard does not write data. All mutations happen on the destination pages.

## Related documentation

- [Frontend guide](../apps/frontend.md) — routes, guards, and data fetching.
- [Chat and presence](chat.md) — how online/last-seen state is produced.
- [Backend guide](../apps/backend.md) — dashboard APIs and scheduling reports.
- [Elective subjects](electives.md) — elective coverage shown in schedule totals.
