from __future__ import annotations

import hashlib
import re
from difflib import SequenceMatcher
from typing import Any

from app.models.common import (
    bounded_list,
    bounded_text,
    clamp_score,
    is_listing_eligible,
    normalize,
    normalized_skill_set,
    similarity,
    skill_overlap,
    unavailable,
    validate_mapping,
)

MAX_LISTINGS = 200
MAX_CANDIDATES = 200
MAX_TEXT = 20_000


def _text(value: Any, name: str, limit: int = MAX_TEXT) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{name} must be text")
    return bounded_text(value, name, limit)


def _number(value: Any, name: str, minimum: float = 0, maximum: float = 100) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a number")
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{name} must be a number") from error
    if number < minimum or number > maximum:
        raise ValueError(f"{name} is outside the supported range")
    return number


def _string_list(value: Any, name: str, limit: int = 200) -> list[str]:
    if value is None:
        return []
    values = bounded_list(value, name, limit)
    if any(not isinstance(item, str) or len(item) > 200 for item in values):
        raise ValueError(f"{name} must contain short text values")
    return [item.strip() for item in values if item.strip()]


def _profile(value: Any) -> dict[str, Any]:
    profile = validate_mapping(value, "profile")
    return {
        "skills": _string_list(profile.get("skills", []), "profile.skills"),
        "interests": _string_list(profile.get("interests", []), "profile.interests"),
        "branch": _text(profile["branch"], "profile.branch", 200) if profile.get("branch") is not None else None,
        "graduationYear": profile.get("graduationYear"),
        "cgpa": _number(profile.get("cgpa"), "profile.cgpa", 0, 10),
    }


def _listing(value: Any) -> dict[str, Any]:
    listing = validate_mapping(value, "listing")
    eligibility = listing.get("eligibility")
    if eligibility is not None and not isinstance(eligibility, dict):
        raise ValueError("listing.eligibility must be an object")
    return {
        "id": _text(listing.get("id", ""), "listing.id", 200),
        "title": _text(listing.get("title", ""), "listing.title", 500),
        "companyName": _text(listing.get("companyName", ""), "listing.companyName", 500),
        "location": _text(listing.get("location", ""), "listing.location", 500),
        "workMode": _text(listing.get("workMode", ""), "listing.workMode", 100),
        "description": _text(listing.get("description", ""), "listing.description"),
        "requiredSkills": _string_list(listing.get("requiredSkills", []), "listing.requiredSkills"),
        "eligibility": eligibility,
        "deadline": listing.get("deadline"),
    }


def recommend_internships(payload: dict[str, Any]) -> dict[str, Any]:
    profile = _profile(payload.get("profile"))
    listings = [_listing(item) for item in bounded_list(payload.get("listings", []), "listings", MAX_LISTINGS)]
    applied_ids = set(_string_list(payload.get("appliedListingIds", []), "appliedListingIds", MAX_LISTINGS))
    profile_skills = normalized_skill_set(profile["skills"])
    interests = normalized_skill_set(profile["interests"])
    recommendations = []
    for listing in listings:
        if listing["id"] in applied_ids:
            continue
        eligible, checks = is_listing_eligible(profile, listing["eligibility"])
        if not eligible:
            continue
        required = normalized_skill_set(listing["requiredSkills"])
        matched = sorted(required & profile_skills)
        listing_text = normalize(f"{listing['title']} {listing['description']}")
        matched_interests = sorted(interest for interest in interests if interest and interest in listing_text)
        score = clamp_score((80 * len(matched) / len(required) if required else 0) + min(5 * len(matched_interests), 20))
        reasons = []
        if required:
            reasons.append(f"Matches {len(matched)} of {len(required)} listed skills.")
        if matched_interests:
            reasons.append("Related to stated interests: " + ", ".join(matched_interests) + ".")
        if not reasons:
            reasons.append("No skill or interest signal was provided; shown because published eligibility criteria were met.")
        recommendations.append({**listing, "score": score, "reasons": reasons, "eligibilityChecks": checks})
    recommendations.sort(key=lambda item: (-item["score"], item["title"].casefold(), item["id"]))
    return {
        "task": "internship_recommendation",
        "available": True,
        "lifecycle": "rules_based",
        "trainedModelUsed": False,
        "disclaimer": "Explainable skill and interest matching only; not a trained model, employment decision, or outcome prediction.",
        "recommendations": recommendations,
    }


