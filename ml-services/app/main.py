from __future__ import annotations

import hmac
import json
import os
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict

from app.models.placement_models import TASK_HANDLERS, task_capabilities
from app.models.resume_parser.service import parse_resume

MAX_PAYLOAD_BYTES = 64 * 1024
MAX_RESUME_BYTES = 4 * 1024 * 1024
MAX_RESUME_BODY_BYTES = MAX_RESUME_BYTES + 64 * 1024

app = FastAPI(
    title="Smart Internship and Placement ML Services",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

auth_scheme = HTTPBearer(auto_error=False)


class InferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payload: dict[str, Any]


async def require_service_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
) -> None:
    expected = os.environ.get("ML_SERVICE_TOKEN", "")
    if len(expected) < 32:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ML service authentication is not configured")
    supplied = credentials.credentials if credentials and credentials.scheme.lower() == "bearer" else ""
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service credentials", headers={"WWW-Authenticate": "Bearer"})


class RequestBodyTooLarge(Exception):
    pass


class RequestSizeLimitMiddleware:
    def __init__(self, app, max_body_size: int) -> None:
        self.app = app
        self.max_body_size = max_body_size

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or not scope.get("path", "").startswith("/v1/"):
            await self.app(scope, receive, send)
            return

        max_body_size = MAX_RESUME_BODY_BYTES if scope.get("path") == "/v1/resume/parse-file" else self.max_body_size
        headers = dict(scope.get("headers", []))
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                if int(raw_length) > max_body_size:
                    await self._reject(send, 413, "Request payload is too large")
                    return
            except ValueError:
                await self._reject(send, 400, "Invalid content length")
                return

        body_size = 0

        async def limited_receive():
            nonlocal body_size
            message = await receive()
            if message["type"] == "http.request":
                body_size += len(message.get("body", b""))
                if body_size > max_body_size:
                    raise RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge:
            await self._reject(send, 413, "Request payload is too large")

    @staticmethod
    async def _reject(send, code: int, message: str) -> None:
        body = json.dumps({"detail": message}).encode("utf-8")
        await send({"type": "http.response.start", "status": code, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode("ascii"))]})
        await send({"type": "http.response.body", "body": body})


app.add_middleware(RequestSizeLimitMiddleware, max_body_size=MAX_PAYLOAD_BYTES)


def _validate_payload_size(payload: dict[str, Any]) -> None:
    try:
        size = len(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Payload must contain JSON values") from error
    if size > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Request payload is too large")


def _run_task(task: str, payload: dict[str, Any]) -> dict[str, Any]:
    _validate_payload_size(payload)
    try:
        if task == "resume_parsing":
            return parse_resume(payload)
        handler = TASK_HANDLERS[task]
        if handler is None:
            raise HTTPException(status_code=501, detail="No handler is registered for this task")
        return handler(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/healthz")
def health():
    return {"status": "ok", "service": "placement-ml", "version": app.version}


@app.get("/v1/models", dependencies=[Depends(require_service_token)])
def models():
    return {"service": "placement-ml", "models": task_capabilities()}


@app.post("/v1/resume/parse", dependencies=[Depends(require_service_token)])
def parse_resume_endpoint(request: InferenceRequest):
    return _run_task("resume_parsing", request.payload)


@app.post("/v1/resume/parse-file", dependencies=[Depends(require_service_token)])
async def parse_resume_file_endpoint(file: UploadFile = File(...)):
    if file.content_type != "application/pdf" or not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF resumes are supported")

    try:
        contents = await file.read(MAX_RESUME_BYTES + 1)
    finally:
        await file.close()

    if len(contents) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=413, detail="Resume must be 4 MB or smaller")

    import base64

    try:
        return parse_resume({"documentBase64": base64.b64encode(contents).decode("ascii"), "mediaType": "application/pdf"})
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=422, detail="The PDF could not be read. Try another file.") from error


@app.post("/v1/recommendations", dependencies=[Depends(require_service_token)])
def recommend_endpoint(request: InferenceRequest):
    return _run_task("internship_recommendation", request.payload)


@app.post("/v1/match", dependencies=[Depends(require_service_token)])
def match_endpoint(request: InferenceRequest):
    return _run_task("job_candidate_matching", request.payload)


@app.post("/v1/placement/predict", dependencies=[Depends(require_service_token)])
def placement_endpoint(request: InferenceRequest):
    return _run_task("placement_prediction", request.payload)


@app.post("/v1/eligibility", dependencies=[Depends(require_service_token)])
def eligibility_endpoint(request: InferenceRequest):
    return _run_task("eligibility_engine", request.payload)


@app.post("/v1/rank", dependencies=[Depends(require_service_token)])
def ranking_endpoint(request: InferenceRequest):
    return _run_task("resume_ranking", request.payload)


@app.post("/v1/salary/predict", dependencies=[Depends(require_service_token)])
def salary_endpoint(request: InferenceRequest):
    return _run_task("salary_prediction", request.payload)


@app.post("/v1/skill-gap", dependencies=[Depends(require_service_token)])
def skill_gap_endpoint(request: InferenceRequest):
    return _run_task("skill_gap_analysis", request.payload)


@app.post("/v1/interview", dependencies=[Depends(require_service_token)])
def interview_endpoint(request: InferenceRequest):
    return _run_task("interview_assistant", request.payload)


@app.post("/v1/knowledge/retrieve", dependencies=[Depends(require_service_token)])
def knowledge_endpoint(request: InferenceRequest):
    return _run_task("knowledge_chatbot", request.payload)


@app.post("/v1/resume/classify", dependencies=[Depends(require_service_token)])
def classification_endpoint(request: InferenceRequest):
    return _run_task("resume_classification", request.payload)


@app.post("/v1/fraud/check", dependencies=[Depends(require_service_token)])
def duplicate_endpoint(request: InferenceRequest):
    return _run_task("fraud_duplicate_detection", request.payload)


@app.post("/v1/fairness/audit", dependencies=[Depends(require_service_token)])
def fairness_endpoint(request: InferenceRequest):
    return _run_task("fairness_audit", request.payload)


__all__ = ["app"]
