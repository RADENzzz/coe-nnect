## Summary

<!-- What user problem does this pull request solve, and why is this approach appropriate? -->

## Changes

<!-- Describe the behavior and the important files, not a file-by-file dump. -->

## Area

- [ ] Frontend (`apps/frontend`)
- [ ] Backend (`apps/backend`)
- [ ] Constraint rules (`packages/constraint-rules`)
- [ ] Solver service (`packages/solver-service`)
- [ ] Prospectus parser (`packages/prospectus-parser`)
- [ ] Database / migrations (`supabase`)
- [ ] Deployment / operations (`.railway`, `scripts`)
- [ ] Documentation
- [ ] Tests / tooling

## Validation

<!-- Include the exact commands run and whether each passed. If a check was not run, explain why. -->

| Check | Command | Result |
| --- | --- | --- |
| Backend build / type-check | `pnpm --filter @coe-nnect/backend build` / `typecheck` |  |
| Backend tests | `pnpm --filter @coe-nnect/backend test` |  |
| Backend E2E specs | `pnpm --filter @coe-nnect/backend test:e2e` |  |
| Constraint rules | `pnpm --filter @coe-nnect/constraint-rules test` |  |
| Frontend lint / type-check / build | `pnpm --filter @coe-nnect/frontend lint` / `typecheck` / `build` |  |
| Database migrations | `supabase db reset` |  |
| Browser workflow | `pnpm test:e2e` |  |

Manual checks and screenshots:

<!-- Add links or images for UI changes. -->

## Impact

- **Database migration:** yes / no — describe any new columns, tables, RLS policies, or data backfills.
- **Deployment variables:** yes / no — list new or changed Railway/Supabase variables. Never include secret values.
- **Roles and permissions:** yes / no — describe changes to `college_dean`, `college_secretary`, `department_head`, `viewer`, or `administrator`.
- **API contract:** yes / no — list changed routes, request/response shapes, or Socket.IO/Realtime events.
- **Rollback:** describe how to revert safely, including migration considerations.
- **Follow-up work:** link issues or describe remaining work.

## Checklist

- [ ] The change is focused and does not include unrelated edits.
- [ ] Authorization is enforced on the API, not only in the browser.
- [ ] Department scoping and schedule integrity were considered.
- [ ] Tests were added or updated for changed behavior.
- [ ] The relevant validation commands above were run, or the reason is documented.
- [ ] Documentation was updated for behavior, routes, environment variables, commands, or deployment changes.
- [ ] New or changed UI is keyboard-operable and has labels, focus handling, and reduced-motion behavior where relevant.
- [ ] No credentials, secrets, `.env` files, database dumps, or private data are included.
- [ ] Database and deployment impacts are described above.
- [ ] Commit messages follow the repository convention and include `Co-authored-by: trynotybort <trynotybort@gmail.com>` when pairing.