def job_candidate_matching(payload: dict[str, Any]) -> dict[str, Any]:
    profile = _profile(payload.get("profile"))
    position = validate_mapping(payload.get("position"), "position")
    required = _string_list(position.get("requiredSkills", []), "position.requiredSkills")
    preferred = _string_list(position.get("preferredSkills", []), "position.preferredSkills")
    title = _text(position.get("title", ""), "position.title", 500)
    description = _text(position.get("description", ""), "position.description")
    matched_required, missing_required = skill_overlap(profile["skills"], required)
    matched_preferred, _ = skill_overlap(profile["skills"], preferred)
    skill_score = 100 * len(matched_required) / len(required) if required else 0
    preferred_score = 20 * len(matched_preferred) / len(preferred) if preferred else 0
    interest_hits = [interest for interest in profile["interests"] if normalize(interest) in normalize(f"{title} {description}")]
    score = clamp_score(skill_score * 0.8 + min(preferred_score, 20) + min(len(interest_hits) * 3, 10))
    return {
        "task": "job_candidate_matching",
        "available": True,
        "lifecycle": "rules_based",
        "trainedModelUsed": False,
        "score": score,
        "matchedRequiredSkills": matched_required,
        "missingRequiredSkills": missing_required,
        "matchedPreferredSkills": matched_preferred,
        "relatedInterests": interest_hits,
        "method": "exact_skill_overlap_v1",
        "disclaimer": "This baseline compares declared skills and interests; it does not establish competence or predict job performance.",
    }


def eligibility_engine(payload: dict[str, Any]) -> dict[str, Any]:
    profile = _profile(payload.get("profile"))
    criteria = validate_mapping(payload.get("criteria", {}), "criteria")
    allowed = {"minCgpa", "branches", "graduationYears", "requiredSkills"}
    unknown = set(criteria) - allowed
    if unknown:
        raise ValueError("criteria contains unsupported fields")
    minimum = _number(criteria.get("minCgpa"), "criteria.minCgpa", 0, 10)
    branches = _string_list(criteria.get("branches", []), "criteria.branches", 100)
    years = bounded_list(criteria.get("graduationYears", []), "criteria.graduationYears", 50)
    try:
        years = [int(year) for year in years]
    except (TypeError, ValueError) as error:
        raise ValueError("criteria.graduationYears must contain years") from error
    required = _string_list(criteria.get("requiredSkills", []), "criteria.requiredSkills", 100)
    rule_criteria = {"minCgpa": minimum, "branches": branches, "graduationYears": years}
    eligible, checks = is_listing_eligible(profile, rule_criteria)
    matched, missing = skill_overlap(profile["skills"], required)
    if required:
        checks.append({"rule": "required_skills", "passed": not missing, "matched": matched, "missing": missing})
        eligible = eligible and not missing
    return {
        "task": "eligibility_engine",
        "available": True,
        "lifecycle": "rules_based",
        "eligible": eligible,
        "checks": checks,
        "unknownDataPolicy": "Missing profile data fails the corresponding explicit criterion.",
        "disclaimer": "Evaluates only the criteria supplied; verify the source and currency of every profile field.",
    }


