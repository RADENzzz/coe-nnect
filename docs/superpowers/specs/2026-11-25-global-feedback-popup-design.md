# Global feedback popup design

Status: draft for approval

## Problem

Transient success and error messages are inconsistent. Some pages use small inline
banners above a table, some use errors inside modals, a few use the existing
`FeedbackToast` provider, and the provider is only mounted in `AppShell`, so
Dean routes and public/auth pages cannot use it safely.

The trigger for this redesign was editing a subject to an existing code:
`PATCH /api/v1/subjects/43` attempted to set `subject_code` to `A&H 100`,
hit `23505` on `subject_subject_code_key`, and surfaced as a generic 500 because
`subjects.service.ts` checks duplicates on create but not on update.

The user wants one obvious top-center popup for both success and failure, with
sound, that replaces inline result messages everywhere.

## Decisions

- One top-center app banner, not a card buried in a modal or above a table.
- The banner replaces page-level success/error messages. It does not merely add
  another copy.
- Success and failure use distinct short tones.
- The banner auto-closes after about 6 seconds, can be closed manually, and can
  be muted through the existing sound preference system.
- A thin countdown line spans the full width of the banner, drains over the
  auto-close duration, and disappears with the banner.
- Field-level validation stays next to the field that caused it. Persistent
  system status, realtime notifications, chat sounds, and PDF save-state
  indicators are separate concerns and stay as they are.

## User-visible behavior

- The banner is fixed to the top center of the viewport in a portal above all
  app content and modals. Inside the shells it sits just below the sticky top
  bar; public/auth routes use a smaller top offset.
- Width is capped around 720px on desktop and fills the available width with
  margins on mobile.
- Only one banner is visible at a time. New messages queue behind it and appear
  when it closes. Repeating the same message id updates the current banner and
  restarts its timer instead of stacking duplicates.
- The banner shows a colored leading icon, a short label (`Success`, `Error`,
  `Failed`), a bold one-line summary, an optional detail line, and a close
  button.
- The countdown line sits along the bottom edge of the banner. It pauses while
  the pointer or keyboard focus is inside the banner and while the tab is
  hidden, then resumes with the remaining time.
- Success plays a short pleasant chime; error and failed play a shorter,
  lower warning tone. Both obey the global sound volume and a new
  `feedback` mute preference.
- Entrance/exit animation respects the existing reduced-motion guardrails. The
  countdown line still updates because it communicates time remaining.

## Architecture

### Feedback provider

- Keep the `FeedbackToast.tsx` path to avoid churn, but change the rendered UI
  from a top-right stack to the top-center banner described above.
- Move `FeedbackProvider` from `AppShell` to `App.tsx` so login, password
  reset, maintenance, deactivated-department, Dean shell, and department-head
  shell all share one provider. Remove the duplicate mount in `AppShell`.
- Keep the `useFeedback()` API: `success`, `error`, and `failed` with optional
  `title`, `durationMs`, and `id`.
- Replace the current array of visible cards with one visible item plus a queue.
  Track `remainingMs`, `startedAt`, and paused state so the countdown line and
  the dismissal timer never disagree.
- Keep `aria-live="polite"` on the region; use `role="alert"` for error/failed
  and `role="status"` for success. The close button has an explicit
  `aria-label`.

### Sounds

- Extend `lib/sound.ts`:
  - `SoundKind` becomes `'notification' | 'chat' | 'success' | 'error'`.
  - `SoundPreferences` gains `feedback: boolean`, default `true`.
  - Add `playSuccessSound()` and `playErrorSound()`; the provider calls the
    matching one when a banner becomes visible.
  - `failed` uses the `error` tone.
- Extend `NotificationSettingsTab` with a third toggle, “Success/error
  feedback sounds”, plus preview buttons. Rename the section copy to cover
  notification, chat, and feedback sounds.
- No audio assets are added; tones stay synthesised with Web Audio like the
  existing notification and chat sounds.

### Error text

- Add one shared normalizer, `lib/api-error.ts`, and replace the duplicated
  `extractErrorMessage` / `apiErrorMessage` / `apiError` helpers across pages.
- Normalization order:
  1. `error.response.data.message` when it is a non-empty string or string array.
  2. `error.response.data.error` when it is a non-empty string.
  3. A status-based fallback: 400 invalid request, 403 not allowed, 404 not
     found, 409 conflict, 422 invalid input, 500 unexpected error, 503 service
     unavailable.
  4. A network fallback: “Could not reach the server.”
- The caller supplies a short fallback summary when the response has no useful
  text. The popup shows the normalized message as its detail line.

### Backend duplicate-code case

- Add the same duplicate pre-check used by `subjects.service.create()` to
  `subjects.service.update()`: when `dto.subjectCode` is present and belongs to
  a different subject, throw `ConflictException` with
  `Subject code "<code>" already exists`.
- This turns the confirmed 500 into a 409 with text the normalizer can display.
  No global exception filter is added in this change.

## Migration scope

Move transient mutation feedback to `useFeedback()` across authenticated and
public flows, including but not limited to:

- Subjects, programs, rooms, faculty, sections, prospectus, and import pages.
- Approvals, schedule-change approvals, Dean approvals, and IDP change requests.
- System config, semester types, terms, and settings sections.
- Admin user management and maintenance/deactivated/auth flows where the
  message is a result of a user action.

For each migrated call site:

- Replace local `error`/`success`/`message` banner state with `feedback.error`,
  `feedback.failed`, or `feedback.success`.
- Keep field-level validation arrays and per-input messages in place.
- Remove the now-dead local banner JSX and the state/timer that only supported
  it.
- Use `extractApiError(err, fallback)` for rejection text.

## Tests and verification

- Unit tests for the normalizer covering string messages, arrays, status
  fallbacks, network errors, and empty responses.
- Unit tests for sound preferences covering the new `feedback` flag, migration
  of stored preferences without it, and volume zero.
- Source-level tests for the provider wiring: one provider in `App.tsx`, none in
  `AppShell`, success/error/failed call the expected sound functions, and the
  countdown element is rendered for the visible banner.
- Backend test or narrow source check that update rejects a duplicate code with
  `ConflictException` before `repo.save`.
- `pnpm typecheck` and `pnpm test` must pass.
- Human browser smoke: create and edit a subject with a duplicate code, save a
  prospectus change, approve a request, and confirm each shows the top-center
  banner with the right tone and countdown, while field errors still appear
  inline.

## Out of scope

- Global exception filter or database-level error rewriting beyond the subject
  duplicate-code guard.
- Replacing the realtime notification toaster, chat sound listener, system
  status banner, tutorial messages, or PDF editor save-status indicator.
- Session-count edits in the prospectus; that has its own approved design path.
- Committing, pushing, merging, or opening a PR.
