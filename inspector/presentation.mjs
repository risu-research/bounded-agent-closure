const EXPLANATIONS = Object.freeze({
  RESIDUAL_NONTERMINAL: "A reachable residual was classified as nonterminal.",
  RESIDUAL_DISPOSITION_NONE: "A reachable residual has no terminal disposition.",
  TRANSFER_TO_RETIRING_ROOT: "A transfer targets the retiring root and remains nonterminal.",
  ROOT_AUTHORITY_ACTIVE: "The retiring root still has active new-business authority.",
  CONE_NOT_STABLE: "The final qualified observations have different semantic signatures.",
  SOURCE_COVERAGE_PARTIAL: "The source reports only partial coverage.",
  SOURCE_UNAVAILABLE: "The source was unavailable for this observation.",
  ATTRIBUTION_COVERAGE_PARTIAL: "The source reports only partial root-attribution coverage.",
  ATTRIBUTION_UNAVAILABLE: "Root-attribution coverage was unavailable.",
  UNBOUNDED_STABILITY: "The declared source contract does not establish a bounded visibility horizon.",
  BARRIER_PRECEDES_QUIESCENCE: "The stability barrier was captured before root quiescence.",
  STABILITY_NOT_SATISFIED: "The declared source stability condition was not satisfied.",
  SCAN_PRECEDES_QUIESCENCE: "The scan occurred before the declared root quiescence point.",
  ROOT_AUTHORITY_UNKNOWN: "The root authority state is unknown.",
  NODE_NOT_REOBSERVED: "A known lineage node was not reobserved in the scan.",
  RESIDUAL_TERMINALITY_UNKNOWN: "The observed residual state does not establish terminality.",
  SECOND_CONFIRMATION_MISSING: "A second matching terminal-qualified observation is required.",
  BOUNDED_LAG_CONFIRMATION_WINDOW_NOT_ELAPSED:
    "The final confirmation interval is shorter than the declared visibility lag.",
  SCHEMA_VALIDATION_ERROR: "The evidence does not conform to the required bundle schema.",
  DUPLICATE_SOURCE_ID: "A source identifier is declared more than once.",
  DUPLICATE_DOMAIN_BINDING: "A domain binding is declared more than once.",
  MISSING_DOMAIN_BINDING: "A required profile domain binding is missing.",
  COVERED_BINDING_UNKNOWN_SOURCE: "A covered domain binding references an undeclared source.",
  SOURCE_DOES_NOT_DECLARE_DOMAIN: "The bound source does not declare the referenced domain.",
  UNUSED_DECLARED_SOURCE: "A declared source is not used by a covered domain binding.",
  DUPLICATE_SCAN_ID: "A scan identifier is used more than once.",
  NON_MONOTONIC_SCAN_TIME: "Scan observation time regressed.",
  DUPLICATE_SOURCE_OBSERVATION: "A scan contains duplicate observations for one source.",
  MISSING_SOURCE_OBSERVATION: "A declared source has no observation in the scan.",
  UNKNOWN_SOURCE_OBSERVATION: "A scan contains an observation for an undeclared source.",
  INVALID_STABILITY_WITNESS: "A source observation has an invalid stability witness.",
  BARRIER_AFTER_SCAN: "A stability barrier was captured after its containing scan.",
  BARRIER_REGRESSED: "A source stability barrier regressed between scans.",
  OBSERVED_THROUGH_REGRESSED: "A source observed-through position regressed between scans.",
  RESERVED_RESIDUAL_ID: "A residual uses the reserved root sentinel identifier.",
  RESIDUAL_IN_NOT_APPLICABLE_DOMAIN:
    "A residual appears in a domain declared not applicable.",
  RESIDUAL_DOMAIN_NOT_DECLARED_BY_SOURCE:
    "A residual class is not declared by its owning source.",
  RESIDUAL_CLASS_CHANGED: "A residual changed class between observations.",
  RESIDUAL_SOURCE_CHANGED: "A residual changed owning source between observations.",
  DUPLICATE_RESIDUAL_OBSERVATION: "A residual is observed more than once in one scan.",
  LINEAGE_SELF_EDGE: "A lineage edge points from a residual to itself.",
  DANGLING_LINEAGE_TO: "A lineage edge targets an unknown residual.",
  DANGLING_LINEAGE_FROM: "A lineage edge starts at an unknown residual.",
  LINEAGE_CYCLE: "The supplied lineage contains a cycle.",
  MALFORMED_JSON: "The uploaded file is not valid JSON.",
  REQUEST_BODY_TOO_LARGE: "The uploaded evidence exceeds the local request-size limit.",
});

const FACT_FIELDS = Object.freeze([
  "class",
  "disposition",
  "presence",
  "effect",
  "root_linkage",
  "settlement",
  "successor_id",
  "transfer_acceptance",
]);