def resume_ranking(payload: dict[str, Any]) -> dict[str, Any]:
    position = validate_mapping(payload.get("position"), "position")
    required = _string_list(position.get("requiredSkills", []), "position.requiredSkills", 100)
    preferred = _string_list(position.get("preferredSkills", []), "position.preferredSkills", 100)
    candidates = bounded_list(payload.get("candidates", []), "candidates", MAX_CANDIDATES)
    ranked = []
    for index, raw in enumerate(candidates):
        candidate = validate_mapping(raw, f"candidates[{index}]")
        profile = _profile(candidate.get("profile", {}))
        candidate_id = _text(candidate.get("candidateId", ""), f"candidates[{index}].candidateId", 200)
        matched, missing = skill_overlap(profile["skills"], required)
        preferred_match, _ = skill_overlap(profile["skills"], preferred)
        score = clamp_score((80 * len(matched) / len(required) if required else 0) + (20 * len(preferred_match) / len(preferred) if preferred else 0))
        ranked.append({"candidateId": candidate_id, "score": score, "matchedRequiredSkills": matched, "missingRequiredSkills": missing, "matchedPreferredSkills": preferred_match})
    ranked.sort(key=lambda item: (-item["score"], item["candidateId"]))
    return {
        "task": "resume_ranking",
        "available": True,
        "lifecycle": "rules_based",
        "trainedModelUsed": False,
        "rankedCandidates": ranked,
        "disclaimer": "Explainable relevance ordering based solely on declared job-related skills; not a hiring decision. Human review is required.",
    }


def skill_gap_analysis(payload: dict[str, Any]) -> dict[str, Any]:
    profile = _profile(payload.get("profile"))
    required = _string_list(payload.get("requiredSkills", []), "requiredSkills", 200)
    matched, missing = skill_overlap(profile["skills"], required)
    return {
        "task": "skill_gap_analysis",
        "available": True,
        "lifecycle": "rules_based",
        "matchedSkills": matched,
        "missingSkills": missing,
        "coveragePercent": clamp_score(100 * len(matched) / len(set(normalized_skill_set(required)))) if required else 0,
        "disclaimer": "Compares self-reported skills to a supplied role profile; does not verify proficiency.",
    }


def interview_assistant(payload: dict[str, Any]) -> dict[str, Any]:
    role = _text(payload.get("role", ""), "role", 200)
    skills = _string_list(payload.get("skills", []), "skills", 10)
    difficulty = payload.get("difficulty", "intermediate")
    if difficulty not in {"entry", "intermediate", "advanced"}:
        raise ValueError("difficulty must be entry, intermediate, or advanced")
    prompts = []
    for skill in skills[:5]:
        prompts.append({"type": "technical_practice", "skill": skill, "question": f"Describe a {difficulty}-level project where you used {skill}. What trade-offs did you consider, and how did you verify the result?"})
    prompts.extend([
        {"type": "behavioral_practice", "skill": None, "question": f"For a {role} role, describe a time you received difficult feedback. What did you change afterward?"},
        {"type": "problem_solving_practice", "skill": None, "question": "A project requirement changes shortly before delivery. How would you assess the impact, communicate trade-offs, and agree on a revised plan?"},
    ])
    return {"task": "interview_assistant", "available": True, "lifecycle": "rules_based", "prompts": prompts, "feedbackRubric": ["specific context", "clear personal contribution", "reasoned decisions", "verifiable outcome", "reflection"], "disclaimer": "Practice prompts only; no hiring score, personality inference, or psychometric assessment is produced."}


def knowledge_retrieval(payload: dict[str, Any]) -> dict[str, Any]:
    query = _text(payload.get("question", ""), "question", 2_000)
    if not query.strip():
        raise ValueError("question must not be empty")
    documents = bounded_list(payload.get("documents", []), "documents", 100)
    ranked = []
    for index, raw in enumerate(documents):
        document = validate_mapping(raw, f"documents[{index}]")
        document_id = _text(document.get("id", ""), f"documents[{index}].id", 200)
        title = _text(document.get("title", ""), f"documents[{index}].title", 500)
        text = _text(document.get("text", ""), f"documents[{index}].text", 20_000)
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]
        matches = sorted(((similarity(query, sentence), sentence) for sentence in sentences), key=lambda item: -item[0])[:2]
        score = matches[0][0] if matches else 0
        if score > 0:
            ranked.append({"documentId": document_id, "title": title, "score": round(score, 3), "snippets": [sentence for _, sentence in matches if sentence]})
    ranked.sort(key=lambda item: (-item["score"], item["documentId"]))
    return {"task": "knowledge_chatbot", "available": True, "lifecycle": "rules_based", "answerMode": "extractive_retrieval_only", "sources": ranked[:5], "answer": None, "disclaimer": "No generated answer is provided. Review the cited snippets and the caller must pass only documents it is authorized to access."}


