# IDP Integration Whats' New

**30 November 2026** — This pass introduces Department Head schedule-change review, IDP Requests guided tours, and related UX polish.

## DH Schedule-Change Review Queue

A new queue at `/approvals/schedule-changes` (sidebar: **Planning → Schedule Changes**) gives Department Heads a conflict-aware view of IDP `schedule_override` and `unavailability_change` requests. Each item shows:

- **Type**: `schedule_override` or `unavailability_change`
- **Status**: `pending`, `ready`, `conflicted`, `warning`, or `unknown`
- **Severity**: `hard` (blocking), `soft` (advisory), or `info`
- **Conflict analysis**: summary + rule details (`ruleId`, `ruleName`, `reason`)
- **Proposed change**: day, time, load type, reason, affected dates
- **Decision**: DH can **accept** or **reject** with an optional note; `acknowledgeConflicts: true` is required when conflicts exist

**API endpoints**:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/idp/schedule-change-requests` | List DH-visible schedule/unavailability changes with conflict analysis and ack state |
| `POST` | `/api/v1/idp/schedule-change-requests/:id/decision` | Approve or reject an IDP schedule/unavailability change and record the DH ack |

**Flow**:

1. DH visits `/approvals/schedule-changes` → sidebar highlights *Schedule Changes* actively
2. List shows items scoped to the DH's department
3. Clicking an item reveals the detail modal with conflict analysis
4. DH clicks **Accept** or **Reject**, optionally acknowledging conflicts
5. On `accepted` for a published `schedule_override`, a Dean unfinalize request is filed automatically (no second manual step)
6. On `unavailability_change`, conflicts are computed by checking plotted classes on the same faculty and term that overlap the proposed window (`UNAVAIL-OVERLAP` rule)
7. On `schedule_override`, the full scheduling validator runs against the proposed subject, term, and slot (excluding the original schedule)

## IDP Requests Page Upgrades

The `/dean/idp/change-requests` page now includes a guided tour (**"IDP change requests"**) that walks Deans and college secretaries through the review queue, status/type filters, search, and the detail modal. The active-state behavior matches the rest of the sidebar — exactly one nav item is active at a time, and detail routes still light their parent.

**Tour anchors**: `idp-header`, `idp-filters`, `idp-table`.

## Recommended Order for Roles

- **department_head**: Review DH schedule-change items in the new `/approvals/schedule-changes` queue before proceeding to IDP change-request review.
- **college_dean**: Review IDP change requests after completing the schedule-change review flow.
- **college_secretary**: Support the dean by managing the change-request ack outbox and ensuring durable webhook idempotency.

## Handoff Notes for the IDP Team

- The new `schedule-change-requests` endpoints are **device-bearer-key authenticated** (Pattern C), same as other IDP outbox/poll endpoints.
- Responses use the same contract shape as inbound change requests, with an additional `conflict` block and `counts` summary.
- Ack state flows to the IDP desktop through the `change_request.ack` outbox, exactly once per request.
- No automatic mutation of live schedule or faculty data — all changes require explicit DH approval.

## See Also

- [`idp.md`](idp.md) — full IDP integration documentation, including the new DH schedule-change review section
- [`idp-handoff.md`](idp-handoff.md) — practical companion for the IDP team, covering Pattern A/B/C configuration and end-to-end testing
- [`integrations/idp.md §DH schedule-change review`](idp.md#dh-schedule-change-review-college) — the detailed DH review section