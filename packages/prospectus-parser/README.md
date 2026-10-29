# Prospectus parser

This package contains the standalone FastAPI service for extracting selectable text from user-defined regions of prospectus PDFs. It is not required to run the main web application.

Scanned pages and screenshots pasted into a document have no text layer. Those can be read with the opt-in OCR fallback (`ocr: true` on `POST /extract`), which renders the page and runs Tesseract — dark pages (white text on black) are inverted first. OCR needs the `tesseract-ocr` system package (installed in the Dockerfile; see the service guide for local setup).

See the [service guide](../../docs/packages/prospectus-parser.md) for endpoints, request coordinates, local setup, and configuration.
