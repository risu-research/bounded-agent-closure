const SVG_NS = "http://www.w3.org/2000/svg";
const VERDICT_VALUES = new Set(["CLOSED", "INCOMPLETE", "UNKNOWN"]);

const dom = Object.fromEntries(
  [
    "intro",
    "canonical-cases",
    "case-grid",
    "open-file",
    "file-input",
    "capability-note",
    "privacy-note",
    "inspector",
    "case-kicker",
    "case-title",
    "case-description",
    "choose-another",
    "evaluation-tab",
    "evidence-tab",
    "evaluation-view",
    "evidence-view",
    "verdict-strip",
    "history-label",
    "lineage-graph",
    "node-detail",
    "why-content",
    "timeline",
    "sources-content",
    "certificate-panel",
    "certificate-content",
    "evidence-content",
    "error-surface",
    "error-list",
  ].map((id) => [id, document.getElementById(id)]),
);

let localEvaluationAvailable = false;
let localUploadLimitBytes = null;
let current = null;
let selectedScanIndex = 0;

function compareText(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function compactGraphText(value, maxLength = 22) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  const leftLength = Math.ceil((maxLength - 1) / 2);
  const rightLength = Math.floor((maxLength - 1) / 2);
  return `${text.slice(0, leftLength)}…${text.slice(-rightLength)}`;
}

function element(tag, className = "", text = null) {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== null) created.textContent = String(text);
  return created;
}

function svgElement(tag, attributes = {}) {
  const created = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    created.setAttribute(name, String(value));
  }
  return created;
}

