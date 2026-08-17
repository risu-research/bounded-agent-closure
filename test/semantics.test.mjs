import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { terminality, verifyClosure } from "../src/verify-closure.mjs";

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

function codes(problems) {
  return problems.map(({ code }) => code);
}

test("canonical fixtures have the required verdicts and CLOSED certificates", () => {
  const expected = {
    "c1-direct-zombie.json": "INCOMPLETE",
    "c2-transitive-zombie.json": "INCOMPLETE",
    "c3-pending-commitment.json": "INCOMPLETE",
    "c4-retained-evidence.json": "CLOSED",
    "c5-successor-transfer.json": "CLOSED",
    "c6-missing-coverage.json": "UNKNOWN",
    "c7-false-success.json": "INCOMPLETE",
    "c8-fixed-point-winddown.json": "CLOSED",
  };
  for (const [name, verdict] of Object.entries(expected)) {
    const result = verifyClosure(fixture(name));
    assert.equal(result.verdict, verdict, name);
    assert.equal(result.certificate !== null, verdict === "CLOSED", name);
  }
});

test("C2 reports a transitive path to its blocker", () => {
  const result = verifyClosure(fixture("c2-transitive-zombie.json"));
  const blocker = result.blockers.find(({ residual_id }) => residual_id === "child-schedule");
  assert.deepEqual(blocker.path, ["$root", "child-delegation", "child-schedule"]);
});

test("I. active root authority wins over unrelated source uncertainty", () => {
  const bundle = fixture("c6-missing-coverage.json");
  bundle.root.new_business_authority = "ACTIVE";
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "INCOMPLETE");
  assert.ok(codes(result.blockers).includes("ROOT_AUTHORITY_ACTIVE"));
  assert.ok(codes(result.unknowns).includes("SOURCE_UNAVAILABLE"));
});

test("J. an active reachable schedule wins over source uncertainty", () => {
  const bundle = fixture("c1-direct-zombie.json");
  bundle.scans[0].sources[0].coverage = "UNAVAILABLE";
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "INCOMPLETE");
  assert.ok(codes(result.blockers).includes("RESIDUAL_NONTERMINAL"));
  assert.ok(codes(result.unknowns).includes("SOURCE_UNAVAILABLE"));
});

test("K. an UNBOUNDED required source prevents closure", () => {
  const bundle = fixture("c6-missing-coverage.json");
  bundle.sources[0].stability_contract = { type: "UNBOUNDED" };
  bundle.scans[0].sources[0].coverage = "COMPLETE";
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "UNKNOWN");
  assert.ok(codes(result.unknowns).includes("UNBOUNDED_STABILITY"));
});

test("L. BOUNDED_LAG before the visibility boundary is uncertain", () => {
  const bundle = fixture("c6-missing-coverage.json");
  bundle.sources[0].stability_contract.max_visibility_lag_ms = 100;
  bundle.scans[0].sources[0].coverage = "COMPLETE";
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "UNKNOWN");
  assert.ok(codes(result.unknowns).includes("STABILITY_NOT_SATISFIED"));
});

test("M. BOUNDED_LAG at the boundary with a full confirmation window can qualify", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.sources[0].stability_contract.max_visibility_lag_ms = 100;
  bundle.scans[0].observed_at_ms = 200;
  bundle.scans[1].observed_at_ms = 300;
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "CLOSED");
  assert.ok(result.passes.every(({ terminal_qualified }) => terminal_qualified));
});

test("N. a cone node needs a fresh observation in the final scan", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.scans[1].sources[0].residuals = [];
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "UNKNOWN");
  assert.ok(codes(result.unknowns).includes("NODE_NOT_REOBSERVED"));
});

test("O. RETAIN plus ACTIVE is unsafe evidence, not invalid evidence", () => {
  const bundle = fixture("c1-direct-zombie.json");
  bundle.scans[0].sources[0].residuals[0].disposition = "RETAIN";
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "INCOMPLETE");
  assert.equal("runner_state" in result, false);
});

test("P. TRANSFER with a null successor is nonterminal", () => {
  const bundle = fixture("c5-successor-transfer.json");
  for (const scan of bundle.scans) scan.sources[0].residuals[0].successor_id = null;
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "INCOMPLETE");
  assert.equal("runner_state" in result, false);
});

test("Q. TRANSFER with unknown acceptance is uncertain", () => {
  const bundle = fixture("c5-successor-transfer.json");
  for (const scan of bundle.scans) {
    scan.sources[0].residuals[0].transfer_acceptance = "UNKNOWN";
  }
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "UNKNOWN");
  assert.ok(codes(result.unknowns).includes("RESIDUAL_TERMINALITY_UNKNOWN"));
});

