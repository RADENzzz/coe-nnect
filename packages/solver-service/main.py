from fastapi import FastAPI
from solver import SolveRequest, solve_schedule

app = FastAPI(title="CoE-NNECT Solver Service")

@app.post("/solve")
def solve(req: SolveRequest):
    return solve_schedule(req)

@app.get("/health")
def health():
    return {"status": "ok"}