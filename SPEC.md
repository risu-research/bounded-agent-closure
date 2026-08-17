# Frozen Bounded Agent-Closure Engine v0.3

This document is the normative Phase-1 specification for a deterministic evidence verifier answering: within the fixed closure profile and explicit source contracts, is an autonomous agent operationally closed? A disabled agent is not necessarily closed. This verifier observes evidence; it does not execute actions.

## Scope and profile

The only supported profile is `RISU_AGENT_CLOSURE_V0`, with exactly `AUTHORITY`, `EXECUTION`, `COMMITMENT`, and `OPERATIONAL_STATE`. Every domain is either `COVERED` by at least one declared source or `NOT_APPLICABLE` with a non-empty evidence reference and no sources. A residual in a not-applicable domain is invalid. Every declared source is used by a covered binding, exists when referenced, and declares each domain for which it is bound.

Phase 1 contains this specification, a JSON Schema, the deterministic verifier and semantic-signature function, a CLI, exactly eight canonical fixtures, and focused tests. It has no actuators, integrations, orchestration, rollback/compensation, planning, distributed protocols, clock synchronization, UI, telemetry, benchmarks, paper, or standard proposal.

## Evidence bundle and time basis

A complete bundle has `spec_version` `0.3`, fixed `profile_id` `RISU_AGENT_CLOSURE_V0`, `time_basis` `BUNDLE_MONOTONIC_MS`, one root, four domain bindings, source definitions, and one or more ordered scans. `$root` is reserved for lineage and cannot be a residual ID.

All `*_at_ms` fields in a bundle use one bundle-local monotonic closure-run timeline. They are not remote service wall clocks. Adapters normalize timing evidence before producing the bundle; the verifier performs no clock synchronization. Every numeric time, lag, barrier, and observed-through value is a non-negative JavaScript safe integer (`<= 9007199254740991`) so validated numeric identity and canonical digests are exact under the Node.js runtime.

The root has a non-empty `id`, `new_business_authority` (`BLOCKED`, `ACTIVE`, or `UNKNOWN`), non-negative integer `quiesced_at_ms`, and non-empty `quiescence_evidence_ref`. `BLOCKED` is a run-level assertion that new-business authority remained continuously blocked from `quiesced_at_ms` through the final supplied scan, with its evidence bound by `quiescence_evidence_ref`. The verifier trusts this bundle-level contract. `ACTIVE` is a known blocker; `UNKNOWN` is uncertainty.

## Source stability contracts

Each source has a unique non-empty ID, one or more unique profile domains, and one stability contract:

- `MONOTONIC_BARRIER` is exactly `{ "type": "MONOTONIC_BARRIER" }`. It contains no run-specific barrier, time, or evidence.
- `BOUNDED_LAG` has non-negative `max_visibility_lag_ms`.
- `UNBOUNDED` never stability-qualifies for closure.

Each scan has a unique ID, a non-negative time, and exactly one observation for every declared source. Times are non-decreasing and scans are processed in input order. A scan before root quiescence cannot qualify and yields `SCAN_PRECEDES_QUIESCENCE`.

Each source observation reports `coverage` and `attribution_coverage` as `COMPLETE`, `PARTIAL`, or `UNAVAILABLE`; one or more evidence references; fresh residual observations; lineage edges; and the contract-appropriate stability witness. `COMPLETE` coverage means complete enumeration under the source's declared stability contract and the observation's stability horizon. `COMPLETE` attribution means complete closure-lineage attribution under that same horizon. The verifier trusts, but does not independently prove, adapter truthfulness.

For `BOUNDED_LAG` and `UNBOUNDED`, `stability_witness` is `null`. A bounded-lag scan stability-qualifies only at or after `root.quiesced_at_ms + max_visibility_lag_ms`.

For `MONOTONIC_BARRIER`, every `COMPLETE` + `COMPLETE` observation has the following witness. If coverage or attribution is not complete, the witness may be `null` (or a structurally valid witness); source/attribution uncertainty already prevents qualification:

