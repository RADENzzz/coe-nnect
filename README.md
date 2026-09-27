# CoE-NNECT — College of Engineering Scheduling System

> A web-based class scheduling system for the College of Engineering at Western Mindanao State University (WMSU). Covers all 10 departments, replacing manual spreadsheet-based scheduling with automated conflict detection, faculty load management, and auditable timetables.

**Project:** CPE SD 3 — Management Information System
**Academic Year:** 2026–2027


## Overview

CoE-NNECT is a scheduling platform used by:
- **College Dean** — college-wide oversight, cross-department conflict resolution
- **Department Head** — builds and finalizes their department's schedule
- **Administrator** — system config, users, academic structure, rooms, faculty

The system replaces manual processes by:
1. Enforcing hard scheduling constraints (no overlaps, max 2 consecutive blocks, room-type matching, lab split rules, etc.)
2. Managing faculty workload against required hours (release time, overload, visiting lecturer caps)
3. Supporting an approval workflow (draft → finalize → publish)
4. Providing timely reports (faculty timetable, room timetable, master schedule, workload summary)
5. Integrating with the **IDP (Individual Daily Program)** system for faculty data and non-class commitments

## Tech Stack

| Layer | Technology |
|---|---|
| **Monorepo** | pnpm workspaces |
| **Backend** | NestJS 10 · TypeORM · PostgreSQL · Redis (BullMQ) |
| **Frontend** | React 18 · Vite 5 · TypeScript · TailwindCSS 3 · React Query · Zustand |
| **Shared** | `@coe-nnect/shared-types`, `@coe-nnect/constraint-rules`, `@coe-nnect/idp-client` |
| **Testing** | Vitest (libraries) · Jest + Supertest (backend) |
| **CI/CD** | GitHub Actions · Vercel (frontend) |
| **Node** | 24.x |
| **pnpm** | 12.x |


## Prerequisites
Install these before you begin:
| Node.js | ≥ 24.0.0 | https://nodejs.org |
| pnpm | ≥ 12.0.0 | `npm install -g pnpm` |
| Git | Latest | https://git-scm.com |
| PostgreSQL | ≥ 15 | https://www.postgresql.org/download/ |
| Redis | ≥ 7 | https://redis.io/download |


## DEV INSTALLATION:
1. Clone the repository
git clone https://github.com/<org>/SCHEDULING-SYSTEM-WMSU-.git
cd SCHEDULING-SYSTEM-WMSU-

2. Install all workspace dependencies
From the repo root:
pnpm install

On Windows: You may need to approve native build scripts:
pnpm approve-builds

3. Set up environment variables
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env

---- Working in Progrwss pa ----