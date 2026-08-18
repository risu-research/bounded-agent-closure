# Bounded Agent Closure

**A disabled agent is not necessarily a closed agent.**

Bounded Agent Closure is a deterministic verifier for the operational wind-down of an autonomous agent. It asks a narrow question: after new-business authority has been blocked, have the consequences attributable to that retiring root actually reached a terminal, stable state within an explicitly declared evidence profile?

The verifier does not infer closure from deletion, a shutdown flag, or a successful cancellation response. It evaluates supplied evidence across authority, execution, commitments, and operational state, follows evidence-backed consequence lineage transitively, checks postconditions, and requires convergence across the final two qualifying observations before issuing `CLOSED`.

A successful certificate states exactly:

> `CLOSED within RISU_AGENT_CLOSURE_V0 and the declared source contracts.`

That is a bounded claim, not a claim of universal or global closure.

## Why this exists

Administrative retirement and operational termination are different events. An agent can be disabled while a delegated job still runs, a commitment remains unsettled, or a consequence survives several lineage edges away from the original actor. Conversely, an object may remain globally active after responsibility has been validly transferred away from the retiring root.

This repository makes those distinctions executable.

- Identity termination ≠ consequence termination
- Reported success ≠ verified postcondition
- No observed blocker ≠ closure
- One clean observation ≠ stable convergence
- Closure ≠ deletion

The intended lifecycle is:

```text
ACTIVE → WINDING_DOWN → CLOSED
```

`CLOSED` is available only after evidence supports the transition.

## What the verifier evaluates

`RISU_AGENT_CLOSURE_V0` contains exactly four domains:

- `AUTHORITY`
- `EXECUTION`
- `COMMITMENT`
- `OPERATIONAL_STATE`

Residual consequences use one of five dispositions: `NONE`, `EXTINGUISH`, `SETTLE`, `TRANSFER`, or `RETAIN`. Evidence-backed `DERIVED_FROM` edges form the transitive closure cone rooted at `$root`.

The verifier processes the complete scan sequence. A scan can qualify only when root authority is blocked, required source coverage and attribution are complete, source stability requirements are satisfied, every reachable residual is freshly observed, and every residual is terminal under its disposition. `CLOSED` then requires the final two qualifying scans to have the same semantic signature, subject to any bounded-lag confirmation window.

Known blockers take precedence over uncertainty.

## Outcomes

| Outcome | Meaning |
| --- | --- |
| `CLOSED` | Bounded closure is established under the declared profile and source contracts. |
| `INCOMPLETE` | A known blocker or unstable final state prevents closure. |
| `UNKNOWN` | Available evidence is insufficient to establish closure. |

Malformed or logically impossible evidence produces `VALIDATION_ERROR`. It is a runner state, not a fourth verdict.

## Quick start

Requires Node.js 20 or newer.

```sh
npm ci
npm test
```

Evaluate an evidence bundle from the command line:

```sh
npm run verify -- fixtures/c2-transitive-zombie.json
```

The CLI emits deterministic JSON and performs no network or LLM calls.

## Agent Closure Inspector

The repository also includes a local-first evidence debugger built on the same verifier.

```sh
npm run inspector
```

Open the loopback URL printed by the process.

The Inspector is a consumer of the verifier, not a second implementation of closure semantics. Local bundle evaluation calls the frozen `verifyClosure()` path directly; the presentation layer explains the returned evaluation without independently manufacturing a verdict.

Canonical cases are generated from the frozen fixtures. When the Inspector is run locally on literal `127.0.0.1`, an arbitrary conforming evidence bundle can also be opened and evaluated. Uploaded evidence is held in memory, is not persisted, and is not sent to an external service.

The static Inspector retains canonical-case exploration but deliberately does not enable arbitrary private-bundle evaluation.

## Canonical corpus

The frozen corpus contains eight cases chosen to exercise different closure boundaries.