export const PHASE1_PROVENANCE = Object.freeze({
  tag: "phase1-freeze-v0.3",
  commit: "a46456f028cd3dd1d386111b1faab890a26ae5e9",
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compareText(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function explainCode(code) {
  return (
    EXPLANATIONS[code] ??
    "No display explanation is registered for this machine code."
  );
}

export function presentProblem(problem) {
  const code = typeof problem?.code === "string" ? problem.code : "UNRECOGNIZED_CODE";
  return {
    code,
    explanation: explainCode(code),
    facts: copy(problem ?? {}),
  };
}

function flattenScan(scan) {
  const residuals = [];
  const edges = [];
  for (const observation of asArray(scan?.sources)) {
    for (const residual of asArray(observation?.residuals)) {
      residuals.push({
        ...copy(residual),
        source_id: observation.source_id,
      });
    }
    for (const edge of asArray(observation?.lineage_edges)) {
      edges.push({
        ...copy(edge),
        source_id: observation.source_id,
      });
    }
  }
  residuals.sort((left, right) => compareText(left.id, right.id));
  edges.sort(
    (left, right) =>
      compareText(left.from, right.from) ||
      compareText(left.to, right.to) ||
      compareText(left.type, right.type),
  );
  return { residuals, edges };
}

function diffResidual(previous, current, seenBefore = false) {
  if (!previous) {
    return [
      {
        field: "observation",
        before: seenBefore ? "NOT_REOBSERVED" : null,
        after: seenBefore ? "REOBSERVED" : "FIRST_OBSERVED",
      },
    ];
  }
  const changes = [];
  for (const field of FACT_FIELDS) {
    if (previous[field] !== current[field]) {
      changes.push({ field, before: previous[field], after: current[field] });
    }
  }
  const previousReport = previous.action_report?.reported ?? null;
  const currentReport = current.action_report?.reported ?? null;
  if (previousReport !== currentReport) {
    changes.push({
      field: "action_report.reported",
      before: previousReport,
      after: currentReport,
    });
  }
  return changes;
}

function scanPresentations(bundle, evaluation) {
  const passById = new Map(
    asArray(evaluation?.passes).map((pass) => [pass.scan_id, pass]),
  );
  const edgeLedger = new Map();
  const identityLedger = new Map();
  const seenResidualIds = new Set();
  let previousResiduals = new Map();

  return asArray(bundle?.scans).map((scan, index) => {
    const seenBeforeScan = new Set(seenResidualIds);
    const flattened = flattenScan(scan);
    const currentResiduals = new Map(
      flattened.residuals.map((residual) => [residual.id, residual]),
    );
    for (const residual of flattened.residuals) {
      identityLedger.set(residual.id, {
        id: residual.id,
        class: residual.class,
        source_id: residual.source_id,
      });
    }
    for (const edge of flattened.edges) {
      const key = JSON.stringify([edge.from, edge.to, edge.type]);
      edgeLedger.set(key, edge);
    }

    const nodes = [
      {
        id: "$root",
        label: bundle?.root?.id ?? "$root",
        kind: "ROOT",
        observed: true,
        facts: copy(bundle?.root ?? {}),
      },
      ...[...identityLedger.values()]
        .sort((left, right) => compareText(left.id, right.id))
        .map((identity) => {
          const residual = currentResiduals.get(identity.id);
          return {
            id: identity.id,
            label: identity.id,
            kind: "RESIDUAL",
            observed: Boolean(residual),
            class: residual?.class ?? identity.class,
            source_id: residual?.source_id ?? identity.source_id,
            facts: copy(residual ?? identity),
            changes: residual
              ? diffResidual(
                  previousResiduals.get(identity.id),
                  residual,
                  seenBeforeScan.has(identity.id),
                )
              : [],
          };
        }),
    ];

    for (const residual of flattened.residuals) {
      seenResidualIds.add(residual.id);
    }
    previousResiduals = currentResiduals;
    return {
      index,
      scan_id: scan.scan_id,
      observed_at_ms: scan.observed_at_ms,
      pass: copy(passById.get(scan.scan_id) ?? null),
      sources: copy(asArray(scan.sources)),
      nodes,
      edges: [...edgeLedger.values()].map(copy),
    };
  });
}

function verdictCopy(verdict) {
  if (verdict === "INCOMPLETE") {
    return {
      summary: "A known blocker prevents bounded operational closure.",
      detail: "The verifier reported one or more closure blockers.",
    };
  }
  if (verdict === "UNKNOWN") {
    return {
      summary: "Available evidence is insufficient to establish closure.",
      detail: "No known blocker establishes failure. Closure is not established either.",
    };
  }
  if (verdict === "CLOSED") {
    return {
      summary: "Closure was established within the declared profile and source contracts.",
      detail:
        "The final two scans were terminal-qualified with the same semantic signature, and no remaining confirmation uncertainty prevented closure.",
    };
  }
  return {
    summary: "No closure verdict was supplied.",
    detail: "The presentation does not infer a verdict from evidence fields.",
  };
}

function actionReports(bundle) {
  const reports = [];
  for (const scan of asArray(bundle?.scans)) {
    for (const observation of asArray(scan?.sources)) {
      for (const residual of asArray(observation?.residuals)) {
        if (residual.action_report) {
          reports.push({
            scan_id: scan.scan_id,
            residual_id: residual.id,
            reported_operation: copy(residual.action_report),
            observed_state: {
              presence: residual.presence,
              effect: residual.effect,
              root_linkage: residual.root_linkage,
            },
          });
        }
      }
    }
  }
  return reports;
}

function actionReportsForBlockers(bundle, blockers, latestScanId) {
  const blockerKeys = new Set(
    asArray(blockers)
      .filter((problem) => typeof problem?.residual_id === "string")
      .map((problem) =>
        JSON.stringify([problem.residual_id, problem.source_id ?? null]),
      ),
  );
  if (!blockerKeys.size) return [];

  const latestScan = asArray(bundle?.scans).find(
    (scan) => scan?.scan_id === latestScanId,
  );
  if (!latestScan) return [];

  const reports = [];
  for (const observation of asArray(latestScan.sources)) {
    for (const residual of asArray(observation?.residuals)) {
      if (!residual.action_report) continue;
      const exactKey = JSON.stringify([residual.id, observation.source_id ?? null]);
      const idOnlyKey = JSON.stringify([residual.id, null]);
      if (!blockerKeys.has(exactKey) && !blockerKeys.has(idOnlyKey)) continue;
      reports.push({
        scan_id: latestScan.scan_id,
        residual_id: residual.id,
        source_id: observation.source_id ?? null,
        reported_operation: copy(residual.action_report),
        observed_state: {
          presence: residual.presence,
          effect: residual.effect,
          root_linkage: residual.root_linkage,
        },
      });
    }
  }
  return reports;
}

function transfers(bundle) {
  const found = [];
  for (const scan of asArray(bundle?.scans)) {
    for (const observation of asArray(scan?.sources)) {
      for (const residual of asArray(observation?.residuals)) {
        if (residual.disposition === "TRANSFER") {
          found.push({
            scan_id: scan.scan_id,
            residual_id: residual.id,
            presence: residual.presence,
            effect: residual.effect,
            root_linkage: residual.root_linkage,
            successor_id: residual.successor_id,
            transfer_acceptance: residual.transfer_acceptance,
          });
        }
      }
    }
  }
  return found;
}

export function presentValidationError(evaluation) {
  return {
    runner_state: "VALIDATION_ERROR",
    title: "Evidence could not be evaluated",
    notice: "No verdict issued.",
    errors: asArray(evaluation?.errors).map(presentProblem),
  };
}

export function presentParseError(code = "MALFORMED_JSON", message = "Invalid JSON.") {
  return {
    runner_state: "PARSE_ERROR",
    title: "Evidence could not be evaluated",
    notice: "No verdict issued.",
    errors: [
      {
        code,
        explanation: explainCode(code),
        facts: { code, message },
      },
    ],
  };
}

export function presentEvaluation(bundle, evaluation, metadata = null) {
  if (evaluation?.runner_state === "VALIDATION_ERROR") {
    return presentValidationError(evaluation);
  }

  const verdict = evaluation?.verdict ?? null;
  const rawBlockers = asArray(evaluation?.blockers);
  const blockers = rawBlockers.map(presentProblem);
  const unknowns = asArray(evaluation?.unknowns).map(presentProblem);
  const bindings = asArray(bundle?.domain_bindings);
  const scans = scanPresentations(bundle, evaluation);

  return {
    runner_state: "EVALUATED",
    verdict,
    verdict_copy: verdictCopy(verdict),
    root: {
      id: bundle?.root?.id ?? null,
      authority: bundle?.root?.new_business_authority ?? null,
    },
    profile_id: bundle?.profile_id ?? null,
    latest_scan_id: evaluation?.latest_scan_id ?? null,
    closure_cone_nodes: asArray(evaluation?.passes).at(-1)?.closure_cone_nodes ?? null,
    declared_domain_count: bindings.length,
    covered_domain_count: bindings.filter((binding) => binding.status === "COVERED").length,
    not_applicable_domain_count: bindings.filter(
      (binding) => binding.status === "NOT_APPLICABLE",
    ).length,
    blockers,
    unknowns,
    blocker_paths: blockers
      .map(({ facts }) => facts.path)
      .filter((path) => Array.isArray(path))
      .map(copy),
    scans,
    action_reports: actionReports(bundle),
    reason_action_reports: actionReportsForBlockers(
      bundle,
      rawBlockers,
      evaluation?.latest_scan_id ?? null,
    ),
    transfers: transfers(bundle),
    certificate: copy(evaluation?.certificate ?? null),
    metadata: copy(metadata),
    provenance: copy(PHASE1_PROVENANCE),
  };
}
