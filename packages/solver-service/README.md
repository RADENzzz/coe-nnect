# Solver service

`packages/solver-service` is the standalone FastAPI + Google OR-Tools CP-SAT service used by backend automatic schedule generation. The NestJS API builds the problem, calls `POST /solve`, re-validates the result with the TypeScript constraint rules, and persists only a passing draft.

- `GET /health` — liveness probe.
- `POST /solve` — candidate schedule, unscheduled blocks, or a failure status.
- `GET /docs` — interactive FastAPI schema while running.

Run locally:

```powershell
Set-Location packages\solver-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Configuration: `SOLVER_MAX_TIME` (default 90 seconds; Docker 60), `SOLVER_WORKERS` (default 8), and `SOLVER_VERBOSE` (default 0). Railway runs this service privately and the backend reaches it through `SOLVER_URL`.

See the [service guide](../../docs/packages/solver-service.md) for the request/response contract, constraints, objectives, Docker/Railway details, and troubleshooting.
