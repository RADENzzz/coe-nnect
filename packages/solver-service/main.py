from fastapi import FastAPI
from contextlib import asynccontextmanager
from solver import SolveRequest, solve_schedule

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm the OR-Tools import path in the request thread pool.
    # No model building here — just ensuring the module is loaded.
    yield
    # On shutdown, drop the global CP-SAT solver singletons (if any).
    try:
        from ortools.sat.python import cp_model  # noqa: F401
    except Exception:
        pass

app = FastAPI(title="CoE-NNECT Solver Service", lifespan=lifespan)

@app.post("/solve")
def solve(req: SolveRequest):
    return solve_schedule(req)

@app.get("/health")
def health():
    return {"status": "ok"}