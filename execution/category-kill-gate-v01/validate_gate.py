#!/usr/bin/env python3
from __future__ import annotations
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CORPUS = ROOT / "CORPUS_V0_1.json"
PRELOCK = ROOT / "PRELOCK.md"
PRELOCK_CORRECTION = ROOT / "PRELOCK_CORRECTION_001.md"
DISPOSITION = ROOT / "RG3_DISPOSITION.md"
SOURCE_AUDIT = ROOT / "SOURCE_AUDIT_V0_1.md"
CLAIM_MATRIX = ROOT / "CLAIM_SURFACE_MATRIX_V0_1.csv"
COMPETITIVE_FRONTIER = ROOT / "COMPETITIVE_FRONTIER_V0_1.md"
COMPILER_CRUCIBLE = ROOT / "ZERO_SHOT_COMPILER_CRUCIBLE_V0_1.md"
PLAN_SCHEMA = ROOT / "SOURCE_BOUND_EVIDENCE_PLAN_V0_1.schema.json"
NATIVE_PROVENANCE = ROOT / "NATIVE_VOCABULARY_PROVENANCE.json"
CONTAMINATION_LEDGER = ROOT / "HOLDOUT_CONTAMINATION_LEDGER_V0_1.md"
ARM_B_PROTOCOL = ROOT / "ARM_B_STRONG_LLM_PROTOCOL_V0_1.md"
BLIND_GENERATOR = ROOT / "make_blind_arm_package.py"

ALLOWED_ORACLES = {
    "UNKNOWN_FROM_NOMINAL_ARTIFACT",
    "REFUTED_IF_PREEXISTING_SHORT_LIVED_CREDENTIAL_REMAINS_VALID_ELSE_UNKNOWN_WITHOUT_COVERAGE",
}

FROZEN_ACQUISITION_OPS = ["ENUMERATE", "OBSERVE", "WATCH", "SNAPSHOT"]
FROZEN_PROOF_OPS = ["CERTIFY_COMPLETE", "CERTIFY_TEMPORAL_CLOSURE"]
FROZEN_COMPLETENESS = ["SINGLE_COLLECTION", "STABLE_RESCAN", "EXHAUSTIVE_MEMBER_PROBE"]
FROZEN_ATOM_KINDS = [
    "RELATION_MEMBER",
    "FIELD_VALUE",
    "BINARY_RELATION",
    "EVENT",
    "SNAPSHOT",
    "TEMPORAL_ORIGIN",
    "ACQUISITION_FACT",
    "DERIVED_VALUE",
]


def fail(msg: str) -> None:
    raise SystemExit(f"CATEGORY_GATE_V0_1_VALIDATE=FAIL: {msg}")


