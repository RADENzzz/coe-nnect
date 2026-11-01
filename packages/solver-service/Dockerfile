FROM python:3.11-slim

# OR-Tools needs libgomp at runtime. Without it, CP-SAT silently falls
# back to single-threaded mode — your 8 workers become 1, presolve
# runs 5-10x slower, and that's half the reason the 120s timeout fires.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Sensible defaults for a 16-section CPE term on a 2-4 core host.
# Override at deploy time via `-e SOLVER_MAX_TIME=120` etc.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    SOLVER_MAX_TIME=60 \
    SOLVER_WORKERS=8 \
    SOLVER_VERBOSE=0

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-keep-alive 75"]