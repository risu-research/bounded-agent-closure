import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifyClosure } from "../src/verify-closure.mjs";

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

function assertValidationError(bundle, code = null) {
  const result = verifyClosure(bundle);
  assert.equal(result.runner_state, "VALIDATION_ERROR");
  assert.equal("verdict" in result, false);
  if (code) assert.ok(result.errors.some((error) => error.code === code), result.errors);
}

test("A. a missing profile domain binding is invalid", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.domain_bindings.pop();
  assertValidationError(bundle);
});

test("B. NOT_APPLICABLE requires evidence", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.domain_bindings[0] = {
    domain: "AUTHORITY",
    status: "NOT_APPLICABLE",
    source_ids: [],
    evidence_ref: null,
  };
  assertValidationError(bundle);
});

test("C. a covered binding cannot reference an unknown source", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.domain_bindings[0].source_ids = ["missing-source"];
  assertValidationError(bundle, "COVERED_BINDING_UNKNOWN_SOURCE");
});

test("D. every declared source must be used by a covered domain", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.sources.push({
    id: "unused",
    domains: ["AUTHORITY"],
    stability_contract: { type: "BOUNDED_LAG", max_visibility_lag_ms: 0 },
  });
  for (const scan of bundle.scans) {
    scan.sources.push({
      source_id: "unused",
      coverage: "COMPLETE",
      attribution_coverage: "COMPLETE",
      stability_witness: null,
      evidence_refs: ["unused-read"],
      residuals: [],
      lineage_edges: [],
    });
  }
  assertValidationError(bundle, "UNUSED_DECLARED_SOURCE");
});

test("E. a residual class cannot change", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.scans[1].sources[0].residuals[0].class = "EXECUTION";
  assertValidationError(bundle, "RESIDUAL_CLASS_CHANGED");
});

test("F. a residual owning source cannot change", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.sources.push({
    id: "second-inventory",
    domains: ["OPERATIONAL_STATE"],
    stability_contract: { type: "BOUNDED_LAG", max_visibility_lag_ms: 0 },
  });
  bundle.domain_bindings.find(({ domain }) => domain === "OPERATIONAL_STATE").source_ids.push(
    "second-inventory",
  );
  bundle.scans[0].sources.push({
    source_id: "second-inventory",
    coverage: "COMPLETE",
    attribution_coverage: "COMPLETE",
    stability_witness: null,
    evidence_refs: ["second-read-1"],
    residuals: [],
    lineage_edges: [],
  });
  const moved = bundle.scans[1].sources[0].residuals.pop();
  bundle.scans[1].sources.push({
    source_id: "second-inventory",
    coverage: "COMPLETE",
    attribution_coverage: "COMPLETE",
    stability_witness: null,
    evidence_refs: ["second-read-2"],
    residuals: [moved],
    lineage_edges: [],
  });
  assertValidationError(bundle, "RESIDUAL_SOURCE_CHANGED");
});

test("G. dangling DERIVED_FROM endpoints are invalid", () => {
  const bundle = fixture("c1-direct-zombie.json");
  bundle.scans[0].sources[0].lineage_edges.push({
    from: "$root",
    to: "not-observed",
    type: "DERIVED_FROM",
    evidence_ref: "bad-edge",
  });
  assertValidationError(bundle, "DANGLING_LINEAGE_TO");
});

test("H. DERIVED_FROM lineage must be acyclic", () => {
  const bundle = fixture("c2-transitive-zombie.json");
  bundle.scans[0].sources[0].lineage_edges.push({
    from: "child-schedule",
    to: "child-delegation",
    type: "DERIVED_FROM",
    evidence_ref: "cycle-edge",
  });
  assertValidationError(bundle, "LINEAGE_CYCLE");
});

test("a malformed MONOTONIC_BARRIER witness is invalid", () => {
  const bundle = fixture("c8-fixed-point-winddown.json");
  delete bundle.scans[0].sources[0].stability_witness.evidence_ref;
  assertValidationError(bundle);
});

test("C. a barrier captured after its scan is invalid", () => {
  const bundle = fixture("c8-fixed-point-winddown.json");
  bundle.scans[3].sources[0].stability_witness.barrier_captured_at_ms = 91;
  assertValidationError(bundle, "BARRIER_AFTER_SCAN");
});

test("D. a MONOTONIC_BARRIER regression is invalid", () => {
  const bundle = fixture("c8-fixed-point-winddown.json");
  bundle.scans[3].sources[0].stability_witness.barrier = 119;
  assertValidationError(bundle, "BARRIER_REGRESSED");
});

test("E. an observed-through regression is invalid", () => {
  const bundle = fixture("c8-fixed-point-winddown.json");
  bundle.scans[3].sources[0].stability_witness.observed_through = 124;
  assertValidationError(bundle, "OBSERVED_THROUGH_REGRESSED");
});

test("all temporal and barrier integers must be non-negative JavaScript safe integers", () => {
  const unsafe = Number.MAX_SAFE_INTEGER + 1;
  const cases = [
    ["root.quiesced_at_ms", (bundle) => { bundle.root.quiesced_at_ms = unsafe; }],
    ["scan.observed_at_ms", (bundle) => { bundle.scans[0].observed_at_ms = unsafe; }],
    ["bounded lag", (bundle) => { bundle.sources[0].stability_contract.max_visibility_lag_ms = unsafe; }],
    ["barrier", (bundle) => { bundle.scans[0].sources[0].stability_witness.barrier = unsafe; }],
    ["barrier capture", (bundle) => { bundle.scans[0].sources[0].stability_witness.barrier_captured_at_ms = unsafe; }],
    ["observed through", (bundle) => { bundle.scans[0].sources[0].stability_witness.observed_through = unsafe; }],
  ];

  for (const [label, mutate] of cases) {
    const bundle = label === "bounded lag"
      ? fixture("c4-retained-evidence.json")
      : label.startsWith("barrier") || label === "observed through"
        ? fixture("c8-fixed-point-winddown.json")
        : fixture("c4-retained-evidence.json");
    mutate(bundle);
    assertValidationError(bundle, null);
  }
});
