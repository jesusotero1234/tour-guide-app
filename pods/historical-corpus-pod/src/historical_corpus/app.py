from __future__ import annotations

import hmac
import os
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from historical_corpus.models import (
    ChunkRecord,
    ClaimSearchRequest,
    DocumentRecord,
    IndexVersion,
    IngestRequest,
    IngestResult,
    SearchRequest,
    SearchResponse,
    StopSearchRequest,
)
from historical_corpus.service import (
    DocumentConflictError,
    HistoricalCorpusError,
    HistoricalCorpusService,
    RecordNotFoundError,
    RightsNotReusableError,
)


class ApiProblem(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


class _BodyTooLarge(Exception):
    pass


class BodySizeLimiter:
    def __init__(self, app: Any, max_body_bytes: int) -> None:
        self._app = app
        self._max_body_bytes = max_body_bytes

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self._app(scope, receive, send)
            return

        if scope["method"] in ("GET", "HEAD", "OPTIONS"):
            await self._app(scope, receive, send)
            return

        headers = scope.get("headers", [])
        declared_length: int | None = None
        for key, value in headers:
            if key.lower() == b"content-length":
                try:
                    declared_length = int(value.decode("latin-1"))
                except (ValueError, UnicodeDecodeError):
                    declared_length = None
                break

        if declared_length is not None and declared_length > self._max_body_bytes:
            await self._send_413(send)
            return

        received = 0

        async def limited_receive() -> dict[str, Any]:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                chunk = message.get("body", b"")
                received += len(chunk)
                if received > self._max_body_bytes:
                    raise _BodyTooLarge()
                return message
            return message

        try:
            await self._app(scope, limited_receive, send)
        except _BodyTooLarge:
            await self._send_413(send)

    async def _send_413(self, send: Any) -> None:
        payload = b'{"error":{"code":"PAYLOAD_TOO_LARGE","message":"request body exceeds maximum allowed size"}}'
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(payload)).encode("latin-1")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": payload})


def create_app(
    service: HistoricalCorpusService | None = None,
    admin_token: str | None = None,
    max_body_bytes: int = 2097152,
) -> FastAPI:
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if service is None:
            from historical_corpus.runtime import build_service_from_env

            app.state.service = build_service_from_env()
        else:
            app.state.service = service
        app.state.owns_service = service is None
        app.state.admin_token = admin_token if admin_token is not None else os.environ.get("HISTORICAL_CORPUS_ADMIN_TOKEN")
        try:
            yield
        finally:
            if app.state.owns_service and app.state.service is not None:
                app.state.service.close()

    app = FastAPI(
        title="Historical Corpus API",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.state.service = service
    app.state.admin_token = admin_token
    app.state.owns_service = service is None

    app.add_middleware(BodySizeLimiter, max_body_bytes=max_body_bytes)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        details: dict[str, Any] = {}
        for error in exc.errors():
            loc = error.get("loc", ())
            key = ".".join(str(part) for part in loc) or "body"
            details[key] = error.get("msg", "invalid value")
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"error": {"code": "VALIDATION_ERROR", "message": "request validation failed", "details": details}},
        )

    @app.exception_handler(HistoricalCorpusError)
    async def _corpus_error_handler(request: Request, exc: HistoricalCorpusError) -> JSONResponse:
        if isinstance(exc, RightsNotReusableError):
            code_status = status.HTTP_422_UNPROCESSABLE_CONTENT
        elif isinstance(exc, DocumentConflictError):
            code_status = status.HTTP_409_CONFLICT
        elif isinstance(exc, RecordNotFoundError):
            code_status = status.HTTP_404_NOT_FOUND
        else:
            code_status = status.HTTP_500_INTERNAL_SERVER_ERROR
        body: dict[str, Any] = {"code": exc.code, "message": exc.message}
        if exc.details:
            body["details"] = exc.details
        return JSONResponse(
            status_code=code_status,
            content={"error": body},
        )

    @app.exception_handler(ApiProblem)
    async def _api_problem_handler(request: Request, exc: ApiProblem) -> JSONResponse:
        body: dict[str, Any] = {"code": exc.code, "message": exc.message}
        if exc.details:
            body["details"] = exc.details
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": body},
        )

    @app.exception_handler(Exception)
    async def _generic_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": {"code": "INTERNAL_ERROR", "message": "internal server error"}},
        )

    def _require_service() -> HistoricalCorpusService:
        svc = app.state.service
        if svc is None:
            raise ApiProblem(status.HTTP_503_SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "service is not available")
        return svc

    def _check_ingest_auth(request: Request) -> None:
        token = app.state.admin_token
        if token is None:
            raise ApiProblem(status.HTTP_503_SERVICE_UNAVAILABLE, "INGEST_NOT_CONFIGURED", "ingest is not configured")
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            raise ApiProblem(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", "missing bearer token")
        provided = auth_header[len("Bearer "):]
        if not hmac.compare_digest(provided.encode("utf-8"), token.encode("utf-8")):
            raise ApiProblem(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", "invalid bearer token")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/index/version", response_model=IndexVersion)
    async def index_version() -> IndexVersion:
        svc = _require_service()
        return svc.index_version()

    @app.get("/v1/chunks/{chunk_id}", response_model=ChunkRecord)
    async def get_chunk(chunk_id: str) -> ChunkRecord:
        svc = _require_service()
        return svc.get_chunk(chunk_id)

    @app.get("/v1/documents/{document_id}", response_model=DocumentRecord)
    async def get_document(document_id: str) -> DocumentRecord:
        svc = _require_service()
        return svc.get_document(document_id)

    @app.post("/v1/ingest", response_model=IngestResult)
    async def ingest(request: Request, payload: IngestRequest) -> IngestResult:
        _check_ingest_auth(request)
        svc = _require_service()
        return svc.ingest(payload)

    @app.post("/v1/search", response_model=SearchResponse)
    async def search(payload: SearchRequest) -> SearchResponse:
        svc = _require_service()
        return svc.search(payload)

    @app.post("/v1/search-for-stop", response_model=SearchResponse)
    async def search_for_stop(payload: StopSearchRequest) -> SearchResponse:
        svc = _require_service()
        return svc.search(payload.to_search_request())

    @app.post("/v1/search-for-claim", response_model=SearchResponse)
    async def search_for_claim(payload: ClaimSearchRequest) -> SearchResponse:
        svc = _require_service()
        return svc.search(payload.to_search_request())

    return app


app = create_app()
