FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source (scripts/ lands in /app/scripts, where `flyctl ssh
# console` starts, so `python scripts/strava_webhook.py ...` works there)
COPY backend/ .

# Only the small live menu copies: menu_store loads data/live/ first and
# re-pulls it from GitHub hourly. The full 6-week files (~35 MB) are never read.
COPY scraping_scripts/data/live/ ./scraping_scripts/data/live/

# Non-root user for security. The app never writes to /app, so the code stays
# root-owned and read-only for it; compile now, since it can't write __pycache__.
RUN python -m compileall -q . && adduser --disabled-password --gecos "" appuser
USER appuser

ENV PORT=8000
EXPOSE $PORT

# exec: uvicorn replaces sh as PID 1, so it gets Fly's stop signal and shuts down cleanly.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port $PORT"]
