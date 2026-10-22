FROM python:3.12-slim
WORKDIR /app
ENV PYTHONPATH=/app
# CA-сертификаты нужны для HTTPS к API MAX (без них push не отправляются)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
