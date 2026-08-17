import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { canonicalStringify, sha256Digest } from "../src/canonicalize.mjs";
import { verifyClosure } from "../src/verify-closure.mjs";

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

test("canonicalization recursively sorts object keys", () => {
  const first = { z: 1, a: { y: 2, b: 3 }, list: [{ q: 4, a: 5 }] };
  const second = { list: [{ a: 5, q: 4 }], a: { b: 3, y: 2 }, z: 1 };
  assert.equal(canonicalStringify(first), canonicalStringify(second));
  assert.equal(sha256Digest(first), sha256Digest(second));
  assert.match(sha256Digest(first), /^sha256:[0-9a-f]{64}$/);
});

test("repeated verification is byte-for-byte deterministic", () => {
  const bundle = fixture("c8-fixed-point-winddown.json");
  assert.equal(canonicalStringify(verifyClosure(bundle)), canonicalStringify(verifyClosure(bundle)));
});

test("CLOSED certificates bind scope and final closure-cone digest", () => {
  const result = verifyClosure(fixture("c8-fixed-point-winddown.json"));
  assert.equal(result.verdict, "CLOSED");
  assert.match(result.certificate.scope_digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.certificate.evidence_bundle_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.certificate.closure_cone_digest, result.passes.at(-1).semantic_signature);
  assert.deepEqual(result.certificate.terminal_scan_ids, ["c8-pass-3", "c8-pass-4"]);
  assert.equal(result.certificate.unknown_count, 0);
});

test("C8 exposes expansion and only qualifies passes three and four", () => {
  const result = verifyClosure(fixture("c8-fixed-point-winddown.json"));
  assert.deepEqual(
    result.passes.map(({ closure_cone_nodes, terminal_qualified }) => ({
      closure_cone_nodes,
      terminal_qualified,
    })),
    [
      { closure_cone_nodes: 3, terminal_qualified: false },
      { closure_cone_nodes: 4, terminal_qualified: false },
      { closure_cone_nodes: 4, terminal_qualified: true },
      { closure_cone_nodes: 4, terminal_qualified: true },
    ],
  );
  assert.equal(result.passes[2].semantic_signature, result.passes[3].semantic_signature);
});

test("V. exactly eight canonical JSON fixture files exist", () => {
  const names = readdirSync(new URL("../fixtures/", import.meta.url))
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert.deepEqual(names, [
    "c1-direct-zombie.json",
    "c2-transitive-zombie.json",
    "c3-pending-commitment.json",
    "c4-retained-evidence.json",
    "c5-successor-transfer.json",
    "c6-missing-coverage.json",
    "c7-false-success.json",
    "c8-fixed-point-winddown.json",
  ]);
});

test("identical bundles produce identical evidence-bundle digests", () => {
  const bundle = fixture("c4-retained-evidence.json");
  const first = verifyClosure(bundle);
  const second = verifyClosure(structuredClone(bundle));
  assert.equal(first.verdict, "CLOSED");
  assert.equal(first.certificate.evidence_bundle_digest, second.certificate.evidence_bundle_digest);
});

test("H. changing barrier witness evidence changes the evidence-bundle digest", () => {
  const originalBundle = fixture("c8-fixed-point-winddown.json");
  const changedBundle = structuredClone(originalBundle);
  changedBundle.scans[3].sources[0].stability_witness.evidence_ref =
    "changed-barrier-evidence-only";
  const original = verifyClosure(originalBundle);
  const changed = verifyClosure(changedBundle);
  assert.notEqual(
    original.certificate.evidence_bundle_digest,
    changed.certificate.evidence_bundle_digest,
  );
});

test("changing only barrier evidence preserves semantic signatures and verdict", () => {
  const originalBundle = fixture("c8-fixed-point-winddown.json");
  const changedBundle = structuredClone(originalBundle);
  changedBundle.scans[3].sources[0].stability_witness.evidence_ref =
    "changed-barrier-evidence-only";
  const original = verifyClosure(originalBundle);
  const changed = verifyClosure(changedBundle);
  assert.equal(original.verdict, "CLOSED");
  assert.equal(changed.verdict, original.verdict);
  assert.deepEqual(
    changed.passes.map(({ semantic_signature }) => semantic_signature),
    original.passes.map(({ semantic_signature }) => semantic_signature),
  );
});

test("changing qualified barrier progress changes only the evidence-bundle digest", () => {
  const originalBundle = fixture("c8-fixed-point-winddown.json");
  const changedBundle = structuredClone(originalBundle);
  changedBundle.scans[3].sources[0].stability_witness.barrier = 131;
  changedBundle.scans[3].sources[0].stability_witness.observed_through = 136;
  const original = verifyClosure(originalBundle);
  const changed = verifyClosure(changedBundle);
  assert.equal(changed.verdict, original.verdict);
  assert.deepEqual(
    changed.passes.map(({ semantic_signature }) => semantic_signature),
    original.passes.map(({ semantic_signature }) => semantic_signature),
  );
  assert.notEqual(
    changed.certificate.evidence_bundle_digest,
    original.certificate.evidence_bundle_digest,
  );
});