test("R. action SUCCESS cannot override an active postcondition", () => {
  const result = verifyClosure(fixture("c7-false-success.json"));
  assert.equal(result.verdict, "INCOMPLETE");
  assert.ok(codes(result.blockers).includes("RESIDUAL_NONTERMINAL"));
});

test("S/G. barrier and evidence facts do not change semantic signatures", () => {
  const result = verifyClosure(fixture("c8-fixed-point-winddown.json"));
  assert.equal(result.passes[2].terminal_qualified, true);
  assert.equal(result.passes[3].terminal_qualified, true);
  assert.equal(result.passes[2].semantic_signature, result.passes[3].semantic_signature);
});

test("T. changing a semantic state field changes the signature", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.scans[1].sources[0].residuals[0].disposition = "EXTINGUISH";
  const result = verifyClosure(bundle);
  assert.equal(result.passes[0].terminal_qualified, true);
  assert.equal(result.passes[1].terminal_qualified, true);
  assert.notEqual(result.passes[0].semantic_signature, result.passes[1].semantic_signature);
  assert.equal(result.verdict, "INCOMPLETE");
  assert.ok(codes(result.blockers).includes("CONE_NOT_STABLE"));
});

test("U. a later zombie overrides an earlier CLOSED-looking pair", () => {
  const bundle = fixture("c4-retained-evidence.json");
  const finalScan = structuredClone(bundle.scans[1]);
  finalScan.scan_id = "c4-scan-3-late-zombie";
  finalScan.observed_at_ms = 300;
  finalScan.sources[0].residuals.push({
    id: "late-zombie",
    class: "EXECUTION",
    disposition: "EXTINGUISH",
    presence: "PRESENT",
    effect: "ACTIVE",
    root_linkage: "LIVE",
    settlement: "NOT_APPLICABLE",
    successor_id: null,
    transfer_acceptance: "NOT_APPLICABLE",
    evidence_refs: ["late-readback"],
  });
  finalScan.sources[0].lineage_edges.push({
    from: "$root",
    to: "late-zombie",
    type: "DERIVED_FROM",
    evidence_ref: "late-origin",
  });
  bundle.scans.push(finalScan);
  const result = verifyClosure(bundle);
  assert.deepEqual(result.passes.slice(0, 2).map(({ terminal_qualified }) => terminal_qualified), [
    true,
    true,
  ]);
  assert.equal(result.latest_scan_id, "c4-scan-3-late-zombie");
  assert.equal(result.verdict, "INCOMPLETE");
  assert.ok(result.blockers.some(({ residual_id }) => residual_id === "late-zombie"));
});

test("terminality ignores action report metadata", () => {
  const active = fixture("c7-false-success.json").scans[0].sources[0].residuals[0];
  const withoutReport = structuredClone(active);
  delete withoutReport.action_report;
  assert.equal(terminality(active), "NONTERMINAL");
  assert.equal(terminality(active), terminality(withoutReport));
});

test("A. a scan before quiescence cannot qualify", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.root.quiesced_at_ms = 300;
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "UNKNOWN");
  assert.deepEqual(result.passes.map(({ terminal_qualified }) => terminal_qualified), [false, false]);
  assert.ok(codes(result.unknowns).includes("SCAN_PRECEDES_QUIESCENCE"));
});

test("B. a MONOTONIC_BARRIER captured before quiescence cannot qualify", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.sources[0].stability_contract = { type: "MONOTONIC_BARRIER" };
  for (const scan of bundle.scans) {
    scan.sources[0].stability_witness = {
      barrier: 10,
      barrier_captured_at_ms: 99,
      observed_through: 10,
      evidence_ref: `barrier-${scan.scan_id}`,
    };
  }
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "UNKNOWN");
  assert.deepEqual(result.passes.map(({ terminal_qualified }) => terminal_qualified), [false, false]);
  assert.ok(codes(result.unknowns).includes("BARRIER_PRECEDES_QUIESCENCE"));
});

test("F. equal MONOTONIC_BARRIER progress values are valid", () => {
  const bundle = fixture("c8-fixed-point-winddown.json");
  for (let sourceIndex = 0; sourceIndex < bundle.scans[3].sources.length; sourceIndex += 1) {
    const previous = bundle.scans[2].sources[sourceIndex].stability_witness;
    const final = bundle.scans[3].sources[sourceIndex].stability_witness;
    final.barrier = previous.barrier;
    final.observed_through = previous.observed_through;
  }
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "CLOSED");
  assert.deepEqual(result.passes.map(({ terminal_qualified }) => terminal_qualified), [
    false,
    false,
    true,
    true,
  ]);
});

test("I. a short BOUNDED_LAG final confirmation window prevents CLOSED", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.sources[0].stability_contract.max_visibility_lag_ms = 100;
  bundle.scans[0].observed_at_ms = 200;
  bundle.scans[1].observed_at_ms = 201;
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "UNKNOWN");
  assert.ok(codes(result.unknowns).includes("BOUNDED_LAG_CONFIRMATION_WINDOW_NOT_ELAPSED"));
  assert.equal(result.unknowns[0].source_id, "inventory");
  assert.equal(result.unknowns[0].required_lag_ms, 100);
});

