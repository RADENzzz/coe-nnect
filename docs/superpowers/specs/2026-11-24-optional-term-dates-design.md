# Optional Term Dates Design

## Intent and why

Term creation may occur before exact academic dates are known. Start and end dates should therefore be optional while the term name, school year, and semester remain required.

## Goals

- Allow both date fields to be omitted independently in the New Academic Term form.
- Store omitted dates as `NULL` in the database.
- Preserve end-after-start validation when both dates are provided.
- Display terms with missing dates clearly instead of treating a blank value as a date.

## Non-goals

- Editing existing terms is not being added.
- Inferring or automatically filling missing dates is not being added.
- This does not change term activation or deletion behavior.

## Constraints

- Keep the existing term name, school year, and semester validation.
- The existing `YYYY-MM-DD` format remains required for any date that is supplied.
- When both dates are supplied, `endDate` must be after `startDate`.
- Existing rows remain unchanged and receive no migration defaults.

## Approaches

1. **Optional values with individual validation (recommended):** Make `startDate` and `endDate` nullable in API/types/database and allow either field to be blank. Validate their relationship only when both exist.
2. **Require both or neither:** This reduces ambiguity but is less useful when only one date is known.
3. **Derive missing dates from the school year:** This could invent incorrect academic dates and is not requested.

## Implementation direction

The API DTO, TypeORM entity, frontend term input type, and creation form will use optional or nullable date values. A migration will make both database columns nullable and preserve the existing range constraint with null-safe behavior. The terms list and new-term defaults will tolerate missing dates; blank-date terms will show "Dates not set."
