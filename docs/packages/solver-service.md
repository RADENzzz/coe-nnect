# Schedule solver service

`packages/solver-service` is a standalone Python FastAPI service that uses Google OR-Tools CP-SAT to construct candidate schedules. It is separate from the main NestJS API; do not assume it is deployed or called by the app.

## API

- `GET /health` — returns `{"status":"ok"}`.
- `POST /solve` — accepts a `SolveRequest` and returns either a successful schedule or an infeasible status.

The request includes a term, department, sections, subjects, prospectus entries, faculty, qualifications, rooms, available time slots, and scheduling configuration. Preferences, faculty unavailability, and existing schedule entries are optional. Refer to the Pydantic models in `solver.py` for the authoritative field names and defaults.

For a successful solve, the response includes schedule assignments, unscheduled blocks, solve duration, and the solver status. The model includes hard feasibility constraints and a minimization objective for soft preferences, including unscheduled blocks, lunch overlap, and faculty day preference.

## Run locally

From the repository root:

```powershell
Set-Location packages\solver-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload --port 8002
```

Open `http://localhost:8002/docs` for the generated API schema or call `http://localhost:8002/health` to check the service.

## Integration status

This service is not currently invoked by the frontend or backend. Before integrating it, agree on request/response versioning, deployment URL, timeout behavior, and how infeasible or partially scheduled results should be presented to users.
