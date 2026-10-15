from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any


def normalize(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().casefold())


def terms(value: Any) -> set[str]:
    return set(re.findall(r"[a-z0-9+#.]+", normalize(value)))


def unavailable(task: str, reason: str) -> dict[str, Any]:
    return {"task": task, "available": False, "lifecycle": "not_trained", "reason": reason}


def similarity(left: str, right: str) -> float:
    a, b = terms(left), terms(right)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def text_similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, normalize(left), normalize(right)).ratio()


def clamp_score(value: float) -> int:
    return max(0, min(100, round(value)))


def normalized_skill_set(values: list[str] | None) -> set[str]:
    return {normalize(value) for value in (values or []) if normalize(value)}


def skill_overlap(left: list[str] | None, right: list[str] | None) -> tuple[list[str], list[str]]:
    available = normalized_skill_set(left)
    required = sorted(normalized_skill_set(right))
    matched = [skill for skill in required if skill in available]
    missing = [skill for skill in required if skill not in available]
    return matched, missing


def is_listing_eligible(profile: dict[str, Any], criteria: dict[str, Any] | None) -> tuple[bool, list[dict[str, Any]]]:
    rules = criteria or {}
    checks: list[dict[str, Any]] = []
    if rules.get("minCgpa") is not None:
        try:
            passed = profile.get("cgpa") is not None and float(profile["cgpa"]) >= float(rules["minCgpa"])
        except (TypeError, ValueError):
            passed = False
        checks.append({"rule": "minimum_cgpa", "passed": passed})
    branches = rules.get("branches") or []
    if branches:
        branch = normalize(profile.get("branch"))
        checks.append({"rule": "eligible_branch", "passed": bool(branch and branch in {normalize(item) for item in branches})})
    years = rules.get("graduationYears") or []
    if years:
        try:
            year = int(profile["graduationYear"])
            passed = year in {int(item) for item in years}
        except (TypeError, ValueError):
            passed = False
        checks.append({"rule": "graduation_year", "passed": passed})
    return all(check["passed"] for check in checks), checks


def validate_mapping(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    return value


def bounded_text(value: Any, name: str, limit: int = 20_000) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{name} must be text")
    if len(value) > limit:
        raise ValueError(f"{name} exceeds the maximum length")
    return value


def bounded_list(value: Any, name: str, limit: int = 500) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{name} must be a list")
    if len(value) > limit:
        raise ValueError(f"{name} exceeds the maximum number of items")
    return value
