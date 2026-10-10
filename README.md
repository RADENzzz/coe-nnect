# CoE-NNECT

<p align="center">
  <strong>CoE-NNECT</strong><br>
  College of Engineering Scheduling System<br>
  Western Mindanao State University<br>
  <em>CPE SD 3 — Management Information System · 2026–2027</em>
</p>

---

## Project Information

| Field | Details |
| :--- | :--- |
| **Project** | CPE SD 3 — Management Information System |
| **Institution** | Western Mindanao State University |
| **College** | College of Engineering |
| **Academic Year** | 2026–2027 |
| **Departments** | 10 |
| **Status** | Work in Progress · Active Development |

---

## Team

| Name | Role |
| :--- | :--- |
| **Jazmine Elaiza L. Luis** | Project Manager |
| **Alrhaden A. Javier** | Lead Developer · System Architect |
| **Giel V. Andales** | Senior Developer |
| **Edzel Don V. Tio** | Junior Developer |
| **Roland C. Velez** | Lead Tester · Asst. Trainer · Jr. Archivist |
| **Andre Aga B. Dacumos** | Lead Trainer · Sr. Tester |
| **Aizzah Arabelle B. Javelosa** | Lead Archivist · Asst. System Analyst |
| **Euwan Tyrone B. Prias** | Lead System Analyst · Sr. Archivist |


* Developed as part of CPE SD 3 — Management Information System for the College of Engineering, Western Mindanao State University.
* **Project Client:** Engr. Gajil J. Santos (College of Engineering).

---

## Table of Contents

