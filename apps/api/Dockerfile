# --- Etapa de construcción: compila wheels con las dependencias de ejecución ---
FROM python:3.15-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /src
COPY pyproject.toml ./
COPY app ./app
RUN pip wheel --wheel-dir /wheels .

# --- Etapa final: solo runtime, sin herramientas de desarrollo ni compiladores ---
FROM python:3.15-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY --from=build /wheels /wheels
RUN pip install --no-index --find-links=/wheels ecomove-api && rm -rf /wheels \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin ecomove
COPY --chown=root:root alembic.ini ./
COPY --chown=root:root alembic ./alembic
COPY --chown=root:root app ./app
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh
USER ecomove
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=2).status == 200 else 1)"
ENTRYPOINT ["docker-entrypoint.sh"]
# RUN_MIGRATIONS=false para ejecutar las migraciones como un job aparte (recomendado con varias réplicas).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-server-header"]