def main() -> int:
    required_files = (
        CORPUS,
        PRELOCK,
        PRELOCK_CORRECTION,
        DISPOSITION,
        SOURCE_AUDIT,
        CLAIM_MATRIX,
        COMPETITIVE_FRONTIER,
        COMPILER_CRUCIBLE,
        PLAN_SCHEMA,
        NATIVE_PROVENANCE,
        CONTAMINATION_LEDGER,
        ARM_B_PROTOCOL,
        BLIND_GENERATOR,
    )
    for p in required_files:
        if not p.is_file() or p.stat().st_size == 0:
            fail(f"missing or empty {p.name}")

    data = json.loads(CORPUS.read_text())
    if data.get("corpus_id") != "CONSEQUENCE_CATEGORY_KILL_GATE_V0_1":
        fail("corpus_id drift")
    if data.get("status") != "FROZEN_PREPRIMARY":
        fail("corpus must remain FROZEN_PREPRIMARY")

    cases = data.get("cases")
    if not isinstance(cases, list) or len(cases) != 8:
        fail("exactly eight frozen cases required")

    allow = data.get("generic_obligation_family_allowlist")
    if not isinstance(allow, list) or len(allow) != 8 or len(set(allow)) != 8:
        fail("exactly eight unique generic obligation families required")
    allowset = set(allow)

    ids = []
    domains = []
    sources = []
    for case in cases:
        cid = case.get("id")
        if not isinstance(cid, str) or not cid:
            fail("case id missing")
        ids.append(cid)
        domain = case.get("domain")
        if not isinstance(domain, str) or not domain:
            fail(f"{cid}: domain missing")
        domains.append(domain)
        source = case.get("source")
        if not isinstance(source, str) or not source.startswith("https://"):
            fail(f"{cid}: source must be https")
        sources.append(source)
        if case.get("locked_oracle") not in ALLOWED_ORACLES:
            fail(f"{cid}: oracle not preapproved")
        fams = case.get("expected_obligation_families")
        if not isinstance(fams, list) or not fams:
            fail(f"{cid}: expected families missing")
        if not set(fams) <= allowset:
            fail(f"{cid}: invented generic family")
        for field in ("nominal_success_artifact", "intended_consequence", "reason"):
            if not isinstance(case.get(field), str) or not case[field].strip():
                fail(f"{cid}: missing {field}")

    if len(set(ids)) != len(ids):
        fail("duplicate case ids")
    if len(set(sources)) < 7:
        fail("insufficient independent source diversity")

    counts = Counter(domains)
    if len(counts) != 4:
        fail(f"expected four material domains, got {sorted(counts)}")
    if counts["agentic_payments"] != 3:
        fail("payment wedge must have exactly three cases")
    if min(counts.values()) < 1:
        fail("empty material domain")

    rules = data.get("primary_kill_rules") or {}
    expected = {
        "false_decisive_claims_max": 0,
        "min_cases_explainable_without_new_generic_family": 6,
        "min_material_domains": 3,
        "median_bespoke_semantic_rules_max": 2,
        "max_bespoke_semantic_rules_any_domain": 4,
        "min_executable_evidence_plans": 6,
    }
    if rules != expected:
        fail("kill-rule drift")

    prelock = PRELOCK.read_text()
    required_phrases = [
        "The Project X arm may lose.",
        "One false decisive claim kills the strong horizontal claim",
        "no changing thresholds after seeing outputs",
        "no platform build before this gate resolves",
    ]
    for phrase in required_phrases:
        if phrase not in prelock:
            fail(f"PRELOCK invariant missing: {phrase}")

    correction = PRELOCK_CORRECTION.read_text()
    for phrase in (
        "BEFORE ANY ARM EXECUTION OR ARM OUTPUT",
        "THRESHOLDS UNCHANGED",
        "posthoc scorer derives `bespoke_semantic_rules_used`",
    ):
        if phrase not in correction:
            fail(f"prelock correction invariant missing: {phrase}")

    disposition = DISPOSITION.read_text()
    if "RG3 is SUSPENDED, not abandoned" not in disposition:
        fail("RG3 suspension invariant missing")
    if "no Stripe v0.5 live E0" not in disposition:
        fail("live-RG3 stop condition missing")

    audit = SOURCE_AUDIT.read_text()
    if "Qualified cases: **8 / 8**" not in audit:
        fail("source audit must qualify exactly 8/8 before arm execution")
    if "NOT AN ARM RESULT" not in audit:
        fail("source audit/arm separation invariant missing")

    with CLAIM_MATRIX.open(newline="") as f:
        rows = list(csv.DictReader(f))
    if len(rows) != 8:
        fail("claim surface matrix must contain exactly eight rows")
    matrix_ids = [r.get("case_id") for r in rows]
    if set(matrix_ids) != set(ids) or len(set(matrix_ids)) != 8:
        fail("claim surface matrix/corpus identity mismatch")
    if any(r.get("source_audit") != "PASS" for r in rows):
        fail("claim surface matrix contains unqualified case")

    frontier = COMPETITIVE_FRONTIER.read_text()
    for phrase in (
        "integration compression",
        "KILL-HORIZONTAL",
        "Consequence Contract Compiler",
        "provider/resource-specific procedural handler",
    ):
        if phrase not in frontier:
            fail(f"competitive frontier invariant missing: {phrase}")

    crucible = COMPILER_CRUCIBLE.read_text()
    for phrase in (
        "NO HOLDOUT-SPECIFIC COMPILER CODE",
        "Intent lowering",
        "Source binding",
        "No seventh operation may be added",
        "Catalog-equivalence kill",
    ):
        if phrase not in crucible:
            fail(f"compiler crucible invariant missing: {phrase}")

    provenance = json.loads(NATIVE_PROVENANCE.read_text())
    if provenance.get("source_commit") != "455184caf716751148b7c9c2a372b66084dcaa30":
        fail("Native++ source commit drift")
    if provenance.get("source_archive_sha256") != "a65d2e79590f99cff0efa83de283075f54c69135d00487caa5d1c305ee0aaa8b":
        fail("Native++ source archive digest drift")
    if provenance.get("acquisition_ops") != FROZEN_ACQUISITION_OPS:
        fail("Native++ acquisition vocabulary drift")
    if provenance.get("proof_ops") != FROZEN_PROOF_OPS:
        fail("Native++ proof vocabulary drift")
    if provenance.get("completeness_procedures") != FROZEN_COMPLETENESS:
        fail("Native++ completeness vocabulary drift")
    if provenance.get("evidence_atom_kinds") != FROZEN_ATOM_KINDS:
        fail("Native++ evidence atom vocabulary drift")

    schema = json.loads(PLAN_SCHEMA.read_text())
    props = schema.get("properties") or {}
    gv = ((props.get("generic_vocabulary") or {}).get("properties") or {})
    if (gv.get("acquisition_ops") or {}).get("const") != FROZEN_ACQUISITION_OPS:
        fail("plan schema acquisition op drift")
    if (gv.get("proof_ops") or {}).get("const") != FROZEN_PROOF_OPS:
        fail("plan schema proof op drift")
    if (gv.get("completeness_procedures") or {}).get("const") != FROZEN_COMPLETENESS:
        fail("plan schema completeness procedure drift")
    defs = schema.get("$defs") or {}
    atom_enum = (((defs.get("evidence_projection") or {}).get("properties") or {}).get("atom_kind") or {}).get("enum")
    if atom_enum != FROZEN_ATOM_KINDS:
        fail("plan schema evidence atom drift")

    ledger = CONTAMINATION_LEDGER.read_text()
    if ledger.count("EXCLUDED_FROM_OFFICIAL_HOLDOUT") < 9:
        fail("prospective holdout contamination ledger incomplete")
    if "This ledger is monotonic" not in ledger:
        fail("holdout contamination monotonicity invariant missing")

    arm_b = ARM_B_PROTOCOL.read_text()
    for phrase in (
        "fair chance to make the horizontal Project X thesis unnecessary",
        "must not define or name Project X obligation families",
        "strong general-purpose model",
        "Output freezing",
    ):
        if phrase not in arm_b:
            fail(f"Arm B strength/neutrality invariant missing: {phrase}")

    print("CATEGORY_GATE_V0_1_VALIDATE=PASS")
    print(f"cases={len(cases)} domains={dict(sorted(counts.items()))} sources={len(set(sources))}")
    print(f"generic_families={len(allowset)} false_decisive_claims_max={rules['false_decisive_claims_max']}")
    print("source_audit=8/8 claim_surface_matrix=8/8")
    print("compiler_crucible=PRELOCKED native_vocabulary=FROZEN holdout_contamination=MONOTONIC")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
