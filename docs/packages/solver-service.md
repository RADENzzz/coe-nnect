# Schedule solver service

`packages/solver-service` is a separately deployed Python FastAPI service that uses Google OR-Tools CP-SAT to construct candidate schedules. The NestJS backend invokes it during automatic schedule generation through `SolverClient`; the frontend calls the backend rather than calling this service directly. Configure the backend's `SOLVER_URL` to the service base URL.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Returns `{ "status": "ok" }`. Used by Railway and the backend health check. |
| `POST` | `/solve` | Accepts a `SolveRequest` and returns a candidate schedule, unscheduled blocks, or a failure status. |

FastAPI's interactive schema is available at `/docs` while the service is running.

## Request model

`SolveRequest` is defined in `solver.py` and includes:

| Field | Required | Contents |
| --- | --- | --- |
| `termId`, `deptId` | Yes | Scope of the run. |
| `sections` | Yes | Section ID/code and optional program/year. |
| `subjects` | Yes | Subject ID/code/title, units, required room type, and department. |
| `prospectus` | Yes | Program/subject/year/semester plus lecture and lab session counts and durations. |
| `faculty` | Yes | Faculty ID, name, department, classification, required hours, and designation. |
| `qualifications` | Yes | Faculty-to-subject qualification pairs. |
| `preferences` | No | Preferred day and start/end window. |
| `unavailability` | No | Faculty day/time blocks with an optional reason. |
| `rooms` | Yes | Room ID, number, building, type, capacity, and owning department. |
| `timeSlots` | Yes | Available day/start/end slots. |
| `config` | Yes | Operating hours, lunch window, block durations, consecutive-hour limits, visiting-lecturer cap, default required hours, and optional soft-objective weights. |
| `existingSchedule` | No | Blocks already on the timetable that must not be double-booked. |
| `roomPreferences` | No | Department priority for shared rooms. |

The Pydantic models in `solver.py` are authoritative for field names and defaults. Keep them in sync with the backend problem builder when the contract changes.

## Response

A successful run returns:

```json
{
  "status": "success",
  "solveTimeSeconds": 12.34,
  "schedule": [
    {
      "sectionId": "...",
      "sectionCode": "CPE-3A",
      "subjectId": "...",
      "facultyId": "...",
      "roomId": "...",
      "day": "Monday",
      "startTime": "07:30",
      "endTime": "09:00",
      "loadType": "lecture"
    }
  ],
  "unscheduled": [
    {
      "sectionId": "...",
      "sectionCode": "CPE-3A",
      "subjectId": "...",
      "subjectCode": "CPE 311",
      "kind": "lab",
      "sessionIndex": 0
    }
  ],
  "solveStatus": "OPTIMAL"
}
```

Failure statuses:

| `status` | Meaning |
| --- | --- |
| `infeasible` | No valid assignment exists under the hard constraints, or no candidate variables could be created. |
| `timeout` | CP-SAT reached its time limit with status `UNKNOWN`; the problem is not necessarily impossible. |

`unscheduled` is always present. `solveStatus` carries the CP-SAT status name (`OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `MODEL_INVALID`, `UNKNOWN`).

## Constraints and objectives

The solver enforces hard feasibility constraints including:

- at most one placement per block-session;
- no faculty, room, or section overlap;
- distinct days for multiple sessions of the same section/subject/kind;
- visiting-lecturer hour caps;
- operating-hours and available-time-slot bounds;
- faculty qualifications and room-type suitability;
- existing schedule blocks;
- faculty unavailability.

Soft objectives include unscheduled blocks (dominant weight), lunch-window overlap, end-hour alignment, faculty preferences, room preferences, and consecutive-block penalties. The Python objective and constraints are implemented separately from the TypeScript validation rules; the backend re-validates every returned block with `@coe-nnect/constraint-rules` before persisting a draft.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | HTTP port used by the Docker command. |
| `SOLVER_MAX_TIME` | `90` | CP-SAT time limit in seconds. Docker sets `60`. |
| `SOLVER_WORKERS` | `8` | Number of CP-SAT search workers. |
| `SOLVER_VERBOSE` | `0` | Set `1` to log CP-SAT search progress. |

The Dockerfile sets `SOLVER_MAX_TIME=60`, `SOLVER_WORKERS=8`, and `SOLVER_VERBOSE=0`. Override them at deploy time when the host has more CPU or a larger term needs a longer search.

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

The root `pnpm setup:venvs` command creates this virtual environment and installs the requirements. `pnpm dev` starts the solver automatically when the environment exists.

## Docker and Railway

The package includes a Dockerfile based on `python:3.11-slim`. It installs `libgomp1` (required by OR-Tools for multi-threaded search), copies the service, exposes port `8000`, and starts Uvicorn with `${PORT:-8000}`.

Railway builds the service from `packages/solver-service` and keeps it private. The backend reaches it through the reference variable:

```text
SOLVER_URL=http://${{coe-nnectsolver.RAILWAY_PRIVATE_DOMAIN}}:${{coe-nnectsolver.PORT}}
```

The health check is `/health`. See the [Railway deployment guide](../operations/railway.md).

## Integration boundary

The backend prepares the solve request, checks room sufficiency, calls `POST /solve`, validates returned blocks with the TypeScript constraint-rules package, and persists the result only after hard validation passes. The backend client uses a **240-second** solve timeout and retries transient `502`/`503`/`504`/network failures. Solver availability is required for auto-generation, but not for manual schedule plotting or other API features.

The Python solver's optimization constraints and objectives are implemented separately from the TypeScript validation rules. Keep the request/response models in `solver.py`, the backend problem builder, and the backend's post-solve validation behavior in sync when changing this contract. The [system architecture](../architecture/README.md) describes the complete flow.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `status: timeout` | Increase `SOLVER_MAX_TIME`, reduce the term load, or give the container more CPU. |
| `status: infeasible` | Check faculty qualifications, room types, available time slots, and unavailability. |
| Slow single-threaded search | Confirm `libgomp1` is installed in the container and `SOLVER_WORKERS` is greater than 1. |
| Backend reports solver unavailable | Confirm `SOLVER_URL`, the service `/health` response, and Railway private networking. |
| Backend times out at 240 seconds | The solver exceeded the client budget; reduce the model or raise the client timeout deliberately. |
