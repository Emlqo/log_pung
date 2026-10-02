FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONUTF8=1 DISABLE_SQLALCHEMY_CEXT_RUNTIME=1
WORKDIR /app
COPY server/requirements.lock.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && useradd --uid 10001 --create-home pilot
COPY server/app.py server/dashboard.html server/dashboard.js server/dashboard.css server/production_run.py /app/
USER pilot
EXPOSE 8000
CMD ["python", "production_run.py"]
