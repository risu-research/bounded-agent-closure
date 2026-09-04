# Consequence Category Kill Gate v0.1 — PRELOCK Correction 001

Date: 2026-09-04
Timing: **BEFORE ANY ARM EXECUTION OR ARM OUTPUT**
Status: METHODOLOGICAL CORRECTION; THRESHOLDS UNCHANGED

## Problem discovered

PRELOCK §5 required every arm to output `generic_obligation_families_used` while Arm B was simultaneously defined as receiving no Project X terminology.

That is a contamination bug: exposing the frozen Project X ontology to the strong LLM baseline could improve its decomposition in exactly the dimension being tested.

No Arm A, B, or C output existed when this correction was committed.

## Corrected rule

The common blind case payload contains only:

- opaque case id;
- nominal success artifact;
- intended consequence;
- official source URI.

It contains no oracle, domain label, designer reasoning, expected obligation family, Project X term, or scoring rubric.

### Arm A — conventional strong baseline

Outputs neutral evidence-requirement labels in its own vocabulary plus concrete source-specific facts/rules.

### Arm B — strong LLM baseline

Outputs neutral evidence-requirement labels in its own vocabulary plus concrete source-specific facts/rules. The prompt must not define or name Project X obligation families.

### Arm C — Project X

May use the frozen Project X judgment, obligation, acquisition, proof, and evidence vocabulary because that is the mechanism under test.

## Post-freeze mapping

After Arm A and Arm B outputs are cryptographically frozen, a scorer may map their neutral evidence-requirement categories to the already frozen eight generic obligation families for cross-arm structural comparison.

The scorer must retain the original neutral labels and the mapping table. It may not rewrite an arm answer.

## Output fields for neutral baselines

Arm A/B must produce per case:

- `verdict`: `ESTABLISHED | REFUTED | UNKNOWN`
- `max_justified_claim`
- `unsupported_upgrade_detected`
- `source_facts_used`
- `missing_evidence`
- `minimal_evidence_plan`
- `source_specific_rules`
- `neutral_requirement_categories`
- `unresolved_boundaries`

The posthoc scorer derives `bespoke_semantic_rules_used` from `source_specific_rules` under a frozen counting protocol.

## Thresholds

No threshold changes.

All PRELOCK safety, reuse, compiler, baseline-leverage, and kill thresholds remain unchanged.

## Scientific effect

This correction makes the baseline **stronger and less contaminated**. It cannot selectively improve the Project X arm.