```json
{
  "barrier": 0,
  "barrier_captured_at_ms": 0,
  "observed_through": 0,
  "evidence_ref": "non-empty"
}
```

This witness asserts the adapter obtained fresh closure-relevant state and lineage, captured the current monotonic closure-relevant barrier, advanced or reconciled observation through that barrier, and emitted the scan observation. The verifier does not execute that sequence; this is an explicit trust boundary.

A barrier observation stability-qualifies only when the scan is at or after quiescence, barrier capture is at or after quiescence and no later than the scan, and `observed_through >= barrier`, in addition to complete coverage and attribution. A capture before quiescence yields `BARRIER_PRECEDES_QUIESCENCE`. A capture after its scan is invalid with `BARRIER_AFTER_SCAN`. Insufficient observed progress yields `STABILITY_NOT_SATISFIED` for `MONOTONIC_BARRIER`.

For each barrier source across scans, `barrier` and `observed_through` must each be non-decreasing. Equal values are valid. Regression is invalid with `BARRIER_REGRESSED` or `OBSERVED_THROUGH_REGRESSED`.

## Residuals, lineage, and closure cone

Every residual observation has a non-empty ID, profile-domain class, disposition (`NONE`, `EXTINGUISH`, `SETTLE`, `TRANSFER`, or `RETAIN`), presence (`PRESENT`, `ABSENT`, or `UNKNOWN`), effect (`ACTIVE`, `INERT`, or `UNKNOWN`), root linkage (`LIVE`, `ENDED`, or `UNKNOWN`), settlement (`PENDING`, `SETTLED`, `NOT_APPLICABLE`, or `UNKNOWN`), nullable non-empty successor ID, transfer acceptance (`ACCEPTED`, `REJECTED`, `NOT_APPLICABLE`, or `UNKNOWN`), and evidence references. An optional action report records operation, reported outcome, and evidence; it is metadata and never contributes to terminality.

Residual identities persist across the sequence. A repeated ID keeps its original class and owning source, while its disposition and observed state may change.

The sole edge is evidence-backed `DERIVED_FROM`, directed from parent/origin to consequence. Its endpoints must be `$root` or residuals seen in the current or a prior scan as permitted by their roles. Self-edges, dangling endpoints, and cycles are invalid. Lineage accumulates even when an edge is not repeated. Internal edge identity is the exact `(from, to, type)` tuple and must not depend on delimiter-concatenated string keys that can collide with legal identifier contents.

After each scan merge, the closure cone is every residual transitively reachable from `$root`. Unreachable observations do not affect this root. Incomplete attribution on any required source is uncertainty. Every cone node needs a fresh observation in each terminal-qualified scan; otherwise `NODE_NOT_REOBSERVED` applies and stale state is not carried forward.

## Derived terminality

Terminality is the pure tri-state `TERMINAL`, `NONTERMINAL`, or `UNKNOWN` and never reads action reports.

- `NONE` is nonterminal.
- `EXTINGUISH` is terminal when presence is `ABSENT` and root linkage is `ENDED`, or when presence is `PRESENT`, effect is `INERT`, and root linkage is `ENDED`. `ACTIVE` effect or `LIVE` linkage is a definitive contradiction; otherwise unresolved required facts are unknown.
- `SETTLE` is terminal when settlement is `SETTLED`, effect is `INERT`, and root linkage is `ENDED`. `PENDING` settlement, `ACTIVE` effect, `LIVE` linkage, or another definitive failure is nonterminal. Presence alone does not prevent settlement; unresolved required facts are unknown.
- `TRANSFER` is terminal when root linkage is `ENDED`, successor ID is non-empty and distinct from the retiring root (and from the reserved `$root` sentinel), and acceptance is `ACCEPTED`. The object may remain globally active. Transfer to the retiring root, `LIVE` linkage, null successor, `REJECTED` acceptance, or another definitive failure is nonterminal; unresolved linkage or acceptance is unknown. A transfer to the retiring root is reported with `TRANSFER_TO_RETIRING_ROOT`.
- `RETAIN` is terminal when it is `PRESENT`, `INERT`, and has `ENDED` root linkage. `ABSENT`, `ACTIVE`, or `LIVE` is nonterminal; unresolved required facts are unknown.