function valueText(value) {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(" → ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function verdictClass(verdict) {
  return VERDICT_VALUES.has(verdict) ? verdict.toLowerCase() : "neutral";
}

function scopeStatusText(status) {
  if (status === "COVERED") return "IN SCOPE";
  if (status === "NOT_APPLICABLE") return "N/A";
  return valueText(status);
}

function fact(label, value) {
  const wrapper = element("div", "fact");
  wrapper.append(
    element("span", "fact-label", label),
    element("span", "fact-value", valueText(value)),
  );
  return wrapper;
}

function compactFacts(values) {
  const list = element("ul", "compact-facts");
  for (const [label, value] of values) {
    if (value === undefined) continue;
    const item = element("li");
    const strong = element("strong", "", `${label}: `);
    item.append(strong, document.createTextNode(valueText(value)));
    list.append(item);
  }
  return list;
}

function caseButton(caseItem) {
  const button = element("button", "case-button");
  button.type = "button";
  button.dataset.file = caseItem.file;
  button.setAttribute(
    "aria-label",
    `${caseItem.id} ${caseItem.title}, ${caseItem.verdict}`,
  );

  const header = element("span", "case-id", caseItem.id);
  const title = element("h3", "", caseItem.title);
  const description = element("p", "", caseItem.description);
  const footer = element("div", "case-footer");
  const verdict = element(
    "span",
    `verdict-chip ${verdictClass(caseItem.verdict)}`,
    caseItem.verdict,
  );
  const open = element("span", "", "Open →");
  footer.append(verdict, open);
  button.append(header, title, description, footer);
  button.addEventListener("click", () => loadCanonicalCase(caseItem.file));
  return button;
}

async function loadCaseIndex() {
  try {
    const response = await fetch("./cases/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Case index unavailable.");
    const cases = await response.json();
    dom["case-grid"].replaceChildren(...cases.map(caseButton));
  } catch {
    dom["case-grid"].replaceChildren(
      element("p", "problem-intro", "Canonical cases could not be loaded."),
    );
  }
}

async function checkLocalCapability() {
  const loopbackOrigin =
    window.location.protocol === "http:" && window.location.hostname === "127.0.0.1";

  localEvaluationAvailable = false;
  localUploadLimitBytes = null;

  if (loopbackOrigin) {
    try {
      const response = await fetch("/api/capabilities", { cache: "no-store" });
      const capability = response.ok ? await response.json() : null;
      localEvaluationAvailable = capability?.local_evaluation === true;
      localUploadLimitBytes = Number.isSafeInteger(capability?.upload_limit_bytes)
        ? capability.upload_limit_bytes
        : null;
    } catch {
      localEvaluationAvailable = false;
      localUploadLimitBytes = null;
    }
  }

  dom["open-file"].disabled = !localEvaluationAvailable;
  if (localEvaluationAvailable) {
    dom["capability-note"].textContent =
      "JSON is evaluated in memory by the local frozen verifier.";
    dom["privacy-note"].textContent =
      "Runs locally. Evidence does not leave this machine.";
  } else {
    dom["capability-note"].textContent =
      "Inspect your own evidence locally with: npm run inspector";
    dom["privacy-note"].textContent =
      "Static mode · Canonical evidence only";
  }
}

async function loadCanonicalCase(file) {
  try {
    const response = await fetch(`./cases/${encodeURIComponent(file)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Canonical artifact unavailable.");
    const artifact = await response.json();
    showEvaluation(artifact);
  } catch (error) {
    showClientError("CANONICAL_ARTIFACT_UNAVAILABLE", error.message);
  }
}

async function evaluateFile(file) {
  if (
    Number.isSafeInteger(localUploadLimitBytes) &&
    file.size > localUploadLimitBytes
  ) {
    showClientError(
      "REQUEST_BODY_TOO_LARGE",
      `Evidence bundle exceeds the local ${localUploadLimitBytes}-byte limit.`,
    );
    return;
  }

  const raw = await file.text();
  let response;
  try {
    response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
    });
  } catch {
    showClientError(
      "LOCAL_API_UNAVAILABLE",
      "Start the local Inspector with: npm run inspector",
    );
    return;
  }

  const result = await response.json();
  if (result.presentation?.runner_state !== "EVALUATED") {
    showEvaluationError(result.presentation);
    return;
  }

  let bundle;
  try {
    bundle = JSON.parse(raw);
  } catch {
    showEvaluationError(result.presentation);
    return;
  }

  showEvaluation({
    metadata: {
      id: "LOCAL",
      title: file.name,
      description: "Evaluated in memory by the local frozen verifier.",
    },
    bundle,
    evaluation: result.evaluation,
    presentation: result.presentation,
  });
}

function showClientError(code, message) {
  showEvaluationError({
    errors: [
      {
        code,
        explanation: message,
        facts: { code },
      },
    ],
  });
}

function showEvaluationError(presentation) {
  current = null;
  dom.inspector.classList.add("hidden");
  dom["error-surface"].classList.remove("hidden");
  const items = (presentation?.errors ?? []).map((problem) => {
    const wrapper = element("div", "error-item");
    wrapper.append(
      element("span", "machine-code", problem.code),
      element("p", "", problem.explanation),
      element("p", "problem-facts", JSON.stringify(problem.facts ?? {})),
    );
    return wrapper;
  });
  dom["error-list"].replaceChildren(...items);
  dom["error-surface"].scrollIntoView({ block: "start" });
}

function showEvaluation(artifact) {
  current = artifact;
  selectedScanIndex = Math.max(0, artifact.presentation.scans.length - 1);
  dom.intro.classList.add("hidden");
  dom["canonical-cases"].classList.add("hidden");
  dom["error-surface"].classList.add("hidden");
  dom.inspector.classList.remove("hidden");
  dom["case-kicker"].textContent =
    artifact.metadata?.id === "LOCAL"
      ? "RISU · Agent Closure Inspector · Local evidence bundle"
      : `RISU · Agent Closure Inspector · ${artifact.metadata?.id ?? "Canonical"} · Canonical case`;
  dom["case-title"].textContent = artifact.metadata?.title ?? "Evaluation";
  dom["case-description"].textContent = artifact.metadata?.description ?? "";
  selectTab("evaluation");
  renderAll();
  dom.inspector.scrollIntoView({ block: "start" });
}

function renderAll() {
  renderVerdict();
  renderWhy();
  renderTimeline();
  renderSelectedScan();
  renderSources();
  renderCertificate();
  renderEvidence();
}

function renderVerdict() {
  const presentation = current.presentation;
  const strip = dom["verdict-strip"];
  const tone = verdictClass(presentation.verdict);
  strip.className = `verdict-strip ${tone}`;

  const primary = element("div");
  primary.append(
    element("span", "verdict-label", "Closure verdict"),
    element("div", "verdict-word", presentation.verdict ?? "NO VERDICT"),
    element("p", "verdict-summary", presentation.verdict_copy.summary),
  );

  const facts = element("div", "fact-grid");
  facts.append(
    fact("Root ID", presentation.root.id),
    fact("Root authority", presentation.root.authority),
    fact("Verifier cone nodes", presentation.closure_cone_nodes),
    fact("Latest scan", presentation.latest_scan_id),
    fact(
      "Domain scope",
      `${presentation.covered_domain_count} IN SCOPE · ${presentation.not_applicable_domain_count} N/A`,
    ),
    fact("Profile", presentation.profile_id),
  );
  strip.replaceChildren(primary, facts);
}

function problemList(problems) {
  const list = element("ul", "problem-list");
  for (const problem of problems) {
    const item = element("li");
    item.append(
      element("span", "machine-code", problem.code),
      element("p", "", problem.explanation),
    );

    const facts = problem.facts ?? {};
    const structured = [];
    for (const [label, key] of [
      ["Residual", "residual_id"],
      ["Source", "source_id"],
      ["Domain", "domain"],
      ["Scan", "scan_id"],
    ]) {
      if (facts[key] !== undefined && facts[key] !== null) {
        structured.push([label, facts[key]]);
      }
    }
    if (Array.isArray(facts.path)) structured.push(["Path", facts.path]);
    if (structured.length) {
      const factList = element("dl", "reason-facts");
      for (const [label, value] of structured) {
        factList.append(
          element("dt", "", label),
          element("dd", "", valueText(value)),
        );
      }
      item.append(factList);
    }

    const machineDetail = element("details", "machine-detail");
    machineDetail.append(
      element("summary", "", "Machine detail"),
      element("pre", "problem-facts", JSON.stringify(facts, null, 2)),
    );
    item.append(machineDetail);
    list.append(item);
  }
  return list;
}

function stateBox(title, pairs) {
  const box = element("div", "state-box");
  box.append(element("span", "fact-label", title));
  for (const [label, value] of pairs) {
    box.append(element("p", "", `${label}: ${valueText(value)}`));
  }
  return box;
}

function renderWhy() {
  const presentation = current.presentation;
  const content = dom["why-content"];
  const children = [
    element("p", "problem-intro", presentation.verdict_copy.detail),
  ];

  if (presentation.blockers.length) {
    children.push(
      element("h4", "reason-heading", "Decisive blocker"),
      problemList(presentation.blockers),
    );
  }

  if (presentation.unknowns.length) {
    const heading = presentation.blockers.length
      ? "Additional uncertainty"
      : "Uncertainty preventing closure";
    children.push(element("h4", "reason-heading", heading));
    if (presentation.blockers.length) {
      children.push(
        element(
          "p",
          "problem-intro",
          "The verifier recorded this uncertainty, but the known blocker determines the INCOMPLETE verdict.",
        ),
      );
    }
    children.push(problemList(presentation.unknowns));
  }

  for (const report of presentation.reason_action_reports ?? []) {
    const comparison = element("div", "reported-observed");
    comparison.append(
      stateBox("Reported operation", [
        ["operation", report.reported_operation.operation],
        ["reported", report.reported_operation.reported],
      ]),
      stateBox("Observed state", [
        ["effect", report.observed_state.effect],
        ["root linkage", report.observed_state.root_linkage],
        ["presence", report.observed_state.presence],
      ]),
    );
    const reportCopy =
      report.reported_operation.reported === "SUCCESS"
        ? "Reported action success does not override the observed postcondition."
        : "Action-report metadata does not determine terminality; the observed postcondition is evaluated separately.";
    children.push(comparison, element("p", "problem-intro", reportCopy));
  }

  content.replaceChildren(...children);
}

function shortDigest(value) {
  if (!value) return "—";
  return value.length > 24
    ? `${value.slice(0, 15)}…${value.slice(-8)}`
    : value;
}

function renderTimeline() {
  const presentation = current.presentation;
  const buttons = presentation.scans.map((scan, index) => {
    const pass = scan.pass;
    const qualified = pass?.terminal_qualified === true;
    const button = element(
      "button",
      `timeline-button ${qualified ? "qualified" : ""} ${index === selectedScanIndex ? "selected" : ""}`,
    );
    button.type = "button";
    button.setAttribute(
      "aria-pressed",
      index === selectedScanIndex ? "true" : "false",
    );
    button.append(
      element("strong", "", scan.scan_id),
      element(
        "span",
        `status-tag ${qualified ? "qualified" : "unqualified"}`,
        `terminal-qualified: ${qualified}`,
      ),
      element(
        "span",
        "",
        `${valueText(pass?.closure_cone_nodes)} verifier cone nodes`,
      ),
    );
    if (pass?.semantic_signature) {
      const digest = element("code", "", shortDigest(pass.semantic_signature));
      digest.title = pass.semantic_signature;
      button.append(digest);
    }
    button.addEventListener("click", () => {
      selectedScanIndex = index;
      renderTimeline();
      renderSelectedScan();
      renderSources();
    });
    return button;
  });
  dom.timeline.replaceChildren(...buttons);
}

function edgeKey(from, to) {
  return JSON.stringify([from, to]);
}

function graphicalLayout(scan) {
  const nodes = [...scan.nodes].sort((a, b) => compareText(a.id, b.id));
  const ids = new Set(nodes.map(({ id }) => id));
  const outgoing = new Map();
  for (const edge of [...scan.edges].sort(
    (a, b) =>
      compareText(a.from, b.from) ||
      compareText(a.to, b.to) ||
      compareText(a.type, b.type),
  )) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge.to);
  }

  const depth = new Map([["$root", 0]]);
  const queue = ["$root"];
  for (let index = 0; index < queue.length; index += 1) {
    const from = queue[index];
    for (const to of outgoing.get(from) ?? []) {
      const nextDepth = depth.get(from) + 1;
      if (!depth.has(to) || nextDepth < depth.get(to)) {
        depth.set(to, nextDepth);
        queue.push(to);
      }
    }
  }
  const connectedMax = Math.max(0, ...depth.values());
  for (const item of nodes) {
    if (!depth.has(item.id)) depth.set(item.id, connectedMax + 1);
  }

  const layers = new Map();
  for (const item of nodes) {
    const itemDepth = depth.get(item.id);
    if (!layers.has(itemDepth)) layers.set(itemDepth, []);
    layers.get(itemDepth).push(item);
  }
  const maxLayer = Math.max(...[...layers.values()].map((layer) => layer.length));
  const width = Math.max(620, (Math.max(...depth.values()) + 1) * 210);
  const height = Math.max(320, maxLayer * 88 + 80);
  const positions = new Map();
  for (const [itemDepth, layer] of layers) {
    layer.sort((a, b) => compareText(a.id, b.id));
    layer.forEach((item, index) => {
      const spacing = height / (layer.length + 1);
      positions.set(item.id, {
        x: 86 + itemDepth * 205,
        y: spacing * (index + 1),
      });
    });
  }
  return { nodes, positions, width, height };
}

function highlightedEdges(paths) {
  const result = new Set();
  for (const path of paths) {
    for (let index = 1; index < path.length; index += 1) {
      result.add(edgeKey(path[index - 1], path[index]));
    }
  }
  return result;
}

function renderLineage(scan) {
  const graph = dom["lineage-graph"];
  const layout = graphicalLayout(scan);
  const svg = svgElement("svg", {
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    role: "img",
    "aria-labelledby": "graph-svg-title graph-svg-description",
  });
  svg.style.minWidth = `${layout.width}px`;
  svg.style.height = `${layout.height}px`;
  const title = svgElement("title", { id: "graph-svg-title" });
  title.textContent = `Evidence lineage for ${scan.scan_id}`;
  const description = svgElement("desc", { id: "graph-svg-description" });
  description.textContent =
    "A deterministic layered layout of the lineage relationships supplied by the bundle.";
  svg.append(title, description);

  const finalScanSelected =
    selectedScanIndex === current.presentation.scans.length - 1;
  const finalBlockerPaths = finalScanSelected
    ? current.presentation.blocker_paths
    : [];
  const highlights = highlightedEdges(finalBlockerPaths);
  for (const edge of scan.edges) {
    const from = layout.positions.get(edge.from);
    const to = layout.positions.get(edge.to);
    if (!from || !to) continue;
    const line = svgElement("path", {
      d: `M ${from.x + 70} ${from.y} L ${to.x - 70} ${to.y}`,
      class: `graph-edge ${highlights.has(edgeKey(edge.from, edge.to)) ? "highlight" : ""}`,
    });
    const edgeTitle = svgElement("title");
    edgeTitle.textContent = `${edge.from} ${edge.type} ${edge.to}`;
    line.append(edgeTitle);
    svg.append(line);
  }

  const blockerNodeIds = new Set(
    finalScanSelected
      ? (current.presentation.blockers ?? [])
          .map((problem) =>
            problem?.code === "ROOT_AUTHORITY_ACTIVE"
              ? "$root"
              : problem?.facts?.residual_id,
          )
          .filter((id) => typeof id === "string")
      : [],
  );
  for (const graphNode of layout.nodes) {
    const position = layout.positions.get(graphNode.id);
    const group = svgElement("g", {
      class: [
        "graph-node",
        graphNode.kind === "ROOT" ? "root" : "",
        blockerNodeIds.has(graphNode.id) ? "blocker" : "",
        graphNode.observed ? "" : "not-observed",
      ]
        .filter(Boolean)
        .join(" "),
      role: "button",
      tabindex: "0",
      "aria-label": `${graphNode.label}, ${graphNode.class ?? graphNode.kind}, ${graphNode.facts.effect ?? graphNode.facts.new_business_authority ?? "not reobserved"}`,
    });
    const rect = svgElement("rect", {
      x: position.x - 70,
      y: position.y - 28,
      width: 140,
      height: 56,
      rx: 6,
    });
    const nodeTitle = svgElement("title");
    nodeTitle.textContent = `${graphNode.label} · ${graphNode.class ?? graphNode.kind}`;
    const label = svgElement("text", {
      x: position.x,
      y: position.y - 5,
      "text-anchor": "middle",
    });
    label.textContent = compactGraphText(graphNode.label);
    const state = svgElement("text", {
      x: position.x,
      y: position.y + 14,
      "text-anchor": "middle",
    });
    state.textContent = graphNode.observed
      ? compactGraphText(
          `${graphNode.class ?? "ROOT"} · ${graphNode.facts.effect ?? graphNode.facts.new_business_authority ?? ""}`,
          26,
        )
      : "NOT REOBSERVED";
    group.append(nodeTitle, rect, label, state);
    group.addEventListener("click", () => renderNodeDetail(graphNode));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        renderNodeDetail(graphNode);
      }
    });
    svg.append(group);
  }
  graph.replaceChildren(svg);

  const blockerNode = layout.nodes.find((item) => blockerNodeIds.has(item.id));
  const observedResiduals = layout.nodes.filter(
    (item) => item.kind === "RESIDUAL" && item.observed,
  );
  const defaultNode =
    blockerNode ??
    (observedResiduals.length === 1 ? observedResiduals[0] : layout.nodes[0]);
  if (defaultNode) renderNodeDetail(defaultNode);
}

function renderNodeDetail(graphNode) {
  const detail = dom["node-detail"];
  const facts = graphNode.facts ?? {};
  const heading = element("h4", "", graphNode.label);
  const factList = compactFacts([
    ["class", graphNode.class ?? graphNode.kind],
    ["source", graphNode.source_id],
    ["observed", graphNode.observed],
    ["disposition", facts.disposition],
    ["presence", facts.presence],
    ["effect", facts.effect],
    ["root linkage", facts.root_linkage],
    ["settlement", facts.settlement],
    ["successor", facts.successor_id],
    ["transfer acceptance", facts.transfer_acceptance],
    ["authority", facts.new_business_authority],
  ]);
  const children = [heading, factList];
  if (graphNode.changes?.length) {
    const [observationChange] = graphNode.changes;
    if (
      graphNode.changes.length === 1 &&
      observationChange.field === "observation" &&
      observationChange.after === "FIRST_OBSERVED"
    ) {
      children.push(element("p", "observation-note", "First observed in this scan."));
    } else if (
      graphNode.changes.length === 1 &&
      observationChange.field === "observation" &&
      observationChange.after === "REOBSERVED"
    ) {
      children.push(element("p", "observation-note", "Reobserved in this scan."));
    } else {
      children.push(element("h4", "", "Changed since previous scan"));
      const changes = element("ul", "diff-list");
      for (const change of graphNode.changes) {
        const item = element("li");
        item.append(
          element("strong", "", `${change.field}: `),
          document.createTextNode(
            `${valueText(change.before)} → ${valueText(change.after)}`,
          ),
        );
        changes.append(item);
      }
      children.push(changes);
    }
  }
  detail.replaceChildren(...children);
}

function renderSelectedScan() {
  const scans = current.presentation.scans;
  const scan = scans[selectedScanIndex];
  if (!scan) {
    dom["lineage-graph"].replaceChildren(
      element("p", "problem-intro", "No scan evidence is available."),
    );
    dom["node-detail"].replaceChildren();
    return;
  }
  const final = selectedScanIndex === scans.length - 1;
  dom["history-label"].textContent = final
    ? `Final scan · Final evaluation: ${current.presentation.verdict}`
    : `Viewing historical ${scan.scan_id} of ${scans.length} · Final evaluation: ${current.presentation.verdict}`;
  renderLineage(scan);
}

function renderSources() {
  const bundle = current.bundle;
  const presentation = current.presentation;
  const selectedScan = presentation.scans?.[selectedScanIndex] ?? null;
  const observationBySource = new Map(
    (selectedScan?.sources ?? []).map((observation) => [
      observation.source_id,
      observation,
    ]),
  );
  const bindings = new Map(
    (bundle.domain_bindings ?? []).map((binding) => [binding.domain, binding]),
  );
  const children = [
    element(
      "p",
      "problem-intro",
      `${presentation.declared_domain_count} / 4 domains declared · ${presentation.covered_domain_count} IN SCOPE · ${presentation.not_applicable_domain_count} N/A · source observations: ${selectedScan?.scan_id ?? "none"}`,
    ),
  ];
  const domains = element("ul", "source-list");
  for (const domain of [
    "AUTHORITY",
    "EXECUTION",
    "COMMITMENT",
    "OPERATIONAL_STATE",
  ]) {
    const binding = bindings.get(domain);
    const item = element("li");
    item.append(
      element("strong", "", domain),
      document.createTextNode(
        binding
          ? `${scopeStatusText(binding.status)} · ${binding.source_ids.join(", ") || "no bound source"}`
          : "NOT DECLARED",
      ),
    );
    domains.append(item);
  }
  children.push(domains);

  const sources = element("ul", "source-list");
  for (const source of bundle.sources ?? []) {
    const observation = observationBySource.get(source.id);
    const item = element("li");
    item.append(
      element("strong", "", source.id),
      document.createTextNode(
        [
          source.stability_contract?.type,
          `coverage ${observation?.coverage ?? "—"}`,
          `attribution ${observation?.attribution_coverage ?? "—"}`,
        ].join(" · "),
      ),
    );
    sources.append(item);
  }
  children.push(sources);
  dom["sources-content"].replaceChildren(...children);
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = original;
    }, 1200);
  } catch {
    button.textContent = "Copy unavailable";
  }
}

function downloadJson(filename, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = element("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderCertificate() {
  const certificate = current.presentation.certificate;
  const content = dom["certificate-content"];
  const panel = dom["certificate-panel"];
  const summary = panel?.querySelector("summary");
  if (!certificate) {
    if (summary) {
      summary.textContent = "Closure certificate · not issued";
      summary.setAttribute("aria-disabled", "true");
      summary.tabIndex = -1;
    }
    if (panel) {
      panel.open = true;
      panel.classList.add("certificate-unavailable");
    }
    content.replaceChildren(element("p", "", "Not issued for this verdict."));
    return;
  }
  if (summary) {
    summary.textContent = "Closure certificate · issued";
    summary.removeAttribute("aria-disabled");
    summary.removeAttribute("tabindex");
  }
  if (panel) {
    panel.open = true;
    panel.classList.remove("certificate-unavailable");
  }
  const list = element("ul", "certificate-list");
  for (const [label, value] of [
    ["Claim", certificate.claim],
    ["Profile", certificate.profile_id],
    ["Root", certificate.root_id],
    ["Final scans", certificate.terminal_scan_ids],
    ["Closure-cone nodes", certificate.closure_cone_nodes],
    ["Domain status", certificate.domain_status],
    ["Scope digest", certificate.scope_digest],
    ["Closure-cone digest", certificate.closure_cone_digest],
    ["Evidence-bundle digest", certificate.evidence_bundle_digest],
  ]) {
    const item = element("li");
    item.append(
      element("strong", "", label),
      element("span", "digest", valueText(value)),
    );
    list.append(item);
  }
  const actions = element("div", "certificate-actions");
  const copyButton = element("button", "copy-button", "Copy certificate");
  copyButton.type = "button";
  copyButton.addEventListener("click", () =>
    copyText(JSON.stringify(certificate, null, 2), copyButton),
  );
  const downloadButton = element(
    "button",
    "copy-button",
    "Download evaluation JSON",
  );
  downloadButton.type = "button";
  downloadButton.addEventListener("click", () =>
    downloadJson(
      `${current.metadata?.id?.toLowerCase() ?? "closure"}-evaluation.json`,
      current.evaluation,
    ),
  );
  actions.append(copyButton, downloadButton);
  content.replaceChildren(list, actions);
}

function table(headers, rows, emptyMessage = null) {
  const wrapper = element("div", "table-wrap");
  if (!rows.length && emptyMessage) {
    wrapper.append(element("p", "empty-state", emptyMessage));
    return wrapper;
  }
  const created = element("table");
  const head = element("thead");
  const headerRow = element("tr");
  for (const header of headers) headerRow.append(element("th", "", header));
  head.append(headerRow);
  const body = element("tbody");
  for (const row of rows) {
    const tableRow = element("tr");
    for (const cell of row) tableRow.append(element("td", "", valueText(cell)));
    body.append(tableRow);
  }
  created.append(head, body);
  wrapper.append(created);
  return wrapper;
}

function residualEvidenceList(records) {
  const wrapper = element("div", "evidence-records");
  if (!records.length) {
    wrapper.append(element("p", "empty-state", "No residuals supplied."));
    return wrapper;
  }
  for (const record of records) {
    const details = element("details", "evidence-record");
    const summary = element(
      "summary",
      "",
      `${record.scan_id} · ${record.id} · ${record.class} · ${record.disposition} · ${record.effect} · root ${record.root_linkage}`,
    );
    const facts = compactFacts([
      ["scan", record.scan_id],
      ["residual", record.id],
      ["source", record.source_id],
      ["class", record.class],
      ["disposition", record.disposition],
      ["presence", record.presence],
      ["effect", record.effect],
      ["root linkage", record.root_linkage],
      ["settlement", record.settlement],
      ["successor", record.successor_id],
      ["transfer acceptance", record.transfer_acceptance],
      ["reported action", record.action_report?.reported],
      ["reported operation", record.action_report?.operation],
      ["evidence refs", record.evidence_refs],
    ]);
    details.append(summary, facts);
    wrapper.append(details);
  }
  return wrapper;
}

function evidenceSection(title, content) {
  const section = element("section", "evidence-section");
  section.append(element("h4", "", title), content);
  return section;
}

function renderEvidence() {
  const bundle = current.bundle;
  const residualRecords = [];
  const edgeRows = [];
  const sourceObservationRows = [];
  for (const scan of bundle.scans ?? []) {
    for (const observation of scan.sources ?? []) {
      sourceObservationRows.push([
        scan.scan_id,
        observation.source_id,
        observation.coverage,
        observation.attribution_coverage,
        observation.stability_witness,
      ]);
      for (const residual of observation.residuals ?? []) {
        residualRecords.push({
          ...structuredClone(residual),
          scan_id: scan.scan_id,
          source_id: observation.source_id,
        });
      }
      for (const edge of observation.lineage_edges ?? []) {
        edgeRows.push([
          scan.scan_id,
          edge.from,
          edge.type,
          edge.to,
          observation.source_id,
        ]);
      }
    }
  }

  dom["evidence-content"].replaceChildren(
    evidenceSection(
      "Root",
      compactFacts([
        ["id", bundle.root?.id],
        ["authority", bundle.root?.new_business_authority],
        ["quiesced at", bundle.root?.quiesced_at_ms],
        ["evidence ref", bundle.root?.quiescence_evidence_ref],
        ["profile", bundle.profile_id],
        ["time basis", bundle.time_basis],
      ]),
    ),
    evidenceSection(
      "Domain bindings",
      table(
        ["Domain", "Status", "Source IDs", "Evidence ref"],
        (bundle.domain_bindings ?? []).map((binding) => [
          binding.domain,
          binding.status,
          binding.source_ids,
          binding.evidence_ref,
        ]),
      ),
    ),
    evidenceSection(
      "Sources",
      table(
        ["Source", "Domains", "Stability contract"],
        (bundle.sources ?? []).map((source) => [
          source.id,
          source.domains,
          source.stability_contract,
        ]),
        "No sources declared.",
      ),
    ),
    evidenceSection(
      "Scans & source observations",
      table(
        [
          "Scan",
          "Source",
          "Coverage",
          "Attribution",
          "Stability witness",
        ],
        sourceObservationRows,
        "No source observations supplied.",
      ),
    ),
    evidenceSection(
      "Residuals",
      residualEvidenceList(residualRecords),
    ),
    evidenceSection(
      "Lineage",
      table(["Scan", "From", "Type", "To", "Source"], edgeRows, "No lineage edges supplied."),
    ),
  );
}

function selectTab(name) {
  const evaluationSelected = name === "evaluation";
  dom["evaluation-tab"].classList.toggle("active", evaluationSelected);
  dom["evaluation-tab"].setAttribute(
    "aria-selected",
    evaluationSelected ? "true" : "false",
  );
  dom["evidence-tab"].classList.toggle("active", !evaluationSelected);
  dom["evidence-tab"].setAttribute(
    "aria-selected",
    evaluationSelected ? "false" : "true",
  );
  dom["evaluation-view"].classList.toggle("hidden", !evaluationSelected);
  dom["evidence-view"].classList.toggle("hidden", evaluationSelected);
}

dom["open-file"].addEventListener("click", () => {
  if (localEvaluationAvailable) dom["file-input"].click();
});
dom["file-input"].addEventListener("change", async () => {
  const [file] = dom["file-input"].files;
  if (file) await evaluateFile(file);
  dom["file-input"].value = "";
});
dom["choose-another"].addEventListener("click", () => {
  current = null;
  dom.inspector.classList.add("hidden");
  dom.intro.classList.remove("hidden");
  dom["canonical-cases"].classList.remove("hidden");
  dom["canonical-cases"].scrollIntoView({ block: "start" });
});
dom["evaluation-tab"].addEventListener("click", () => selectTab("evaluation"));
dom["evidence-tab"].addEventListener("click", () => selectTab("evidence"));
dom["evaluation-tab"].addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") {
    dom["evidence-tab"].focus();
    selectTab("evidence");
  }
});
dom["evidence-tab"].addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    dom["evaluation-tab"].focus();
    selectTab("evaluation");
  }
});

await Promise.all([loadCaseIndex(), checkLocalCapability()]);
