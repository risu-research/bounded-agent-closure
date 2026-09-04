# Consequence Category Kill Gate v0.1 — PRELOCK

Status: PREPRIMARY / OUTCOME-BLIND
Date: 2026-09-04

## 1. Purpose

This gate exists to **kill or retain** the proposition that Project X / RISU should become a reusable consequence-verification infrastructure layer.

It is not a benchmark designed to make the existing system look good. A capable LLM, protocol-native verifier, or simple deterministic rule set is allowed to beat it. If a simpler approach suffices, the horizontal thesis loses.

## 2. Central hypothesis

Across materially different consequential systems, nominal success artifacts frequently prove a narrower claim than the principal's intended consequence. A reusable consequence-contract layer can:

1. identify the strongest justified claim;
2. refuse unsupported upgrades;
3. compile the minimal additional evidence needed to decide the intended consequence;
4. reuse the same small family of evidence obligations across domains;
5. do so with materially less bespoke semantic work than provider/domain-specific implementations.

## 3. Anti-thesis

Any one of the following is sufficient to kill the strong horizontal claim:

- protocol/API success already establishes the intended consequence in nearly all serious cases;
- a strong LLM with the same public sources reaches the same safe verdicts and evidence plans without a reusable formal substrate;
- a small set of ordinary domain-specific rules is simpler and equally sound;
- cross-domain reuse collapses after blind semantic clustering;
- the system needs so many bespoke annotations that the generic layer is decorative;
- the layer produces false decisive claims even once in the locked corpus.

## 4. Corpus

The frozen corpus is `CORPUS_V0_1.json`. It contains eight independently sourced cases across four families:

- agentic payments / commerce;
- cloud / infrastructure operations;
- workflow execution;
- identity / credential revocation.

The corpus intentionally includes success responses that are **not equivalent** to the desired consequence.

No corpus case may be removed after evaluation begins because it is inconvenient.

## 5. Required output for each case

Each arm must output exactly:

- `verdict`: `ESTABLISHED | REFUTED | UNKNOWN`
- `max_justified_claim`
- `unsupported_upgrade_detected`: boolean
- `missing_evidence`: ordered list
- `minimal_evidence_plan`: ordered observations with source and stopping condition
- `bespoke_semantic_rules_used`: integer
- `generic_obligation_families_used`: list

Allowed generic obligation families are frozen to:

1. `BINDING` — observed effect is attributable to the intended target/action.
2. `EFFECT_EXISTENCE` — the intended effect occurred at all.
3. `POSTCONDITION` — the effect has the intended state/value, not merely an accepted request.
4. `COMPLETENESS` — relevant residual effects / members have been exhaustively covered.
5. `STABILITY` — the postcondition persists across the required checkpoint/window.
6. `TEMPORAL_BOUND` — evidence was obtained within the consequence deadline.
7. `FINALITY_BOUNDARY` — distinguish provider/protocol finality from economic/commercial/system finality.
8. `RECURRENCE_OR_RESIDUAL` — no surviving delegated/session/job/resource path can recreate or preserve the prohibited consequence.

No ninth generic family may be added during the gate.

## 6. Arms

### Arm A — Protocol-native / conventional strong baseline

Use only the protocol/API's documented success semantics plus ordinary deterministic validation a competent engineer would naturally write.

### Arm B — Strong LLM baseline

Give a capable LLM the same intent, success artifact, and cited public source excerpts. Ask for the strongest justified claim and minimal additional evidence. No Project X terminology is provided.

### Arm C — Project X consequence-contract arm

Use the existing consequence/evidence concepts, but **no new generic primitive** may be introduced for this corpus.

The Project X arm may lose.

## 7. Primary safety metric

`false_decisive_claims`

A false decisive claim is any `ESTABLISHED` or `REFUTED` verdict when the locked oracle says the available evidence is insufficient or contradicts the verdict.

**Strong horizontal candidate requires `false_decisive_claims == 0`.**

One false decisive claim kills the strong horizontal claim for v0.1.

## 8. Claim-gap metric

A case has a `material_claim_gap` when the nominal success artifact does not establish the intended consequence and additional evidence is required.

