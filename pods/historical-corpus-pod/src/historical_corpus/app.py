from __future__ import annotations

import hashlib
import hmac
import os
import re
import stat
import tempfile
from contextlib import AbstractContextManager, asynccontextmanager, nullcontext
from pathlib import Path
from typing import Any, Callable

import pymupdf
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from historical_corpus.models import (
    ChunkRecord,
    ClaimSearchRequest,
    DocumentRecord,
    IndexVersion,
    IngestRequest,
    IngestResult,
    PageRecord,
    PageSummary,
    SearchRequest,
    SearchResponse,
    StopSearchRequest,
)
from historical_corpus.pdf_source import (
    CandidateLeaf,
    PdfSourceError,
    render_preview,
    verify_pdf_sha256,
)
from historical_corpus.service import (
    DocumentConflictError,
    HistoricalCorpusError,
    HistoricalCorpusService,
    RecordNotFoundError,
    RightsNotReusableError,
)

PREVIEW_POLICY_VERSION = "pymupdf-preview-crop-png-v1"
PREVIEW_DPI = 144


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


def _strong_etag(payload: bytes) -> str:
    digest = hashlib.sha256(payload).hexdigest()
    return f'"sha256:{digest}"'


def _fsync_directory(directory: Path) -> None:
    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    descriptor = os.open(directory, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _ensure_preview_directory(directory: Path) -> None:
    try:
        directory.mkdir(parents=True, exist_ok=True)
        metadata = directory.lstat()
    except OSError:
        raise HistoricalCorpusError(
            "preview directory is unavailable",
            details={"reason": "inaccessible"},
        ) from None
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        raise HistoricalCorpusError(
            "preview directory is unavailable",
            details={"reason": "not a directory"},
        )


def _preview_renderer_key(
    policy_version: str = PREVIEW_POLICY_VERSION,
    pymupdf_version: str | None = None,
) -> str:
    selected_version = pymupdf_version if pymupdf_version is not None else pymupdf.__version__
    payload = f"{policy_version}\n{selected_version}\n{PREVIEW_DPI}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _render_preview_png(pdf_path: Path, page: Any) -> bytes:
    candidate = CandidateLeaf(
        pdf_page=page.sourcePdfPageNumber,
        side=page.leafSide,
        crop_box=(
            page.cropBox.x0,
            page.cropBox.y0,
            page.cropBox.x1,
            page.cropBox.y1,
        ),
        rotation_degrees=page.rotationDegrees,
        content_class=page.contentClass,
        table_regions=(),
    )
    rendered = render_preview(pdf_path, candidate)
    pixmap = pymupdf.Pixmap(
        pymupdf.csRGB,
        rendered.width_px,
        rendered.height_px,
        rendered.rgb_bytes,
        False,
    )
    return pixmap.tobytes("png")


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
    lifespan_lock: Callable[[], AbstractContextManager[None]] | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if service is None:
            if lifespan_lock is None:
                from historical_corpus.locks import shared_lock

                lock_path = Path(os.environ.get("HISTORICAL_CORPUS_DATA_DIR", "/data")) / "locks" / "corpus.lock"
                lock_cm = shared_lock(lock_path)
            else:
                lock_cm = lifespan_lock()
        else:
            if lifespan_lock is None:
                lock_cm = nullcontext()
            else:
                lock_cm = lifespan_lock()

        with lock_cm:
            if service is None:
                from historical_corpus.runtime import build_service_from_env

                app.state.service = build_service_from_env(startup_policy="verify")
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
        elif exc.message == "canonical PDF digest does not match the declared hash":
            code_status = status.HTTP_409_CONFLICT
            body: dict[str, Any] = {
                "code": "CANONICAL_PDF_ERROR",
                "message": exc.message,
            }
            if exc.details:
                body["details"] = exc.details
            return JSONResponse(
                status_code=code_status,
                content={"error": body},
            )
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
    def index_version() -> IndexVersion:
        svc = _require_service()
        return svc.index_version()

    @app.get("/v1/chunks/{chunk_id}", response_model=ChunkRecord)
    def get_chunk(chunk_id: str) -> ChunkRecord:
        svc = _require_service()
        return svc.get_chunk(chunk_id)

    @app.get("/v1/documents/{document_id}", response_model=DocumentRecord)
    def get_document(document_id: str) -> DocumentRecord:
        svc = _require_service()
        return svc.get_document(document_id)

    @app.get("/v1/documents/{document_id}/pages", response_model=list[PageSummary])
    def list_document_pages(document_id: str) -> list[PageSummary]:
        svc = _require_service()
        return svc.list_document_pages(document_id)

    @app.get("/v1/documents/{document_id}/pages/{logical_page_number}", response_model=PageRecord)
    def get_document_page(document_id: str, logical_page_number: int) -> PageRecord:
        svc = _require_service()
        return svc.get_document_page(document_id, logical_page_number)

    @app.get("/v1/documents/{document_id}/pages/{logical_page_number}/image")
    def get_document_page_image(
        document_id: str,
        logical_page_number: int,
        request: Request,
    ) -> Response:
        if request.query_params:
            raise ApiProblem(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "VALIDATION_ERROR",
                "invalid query parameters",
            )
        svc = _require_service()
        page = svc.get_document_page(document_id, logical_page_number)
        pdf_path = svc.canonical_pdf_path_for_rendering(document_id)

        page_id_match = re.fullmatch(r"sha256:([0-9a-f]{64})", page.pageId)
        if not page_id_match:
            raise HistoricalCorpusError(
                "page identifier is invalid",
                details={
                    "documentId": document_id,
                    "logicalPageNumber": logical_page_number,
                },
            )
        page_id_hex = page_id_match.group(1)

        renderer_key = _preview_renderer_key()

        data_dir = Path(os.environ.get("HISTORICAL_CORPUS_DATA_DIR", "/data"))
        preview_dir = data_dir / "previews"
        cache_path = preview_dir / f"{page_id_hex}-{renderer_key}.png"

        try:
            verify_pdf_sha256(pdf_path, page.canonicalPdfSha256)
            _ensure_preview_directory(preview_dir)

            if cache_path.is_symlink():
                raise ApiProblem(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "internal server error",
                )
            if cache_path.exists():
                try:
                    flags = os.O_RDONLY
                    if hasattr(os, "O_NOFOLLOW"):
                        flags |= os.O_NOFOLLOW
                    descriptor = os.open(cache_path, flags)
                    try:
                        metadata = os.fstat(descriptor)
                        if not stat.S_ISREG(metadata.st_mode):
                            raise ApiProblem(
                                status.HTTP_500_INTERNAL_SERVER_ERROR,
                                "INTERNAL_ERROR",
                                "internal server error",
                            )
                        payload = b""
                        while True:
                            chunk = os.read(descriptor, 65536)
                            if not chunk:
                                break
                            payload += chunk
                    finally:
                        os.close(descriptor)
                except OSError:
                    raise ApiProblem(
                        status.HTTP_500_INTERNAL_SERVER_ERROR,
                        "INTERNAL_ERROR",
                        "internal server error",
                    ) from None
            else:
                payload = _render_preview_png(pdf_path, page)

                descriptor, temp_name = tempfile.mkstemp(
                    dir=preview_dir,
                    prefix=f".{cache_path.name}.tmp-",
                )
                temp_path = Path(temp_name)
                try:
                    os.chmod(temp_path, 0o600)
                    with os.fdopen(descriptor, "wb") as handle:
                        handle.write(payload)
                        handle.flush()
                        os.fsync(handle.fileno())
                    os.replace(temp_path, cache_path)
                    _fsync_directory(preview_dir)
                except OSError:
                    raise ApiProblem(
                        status.HTTP_500_INTERNAL_SERVER_ERROR,
                        "INTERNAL_ERROR",
                        "internal server error",
                    ) from None
                finally:
                    try:
                        temp_path.unlink(missing_ok=True)
                    except OSError:
                        pass
        except PdfSourceError:
            raise ApiProblem(
                status.HTTP_409_CONFLICT,
                "CANONICAL_PDF_ERROR",
                "canonical PDF error",
                details={
                    "documentId": document_id,
                    "logicalPageNumber": logical_page_number,
                },
            )

        etag = _strong_etag(payload)
        if_none_match = request.headers.get("if-none-match")
        if if_none_match is not None and if_none_match == etag:
            return Response(
                status_code=status.HTTP_304_NOT_MODIFIED,
                headers={"ETag": etag},
            )
        return Response(
            content=payload,
            media_type="image/png",
            headers={"ETag": etag},
        )

    @app.post("/v1/ingest", response_model=IngestResult)
    def ingest(request: Request, payload: IngestRequest) -> IngestResult:
        _check_ingest_auth(request)
        svc = _require_service()
        return svc.ingest(payload)

    @app.post("/v1/search", response_model=SearchResponse)
    def search(payload: SearchRequest) -> SearchResponse:
        svc = _require_service()
        return svc.search(payload)

    @app.post("/v1/search-for-stop", response_model=SearchResponse)
    def search_for_stop(payload: StopSearchRequest) -> SearchResponse:
        svc = _require_service()
        return svc.search(payload.to_search_request())

    @app.post("/v1/search-for-claim", response_model=SearchResponse)
    def search_for_claim(payload: ClaimSearchRequest) -> SearchResponse:
        svc = _require_service()
        return svc.search(payload.to_search_request())

    return app


app = create_app()