def fraud_duplicate_detection(payload: dict[str, Any]) -> dict[str, Any]:
    records = bounded_list(payload.get("records", []), "records", MAX_CANDIDATES)
    normalized_records = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(records):
        record = validate_mapping(raw, f"records[{index}]")
        record_id = _text(record.get("id", ""), f"records[{index}].id", 200)
        if not record_id or record_id in seen_ids:
            raise ValueError("record ids must be non-empty and unique")
        seen_ids.add(record_id)
        text = _text(record.get("text", ""), f"records[{index}].text", 10_000)
        canonical = normalize(text)
        normalized_records.append((record_id, canonical, hashlib.sha256(canonical.encode("utf-8")).hexdigest()))
    pairs = []
    for index, (left_id, left_text, left_hash) in enumerate(normalized_records):
        if not left_text:
            continue
        for right_id, right_text, right_hash in normalized_records[index + 1:]:
            if not right_text:
                continue
            score = 1.0 if left_hash == right_hash else SequenceMatcher(None, left_text, right_text, autojunk=False).ratio()
            if score >= 0.92:
                pairs.append({"recordIds": [left_id, right_id], "similarity": round(score, 3), "reviewRequired": True, "matchType": "exact" if score == 1 else "near_duplicate"})
    return {"task": "fraud_duplicate_detection", "available": True, "lifecycle": "rules_based", "duplicateReviewFlags": pairs, "disclaimer": "Similarity flags are not evidence of fraud or misconduct. A trained reviewer must investigate context before taking action."}


def placement_prediction(_payload: dict[str, Any]) -> dict[str, Any]:
    return unavailable("placement_prediction", "No approved, representative outcome dataset or evaluated model artifact is available; no placement probability is returned.")


def salary_prediction(_payload: dict[str, Any]) -> dict[str, Any]:
    return unavailable("salary_prediction", "No approved, representative compensation dataset or evaluated model artifact is available; no salary estimate is returned.")


def resume_classification(_payload: dict[str, Any]) -> dict[str, Any]:
    return unavailable("resume_classification", "No approved labeled resume dataset or evaluated classification artifact is available.")


def fairness_audit(_payload: dict[str, Any]) -> dict[str, Any]:
    return unavailable("fairness_audit", "A fairness audit requires authorized outcome labels and a documented subgroup protocol; this service does not infer protected attributes.")


TASK_HANDLERS = {
    "resume_parsing": None,
    "internship_recommendation": recommend_internships,
    "job_candidate_matching": job_candidate_matching,
    "placement_prediction": placement_prediction,
    "eligibility_engine": eligibility_engine,
    "resume_ranking": resume_ranking,
    "salary_prediction": salary_prediction,
    "skill_gap_analysis": skill_gap_analysis,
    "interview_assistant": interview_assistant,
    "knowledge_chatbot": knowledge_retrieval,
    "resume_classification": resume_classification,
    "fraud_duplicate_detection": fraud_duplicate_detection,
    "fairness_audit": fairness_audit,
}


def task_capabilities() -> list[dict[str, Any]]:
    offline_tasks = {"placement_prediction", "salary_prediction", "resume_classification", "fairness_audit"}
    return [
        {
            "task": task,
            "lifecycle": "not_trained" if task in offline_tasks else "rules_based",
            "trained": False,
            "deployed": task not in offline_tasks,
        }
        for task in TASK_HANDLERS
    ]


__all__ = ["TASK_HANDLERS", "task_capabilities"]
