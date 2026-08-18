import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { after, before, test } from "node:test";
import { generatePublicArtifacts } from "../inspector/generate-public.mjs";
import {
  explainCode,
  presentEvaluation,
} from "../inspector/presentation.mjs";
import { startInspectorServer } from "../inspector/server.mjs";
import { verifyClosure } from "../src/verify-closure.mjs";

const EXPECTED_VERDICTS = Object.freeze({
  C1: "INCOMPLETE",
  C2: "INCOMPLETE",
  C3: "INCOMPLETE",
  C4: "CLOSED",
  C5: "CLOSED",
  C6: "UNKNOWN",
  C7: "INCOMPLETE",
  C8: "CLOSED",
});

let server;
let baseUrl;

async function fixture(name) {
  return JSON.parse(
    await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
  );
}

async function artifact(name) {
  return JSON.parse(
    await readFile(
      new URL(`../inspector/public/cases/${name}`, import.meta.url),
      "utf8",
    ),
  );
}

function rawGet(path) {
  const target = new URL(baseUrl);
  return new Promise((resolveRequest, reject) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        method: "GET",
        path,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolveRequest({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            status: response.statusCode,
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

before(async () => {
  const started = await startInspectorServer({ port: 0, log: false });
  server = started.server;
  baseUrl = started.url;
  assert.equal(started.host, "127.0.0.1");
});

after(async () => {
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
});

test("Inspector generation evaluates all eight canonical fixtures with the frozen verifier", async () => {
  const generated = await generatePublicArtifacts({ write: false });
  assert.equal(generated.artifacts.length, 8);
  for (const generatedArtifact of generated.artifacts) {
    assert.deepEqual(
      generatedArtifact.evaluation,
      verifyClosure(generatedArtifact.bundle),
    );
  }
});

test("generated canonical verdicts remain C1-C8 exact", async () => {
  const index = JSON.parse(
    await readFile(
      new URL("../inspector/public/cases/index.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    Object.fromEntries(index.map(({ id, verdict }) => [id, verdict])),
    EXPECTED_VERDICTS,
  );
});

test("local evaluate endpoint agrees byte-for-byte with direct verification", async () => {
  const bundle = await fixture("c4-retained-evidence.json");
  const response = await fetch(`${baseUrl}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.evaluation, verifyClosure(bundle));
});

test("malformed JSON produces no closure verdict", async () => {
  const response = await fetch(`${baseUrl}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.runner_state, "PARSE_ERROR");
  assert.equal(body.presentation.notice, "No verdict issued.");
  assert.doesNotMatch(JSON.stringify(body), /"verdict"/);
});

test("verifier validation errors stay VALIDATION_ERROR and never become UNKNOWN", async () => {
  const response = await fetch(`${baseUrl}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await response.json();
  assert.equal(body.evaluation.runner_state, "VALIDATION_ERROR");
  assert.ok(body.evaluation.errors.length > 0);
  assert.equal(body.presentation.runner_state, "VALIDATION_ERROR");
  assert.doesNotMatch(JSON.stringify(body), /"verdict":"UNKNOWN"/);
});

test("presentation trusts a supplied Evaluation instead of raw ACTIVE residual fields", async () => {
  const bundle = await fixture("c7-false-success.json");
  const suppliedEvaluation = {
    verdict: "CLOSED",
    latest_scan_id: "presentation-boundary",
    blockers: [],
    unknowns: [],
    passes: [],
    certificate: null,
  };
  const presented = presentEvaluation(bundle, suppliedEvaluation);
  assert.equal(presented.verdict, "CLOSED");
  assert.equal(presented.action_reports[0].observed_state.effect, "ACTIVE");
  assert.deepEqual(presented.reason_action_reports, []);
});

test("presentation does not infer blockers absent from the supplied Evaluation", async () => {
  const bundle = await fixture("c2-transitive-zombie.json");
  const presented = presentEvaluation(bundle, {
    verdict: "UNKNOWN",
    latest_scan_id: "presentation-boundary",
    blockers: [],
    unknowns: [],
    passes: [],
    certificate: null,
  });
  assert.deepEqual(presented.blockers, []);
  assert.deepEqual(presented.blocker_paths, []);
});

test("unreachable action reports stay observational and never become final-verdict reasons", async () => {
  const bundle = await fixture("c4-retained-evidence.json");
  for (const scan of bundle.scans) {
    scan.sources[0].residuals.push({
      id: "unreachable-job",
      class: "EXECUTION",
      disposition: "EXTINGUISH",
      presence: "PRESENT",
      effect: "ACTIVE",
      root_linkage: "LIVE",
      settlement: "NOT_APPLICABLE",
      successor_id: null,
      transfer_acceptance: "NOT_APPLICABLE",
      evidence_refs: ["unreachable-readback"],
      action_report: {
        operation: "cancel",
        reported: "SUCCESS",
        evidence_ref: "unreachable-cancel",
      },
    });
  }

  const evaluation = verifyClosure(bundle);
  assert.equal(evaluation.verdict, "CLOSED");
  assert.deepEqual(evaluation.blockers, []);

  const presented = presentEvaluation(bundle, evaluation);
  assert.ok(presented.action_reports.some(({ residual_id }) => residual_id === "unreachable-job"));
  assert.deepEqual(presented.reason_action_reports, []);
});

test("historical scan selection drives scan-specific source observations and final-reason labeling", async () => {
  const appSource = await readFile(
    new URL("../inspector/public/app.js", import.meta.url),
    "utf8",
  );
  const html = await readFile(
    new URL("../inspector/public/index.html", import.meta.url),
    "utf8",
  );

  assert.match(appSource, /presentation\.scans\?\.\[selectedScanIndex\]/);
  assert.doesNotMatch(appSource, /bundle\.scans\?\.at\(-1\)/);
  assert.match(
    appSource,
    /selectedScanIndex = index;[\s\S]*renderSelectedScan\(\);[\s\S]*renderSources\(\);/,
  );
  assert.match(html, />Why the final verdict</);
});

test("unrecognized explanation codes remain exact and fall back neutrally", () => {
  assert.equal(
    explainCode("FUTURE_ENGINE_CODE"),
    "No display explanation is registered for this machine code.",
  );
});

test("C2 exposes the verifier-provided transitive blocker path", async () => {
  const c2 = await artifact("c2-transitive-zombie.json");
  assert.deepEqual(c2.presentation.blocker_paths, [
    ["$root", "child-delegation", "child-schedule"],
  ]);
  assert.deepEqual(
    c2.presentation.blocker_paths,
    c2.evaluation.blockers.map(({ path }) => path),
  );
});

test("C6 presents UNKNOWN as insufficient evidence rather than success", async () => {
  const c6 = await artifact("c6-missing-coverage.json");
  assert.equal(c6.presentation.verdict, "UNKNOWN");
  assert.match(
    c6.presentation.verdict_copy.summary,
    /insufficient to establish closure/i,
  );
  assert.match(c6.presentation.verdict_copy.detail, /Closure is not established/);
  assert.equal(c6.presentation.unknowns[0].code, "SOURCE_UNAVAILABLE");
});

test("C7 keeps reported SUCCESS separate from ACTIVE and LIVE observations", async () => {
  const c7 = await artifact("c7-false-success.json");
  const report = c7.presentation.reason_action_reports[0];
  assert.equal(report.reported_operation.reported, "SUCCESS");
  assert.equal(report.observed_state.effect, "ACTIVE");
  assert.equal(report.observed_state.root_linkage, "LIVE");
  assert.equal(c7.presentation.verdict, "INCOMPLETE");
});

test("C8 exposes four pass summaries and matching final semantic signatures", async () => {
  const c8 = await artifact("c8-fixed-point-winddown.json");
  assert.deepEqual(
    c8.presentation.scans.map(({ pass }) => pass.terminal_qualified),
    [false, false, true, true],
  );
  assert.deepEqual(
    c8.presentation.scans.map(({ pass }) => pass.closure_cone_nodes),
    [3, 4, 4, 4],
  );
  assert.equal(
    c8.presentation.scans[2].pass.semantic_signature,
    c8.presentation.scans[3].pass.semantic_signature,
  );
  assert.equal(
    c8.presentation.scans[3].pass.semantic_signature,
    c8.evaluation.certificate.closure_cone_digest,
  );
});

test("C5 exposes accepted succession while preserving the observed global effect", async () => {
  const c5 = await artifact("c5-successor-transfer.json");
  const transfer = c5.presentation.transfers.at(-1);
  assert.equal(transfer.root_linkage, "ENDED");
  assert.equal(transfer.transfer_acceptance, "ACCEPTED");
  assert.notEqual(transfer.successor_id, null);
  assert.equal(transfer.effect, "ACTIVE");
  assert.equal(c5.presentation.verdict, "CLOSED");
});

test("certificates are passed through only when the verifier supplied one", async () => {
  for (const name of [
    "c1-direct-zombie.json",
    "c4-retained-evidence.json",
    "c6-missing-coverage.json",
    "c8-fixed-point-winddown.json",
  ]) {
    const generated = await artifact(name);
    assert.deepEqual(
      generated.presentation.certificate,
      generated.evaluation.certificate,
    );
  }
});

test("generated public artifacts are byte-for-byte reproducible", async () => {
  const first = await generatePublicArtifacts({ write: false });
  const second = await generatePublicArtifacts({ write: false });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  for (const generatedArtifact of first.artifacts) {
    const onDisk = await artifact(generatedArtifact.metadata.file);
    assert.deepEqual(onDisk, generatedArtifact);
  }
});

test("local server rejects traversal and emits restrictive security headers", async () => {
  const traversal = await rawGet("/cases/%2e%2e/style.css");
  assert.equal(traversal.status, 400);
  assert.doesNotMatch(traversal.body, /risu-bounded-agent-closure/);

  const landing = await fetch(baseUrl);
  assert.equal(landing.status, 200);
  const csp = landing.headers.get("content-security-policy");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(landing.headers.get("x-content-type-options"), "nosniff");
});

test("oversized evidence fails clearly without a closure verdict", async () => {
  const response = await fetch(`${baseUrl}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oversized: "x".repeat(1024 * 1024) }),
  });
  assert.equal(response.status, 413);
  const body = await response.json();
  assert.equal(
    body.presentation.errors[0].code,
    "REQUEST_BODY_TOO_LARGE",
  );
  assert.equal(body.presentation.notice, "No verdict issued.");
  assert.doesNotMatch(JSON.stringify(body), /"verdict"/);
});

test("Inspector assets have no external dependencies and fixture count remains eight", async () => {
  for (const name of ["index.html", "style.css", "app.js"]) {
    const content = await readFile(
      new URL(`../inspector/public/${name}`, import.meta.url),
      "utf8",
    );
    const withoutSvgNamespace = content.replace(
      "http://www.w3.org/2000/svg",
      "",
    );
    assert.doesNotMatch(withoutSvgNamespace, /https?:\/\//);
  }
  const fixtureNames = (await readdir(new URL("../fixtures/", import.meta.url)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert.equal(fixtureNames.length, 8);
});

test("presentation ordering is locale-independent and reobservation is labeled accurately", async () => {
  const bundle = await fixture("c4-retained-evidence.json");
  const firstScan = structuredClone(bundle.scans[0]);
  const secondScan = structuredClone(bundle.scans[1]);
  const thirdScan = structuredClone(bundle.scans[1]);
  firstScan.scan_id = "unicode-1";
  secondScan.scan_id = "unicode-2";
  thirdScan.scan_id = "unicode-3";
  firstScan.observed_at_ms = 1;
  secondScan.observed_at_ms = 2;
  thirdScan.observed_at_ms = 3;

  const sourceId = firstScan.sources[0].source_id;
  const template = structuredClone(firstScan.sources[0].residuals[0]);
  const unicodeResiduals = ["z-node", "ä-node", "Å-node"].map((id) => ({
    ...structuredClone(template),
    id,
  }));
  firstScan.sources[0].residuals = unicodeResiduals;
  secondScan.sources[0].residuals = unicodeResiduals.filter(({ id }) => id !== "ä-node");
  thirdScan.sources[0].residuals = unicodeResiduals;
  firstScan.sources[0].lineage_edges = [];
  secondScan.sources[0].lineage_edges = [];
  thirdScan.sources[0].lineage_edges = [];
  bundle.scans = [firstScan, secondScan, thirdScan];

  const suppliedEvaluation = {
    verdict: "UNKNOWN",
    latest_scan_id: "unicode-3",
    blockers: [],
    unknowns: [],
    passes: [
      { scan_id: "unicode-1", closure_cone_nodes: 0, terminal_qualified: false, semantic_signature: null },
      { scan_id: "unicode-2", closure_cone_nodes: 0, terminal_qualified: false, semantic_signature: null },
      { scan_id: "unicode-3", closure_cone_nodes: 0, terminal_qualified: false, semantic_signature: null },
    ],
    certificate: null,
  };
  const presented = presentEvaluation(bundle, suppliedEvaluation);
  const thirdResiduals = presented.scans[2].nodes
    .filter(({ kind }) => kind === "RESIDUAL")
    .map(({ id }) => id);
  assert.deepEqual(thirdResiduals, ["z-node", "Å-node", "ä-node"]);
  const reobserved = presented.scans[2].nodes.find(({ id }) => id === "ä-node");
  assert.deepEqual(reobserved.changes, [
    { field: "observation", before: "NOT_REOBSERVED", after: "REOBSERVED" },
  ]);
  assert.equal(sourceId, firstScan.sources[0].source_id);
});

test("static deployment defaults cannot enable private evidence upload", async () => {
  const appSource = await readFile(
    new URL("../inspector/public/app.js", import.meta.url),
    "utf8",
  );
  const html = await readFile(
    new URL("../inspector/public/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /Static mode · Canonical evidence only/);
  assert.match(html, /id="open-file"[^>]*disabled/);
  assert.match(appSource, /window\.location\.hostname === "127\.0\.0\.1"/);
  assert.match(appSource, /file\.size > localUploadLimitBytes/);
});

test("local evaluation endpoint requires JSON content type", async () => {
  const response = await fetch(`${baseUrl}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  });
  assert.equal(response.status, 415);
  const body = await response.json();
  assert.equal(body.runner_state, "REQUEST_ERROR");
  assert.equal(body.error.code, "UNSUPPORTED_MEDIA_TYPE");
  assert.doesNotMatch(JSON.stringify(body), /"verdict"/);
});

test("graph rendering preserves readable scale and does not leak final blocker highlighting into history", async () => {
  const appSource = await readFile(
    new URL("../inspector/public/app.js", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../inspector/public/style.css", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(appSource, /localeCompare/);
  assert.match(appSource, /svg\.style\.minWidth = `\$\{layout\.width\}px`/);
  assert.match(appSource, /svg\.style\.height = `\$\{layout\.height\}px`/);
  assert.match(appSource, /compactGraphText\(graphNode\.label\)/);
  assert.match(appSource, /finalScanSelected[\s\S]*\? current\.presentation\.blocker_paths[\s\S]*: \[\]/);
  assert.match(css, /max-height: 680px;[\s\S]*overflow: auto;/);
});

test("Why presentation preserves blocker precedence and action-report wording", async () => {
  const appSource = await readFile(
    new URL("../inspector/public/app.js", import.meta.url),
    "utf8",
  );
  assert.match(appSource, /Decisive blocker/);
  assert.match(appSource, /Additional uncertainty/);
  assert.match(appSource, /known blocker determines the INCOMPLETE verdict/);
  assert.match(appSource, /reported_operation\.reported === "SUCCESS"/);
  assert.match(appSource, /Action-report metadata does not determine terminality/);
});


test("domain scope makes NOT_APPLICABLE coverage explicit even when the verifier can close", () => {
  const domains = [
    "AUTHORITY",
    "EXECUTION",
    "COMMITMENT",
    "OPERATIONAL_STATE",
  ];
  const bundle = {
    spec_version: "0.3",
    profile_id: "RISU_AGENT_CLOSURE_V0",
    time_basis: "BUNDLE_MONOTONIC_MS",
    root: {
      id: "all-na-root",
      new_business_authority: "BLOCKED",
      quiesced_at_ms: 0,
      quiescence_evidence_ref: "root-quiescence",
    },
    domain_bindings: domains.map((domain) => ({
      domain,
      status: "NOT_APPLICABLE",
      source_ids: [],
      evidence_ref: `na-${domain}`,
    })),
    sources: [],
    scans: [
      { scan_id: "na-scan-1", observed_at_ms: 1, sources: [] },
      { scan_id: "na-scan-2", observed_at_ms: 2, sources: [] },
    ],
  };

  const evaluation = verifyClosure(bundle);
  assert.equal(evaluation.verdict, "CLOSED");
  const presented = presentEvaluation(bundle, evaluation);
  assert.equal(presented.declared_domain_count, 4);
  assert.equal(presented.covered_domain_count, 0);
  assert.equal(presented.not_applicable_domain_count, 4);
});


test("final visual clarity layer keeps scope, blockers, certificates, and transfer evidence semantically distinct", async () => {
  const appSource = await readFile(
    new URL("../inspector/public/app.js", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../inspector/public/style.css", import.meta.url),
    "utf8",
  );
  const html = await readFile(
    new URL("../inspector/public/index.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /RISU · Agent Closure Inspector/);
  assert.match(appSource, /IN SCOPE · \$\{presentation\.not_applicable_domain_count\} N\/A/);
  assert.match(appSource, /scopeStatusText\(binding\.status\)/);
  assert.match(appSource, /Machine detail/);
  assert.match(appSource, /blockerNodeIds/);
  assert.match(appSource, /"blocker"/);
  assert.match(appSource, /observedResiduals\.length === 1/);
  assert.match(appSource, /First observed in this scan\./);
  assert.match(appSource, /Closure certificate · issued/);
  assert.match(appSource, /Closure certificate · not issued/);
  assert.match(appSource, /transfer acceptance/);
  assert.match(appSource, /residualEvidenceList/);
  assert.match(appSource, /No residuals supplied\./);
  assert.match(appSource, /No lineage edges supplied\./);
  assert.match(css, /align-items: start;/);
  assert.match(css, /\.graph-node\.blocker rect/);
});

test("C5 transfer evidence remains fully visible to the presentation without inventing a new verdict", async () => {
  const c5 = await artifact("c5-successor-transfer.json");
  assert.equal(c5.presentation.verdict, "CLOSED");
  const finalScan = c5.presentation.scans.at(-1);
  const transferNode = finalScan.nodes.find(({ id }) => id === "customer-case");
  assert.ok(transferNode);
  assert.equal(transferNode.facts.disposition, "TRANSFER");
  assert.equal(transferNode.facts.effect, "ACTIVE");
  assert.equal(transferNode.facts.root_linkage, "ENDED");
  assert.equal(transferNode.facts.successor_id, "agent-13");
  assert.equal(transferNode.facts.transfer_acceptance, "ACCEPTED");
});
