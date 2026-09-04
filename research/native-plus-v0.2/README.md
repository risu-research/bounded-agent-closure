# Native++ v0.2 — Native Evidence Admission Experiment

**Status:** Frozen experiment record  
**Primary run:** `33809187591`  
**Execution commit:** `455184caf716751148b7c9c2a372b66084dcaa30`  
**Primary result:** **PASS, narrow claim only**

## Research question

Can an existing consequence-evidence substrate become *smaller* when a platform already exposes a strong, cryptographically verified native proof object?

Native++ v0.2 tested a deliberately narrow case: whether a verified GitHub release attestation could discharge exact release and asset-binding claims without adding new generic consequence/evidence machinery or independently reconstructing the same facts from several weaker evidence planes.

The experiment did **not** attempt to replace GitHub's verifier. A pinned GitHub CLI performed the native cryptographic verification. The experiment tested whether the verified statement could be admitted under an explicit trust and binding policy, normalized into the existing typed evidence substrate, and evaluated by the unchanged generic kernel.

## Frozen primary

The fresh primary target was:

- repository: `cli/cli`
- release: `v2.100.0`
- expected release commit: `45437bc7eeeb3359bbfddd1742f79de7652fd3e2`
- selected asset: `gh_2.100.0_linux_amd64.tar.gz`
- expected asset SHA-256: `e4d4bb4498e8d007abe545b6568926793ace1b6447da598294a610018cb164be`

The external verifier was GitHub CLI `v2.96.0`, pinned by both archive and executable SHA-256.

## Result

The verified in-toto release statement contained the exact release subject and selected asset subject expected by the precommitted micro-contract.

| Claim | Result |
| --- | --- |
| Expected release subject exists | PASS |
| Release subject is bound to the intended commit | PASS |
| Expected selected-asset subject exists | PASS |
| Selected asset is bound to the intended SHA-256 | PASS |

The experiment required:

- **0** generic-core changes;
- **0** new contract-judgment kinds;
- **0** new provider I/O verbs;
- **0** new proof-algebra operations;
- **0** new evidence-atom kinds.

The path-aware native binding digest was:

`sha256:4923181ebacedabf186333b8e16d3f1152f1bc66ab9e16ed8330c8e7402a5c34`

## Negative controls

Two controls were required and both passed.

1. **One-byte mutation.** The authentic downloaded asset was modified at exactly one byte while preserving byte length. Native asset verification rejected it.
2. **Wrong release.** Authentic `v2.100.0` bytes were checked against release `v2.96.0`. Verification rejected them.

## Interpretation

The supported claim is intentionally narrow:

> When a platform already supplies a cryptographically verified native proof object that binds the exact facts needed by a consequence claim, the substrate can consume that proof under an explicit trust/binding policy instead of redundantly reconstructing the same facts through bespoke acquisition logic.

This is evidence for **reuse of a frozen consequence-evidence substrate**, not evidence that attestations solve consequence verification generally.

The architectural lesson is equally important in the negative direction: a consequence system should not rebuild mature verification that a platform already supplies. It should admit such native proofs only for the facts they actually establish, and remain conservative everywhere else.

## Boundaries

This experiment does **not** establish:

- semantic-labor amortization across arbitrary providers;
- trivial provider-specific binding work;
- superiority over GitHub's native verifier;
- availability or temporal-delivery guarantees;
- namespace-wide uniqueness;
- payment or economic finality;
- correctness of arbitrary consequences;
- that all consequences can be reduced to attestations;
- elimination of the binding trusted-computing base;
- commercial superiority over a strong bespoke implementation.

## Why this record exists

Native++ is retained as an architectural checkpoint in the broader RISU research program. Its value is not a standalone universality claim. It records one materially different case in which stronger native evidence reduced the amount of bespoke reconstruction required **without changing the frozen generic substrate**.

The original source and primary artifacts are identified by cryptographic digests in [`PROVENANCE.md`](./PROVENANCE.md). The raw execution bundle is not duplicated here.