The corpus is not considered useful unless at least 6/8 cases contain a material claim gap under the locked oracle.

If fewer than 6 do, the corpus was badly chosen and this gate is invalid rather than a Project X pass.

## 9. Cross-domain reuse metric

After outputs freeze, blind reviewers cluster the generic obligation families actually used per case without seeing provider/domain labels.

Strong horizontal candidate requires:

- at least 3 materially different domains represented among decisive corpus cases;
- at least 75% of cases explainable using the frozen eight obligation families with **zero new generic family**;
- median bespoke semantic rules per case <= 2;
- no domain requiring > 4 bespoke semantic rules for a correct evidence plan.

If these fail, the horizontal thesis is weak even if case-level verdict accuracy is high.

## 10. Baseline leverage metric

The horizontal thesis is killed if either strong baseline achieves all of the following:

- zero false decisive claims;
- evidence-plan completeness within one observation of Project X on >= 7/8 cases;
- median bespoke semantic rules <= Project X + 1;
- no materially weaker stopping-condition discipline.

Rationale: if ordinary reasoning already does the job at comparable complexity, there is no demonstrated infrastructure leverage.

## 11. Compiler criterion

A Project X strong candidate must not merely classify cases. It must produce an **executable evidence plan** for at least 6/8 cases, where each observation specifies:

- source/system;
- object or relation to observe;
- predicate to test;
- retry/observation boundary if asynchronous;
- stopping condition;
- what claim becomes justified if satisfied.

If outputs are just prose explanations, the product thesis fails even if the research analysis is correct.

## 12. Adversarial semantic twins

For every case, construct a twin pair with the same nominal success artifact but different underlying consequential reality whenever the source semantics permit it.

The evaluator must not see twin labels.

Strong candidate requirement:

- zero pair collapses where the arm assigns the same decisive consequence verdict to both twins solely because the success artifact is identical.

## 13. Commercial wedge interpretation

The payment wedge is retained only if payment cases show at least one of the following beyond the non-payment cases:

- higher consequence ambiguity after nominal protocol success;
- more asynchronous/finality boundaries;
- stronger recurrence/duplicate/recourse obligations;
- a clearer integration point where an evidence plan can be executed automatically;
- a plausible buyer who already owns the authorization/payment layer but still lacks consequence assurance.

If payments are not unusually strong, do not force the payments wedge merely because RG3 already exists.

## 14. Kill rules

### KILL-HORIZONTAL
Trigger if any:

- Project X false decisive claims > 0;
- cross-domain reuse threshold fails;
- baseline leverage metric kills differentiation;
- executable evidence-plan criterion fails;
- median bespoke semantic burden exceeds threshold.

### KILL-PAYMENTS-WEDGE
Trigger if:

- payment cases show no stronger consequence gap / integration leverage than other domains; or
- current payment protocols already expose enough evidence to make Project X a thin wrapper.

### RETAIN-HORIZONTAL / RETAIN-PAYMENTS-WEDGE
Both are provisional. Passing v0.1 authorizes one real executable integration, not platform construction.

## 15. What happens after the gate

- `KILL-HORIZONTAL + KILL-PAYMENTS-WEDGE`: stop substrate expansion; preserve research; choose a new problem.
- `KILL-HORIZONTAL + RETAIN-PAYMENTS-WEDGE`: pivot to a narrow agentic payment outcome-assurance product with no generic-platform claim.
- `RETAIN-HORIZONTAL + KILL-PAYMENTS-WEDGE`: choose a stronger first domain; do not return to RG3.
- `RETAIN-HORIZONTAL + RETAIN-PAYMENTS-WEDGE`: repair RG3 transport as one adapter leg, then build the smallest Consequence Contract -> Evidence Plan compiler that spans one payment and one non-payment integration.

## 16. Prohibited behavior

- no changing thresholds after seeing outputs;
- no adding new generic families;
- no counting documentation prose as executable evidence planning;
- no treating protocol authorization as consequence proof;
- no treating provider state as broader finality unless the source contract supports that upgrade;
- no platform build before this gate resolves.
