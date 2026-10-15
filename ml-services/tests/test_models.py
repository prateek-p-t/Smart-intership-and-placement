from __future__ import annotations

import os

from fastapi.testclient import TestClient

from app.main import app
from app.models.placement_models import (
    eligibility_engine,
    fairness_audit,
    fraud_duplicate_detection,
    interview_assistant,
    job_candidate_matching,
    knowledge_retrieval,
    placement_prediction,
    recommend_internships,
    resume_classification,
    resume_ranking,
    salary_prediction,
    skill_gap_analysis,
)

client = TestClient(app)
TOKEN = "test-ml-service-token-that-is-long-enough"


def test_independent_task_capability_states() -> None:
    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    response = client.get("/v1/models", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200
    tasks = {entry["task"]: entry for entry in response.json()["models"]}
    assert len(tasks) == 13
    assert tasks["placement_prediction"]["lifecycle"] == "not_trained"
    assert tasks["salary_prediction"]["deployed"] is False
    assert tasks["internship_recommendation"]["lifecycle"] == "rules_based"


def test_service_token_required() -> None:
    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    assert client.get("/v1/models").status_code == 401
    assert client.get("/v1/models", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_resume_parser_uses_text_without_training_claim() -> None:
    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    response = client.post("/v1/resume/parse", headers={"Authorization": f"Bearer {TOKEN}"}, json={"payload": {"text": "Skills\nPython, SQL\nContact test@example.com"}})
    assert response.status_code == 200
    body = response.json()
    assert body["modelTrained"] is False
    assert body["extraction"]["skills"] == ["python", "sql"]


def test_recommendations_api_accepts_gateway_payload_shape() -> None:
    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    response = client.post(
        "/v1/recommendations",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"payload": {"profile": {"skills": ["Python"]}, "listings": []}},
    )
    assert response.status_code == 200
    assert response.json()["task"] == "internship_recommendation"


def test_recommendations_explain_skills_and_exclude_applied_listing() -> None:
    result = recommend_internships({
        "profile": {"skills": ["Python"], "interests": [], "branch": None, "graduationYear": None, "cgpa": None},
        "listings": [
            {"id": "a", "title": "Python intern", "requiredSkills": ["Python"], "eligibility": None},
            {"id": "b", "title": "Python intern", "requiredSkills": ["Python"], "eligibility": None},
        ],
        "appliedListingIds": ["b"],
    })
    assert [item["id"] for item in result["recommendations"]] == ["a"]
    assert result["trainedModelUsed"] is False


def test_explicit_eligibility_criteria_fail_on_missing_profile_data() -> None:
    result = eligibility_engine({"profile": {"skills": []}, "criteria": {"minCgpa": 3.0, "branches": ["CS"]}})
    assert result["eligible"] is False
    assert all(check["passed"] is False for check in result["checks"])


def test_candidate_match_and_resume_ranking_are_skill_explainable() -> None:
    match = job_candidate_matching({"profile": {"skills": ["Python"]}, "position": {"requiredSkills": ["Python", "SQL"]}})
    assert match["matchedRequiredSkills"] == ["python"]
    assert match["missingRequiredSkills"] == ["sql"]
    ranking = resume_ranking({"position": {"requiredSkills": ["Python"]}, "candidates": [{"candidateId": "b", "profile": {"skills": []}}, {"candidateId": "a", "profile": {"skills": ["Python"]}}]})
    assert [candidate["candidateId"] for candidate in ranking["rankedCandidates"]] == ["a", "b"]


def test_skill_gap_and_interview_practice() -> None:
    gap = skill_gap_analysis({"profile": {"skills": ["Python"]}, "requiredSkills": ["Python", "SQL"]})
    assert gap["missingSkills"] == ["sql"]
    practice = interview_assistant({"role": "Backend intern", "skills": ["Python"], "difficulty": "entry"})
    assert practice["prompts"]
    assert "score" not in practice


def test_knowledge_search_is_extractive_and_returns_source_refs() -> None:
    result = knowledge_retrieval({"question": "internship resume", "documents": [{"id": "handbook", "title": "Handbook", "text": "Submit your internship resume before the application deadline."}]})
    assert result["answer"] is None
    assert result["sources"][0]["documentId"] == "handbook"


def test_duplicate_review_does_not_assert_misconduct() -> None:
    result = fraud_duplicate_detection({"records": [{"id": "one", "text": "Identical application text"}, {"id": "two", "text": "Identical application text"}]})
    assert result["duplicateReviewFlags"][0]["reviewRequired"] is True
    assert "not evidence of fraud" in result["disclaimer"]


def test_untrained_tasks_never_fabricate_predictions() -> None:
    for result in (placement_prediction({}), salary_prediction({}), resume_classification({}), fairness_audit({})):
        assert result["available"] is False
        assert result["lifecycle"] == "not_trained"


def test_invalid_payload_returns_validation_error() -> None:
    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    response = client.post("/v1/eligibility", headers={"Authorization": f"Bearer {TOKEN}"}, json={"payload": {"profile": [], "criteria": {}}})
    assert response.status_code == 422


def test_oversized_payload_rejected() -> None:
    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    response = client.post("/v1/skill-gap", headers={"Authorization": f"Bearer {TOKEN}"}, json={"payload": {"value": "x" * 66_000}})
    assert response.status_code == 413


def test_resume_file_endpoint_parses_bounded_multipart_upload(monkeypatch) -> None:
    import base64

    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    document = b"%PDF-1.4 test resume"

    def fake_parse_resume(payload):
        assert payload["mediaType"] == "application/pdf"
        assert base64.b64decode(payload["documentBase64"]) == document
        return {"task": "resume_parsing", "available": True, "lifecycle": "rules_based", "modelTrained": False}

    monkeypatch.setattr("app.main.parse_resume", fake_parse_resume)
    response = client.post(
        "/v1/resume/parse-file",
        headers={"Authorization": f"Bearer {TOKEN}"},
        files={"file": ("resume.pdf", document, "application/pdf")},
    )
    assert response.status_code == 200
    assert response.json()["task"] == "resume_parsing"


def test_resume_file_endpoint_rejects_unsupported_file_type() -> None:
    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    response = client.post(
        "/v1/resume/parse-file",
        headers={"Authorization": f"Bearer {TOKEN}"},
        files={"file": ("resume.txt", b"plain text", "text/plain")},
    )
    assert response.status_code == 415


def test_resume_file_endpoint_rejects_invalid_pdf_content() -> None:
    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    response = client.post(
        "/v1/resume/parse-file",
        headers={"Authorization": f"Bearer {TOKEN}"},
        files={"file": ("resume.pdf", b"not a pdf", "application/pdf")},
    )
    assert response.status_code == 422


def test_resume_file_endpoint_rejects_files_over_four_megabytes() -> None:
    os.environ["ML_SERVICE_TOKEN"] = TOKEN
    response = client.post(
        "/v1/resume/parse-file",
        headers={"Authorization": f"Bearer {TOKEN}"},
        files={"file": ("resume.pdf", b"%PDF-" + b"x" * (4 * 1024 * 1024), "application/pdf")},
    )
    assert response.status_code == 413


