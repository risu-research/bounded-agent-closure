# Native++ v0.2: Admitting Platform-Native Attestations into a Frozen Consequence-Evidence Substrate

## Abstract

Machine-action assurance systems often reconstruct facts that a platform may already expose through stronger native evidence. Native++ v0.2 tested whether a frozen consequence-evidence substrate could admit a mature platform-native proof primitive without adding new generic semantics. The experiment used GitHub release attestations as a narrow test case. A pinned GitHub CLI performed cryptographic verification; a sealed binding normalized only explicitly audited in-toto release predicate versions and translated the verified statement into the existing typed evidence model. A fresh primary on `cli/cli v2.100.0` satisfied four precommitted release/asset binding claims, while one-byte mutation and wrong-release controls were rejected. No generic judgment kind, provider I/O verb, proof operation, or evidence-atom kind was added. The result supports a limited architectural claim: when native evidence already binds the exact facts required by a consequence claim, a consequence system can reuse that proof and remove redundant acquisition paths rather than rebuild verification. It does not establish cross-provider amortization, arbitrary consequence correctness, or broader finality.

## 1. Question

A consequence-assurance system can accumulate redundant machinery. It may query references, release metadata, digests, downloaded bytes, and provider-specific state even when the platform already emits a signed statement that binds the exact facts of interest.

Native++ asks a narrower question than general consequence verification:

> If a platform exposes a mature native proof primitive, can an existing generic consequence-evidence substrate consume that proof under a declared trust policy and preserve its claim boundaries without adding new generic machinery?

A positive result would not show that native attestations establish every consequence. It would show that the substrate can *shrink around stronger evidence* when that evidence is appropriate.

## 2. Experimental boundary

The primary tested two exact bindings for a GitHub release:

1. the expected release subject is bound to the intended commit; and
2. the selected release asset is bound to the intended SHA-256.

The fresh primary target was `cli/cli v2.100.0`. Ordinary immutable release metadata was used to precommit the expected target, while the signed release attestation was reserved for the primary observation.

The experiment deliberately delegated cryptographic verification to a pinned GitHub CLI. Native++ did not implement an alternative Sigstore verifier. The tested system boundary was instead:

**native cryptographic verifier → audited schema normalization → typed evidence → declared trust policy → unchanged generic claim evaluation**

## 3. Fail-closed schema admission

An earlier attempt had exposed a practical weakness: successful native cryptographic verification was not enough if the local binding expected a stale release-predicate schema. Native++ v0.2 therefore made schema admission explicit.

Only the audited in-toto release predicate versions `v0.1` and `v0.2` were accepted. An unrecognized future predicate was classified as unsupported rather than guessed into compatibility.

The binding also required the statement returned by the verifier to agree exactly with the decoded DSSE payload before consequence-relevant facts were admitted.

This distinction is central to the experiment. Cryptographic validity and semantic/schema admission are separate trust decisions.

## 4. Frozen generic substrate

The primary was not permitted to introduce a new generic abstraction merely to fit GitHub's native attestation.

The following counts were precommitted to remain zero:

- generic-core changes;
- new contract-judgment kinds;
- new provider I/O verbs;
- new proof-algebra operations;
- new evidence-atom kinds.

The provider-specific trusted surface was limited to the audited native binding that invoked the pinned verifier, normalized the allowed release schema, and emitted existing evidence types.

## 5. Primary result

Primary run `33809187591`, at execution commit `455184caf716751148b7c9c2a372b66084dcaa30`, completed successfully.

The verified statement was an in-toto `Statement/v1` using the release predicate `https://in-toto.io/attestation/release/v0.2`. It contained 23 subjects, including exactly one release URI subject and exactly one selected target-asset subject.

The exact primary claims reconstructed from the frozen evidence were:

| Claim | Result |
| --- | --- |
| Expected release subject exists | PASS |
| Release subject resolves to commit `45437bc7…f3e2` | PASS |
| Expected selected asset subject exists | PASS |
| Selected asset is bound to SHA-256 `e4d4bb44…64be` | PASS |

The decoded DSSE payload and the verifier-returned statement were independently checked for exact JSON equality.

## 6. Negative controls

A useful admission path must reject nearby invalid evidence.

### 6.1 One-byte mutation

The authentic selected asset was copied and changed at exactly one byte while preserving total byte length. The mutated object had SHA-256:

`a99e439468a59d4d2dcbea681960e5df2b112d23d71c2c816e18663f6b658086`

Native asset verification rejected the mutated bytes because that digest was not a subject of the signed release attestation.

### 6.2 Wrong release

The authentic `v2.100.0` asset was checked against release `v2.96.0`. The verifier rejected the asset because its digest was not a subject of the wrong release's attestation.

Both controls passed.

## 7. Supported architectural claim

The experiment supports the following narrow claim:

> A frozen consequence-evidence substrate can admit a mature, platform-native signed proof for exact facts covered by that proof and use it to discharge existing claims without independently rebuilding those same facts from multiple weaker evidence planes.

The significance is not that the consequence layer "beats" native verification. The significance is that it can distinguish when native verification is already the stronger evidence source and use it without expanding generic semantics.

This suggests a useful design rule for future consequence infrastructure:

> Strong native evidence should collapse redundant reconstruction only within its signed semantic scope. Evidence outside that scope remains independently obligated.

## 8. What remains open

Native++ v0.2 does not answer the harder scaling question: whether the same generic substrate materially reduces semantic integration work across previously unseen providers or domains.

It also does not establish:

- broad finality;
- future stability;
- external delivery;
- provider-independent completeness;
- universal consequence semantics;
- commercial advantage.

Those questions require separate prospective tests.

## 9. Role in the RISU research program

Native++ is best read as a checkpoint between theory and infrastructure.

Earlier consequence-closure work developed a generic language for evidence, completeness, trust, and bounded claim evaluation. Native++ tested one direction of reuse: whether stronger native evidence could be admitted into that language without forcing a new generic abstraction.

The result was positive for the narrow release/asset facts tested. Its long-term value therefore depends on whether later work can demonstrate a better scaling law on genuinely new interfaces. If that broader compression fails, Native++ remains a valid but limited record of native-proof reuse.
