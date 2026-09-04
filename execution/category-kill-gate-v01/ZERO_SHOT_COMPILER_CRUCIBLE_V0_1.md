# Zero-Shot Consequence Compiler Crucible v0.1 — PRELOCK

Date: 2026-09-04
Status: PREPRIMARY / PROSPECTIVE / NO HOLDOUT-SPECIFIC COMPILER CODE

## 1. Question

Can Project X integrate a previously unseen consequential interface with a fundamentally better scaling law than a provider-specific rule catalog or a strong LLM plus ordinary glue code?

This crucible is stricter than the 8-case category gate. The category gate asks whether real claim gaps exist and whether the generic obligation families are useful. This crucible asks whether there is a **commercially meaningful compiler**.

## 2. End-to-end compiler target

Input:

1. a natural-language intended consequence;
2. a machine-readable interface when available (`OpenAPI`, MCP/tool schema, protocol schema) plus a bounded official documentation packet;
3. explicit source trust constraints and a deadline when relevant.

Output:

```text
Intended consequence
  -> frozen Project X Contract judgments
  -> frozen obligation compiler
  -> frozen acquisition/proof ops
  -> concrete source bindings
  -> typed executable Evidence Plan
  -> strongest claim that plan can establish
     OR exact machine-readable UNCOMPILABLE / UNKNOWN boundary
```

The frozen generic acquisition/proof vocabulary is exactly:

- `ENUMERATE`
- `OBSERVE`
- `WATCH`
- `SNAPSHOT`
- `CERTIFY_COMPLETE`
- `CERTIFY_TEMPORAL_CLOSURE`

No seventh operation may be added during the crucible.

The frozen legacy judgment vocabulary remains unchanged. A holdout that cannot be represented must be reported as a representational failure; it may not be repaired in-place and then counted as a pass.

## 3. What is actually being tested

The existing Project X compiler already maps typed judgments to obligations and obligations to acquisition/proof operations. The unresolved commercial problem is whether the two outer compilation boundaries can be made cheap and reliable:

- **Intent lowering:** intended consequence -> formal Contract judgments.
- **Source binding:** logical acquisition target -> real operation/endpoint/field/pagination/watch/stopping condition.

If either outer boundary needs hand-coded provider semantics at catalog scale, the horizontal thesis loses.

## 4. Baselines

### B0 — Catalog baseline

A competent integration engineer may write provider/resource-specific handlers and tests with full access to the same docs.

Measure new semantic rules, procedural handler LOC, endpoint/field selections, and wall-clock implementation effort where available.

### B1 — Strong LLM direct-plan baseline

A strong model receives consequence + interface/docs and produces a concrete evidence plan directly, without Project X concepts.

It may use code generation. It is not intentionally weakened.

### B2 — LLM + typed-plan schema baseline

Same model, but given only the neutral output schema and validator. This isolates whether the value comes merely from asking an LLM for structured output rather than from Project X semantics.

### C — Project X compiler candidate

May use an LLM for semantic/source interpretation, but the final artifact must validate against the frozen Contract grammar, frozen acquisition/proof vocabulary, source-binding schema, and source-contract checks.

## 5. Prospective holdout rule

No compiler implementation may contain conditionals keyed to a holdout provider, operation name, product name, URL, or known response field.

Holdout source packets are revealed only after:

- this PRELOCK is committed;
- the Evidence Plan / Source Binding schemas are frozen;
- the compiler candidate hash is frozen for that trial.

A compiler may be improved after a failed holdout only in a new version, and the failed trial remains part of the scientific record.

## 6. Hard holdout families

The holdout must include at least four of the following consequence shapes, from systems not used to author a provider handler in the candidate:

