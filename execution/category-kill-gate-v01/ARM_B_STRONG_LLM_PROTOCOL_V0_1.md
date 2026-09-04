# Arm B — Strong LLM Baseline Protocol v0.1

Status: FROZEN BEFORE ARM EXECUTION
Date: 2026-09-04

## Goal

Give a strong general-purpose model a fair chance to make the horizontal Project X thesis unnecessary.

This arm is intentionally **not** a weak prompting baseline. It may reason deeply, browse public official documentation, write structured plans, and use ordinary code-generation instincts. It is denied only Project X/RISU-specific concepts and hidden oracle material.

## Inputs

For each opaque case, provide exactly the common blind case payload:

- `case_id`
- `nominal_success_artifact`
- `intended_consequence`
- `source`

The model may open the supplied official source and other first-party documentation needed to interpret that interface. It must not receive:

- the hidden reveal map;
- the locked oracle;
- domain labels from the corpus;
- designer reasoning;
- Project X, RISU, Native++, RG3, consequence-family, or evidence-obligation terminology;
- Project X source code;
- answers from another arm.

## Neutral task prompt

For each case:

> Determine the strongest claim that the stated nominal success artifact actually justifies about the intended consequence. Do not assume undocumented semantics. If the intended consequence is not established, identify exactly what additional evidence would be needed and produce the smallest concrete observation plan you can for obtaining that evidence from trustworthy sources. Prefer machine-checkable observations, explicit object/identifier binding, complete enumeration when absence or universality matters, and explicit stopping conditions for asynchronous state. If the available interfaces cannot establish the requested consequence, say so precisely instead of guessing.

The prompt must not mention any Project X family names or scoring rules.

## Required JSON output per case

```json
{
  "case_id": "CASE-00",
  "verdict": "ESTABLISHED | REFUTED | UNKNOWN",
  "max_justified_claim": "...",
  "unsupported_upgrade_detected": true,
  "source_facts_used": [
    {
      "fact": "...",
      "source_uri": "https://...",
      "source_locator": "section/field/heading or other concise locator"
    }
  ],
  "missing_evidence": ["..."],
  "minimal_evidence_plan": [
    {
      "step": 1,
      "source_or_system": "...",
      "operation_or_observation": "...",
      "object_binding": "...",
      "field_or_predicate": "...",
      "retry_or_temporal_rule": "...",
      "stopping_condition": "...",
      "claim_unlocked_if_satisfied": "...",
      "unknown_or_failure_boundary": "..."
    }
  ],
  "source_specific_rules": [
    {
      "rule": "...",
      "why_source_specific": "..."
    }
  ],
  "neutral_requirement_categories": ["free labels chosen by the evaluator"],
  "unresolved_boundaries": ["..."]
}
```

## Fail-closed requirements

- Unsupported or invented endpoint/field semantics are errors.
- A success artifact may not be silently upgraded to a broader consequence.
- Absence/universality may not be concluded from an incomplete collection.
- An asynchronous state may not be called final without a defensible stopping condition.
- If delivery/business/economic reality sits outside the supplied system, the model must identify the external source needed rather than pretending the provider can prove it.

## Strength concessions to the baseline

The model is allowed to:

- follow first-party documentation links;
- suggest webhooks, event streams, polling, readback, or independent sources when supported;
- use provider-specific facts from official docs;
- produce more than one observation if that is genuinely necessary;
- conclude that the intended consequence is unobservable from the available interface;
- use ordinary software-engineering concepts such as idempotency, pagination, retries, correlation IDs, and state machines.

It is **not** penalized merely for being provider-specific. Provider-specific semantic burden is measured later as an economic scaling metric.

## Replay requirement

Run at least five independent or semantic-preserving prompt replays for the prospective compiler holdout phase. For the eight-case category screen, one independent frozen answer is sufficient to decide whether a deeper replay study is warranted; no positive horizontal claim may rely on that single run.

## Output freezing

The complete raw answer is hashed and frozen before the reveal map or Project X arm result is exposed to the evaluator/scorer.

Malformed outputs remain part of the record; they are not silently regenerated unless the protocol explicitly counts the first response as malformed and the retry rule was predeclared.