| Case | Result | What it demonstrates |
| --- | --- | --- |
| C1 Direct Zombie | `INCOMPLETE` | A directly reachable execution remains active. |
| C2 Transitive Zombie | `INCOMPLETE` | A surviving consequence can remain several lineage edges from the retiring root. |
| C3 Pending Commitment | `INCOMPLETE` | An unsettled commitment prevents closure. |
| C4 Retained Evidence | `CLOSED` | Retained state can be terminal when it is inert and no longer root-linked. |
| C5 Successor Transfer | `CLOSED` | An object may remain globally active after accepted transfer ends the old-root linkage. |
| C6 Missing Coverage | `UNKNOWN` | Missing evidence is not evidence of closure. |
| C7 False Success | `INCOMPLETE` | Reported cancellation success does not override an active observed postcondition. |
| C8 Fixed-Point Wind-Down | `CLOSED` | Closure requires stable confirmation after the reachable consequence set stops changing. |

The fixtures live in [`fixtures/`](fixtures/). Generated Inspector evaluations live in [`inspector/public/cases/`](inspector/public/cases/).

## Evidence boundary

The verifier begins at the evidence-bundle boundary. It does not currently discover closure evidence from a live agent runtime by itself.

A real integration therefore has two parts:

```text
live system → adapter → evidence bundle → verifier → Inspector / CLI
```

The adapter is responsible for producing truthful source coverage, attribution, timing, and stability evidence under the declared source contract. The verifier treats those source assertions as an explicit trust boundary rather than re-deriving facts that only the source adapter can establish.

No live-runtime adapter is included in the v0.3 line. This keeps the core profile vendor-neutral and makes the trust boundary explicit.

## Determinism and trust boundaries

The runtime is Node.js ESM with Ajv, JSON Schema, `node:test`, and `node:crypto`. It has no runtime network dependency and no LLM dependency.

The semantic signature excludes evidence transport details and hashes the closure-relevant semantic state. A separate scope/config digest binds the declared profile and source contracts, while the evidence-bundle digest binds the complete validated input. See [`SPEC.md`](SPEC.md) for the normative rules.

The verifier trusts explicit evidence contracts where independent verification would require access to the underlying system. In particular, it trusts adapter assertions about complete source coverage, complete attribution, root quiescence evidence, and stability witnesses. Those assumptions are surfaced rather than silently converted into certainty.

## Repository map

```text
SPEC.md                         normative Phase-1 specification
schemas/closure-evidence.schema.json
                                evidence-bundle schema
src/verify-closure.mjs          deterministic verifier
src/cli.mjs                     command-line entry point
fixtures/                       eight canonical evidence bundles
inspector/                      local-first evidence debugger
inspector/public/               generated static Inspector artifacts
test/                           semantic, validation, corpus, and Inspector tests
```

## Frozen provenance

The project preserves two explicit freeze points:

- `phase1-freeze-v0.3` — frozen Phase-1 verifier and evidence semantics
- `inspector-v0.1-freeze` — first frozen Inspector built on that verifier

The Phase-1 freeze resolves to commit `a46456f028cd3dd1d386111b1faab890a26ae5e9`.

The Inspector was added after the semantic freeze rather than folded back into it. That separation is intentional: the UI may expose a defect in the verifier, but it may not redefine what closure means.

## Release scope

The v0.3 line is verifier-first. It observes supplied evidence; it does not cancel jobs, settle commitments, transfer responsibility, or shut agents down.

The next integration step is intentionally small: one real adapter from one live agent/runtime environment into the frozen evidence contract. The verifier and Inspector are already usable anywhere that contract can be produced.

Retirement should be a verified transition, not merely an administrative event. This repository tests that proposition narrowly, as bounded operational closure under an explicit evidence profile.

## License

Licensed under the [Apache License 2.0](LICENSE).

## Citation

Machine-readable citation metadata is available in [`CITATION.cff`](CITATION.cff).
