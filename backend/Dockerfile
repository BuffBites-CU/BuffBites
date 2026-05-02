FROM python:3.12-slim

WORKDIR /app

# Install dependencies in a separate layer so they are cached between code changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Non-root user for security
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

# PORT is injected by Railway/Render/Fly at runtime; default to 8000
ENV PORT=8000

EXPOSE $PORT

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
