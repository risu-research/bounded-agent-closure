#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path

SALT = b"CONSEQUENCE_CATEGORY_KILL_GATE_V0_1::2026-09-04::ARM_ORDER"


def canon(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("usage: make_blind_arm_package.py CORPUS ARM_INPUT REVEAL_MAP")
    corpus_path, arm_path, reveal_path = map(Path, sys.argv[1:])
    corpus = json.loads(corpus_path.read_text())
    cases = corpus["cases"]
    ranked = sorted(
        cases,
        key=lambda c: hashlib.sha256(SALT + c["id"].encode()).hexdigest(),
    )

    arm_cases = []
    reveal = {}
    for idx, case in enumerate(ranked, 1):
        opaque = f"CASE-{idx:02d}"
        arm_cases.append({
            "case_id": opaque,
            "nominal_success_artifact": case["nominal_success_artifact"],
            "intended_consequence": case["intended_consequence"],
            "source": case["source"],
        })
        reveal[opaque] = {
            "original_case_id": case["id"],
            "domain": case["domain"],
            "locked_oracle": case["locked_oracle"],
            "reason": case["reason"],
            "expected_obligation_families": case["expected_obligation_families"],
        }

    # Common arm input contains case payload only.  Arm-specific protocols are
    # separate artifacts so the neutral LLM baseline is never shown Project X
    # ontology labels or scoring categories before its answer is frozen.
    arm = {
        "gate": corpus["corpus_id"],
        "package": "BLIND_CASE_PAYLOAD_V0_1",
        "contamination_guards": {
            "project_x_terms_provided": False,
            "oracle_provided": False,
            "domain_labels_provided": False,
            "expected_obligation_families_provided": False,
            "designer_reasoning_provided": False,
            "scoring_rubric_provided": False
        },
        "cases": arm_cases,
    }
    reveal_obj = {
        "gate": corpus["corpus_id"],
        "package": "HIDDEN_REVEAL_MAP_V0_1",
        "must_not_be_given_to_arm_evaluator": True,
        "mapping": reveal,
    }

    arm_path.parent.mkdir(parents=True, exist_ok=True)
    reveal_path.parent.mkdir(parents=True, exist_ok=True)
    arm_path.write_bytes(canon(arm))
    reveal_path.write_bytes(canon(reveal_obj))

    print("BLIND_ARM_PACKAGE=PASS")
    print("arm_sha256=" + hashlib.sha256(arm_path.read_bytes()).hexdigest())
    print("reveal_sha256=" + hashlib.sha256(reveal_path.read_bytes()).hexdigest())
    print("cases=" + str(len(arm_cases)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
