FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY __init__.py backend/__init__.py
COPY app backend/app
COPY core backend/core
COPY cv backend/cv
COPY models backend/models
COPY report backend/report
EXPOSE 8000
CMD uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1