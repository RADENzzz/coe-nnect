FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# pypdfium2 ships manylinux wheels — no apt deps needed
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8001

# Shell form so ${PORT} expands at runtime (Railway injects PORT)
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}