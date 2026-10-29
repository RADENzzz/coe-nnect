FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Tesseract is the OCR engine used for scanned / image-only pages.
# pypdfium2 and Pillow ship manylinux wheels — no other apt deps needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8001

# Shell form so ${PORT} expands at runtime (Railway injects PORT)
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}