1. **accepted != executed** — asynchronous request acceptance does not establish execution success;
2. **queued != externally delivered** — producer success does not establish recipient-side consequence;
3. **control-plane converged != edge/client converged** — authoritative state and distributed observed state diverge during propagation;
4. **parent terminal != residuals terminal** — target action completes while attached/delegated effects survive;
5. **provider success != broad finality** — provider state does not justify irreversible/economic/business finality;
6. **revoked root != derived authority extinguished** — parent credential/action is revoked while issued descendants survive.

The holdout is deliberately chosen for semantic heterogeneity, not ease.

## 7. Required executable plan fields

Every successful compilation must identify, at minimum:

- target claim and bounded claim scope;
- logical Project X judgments;
- obligation family / acquisition operation;
- concrete source or interface operation;
- request bindings and identifiers;
- response selector(s) / relation binding(s);
- predicate or counterexample condition;
- completeness boundary if absence/universality is used;
- retry/watch policy if asynchronous;
- deadline/checkpoint and stopping condition;
- provenance/source-contract requirement;
- exact claim unlocked when the step/proof succeeds;
- exact UNKNOWN/FAIL boundary when evidence remains insufficient.

A prose checklist is not an executable plan.

## 8. Hard metrics

### Safety

- false decisive consequence claims: **0**
- invented endpoint/field/response semantics: **0**
- silently treating incomplete enumeration as complete: **0**
- silently treating provider success as broader finality: **0**

Any violation kills that candidate version.

### Integration compression

Strong horizontal candidate requires on the prospective holdout:

- median provider-specific semantic annotations <= 2;
- median manually written provider-specific procedural LOC = 0;
- >= 75% cases compile to validator-clean executable plans without holdout-specific code changes;
- no new generic judgment, obligation kind, acquisition op, or proof op;
- exact unrepresentable/unobservable cases are surfaced rather than guessed.

### Baseline advantage

Project X must show at least one material advantage over B1 and B2:

- fewer source-semantic mistakes;
- more complete executable evidence plans;
- stronger deterministic stopping/completeness discipline;
- materially lower variance across prompt/model perturbations;
- lower provider-specific integration burden;
- reusable plan execution without bespoke control flow.

If no material advantage appears, **KILL-HORIZONTAL** even if Project X is accurate.

## 9. Robustness / non-determinism test

For model-assisted arms, run at least five semantic-preserving prompt perturbations or equivalent independent replays per holdout.

Measure:

- plan structural agreement;
- endpoint/field agreement;
- claim-boundary agreement;
- unsafe decisive upgrades;
- validator rejection rate.

A core value proposition may be determinization of an LLM's good idea. If ordinary structured prompting is already equally stable, that proposition fails.

## 10. Minimality test

For plans that establish the same claim, delete one acquisition/proof step at a time.

A step is justified only if removing it either:

- makes the claim unprovable under the source contract; or
- weakens the maximum justified claim.

Report redundant-step ratio.

Strong candidate target: <= 10% redundant acquisition/proof steps across successful holdouts.

This is the direct test of `minimal Evidence Plan`, rather than merely a safe but bloated observer.

## 11. Catalog-equivalence kill

Immediate **KILL-HORIZONTAL** if the winning implementation degenerates into any of:

- a growing switch statement keyed by provider/resource;
- a library of manually authored endpoint recipes;
- a resource-handler catalog whose growth is approximately linear in supported object types;
- hidden natural-language instructions that encode the provider-specific plan manually;
- a human choosing the decisive endpoint/field/stopping condition before the compiler runs.

## 12. Commercial interpretation

Pass means only this:

> There is evidence that a Consequence Contract Compiler can reduce the marginal semantic/integration cost of adding a new consequential system while preserving conservative claim boundaries.

It does not authorize a platform build.

The next authorized build after a pass is one tiny end-to-end compiler that ingests one machine-readable interface and emits/runs one typed Evidence Plan on one payment and one non-payment system.

Failure means:

- preserve Cross-Domain Compression / Native++ / RG3 as research assets;
- stop claiming a horizontal consequence compiler;
- evaluate a narrow vertical only if it has independent buyer value.
