# Starts with a small python image.
FROM python:3.13-slim

# Defines the '/app' directory to be the backend project dir, no matter its actual file location
WORKDIR /app

# Install Python dependencies first so Docker can cache this layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code.
COPY . .

# FastAPI will listen on this port inside the container.
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]