Known blockers include active root authority and every reachable nonterminal residual. They take precedence over uncertainty.

## Qualification, convergence, and bounded-lag confirmation

A scan is terminal-qualified only when it was observed at or after root quiescence; root authority is blocked; all bindings are valid; every covered source has complete coverage and attribution plus satisfied per-scan stability; every cone node is freshly observed; every cone residual is terminal; and there are no blockers or unknowns.

The entire sequence is processed. `CLOSED` requires the final and immediately preceding scans to be terminal-qualified with identical semantic signatures. Different signatures yield `INCOMPLETE` and `CONE_NOT_STABLE`. A final qualified scan without immediately preceding qualification yields `UNKNOWN` and `SECOND_CONFIRMATION_MISSING`. Earlier closed-looking pairs do not control the final result.

When the final two scans otherwise qualify with equal signatures, every required `BOUNDED_LAG` source additionally requires `final_scan.observed_at_ms - previous_scan.observed_at_ms >= max_visibility_lag_ms`. A deficient window yields `UNKNOWN` and `BOUNDED_LAG_CONFIRMATION_WINDOW_NOT_ELAPSED`, with source ID and required lag. Zero lag needs no delay. Signature mismatch still yields `CONE_NOT_STABLE`, and known blockers still take precedence.

Final precedence is: latest known blocker; latest uncertainty; final-two signature mismatch; bounded-lag confirmation uncertainty; matching qualified final scans; otherwise missing confirmation.

## Digests and deterministic output

For each terminal-qualified scan, the verifier hashes a canonical semantic closure-cone representation with SHA-256. It includes profile, root ID and authority, normalized bindings, source IDs and domains, current semantic fields and owner of every cone residual, and accumulated edges among `$root` and cone nodes. It excludes scan IDs, time basis, timestamps, evidence references, action reports, raw evidence, barrier witness fields, and bounded-lag elapsed time. Barrier advancement or evidence changes do not alter the semantic signature.

The scope/config digest covers spec and profile configuration, time basis, root ID, normalized bindings, and source IDs/domains/stability-contract definitions. A barrier source contract contributes only its type; per-scan witnesses are excluded.

The evidence-bundle digest hashes the canonicalized complete validated input, preserving scan and array sequence. Barrier values, capture times, observed progress, witness evidence, and other evidence references affect this digest. It is an audit binding only and does not itself affect qualification, convergence, semantic signatures, or verdict.

Valid deterministic output reports `verdict`, `latest_scan_id`, sorted blockers and unknowns, per-scan pass summaries, and a nullable certificate. Only `CLOSED` includes a certificate, containing final two scan IDs, cone size, four domain statuses, scope, cone, and evidence-bundle digests, zero unknowns, and exactly: `CLOSED within RISU_AGENT_CLOSURE_V0 and the declared source contracts.` This is not a universal closure claim.

Malformed or logically impossible evidence produces `{ "runner_state": "VALIDATION_ERROR", "errors": [...] }` without a verdict. Unsafe observed world states remain valid evidence evaluated through terminality.

## CLI and runtime

`node src/cli.mjs <bundle.json>` prints only deterministic JSON. File errors, malformed JSON, and validation errors have non-zero status. `CLOSED`, `INCOMPLETE`, and `UNKNOWN` have status zero. Runtime uses Node.js ESM, Ajv, JSON Schema, built-in `node:test`, and built-in `node:crypto`. It performs no network or LLM calls.
