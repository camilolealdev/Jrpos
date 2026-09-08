FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN groupadd -r jrpos && useradd -r -g jrpos jrpos && chown -R jrpos:jrpos /app
USER jrpos

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\",\"8000\")}/api')" || exit 1

CMD uvicorn app:app --host 0.0.0.0 --port ${PORT}