test("J. a complete BOUNDED_LAG final confirmation window permits CLOSED", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.sources[0].stability_contract.max_visibility_lag_ms = 100;
  bundle.scans[0].observed_at_ms = 200;
  bundle.scans[1].observed_at_ms = 300;
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "CLOSED");
});

test("K. a known blocker wins over a short BOUNDED_LAG confirmation window", () => {
  const bundle = fixture("c4-retained-evidence.json");
  bundle.sources[0].stability_contract.max_visibility_lag_ms = 100;
  bundle.scans[0].observed_at_ms = 200;
  bundle.scans[1].observed_at_ms = 201;
  const finalResidual = bundle.scans[1].sources[0].residuals[0];
  finalResidual.effect = "ACTIVE";
  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "INCOMPLETE");
  assert.ok(codes(result.blockers).includes("RESIDUAL_NONTERMINAL"));
});

test("adversarial edge tuple IDs cannot collide to hide a reachable zombie", () => {
  const bundle = fixture("c4-retained-evidence.json");
  const zombieId = "a\u0000b";
  const decoyParentId = "$root\u0000a";
  const decoyChildId = "b";

  for (const [scanIndex, scan] of bundle.scans.entries()) {
    const observation = scan.sources[0];
    observation.residuals.push(
      {
        id: zombieId,
        class: "EXECUTION",
        disposition: "EXTINGUISH",
        presence: "PRESENT",
        effect: "ACTIVE",
        root_linkage: "LIVE",
        settlement: "NOT_APPLICABLE",
        successor_id: null,
        transfer_acceptance: "NOT_APPLICABLE",
        evidence_refs: [`zombie-readback-${scanIndex + 1}`],
      },
      {
        id: decoyParentId,
        class: "OPERATIONAL_STATE",
        disposition: "RETAIN",
        presence: "PRESENT",
        effect: "INERT",
        root_linkage: "ENDED",
        settlement: "NOT_APPLICABLE",
        successor_id: null,
        transfer_acceptance: "NOT_APPLICABLE",
        evidence_refs: [`decoy-parent-${scanIndex + 1}`],
      },
      {
        id: decoyChildId,
        class: "OPERATIONAL_STATE",
        disposition: "RETAIN",
        presence: "PRESENT",
        effect: "INERT",
        root_linkage: "ENDED",
        settlement: "NOT_APPLICABLE",
        successor_id: null,
        transfer_acceptance: "NOT_APPLICABLE",
        evidence_refs: [`decoy-child-${scanIndex + 1}`],
      },
    );
    if (scanIndex === 0) {
      observation.lineage_edges.push(
        {
          from: "$root",
          to: zombieId,
          type: "DERIVED_FROM",
          evidence_ref: "collision-zombie-edge",
        },
        {
          from: decoyParentId,
          to: decoyChildId,
          type: "DERIVED_FROM",
          evidence_ref: "collision-decoy-edge",
        },
      );
    }
  }

  const result = verifyClosure(bundle);
  assert.equal(result.verdict, "INCOMPLETE");
  const blocker = result.blockers.find(({ residual_id }) => residual_id === zombieId);
  assert.ok(blocker);
  assert.deepEqual(blocker.path, ["$root", zombieId]);
});

test("an unavailable MONOTONIC_BARRIER source with null witness is uncertainty, not invalid evidence", () => {
  const bundle = fixture("c8-fixed-point-winddown.json");
  const finalObservation = bundle.scans.at(-1).sources[0];
  finalObservation.coverage = "UNAVAILABLE";
  finalObservation.attribution_coverage = "UNAVAILABLE";
  finalObservation.stability_witness = null;

  const result = verifyClosure(bundle);
  assert.equal("runner_state" in result, false);
  assert.equal(result.verdict, "UNKNOWN");
  assert.ok(codes(result.unknowns).includes("SOURCE_UNAVAILABLE"));
  assert.ok(codes(result.unknowns).includes("ATTRIBUTION_UNAVAILABLE"));
});

test("TRANSFER to the retiring root or reserved root sentinel is nonterminal", () => {
  for (const successor of ["agent-5", "$root"]) {
    const bundle = fixture("c5-successor-transfer.json");
    assert.equal(bundle.root.id, "agent-5");
    for (const scan of bundle.scans) {
      scan.sources[0].residuals[0].successor_id = successor;
    }
    const result = verifyClosure(bundle);
    assert.equal(result.verdict, "INCOMPLETE", successor);
    assert.ok(codes(result.blockers).includes("TRANSFER_TO_RETIRING_ROOT"), successor);
  }
});
