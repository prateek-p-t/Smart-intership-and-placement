from __future__ import annotations

import base64
import re
from typing import Any

from app.models.common import bounded_text

SKILL_TAXONOMY = {
    "python", "java", "javascript", "typescript", "sql", "postgresql", "mysql", "mongodb",
    "react", "next.js", "node.js", "fastapi", "django", "flask", "machine learning",
    "deep learning", "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy", "aws",
    "azure", "gcp", "docker", "kubernetes", "git", "figma", "excel", "power bi", "tableau",
    "c++", "c#", "go", "rust", "html", "css", "tailwind", "redis", "linux", "rest api",
}
SECTION_NAMES = ("education", "experience", "projects", "certifications", "skills")


def _extract_document(payload: dict[str, Any]) -> tuple[str, str]:
    if isinstance(payload.get("text"), str):
        return bounded_text(payload["text"], "text", 80_000), "text"

    encoded = payload.get("documentBase64")
    media_type = payload.get("mediaType")
    if not isinstance(encoded, str) or len(encoded) > 6_000_000:
        raise ValueError("Provide extracted text or a PDF/DOCX document smaller than 4 MB.")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise ValueError("The document encoding is invalid.") from error
    if len(data) > 4 * 1024 * 1024:
        raise ValueError("The document exceeds the 4 MB limit.")

    if media_type == "application/pdf" and data.startswith(b"%PDF-"):
        from io import BytesIO
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data), strict=True)
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:30])
        return bounded_text(text, "document text", 80_000), "pdf"
    if media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" and data[:2] == b"PK":
        from io import BytesIO
        from docx import Document

        document = Document(BytesIO(data))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        return bounded_text(text, "document text", 80_000), "docx"
    raise ValueError("Only valid PDF and DOCX documents are supported.")


def parse_resume(payload: dict[str, Any]) -> dict[str, Any]:
    text, source_format = _extract_document(payload)
    normalized = text.casefold()
    skills = sorted(skill for skill in SKILL_TAXONOMY if re.search(rf"(?<![\w+#.]){re.escape(skill)}(?![\w+#.])", normalized))
    emails = sorted(set(re.findall(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", text, flags=re.I)))[:5]
    phones = sorted(set(re.findall(r"(?<!\d)(?:\+?\d[\d ()-]{7,}\d)(?!\d)", text)))[:5]
    sections = {name: bool(re.search(rf"(?im)^\s*{name}\s*:?\s*$", text)) for name in SECTION_NAMES}
    return {
        "task": "resume_parsing",
        "available": True,
        "lifecycle": "rules_based",
        "modelTrained": False,
        "sourceFormat": source_format,
        "extraction": {
            "skills": skills,
            "emailAddresses": emails,
            "phoneNumbers": phones,
            "sectionHeadingsPresent": [name for name, present in sections.items() if present],
            "textCharacters": len(text),
        },
        "confidence": {"skills": "heuristic, not calibrated", "contactDetails": "pattern match, verify manually"},
        "limitations": ["Scanned PDFs require an OCR service and are not processed here.", "Verify all extracted details before use."],
    }


def preprocess_resume(text: str) -> str:
    return " ".join(text.casefold().split())


def train_resume_parser(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    return {"task": "resume_parsing", "status": "not_trained", "reason": "This service uses deterministic document extraction; custom extraction training requires an independently labeled entity dataset."}


def evaluate_resume_parser(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    return {"task": "resume_parsing", "status": "not_evaluated", "metrics": ["entity precision", "entity recall", "entity F1", "field-level exact match"]}


def model_config() -> dict[str, Any]:
    return {"task": "resume_parsing", "version": "rules-v1", "artifactLocation": None, "trained": False}


def test_resume_parser() -> None:
    result = parse_resume({"text": "Skills\nPython, SQL\nContact test@example.com"})
    assert result["extraction"]["skills"] == ["python", "sql"]
    assert result["extraction"]["emailAddresses"] == ["test@example.com"]


def main() -> None:
    print("Resume parsing uses deterministic extraction and has no trained artifact.")


if __name__ == "__main__":
    main()

__all__ = ["parse_resume", "preprocess_resume", "train_resume_parser", "evaluate_resume_parser", "model_config", "test_resume_parser"]
