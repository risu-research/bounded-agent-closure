#!/usr/bin/env python3
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CORPUS = ROOT / "CORPUS_V0_1.json"
PRELOCK = ROOT / "PRELOCK.md"
DISPOSITION = ROOT / "RG3_DISPOSITION.md"

ALLOWED_ORACLES = {
    "UNKNOWN_FROM_NOMINAL_ARTIFACT",
    "REFUTED_IF_PREEXISTING_SHORT_LIVED_CREDENTIAL_REMAINS_VALID_ELSE_UNKNOWN_WITHOUT_COVERAGE",
}


def fail(msg: str) -> None:
    raise SystemExit(f"CATEGORY_GATE_V0_1_VALIDATE=FAIL: {msg}")


def main() -> int:
    for p in (CORPUS, PRELOCK, DISPOSITION):
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

    disposition = DISPOSITION.read_text()
    if "RG3 is SUSPENDED, not abandoned" not in disposition:
        fail("RG3 suspension invariant missing")
    if "no Stripe v0.5 live E0" not in disposition:
        fail("live-RG3 stop condition missing")

    print("CATEGORY_GATE_V0_1_VALIDATE=PASS")
    print(f"cases={len(cases)} domains={dict(sorted(counts.items()))} sources={len(set(sources))}")
    print(f"generic_families={len(allowset)} false_decisive_claims_max={rules['false_decisive_claims_max']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
