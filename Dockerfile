FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY assets/ /build/assets/
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /uvx /usr/local/bin/
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ripgrep libexpat1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 kunyu \
    && useradd --uid 10001 --gid kunyu --create-home kunyu \
    && mkdir /data \
    && chown kunyu:kunyu /data
ENV UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    KUNYU_APP_DATA_DIR=/data \
    KUNYU_FRONTEND_DIST=/app/frontend/dist \
    KUNYU_RIPGREP_PATH=/usr/bin/rg \
    PORT=80
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/src/ ./src/
RUN uv sync --frozen --no-dev --no-editable
COPY --from=frontend /build/frontend/dist/ /app/frontend/dist/
USER kunyu
EXPOSE 80
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["/app/backend/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:80/api/v1/system/health', timeout=3).close()"]
CMD ["/app/backend/.venv/bin/python", "-m", "kunyu.main"]
