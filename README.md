# CoE-NNECT
# (UNDER DEVELOPMENT)
## (Eperimental/Prototyping Phase)
### College of Engineering Scheduling System

> A web-based class scheduling and faculty workload management system for the **College of Engineering at Western Mindanao State University (WMSU)**.

CoE-NNECT is designed to replace manual, spreadsheet-based scheduling with a centralized system featuring **automated conflict detection, faculty workload management, scheduling constraints, approval workflows, and auditable timetables**.

---
.
## roject Information

|                   |                                          |
| ----------------- | ---------------------------------------- |
| **Project**       | CPE SD 3 — Management Information System |
| **Institution**   | Western Mindanao State University        |
| **College**       | College of Engineering                   |
| **Academic Year** | 2026–2027                                |
| **Departments**   | 10                                       |
| **Status**        | Work in Progress                         |

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
* Integrate non-class commitments through the **IDP (Individual Daily Program)** system

### Scheduling Workflow

Schedules follow a controlled approval process:

```text
Draft
  ↓
Review
  ↓
Finalize
  ↓
Publish
```

This provides a clear and auditable scheduling workflow between departments and the College.

### Reports & Timetables

Generate and view:

* Faculty Timetable
* Room Timetable
* Master Schedule
* Faculty Workload Summary
* Department Schedule
* College-wide Schedule

### Role-Based Access

| Role                | Responsibilities                                                            |
| ------------------- | --------------------------------------------------------------------------- |
| **College Dean**    | College-wide oversight and cross-department conflict resolution             |
| **Department Head** | Creates, manages, reviews, and finalizes department schedules               |
| **Administrator**   | Manages users, rooms, faculty, academic structure, and system configuration |

---

# System Architecture

CoE-NNECT is organized as a **pnpm monorepo** containing the frontend, backend, and shared packages.

```text
CoE-NNECT/
│
├── apps/
│   ├── backend/          # NestJS API
│   └── frontend/         # React application
│
├── packages/
│   ├── shared-types/     # Shared TypeScript types
│   ├── constraint-rules/ # Scheduling rules
│   └── idp-client/       # IDP integration
│
└── ...
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
└──────┬────────┬─────┘
       │        │
       ▼        ▼
┌──────────┐  ┌──────────┐
│PostgreSQL│  │  Redis   │
│ Database │  │ BullMQ   │
└──────────┘  └──────────┘
       │
       ▼
┌─────────────────────┐
│   IDP Integration   │
│ Faculty & Commitments│
└─────────────────────┘
```

---

# Tech Stack

| Layer               | Technology                |
| ------------------- | ------------------------- |
| **Monorepo**        | pnpm Workspaces           |
| **Backend**         | NestJS 10 · TypeORM       |
| **Database**        | PostgreSQL                |
| **Queue / Cache**   | Redis · BullMQ            |
| **Frontend**        | React 18 · Vite 5         |
| **Language**        | TypeScript                |
| **Styling**         | TailwindCSS 3             |
| **Server State**    | React Query               |
| **Client State**    | Zustand                   |
| **Testing**         | Vitest · Jest · Supertest |
| **CI/CD**           | GitHub Actions · Vercel   |
| **Runtime**         | Node.js 24.x              |
| **Package Manager** | pnpm 12.x                 |

### Shared Packages

```text
@coe-nnect/shared-types
@coe-nnect/constraint-rules
@coe-nnect/idp-client
```

---

# Getting Started

## Prerequisites

Make sure the following are installed:

| Requirement    |  Version | Download                                               |
| -------------- | -------: | ------------------------------------------------------ |
| **Node.js**    | ≥ 24.0.0 | [nodejs.org](https://nodejs.org/)                      |
| **pnpm**       | ≥ 12.0.0 | `npm install -g pnpm`                                  |
| **Git**        |   Latest | [git-scm.com](https://git-scm.com/)                    |
| **PostgreSQL** |     ≥ 15 | [postgresql.org](https://www.postgresql.org/download/) |
| **Redis**      |      ≥ 7 | [redis.io](https://redis.io/download/)                 |

---

## 1. Clone the Repository

```bash
git clone https://github.com/radenzzz/SCHEDULING-SYSTEM-WMSU-.git
cd SCHEDULING-SYSTEM-WMSU-
```
---

## 2. Install Dependencies

From the repository root:

```bash
pnpm install
```

### Windows

If pnpm asks for permission to run native build scripts:

```bash
pnpm approve-builds
```

---

## 3. How to start fromt End Localy:

Dapat nasa Directory ka nung repo:
SCHEDULING-SYSTEM-WMSU->

then I enter mo to sa PShell or CMD lang to run localy:
```bash
cd apps\frontend
pnpm dev
```


---

# Database


---

# Development

The project uses **pnpm workspaces**, allowing the frontend, backend, and shared packages to be developed together.

Typical development workflow:

```bash
pnpm install
```

Then start the required applications using the project's configured scripts.

> Development scripts and additional setup instructions will be documented as the project progresses.

---

# Testing

CoE-NNECT uses different testing tools depending on the project layer.

### Libraries


### Backend



---

# Scheduling Constraints

One of the core components of CoE-NNECT is its scheduling constraint system.

Examples include:

```text
✓ Faculty cannot be scheduled for overlapping classes
✓ Rooms cannot contain overlapping classes
✓ Room type must match class requirements
✓ Laboratory classes follow laboratory splitting rules
✓ Faculty consecutive-block limits are enforced
✓ Faculty workload must remain within defined limits
✓ Published schedules must pass required validations
```

The constraint rules are maintained separately through:

```text
@coe-nnect/constraint-rules
```

This allows scheduling logic to remain reusable and independently testable.

---

# DP Integration

---

# Development Status

> **CoE-NNECT is currently under active development.**

### Current Focus

* [x] Project architecture
* [x] Monorepo setup
* [x] Core technology stack
* [ ] Authentication & authorization
* [ ] Academic structure management
* [ ] Faculty management
* [ ] Room management
* [ ] Scheduling engine
* [ ] Conflict detection
* [ ] Faculty workload management
* [ ] Schedule approval workflow
* [ ] Reports and timetable generation
* [ ] IDP integration
* [ ] Production deployment

The checklist will be updated as development progresses.

# Development

This project is being developed as part of:

**CPE SD 3 — Management Information System**

for the **College of Engineering, Western Mindanao State University**.

---

# License

> License information will be added once the project's distribution and usage terms have been finalized.

---

<p align="center">
  <strong>CoE-NNECT</strong><br>
  College of Engineering Scheduling System<br>
  Western Mindanao State University
</p>
