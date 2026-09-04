# Native++ v0.2 — Provenance and Archival Boundary

This record identifies the exact experiment inputs and primary artifact without republishing unnecessary runner state or large upstream binaries.

## Uploaded archival inputs

| Item | SHA-256 |
| --- | --- |
| Source repository archive | `a65d2e79590f99cff0efa83de283075f54c69135d00487caa5d1c305ee0aaa8b` |
| Primary run artifact ZIP | `b3c2242bdfc11d9bdf653f1de2491297174e41da1d4f63b05d230e0a5e852f96` |
| Post-hoc audit Markdown | `5f25db28abce3693e76bf660594318669b06012744982870ca9964ea59ab319e` |

## Execution identity

- primary run: `33809187591`
- execution commit: `455184caf716751148b7c9c2a372b66084dcaa30`
- scientific runner exit: `0`
- sealed native binding:
  `sha256:4923181ebacedabf186333b8e16d3f1152f1bc66ab9e16ed8330c8e7402a5c34`

## Primary target identity

- repository: `cli/cli`
- release: `v2.100.0`
- expected release commit:
  `45437bc7eeeb3359bbfddd1742f79de7652fd3e2`
- selected asset:
  `gh_2.100.0_linux_amd64.tar.gz`
- selected asset SHA-256:
  `e4d4bb4498e8d007abe545b6568926793ace1b6447da598294a610018cb164be`

## External verifier identity

Pinned GitHub CLI `v2.96.0`:

- archive SHA-256:
  `83d5c2ccad5498f58bf6368acb1ab32588cf43ab3a4b1c301bf36328b1c8bd60`
- extracted executable SHA-256:
  `56b8bbbb27b066ecb33dbef9a256dc9d1314adaeff0908a752feba6c34053b40`

## Why the raw ZIPs are not duplicated in this public record

The source archive includes repository metadata, caches, historical execution wrappers, and internal experiment-operational material that is not needed to state or audit the scientific result.

The primary artifact includes a large copy of the upstream GitHub CLI asset, runner-local paths, and the full raw attestation payload. Those bytes are valuable as archival evidence but are not necessary for a concise institutional checkpoint.

Accordingly, the raw archives remain identified by exact SHA-256 and execution identity, while this public record exposes only the result, interpretation boundary, and reproducibility-relevant digests.

This separation is intentional: **raw evidence is preserved by identity; public interpretation is curated without modifying the underlying evidence.**

## Historical integrity

Two earlier attempts are retained as part of the scientific history:

1. run `33805476200` stopped before primary observation because archive and executable verifier identities had been conflated;
2. run `33806977992` reached the then-primary target and exposed a stale release-predicate schema assumption after cryptographic verification.

The consumed target from the second failure was not reused as the successful v0.2 primary. A fresh `v2.100.0` target was used instead.

These failures are not reclassified as successes. They explain the fail-closed schema and verifier-identity hardening present in v0.2.
