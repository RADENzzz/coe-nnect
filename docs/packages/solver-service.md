# Schedule solver service

`packages/solver-service` is a separately deployed Python FastAPI service that uses Google OR-Tools CP-SAT to construct candidate schedules. The NestJS backend invokes it during schedule auto-generation through `SolverClient`; the frontend calls the backend rather than calling this service directly. Configure the backend's `SOLVER_URL` to the service base URL.

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
uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the interactive API schema or check `http://localhost:8000/health`.

## Integration boundary

The backend prepares the solve request, checks room sufficiency, calls `POST /solve`, validates returned blocks with the TypeScript constraint-rules package, and persists the result only after hard validation passes. The backend client uses a 120-second solve timeout. Solver availability is required for auto-generation, but not for manual schedule plotting or other API features.

The Python solver's optimization constraints and objectives are implemented separately from the TypeScript validation rules. Keep the request/response models in `solver.py`, the backend problem builder, and the backend's post-solve validation behavior in sync when changing this contract. The [system architecture](../architecture/README.md) describes the complete flow.
