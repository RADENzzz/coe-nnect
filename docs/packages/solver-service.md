# Schedule solver service

`packages/solver-service` is a standalone Python FastAPI service that uses Google OR-Tools CP-SAT to construct candidate schedules. It is separate from the main NestJS API and is **not currently invoked by the frontend or backend**.

## Endpoints

- `GET /health` — returns a health status.
- `POST /solve` — accepts a `SolveRequest` and returns solver results, including assignments and unscheduled blocks, or an infeasible status.

The request model covers a term, department, sections, subjects, prospectus entries, faculty, qualifications, rooms, available time slots, and scheduling configuration. Preferences, faculty unavailability, and existing schedules are optional inputs. Consult the Pydantic models in `solver.py` for authoritative field names and defaults.

The solver applies hard feasibility constraints and minimizes a cost function for soft objectives. The exact response schema and objective weights are defined in `solver.py`.

## Run locally

From the repository root in PowerShell:

```powershell
Set-Location packages\solver-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload --port 8002
```

Open `http://localhost:8002/docs` for the interactive API schema or check `http://localhost:8002/health`.

## Before integration

Agree on request and response versioning, deployment URL, timeout behavior, and how infeasible or partially scheduled results should be presented. Until that work is complete, do not treat the solver as an application feature.
