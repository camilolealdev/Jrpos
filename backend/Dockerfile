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
# Not on standard PyPI (emergent.sh's own index) — installed separately so Vercel's
# uv-based resolver (which reads requirements.txt for the backend Service) never sees it.
RUN pip install --no-cache-dir emergentintegrations==0.2.0

COPY . .

EXPOSE 8000

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT}