- [Project Information](#project-information)
- [Team](#team)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database & Seed](#database--seed)
- [Running the Project](#running-the-project)
- [Development Workflow](#development-workflow)
- [Scheduling Constraints](#scheduling-constraints)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Development Status](#development-status)
- [IDP Integration](#idp-integration)
- [License](#license)

---

## Features

### Intelligent Scheduling
* Automated detection of scheduling conflicts
* Prevention of faculty schedule overlaps
* Room availability and room-type validation
* Laboratory scheduling and splitting rules
* Maximum consecutive class-block enforcement
* Department and college-wide schedule coordination

### Faculty Workload Management
* Track required teaching hours
* Monitor faculty load and release time
* Detect faculty overload
* Support visiting lecturer workload limits
* Subject qualification enforcement (rule F-5)
* Integrate non-class commitments through the IDP (Individual Daily Program) system (planned)

### Scheduling Workflow
Schedules follow a controlled approval process enforced at both the application and database layers:

```text
Draft  ⇄  Review  ⇄  Finalized  ⇄  Published
```

* **Finalizing** locks a schedule entry from further edits
* **Unfinalizing** reopens it for revision
* **Published** schedules remain visible but locked

### Reports & Timetables
* Faculty Timetable
* Room Timetable
* Section Timetable
* Master Schedule (per college / per department)
* Faculty Workload Summary *(planned)*
* Department Schedule Summary *(planned)*
* Audit Trail *(planned)*

### Role-Based Access

| Role | Responsibilities |
| :--- | :--- |
| **College Dean** | College-wide oversight and cross-department conflict resolution |
| **Department Head** | Creates, manages, reviews, and finalizes department schedules |
| **Administrator** | Manages users, rooms, faculty, academic structure, and system configuration |

---

## System Architecture

CoE-NNECT is organized as a pnpm monorepo containing the frontend, backend, and shared packages.

```text
CoE-NNECT/
├── apps/
│   ├── backend/          # NestJS API
│   └── frontend/         # React application
├── packages/
│   ├── constraint-rules/ # Scheduling rules engine (26 rules, 164 tests)
│   ├── shared-types/     # Shared TypeScript types (future)
│   └── idp-client/       # IDP integration client (future)
├── docs/
├── test.sql              # Original schema
├── test_2.sql            # Live Supabase introspection
├── railway.toml
└── pnpm-workspace.yaml
```

### High-Level Flow

```text
┌─────────────────────┐
│      Frontend       │
│ React + TypeScript  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│       Backend       │
│      NestJS API     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Supabase       │
│  PostgreSQL + Auth  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   IDP Integration   │
│ Faculty & Commitments│
└─────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Monorepo** | pnpm Workspaces |
| **Backend** | NestJS 10 · TypeORM |
| **Database** | PostgreSQL (hosted on Supabase) |
| **Auth** | Supabase Auth (JWT) |
| **Frontend** | React 18 · Vite 5 |
| **Language** | TypeScript |
| **Styling** | TailwindCSS 3 |
| **Server State** | React Query |
| **Client State** | Zustand |
| **Drag & Drop** | dnd-kit |
| **Testing** | Vitest (constraint engine) |
| **Deployment** | Railway (backend) · Vercel (frontend) |
| **Runtime** | Node.js 20+ |
| **Package Manager** | pnpm |

### Shared Packages
```text
@coe-nnect/constraint-rules   # Scheduling rules engine
@coe-nnect/shared-types       # (reserved — future)
@coe-nnect/idp-client         # (reserved — future)
```

---

## Getting Started

### Prerequisites

| Requirement | Version | Download Link |
| :--- | :--- | :--- |
| **Node.js** | $\ge$ 20.0.0 | [nodejs.org](https://nodejs.org) |
| **pnpm** | $\ge$ 8.0.0 | `npm install -g pnpm` |
| **Git** | Latest | [git-scm.com](https://git-scm.com) |
| **Supabase** | Account | [supabase.com](https://supabase.com) |

### 1. Clone the Repository
```bash
git clone https://github.com/radenzzz/SCHEDULING-SYSTEM-WMSU-.git
cd SCHEDULING-SYSTEM-WMSU-
```

### 2. Install Dependencies
From the repository root:
```bash
pnpm install
```

On Windows, if pnpm asks for permission to run native build scripts:
```bash
pnpm approve-builds
```

---

## Environment Variables

### Backend — `apps/backend/.env`
```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=...
JWT_SECRET=...
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
```

### Frontend — `apps/frontend/.env`
```env
VITE_API_URL=http://localhost:3000/api
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
# Optional — dev login helper accounts
VITE_DEV_ADMIN_EMAIL=admin@wmsu.edu.ph
VITE_DEV_ADMIN_PASSWORD=Demo!2345
VITE_DEV_HEAD_EMAIL=head.cpe@wmsu.edu.ph
VITE_DEV_HEAD_PASSWORD=Demo!2345
```

> **Note:** Never commit `.env` files. Use `.env.example` as a template.

---

## Database & Seed

The database is hosted on Supabase (PostgreSQL). Schema is defined in `test.sql` (original) and `test_2.sql` (live introspection).

### Seed Demo Data
One command populates the environment with departments, subjects, programs, prospectus entries, sections, faculty, users, designations, qualifications, and settings:
```bash
pnpm --filter @coe-nnect/backend seed:demo
```
*The seed is idempotent — safe to run repeatedly.*

### Demo Credentials
*Password for all demo users:* `Demo!2345`

| Role | Email |
| :--- | :--- |
| **Administrator** | `admin@wmsu.edu.ph` |
| **CpE Dept Head** | `head.cpe@wmsu.edu.ph` |
| **EE Dept Head** | `head.ee@wmsu.edu.ph` |
| **ME Dept Head** | `head.me@wmsu.edu.ph` |

---

## Running the Project

You will need two terminals: one for the backend, one for the frontend.

### Backend
```bash
pnpm --filter @coe-nnect/backend dev
```
* Backend runs on `http://localhost:3000`. API prefix: `/api/v1/*`.
* On boot, the constraint engine logs:
  ```text
  [ConstraintsService] Constraint engine ready with 26 rules.
  ```

### Frontend
```bash
pnpm --filter @coe-nnect/frontend dev
```
* Frontend runs on `http://localhost:5173`.

### Quick Start (Windows)
```powershell
cd apps\frontend
pnpm dev
```

---

## Development Workflow

Typical dev loop:
1. Backend runs in one terminal — TypeScript watch mode auto-recompiles.
2. Frontend runs in another — Vite HMR reloads on save.
3. Modify code, verify in the browser.
4. Run tests when touching the constraint engine.

### Adding a New Module
1. Create the module under `apps/backend/src/modules/<name>/`.
2. Register it in `apps/backend/src/app.module.ts`.
3. Add the frontend API client under `apps/frontend/src/api/`.
4. Add the page under `apps/frontend/src/features/<name>/`.
5. Register the route in `apps/frontend/src/App.tsx`.

> **Route-order rule:** In NestJS controllers, static-prefix routes (e.g., `/restrictions`, `/by-program/:id`) must be declared before parameterized routes (e.g., `/:id`), or Nest will match them incorrectly.

---

## Scheduling Constraints

The heart of CoE-NNECT is its constraint engine, maintained as a standalone package:
```text
@coe-nnect/constraint-rules
```

### Coverage

| Tier | Count | Examples |
| :--- | :--- | :--- |
| **Required** | 12 | Faculty/Room/Section overlap · Lab splitting · Operating hours · VL cap |
| **Warning** | 11 | Workload overload · Day pairing · Lunch break · Daytime priority |
| **Optional** | 3 | Faculty preference · Subject restriction |

### Examples
* ✓ Faculty cannot be scheduled for overlapping classes (H-1)
* ✓ Rooms cannot contain overlapping classes (H-2)
* ✓ Sections cannot have two classes at the same time (H-3)
* ✓ Room type must match subject requirements (R-1)
* ✓ 1-unit labs must be a single 3-hour block (H-9)
* ✓ 2-unit labs must split into two 3-hour blocks (H-10)
* ✓ Faculty workload must remain within required hours (F-3)
* ✓ Unqualified faculty cannot be assigned (F-5)
* ✓ Visiting lecturers cannot exceed the cap (F-6)
* ✓ Published schedules are locked from edits (FR 5.1.5 / 5.1.6)

Rules are defined under `packages/constraint-rules/src/rules/**` and consumed by the backend via `apps/backend/src/modules/constraints/`. The frontend validates plots against the engine on a 400ms debounce during both plotting and drag-move.

---

## Testing

### Constraint Engine
```bash
pnpm --filter @coe-nnect/constraint-rules test
```
Uses Vitest. All 164 tests should pass.

### Backend / Frontend Tests
Backend and frontend test suites are not yet built out. When added, they will use Jest (backend) and Vitest (frontend).

---

## Project Structure

```text
CoE-NNECT/
├── apps/
│   ├── backend/
│   │   └── src/
│   │       ├── common/           # guards, decorators, pipes
│   │       ├── config/           # database + supabase config
│   │       ├── database/
│   │       │   ├── seeds/        # demo-seed.ts, reset.ts, create-admin.ts
│   │       │   └── supabase.service.ts
│   │       └── modules/
│   │           ├── approvals/
│   │           ├── auth/
│   │           ├── constraints/
│   │           ├── departments/
│   │           ├── faculty/
│   │           ├── prospectus/
│   │           ├── rooms/
│   │           ├── scheduling/
│   │           ├── sections/
│   │           ├── subjects/
│   │           ├── system-config/
│   │           └── users/
│   │
│   └── frontend/
│       └── src/
│           ├── api/              # axios clients per resource
│           ├── components/       # shared UI (layout, feedback, ui)
│           ├── features/         # page-level features
│           │   ├── admin/
│           │   ├── approvals/
│           │   ├── dashboard/
│           │   ├── dean/
│           │   ├── faculty/
│           │   ├── plot-subject/
│           │   ├── prospectus/
│           │   ├── rooms/
│           │   ├── sections/
│           │   ├── subjects/
│           │   ├── system-config/
│           │   └── timetable/
│           ├── hooks/
│           ├── lib/
│           ├── store/            # zustand stores
│           └── types/
├── packages/
│   └── constraint-rules/
│       └── src/
│           ├── engine.ts
│           ├── registry.ts
│           ├── rules/
│           │   ├── faculty/
│           │   ├── lab/
│           │   ├── overlap/
│           │   ├── room/
│           │   ├── subject/
│           │   └── time/
│           └── types/
├── docs/
├── test.sql
├── test_2.sql
├── railway.toml
└── pnpm-workspace.yaml
```

---

## Development Status

### Completed
* [x] Project architecture
* [x] Monorepo setup
* [x] Core technology stack (NestJS, React, Supabase)
* [x] Authentication & authorization (Supabase Auth + JWT)
* [x] Academic structure management (Departments · Subjects · Prospectus · Sections)
* [x] Faculty management (CRUD · Classifications · Subject Qualifications)
* [x] Room management (CRUD · Ownership · Capacity · Type)
* [x] Scheduling engine — 26 rules, 164 tests, all green
* [x] Conflict detection & inline validation
* [x] Faculty workload management (required hours, release time, designations)
* [x] Schedule workflow (Draft → Review → Finalize → Publish) with locking
* [x] Approval workflow (cross-department faculty requests)
* [x] System configuration UI (operating hours, breaks, lunch, caps)
* [x] Timetable views (Master · By Room · By Faculty · By Section)
* [x] Stack picker for overlapping entries
* [x] Department-aware shell (sidebar + dashboard per department)
* [x] PDF / Excel export
* [x] Print timetable
* [x] Audit trail UI
* [x] Reports (workload summary, department summary, college-wide)
* [x] Chat system
* [x] Schedule Auto Generation

### In Progress / Planned

* [ ] Notification infrastructure
* [ ] Minor subject schedule import
* [ ] Faculty time preference UI
* [ ] Teacher submission workflow
* [ ] IDP integration
* [ ] Production deployment hardening

---

## IDP Integration

CoE-NNECT is designed to integrate with the university's IDP (Individual Daily Program) system, which provides:
* Faculty roster and profile sync
* Non-class commitments (consultation hours, research blocks)
* Change-request notifications

The IDP integration package is reserved at `packages/idp-client/` and will be implemented once the IDP endpoints are available.

* **Planned FRs:** FR 3.1.11 (Refresh Faculty from IDP), FR 7.1.7 (Configure IDP Integration Settings), FR 6.1.7.1 (Respond to IDP-Sourced Change Requests).

---

## License

License information will be added once the project's distribution and usage terms have been finalized.
