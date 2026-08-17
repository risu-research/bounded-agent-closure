import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalStringify, sha256Digest } from "./canonicalize.mjs";

const PROFILE_DOMAINS = [
  "AUTHORITY",
  "COMMITMENT",
  "EXECUTION",
  "OPERATIONAL_STATE",
];

const schema = JSON.parse(
  readFileSync(new URL("../schemas/closure-evidence.schema.json", import.meta.url), "utf8"),
);
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareProblems(left, right) {
  return compareText(canonicalStringify(left), canonicalStringify(right));
}

function sortedProblems(problems) {
  return [...problems].sort(compareProblems);
}

function edgeKey(edge) {
  return canonicalStringify([edge.from, edge.to, edge.type]);
}

function transferTargetsRetiringRoot(residual, retiringRootId) {
  return (
    residual.disposition === "TRANSFER" &&
    residual.successor_id !== null &&
    (residual.successor_id === "$root" || residual.successor_id === retiringRootId)
  );
}

function validationError(errors) {
  return {
    runner_state: "VALIDATION_ERROR",
    errors: sortedProblems(errors),
  };
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function findCycle(edges) {
  const adjacency = new Map();
  for (const { from, to } of edges) {
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(to);
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(node) {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    if (visited.has(node)) return null;

    visiting.add(node);
    stack.push(node);
    for (const next of [...(adjacency.get(node) ?? [])].sort()) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  const nodes = new Set([...adjacency.keys()]);
  for (const targets of adjacency.values()) {
    for (const target of targets) nodes.add(target);
  }
  for (const node of [...nodes].sort()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

function semanticValidation(bundle) {
  const errors = [];
  const sourceById = new Map();
  const bindingByDomain = new Map();

  for (const sourceId of duplicateValues(bundle.sources.map(({ id }) => id))) {
    errors.push({ code: "DUPLICATE_SOURCE_ID", source_id: sourceId });
  }
  for (const source of bundle.sources) sourceById.set(source.id, source);

  for (const domain of duplicateValues(bundle.domain_bindings.map(({ domain }) => domain))) {
    errors.push({ code: "DUPLICATE_DOMAIN_BINDING", domain });
  }
  for (const binding of bundle.domain_bindings) bindingByDomain.set(binding.domain, binding);
  for (const domain of PROFILE_DOMAINS) {
    if (!bindingByDomain.has(domain)) {
      errors.push({ code: "MISSING_DOMAIN_BINDING", domain });
    }
  }

  const referencedSources = new Set();
  for (const binding of bundle.domain_bindings) {
    if (binding.status !== "COVERED") continue;
    for (const sourceId of binding.source_ids) {
      referencedSources.add(sourceId);
      const source = sourceById.get(sourceId);
      if (!source) {
        errors.push({
          code: "COVERED_BINDING_UNKNOWN_SOURCE",
          domain: binding.domain,
          source_id: sourceId,
        });
      } else if (!source.domains.includes(binding.domain)) {
        errors.push({
          code: "SOURCE_DOES_NOT_DECLARE_DOMAIN",
          domain: binding.domain,
          source_id: sourceId,
        });
      }
    }
  }
  for (const source of bundle.sources) {
    if (!referencedSources.has(source.id)) {
      errors.push({ code: "UNUSED_DECLARED_SOURCE", source_id: source.id });
    }
  }

  for (const scanId of duplicateValues(bundle.scans.map(({ scan_id }) => scan_id))) {
    errors.push({ code: "DUPLICATE_SCAN_ID", scan_id: scanId });
  }

  const identities = new Map();
  const edgeLedger = new Map();
  const previousBarrierBySource = new Map();
  const previousObservedThroughBySource = new Map();
  let previousObservedAt = -1;

  for (const scan of bundle.scans) {
    if (scan.observed_at_ms < previousObservedAt) {
      errors.push({
        code: "NON_MONOTONIC_SCAN_TIME",
        scan_id: scan.scan_id,
        observed_at_ms: scan.observed_at_ms,
        previous_observed_at_ms: previousObservedAt,
      });
    }
    previousObservedAt = scan.observed_at_ms;

    const observationIds = scan.sources.map(({ source_id }) => source_id);
    for (const sourceId of duplicateValues(observationIds)) {
      errors.push({
        code: "DUPLICATE_SOURCE_OBSERVATION",
        scan_id: scan.scan_id,
        source_id: sourceId,
      });
    }
    const observationIdSet = new Set(observationIds);
    for (const source of bundle.sources) {
      if (!observationIdSet.has(source.id)) {
        errors.push({
          code: "MISSING_SOURCE_OBSERVATION",
          scan_id: scan.scan_id,
          source_id: source.id,
        });
      }
    }
    for (const sourceId of [...observationIdSet].sort()) {
      if (!sourceById.has(sourceId)) {
        errors.push({
          code: "UNKNOWN_SOURCE_OBSERVATION",
          scan_id: scan.scan_id,
          source_id: sourceId,
        });
      }
    }

    const currentResidualIds = [];
    for (const observation of scan.sources) {
      const source = sourceById.get(observation.source_id);
      if (source) {
        const contractType = source.stability_contract.type;
        const witness = observation.stability_witness;
        const validBarrier =
          contractType === "MONOTONIC_BARRIER" &&
          witness !== null &&
          typeof witness.barrier === "number" &&
          typeof witness.barrier_captured_at_ms === "number" &&
          typeof witness.observed_through === "number";
        const completeBarrierObservation =
          contractType === "MONOTONIC_BARRIER" &&
          observation.coverage === "COMPLETE" &&
          observation.attribution_coverage === "COMPLETE";
        const validUnavailableBarrierWitness =
          contractType === "MONOTONIC_BARRIER" &&
          !completeBarrierObservation &&
          (witness === null || validBarrier);
        const validNullWitness =
          contractType !== "MONOTONIC_BARRIER" && witness === null;
        const validWitness =
          validBarrier || validUnavailableBarrierWitness || validNullWitness;
        if (!validWitness || (completeBarrierObservation && !validBarrier)) {
          errors.push({
            code: "INVALID_STABILITY_WITNESS",
            scan_id: scan.scan_id,
            source_id: observation.source_id,
            stability_contract: contractType,
          });
        }
        if (validBarrier) {
          if (witness.barrier_captured_at_ms > scan.observed_at_ms) {
            errors.push({
              barrier_captured_at_ms: witness.barrier_captured_at_ms,
              code: "BARRIER_AFTER_SCAN",
              observed_at_ms: scan.observed_at_ms,
              scan_id: scan.scan_id,
              source_id: observation.source_id,
            });
          }
          const previousBarrier = previousBarrierBySource.get(observation.source_id);
          if (previousBarrier !== undefined && witness.barrier < previousBarrier) {
            errors.push({
              barrier: witness.barrier,
              code: "BARRIER_REGRESSED",
              previous_barrier: previousBarrier,
              scan_id: scan.scan_id,
              source_id: observation.source_id,
            });
          }
          const previousObservedThrough = previousObservedThroughBySource.get(
            observation.source_id,
          );
          if (
            previousObservedThrough !== undefined &&
            witness.observed_through < previousObservedThrough
          ) {
            errors.push({
              code: "OBSERVED_THROUGH_REGRESSED",
              observed_through: witness.observed_through,
              previous_observed_through: previousObservedThrough,
              scan_id: scan.scan_id,
              source_id: observation.source_id,
            });
          }
          previousBarrierBySource.set(observation.source_id, witness.barrier);
          previousObservedThroughBySource.set(
            observation.source_id,
            witness.observed_through,
          );
        }
      }

      for (const residual of observation.residuals) {
        currentResidualIds.push(residual.id);
        if (residual.id === "$root") {
          errors.push({ code: "RESERVED_RESIDUAL_ID", scan_id: scan.scan_id, residual_id: residual.id });
          continue;
        }
        const binding = bindingByDomain.get(residual.class);
        if (binding?.status === "NOT_APPLICABLE") {
          errors.push({
            code: "RESIDUAL_IN_NOT_APPLICABLE_DOMAIN",
            domain: residual.class,
            residual_id: residual.id,
            scan_id: scan.scan_id,
          });
        }
        if (source && !source.domains.includes(residual.class)) {
          errors.push({
            code: "RESIDUAL_DOMAIN_NOT_DECLARED_BY_SOURCE",
            domain: residual.class,
            residual_id: residual.id,
            scan_id: scan.scan_id,
            source_id: observation.source_id,
          });
        }

        const identity = identities.get(residual.id);
        if (!identity) {
          identities.set(residual.id, {
            class: residual.class,
            source_id: observation.source_id,
          });
        } else {
          if (identity.class !== residual.class) {
            errors.push({
              code: "RESIDUAL_CLASS_CHANGED",
              actual_class: residual.class,
              expected_class: identity.class,
              residual_id: residual.id,
              scan_id: scan.scan_id,
            });
          }
          if (identity.source_id !== observation.source_id) {
            errors.push({
              code: "RESIDUAL_SOURCE_CHANGED",
              actual_source_id: observation.source_id,
              expected_source_id: identity.source_id,
              residual_id: residual.id,
              scan_id: scan.scan_id,
            });
          }
        }
      }
    }

    for (const residualId of duplicateValues(currentResidualIds)) {
      errors.push({
        code: "DUPLICATE_RESIDUAL_OBSERVATION",
        residual_id: residualId,
        scan_id: scan.scan_id,
      });
    }

    const knownThroughCurrentScan = new Set(identities.keys());
    for (const observation of scan.sources) {
      for (const edge of observation.lineage_edges) {
        if (edge.from === edge.to) {
          errors.push({
            code: "LINEAGE_SELF_EDGE",
            residual_id: edge.from,
            scan_id: scan.scan_id,
          });
        }
        if (edge.to === "$root" || !knownThroughCurrentScan.has(edge.to)) {
          errors.push({
            code: "DANGLING_LINEAGE_TO",
            residual_id: edge.to,
            scan_id: scan.scan_id,
          });
        }
        if (edge.from !== "$root" && !knownThroughCurrentScan.has(edge.from)) {
          errors.push({
            code: "DANGLING_LINEAGE_FROM",
            residual_id: edge.from,
            scan_id: scan.scan_id,
          });
        }
        edgeLedger.set(edgeKey(edge), {
          from: edge.from,
          to: edge.to,
          type: edge.type,
        });
      }
    }
  }

  const cycle = findCycle([...edgeLedger.values()]);
  if (cycle) errors.push({ code: "LINEAGE_CYCLE", path: cycle });
  return errors;
}

export function validateEvidenceBundle(bundle) {
  if (!validateSchema(bundle)) {
    return validationError(
      validateSchema.errors.map((error) => ({
        code: "SCHEMA_VALIDATION_ERROR",
        instance_path: error.instancePath,
        keyword: error.keyword,
        message: error.message,
        schema_path: error.schemaPath,
      })),
    );
  }
  const errors = semanticValidation(bundle);
  return errors.length > 0 ? validationError(errors) : null;
}

export function terminality(residual, retiringRootId = null) {
  switch (residual.disposition) {
    case "NONE":
      return "NONTERMINAL";
    case "EXTINGUISH":
      if (residual.effect === "ACTIVE" || residual.root_linkage === "LIVE") {
        return "NONTERMINAL";
      }
      if (
        residual.root_linkage === "ENDED" &&
        (residual.presence === "ABSENT" ||
          (residual.presence === "PRESENT" && residual.effect === "INERT"))
      ) {
        return "TERMINAL";
      }
      return "UNKNOWN";
    case "SETTLE":
      if (
        residual.settlement === "SETTLED" &&
        residual.effect === "INERT" &&
        residual.root_linkage === "ENDED"
      ) {
        return "TERMINAL";
      }
      if (
        residual.settlement === "PENDING" ||
        residual.settlement === "NOT_APPLICABLE" ||
        residual.effect === "ACTIVE" ||
        residual.root_linkage === "LIVE"
      ) {
        return "NONTERMINAL";
      }
      return "UNKNOWN";
    case "TRANSFER":
      if (transferTargetsRetiringRoot(residual, retiringRootId)) {
        return "NONTERMINAL";
      }
      if (
        residual.root_linkage === "ENDED" &&
        residual.successor_id !== null &&
        residual.transfer_acceptance === "ACCEPTED"
      ) {
        return "TERMINAL";
      }
      if (
        residual.root_linkage === "LIVE" ||
        residual.successor_id === null ||
        residual.transfer_acceptance === "REJECTED" ||
        residual.transfer_acceptance === "NOT_APPLICABLE"
      ) {
        return "NONTERMINAL";
      }
      return "UNKNOWN";
    case "RETAIN":
      if (
        residual.presence === "PRESENT" &&
        residual.effect === "INERT" &&
        residual.root_linkage === "ENDED"
      ) {
        return "TERMINAL";
      }
      if (
        residual.presence === "ABSENT" ||
        residual.effect === "ACTIVE" ||
        residual.root_linkage === "LIVE"
      ) {
        return "NONTERMINAL";
      }
      return "UNKNOWN";
    default:
      throw new Error(`Unsupported disposition: ${residual.disposition}`);
  }
}

function adjacencyFor(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    adjacency.get(edge.from).add(edge.to);
  }
  return adjacency;
}

function closureCone(edges) {
  const adjacency = adjacencyFor(edges);
  const reachable = new Set();
  const queue = ["$root"];
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    for (const next of [...(adjacency.get(node) ?? [])].sort()) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  return reachable;
}

function lineagePath(edges, target) {
  const adjacency = adjacencyFor(edges);
  const queue = [["$root"]];
  const visited = new Set(["$root"]);
  for (let index = 0; index < queue.length; index += 1) {
    const path = queue[index];
    const node = path.at(-1);
    for (const next of [...(adjacency.get(node) ?? [])].sort()) {
      const nextPath = [...path, next];
      if (next === target) return nextPath;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(nextPath);
      }
    }
  }
  return [];
}

function normalizedBindings(bundle) {
  return bundle.domain_bindings
    .map((binding) => ({
      domain: binding.domain,
      source_ids: [...binding.source_ids].sort(),
      status: binding.status,
    }))
    .sort((left, right) => compareText(left.domain, right.domain));
}

function normalizedSources(bundle, includeContract = false) {
  return bundle.sources
    .map((source) => ({
      domains: [...source.domains].sort(),
      id: source.id,
      ...(includeContract ? { stability_contract: source.stability_contract } : {}),
    }))
    .sort((left, right) => compareText(left.id, right.id));
}

export function scopeDigest(bundle) {
  return sha256Digest({
    domain_bindings: normalizedBindings(bundle),
    profile_id: bundle.profile_id,
    root_id: bundle.root.id,
    sources: normalizedSources(bundle, true),
    spec_version: bundle.spec_version,
    time_basis: bundle.time_basis,
  });
}

function evidenceBundleDigest(bundle) {
  return sha256Digest(bundle);
}

export function semanticClosureCone(bundle, cone, currentResiduals, edges) {
  const residuals = [...cone]
    .sort()
    .map((id) => {
      const { residual, source_id: owningSource } = currentResiduals.get(id);
      return {
        class: residual.class,
        disposition: residual.disposition,
        effect: residual.effect,
        id: residual.id,
        owning_source: owningSource,
        presence: residual.presence,
        root_linkage: residual.root_linkage,
        settlement: residual.settlement,
        successor_id: residual.successor_id,
        transfer_acceptance: residual.transfer_acceptance,
      };
    });
  const includedNodes = new Set(["$root", ...cone]);
  const includedEdges = edges
    .filter(({ from, to }) => includedNodes.has(from) && includedNodes.has(to))
    .map(({ from, to, type }) => ({ from, to, type }))
    .sort(
      (left, right) =>
        compareText(left.from, right.from) ||
        compareText(left.to, right.to) ||
        compareText(left.type, right.type),
    );

  return {
    domain_bindings: normalizedBindings(bundle),
    edges: includedEdges,
    profile_id: bundle.profile_id,
    residuals,
    root: {
      id: bundle.root.id,
      new_business_authority: bundle.root.new_business_authority,
    },
    sources: normalizedSources(bundle),
  };
}

function sourceUnknowns(bundle, scan) {
  const sourceById = new Map(bundle.sources.map((source) => [source.id, source]));
  const unknowns = [];
  for (const observation of [...scan.sources].sort((a, b) => compareText(a.source_id, b.source_id))) {
    const source = sourceById.get(observation.source_id);
    if (observation.coverage === "PARTIAL") {
      unknowns.push({ code: "SOURCE_COVERAGE_PARTIAL", source_id: observation.source_id });
    } else if (observation.coverage === "UNAVAILABLE") {
      unknowns.push({ code: "SOURCE_UNAVAILABLE", source_id: observation.source_id });
    }
    if (observation.attribution_coverage === "PARTIAL") {
      unknowns.push({ code: "ATTRIBUTION_COVERAGE_PARTIAL", source_id: observation.source_id });
    } else if (observation.attribution_coverage === "UNAVAILABLE") {
      unknowns.push({ code: "ATTRIBUTION_UNAVAILABLE", source_id: observation.source_id });
    }

    const contract = source.stability_contract;
    if (contract.type === "UNBOUNDED") {
      unknowns.push({ code: "UNBOUNDED_STABILITY", source_id: source.id });
    } else if (contract.type === "MONOTONIC_BARRIER" && observation.stability_witness !== null) {
      if (observation.stability_witness.barrier_captured_at_ms < bundle.root.quiesced_at_ms) {
        unknowns.push({
          code: "BARRIER_PRECEDES_QUIESCENCE",
          source_id: source.id,
        });
      }
      if (
        observation.stability_witness.observed_through <
        observation.stability_witness.barrier
      ) {
        unknowns.push({
          code: "STABILITY_NOT_SATISFIED",
          source_id: source.id,
          stability_contract: "MONOTONIC_BARRIER",
        });
      }
    } else if (
      contract.type === "BOUNDED_LAG" &&
      scan.observed_at_ms < bundle.root.quiesced_at_ms + contract.max_visibility_lag_ms
    ) {
      unknowns.push({
        code: "STABILITY_NOT_SATISFIED",
        source_id: source.id,
        stability_contract: "BOUNDED_LAG",
      });
    }
  }
  return unknowns;
}

function boundedLagConfirmationUnknowns(bundle, previousScan, finalScan) {
  const elapsedMs = finalScan.observed_at_ms - previousScan.observed_at_ms;
  return sortedProblems(
    bundle.sources
      .filter(({ stability_contract: contract }) => contract.type === "BOUNDED_LAG")
      .filter(
        ({ stability_contract: contract }) => elapsedMs < contract.max_visibility_lag_ms,
      )
      .map((source) => ({
        code: "BOUNDED_LAG_CONFIRMATION_WINDOW_NOT_ELAPSED",
        required_lag_ms: source.stability_contract.max_visibility_lag_ms,
        source_id: source.id,
      })),
  );
}

function evaluatePass(bundle, scan, cone, currentResiduals, edges) {
  const blockers = [];
  const unknowns = sourceUnknowns(bundle, scan);

  if (scan.observed_at_ms < bundle.root.quiesced_at_ms) {
    unknowns.push({ code: "SCAN_PRECEDES_QUIESCENCE", scan_id: scan.scan_id });
  }

  if (bundle.root.new_business_authority === "ACTIVE") {
    blockers.push({ code: "ROOT_AUTHORITY_ACTIVE", root_id: bundle.root.id });
  } else if (bundle.root.new_business_authority === "UNKNOWN") {
    unknowns.push({ code: "ROOT_AUTHORITY_UNKNOWN", root_id: bundle.root.id });
  }

  for (const residualId of [...cone].sort()) {
    const observed = currentResiduals.get(residualId);
    if (!observed) {
      unknowns.push({ code: "NODE_NOT_REOBSERVED", residual_id: residualId });
      continue;
    }
    const state = terminality(observed.residual, bundle.root.id);
    if (state === "NONTERMINAL") {
      blockers.push({
        code:
          observed.residual.disposition === "NONE"
            ? "RESIDUAL_DISPOSITION_NONE"
            : transferTargetsRetiringRoot(observed.residual, bundle.root.id)
              ? "TRANSFER_TO_RETIRING_ROOT"
              : "RESIDUAL_NONTERMINAL",
        path: lineagePath(edges, residualId),
        residual_id: residualId,
        source_id: observed.source_id,
      });
    } else if (state === "UNKNOWN") {
      unknowns.push({
        code: "RESIDUAL_TERMINALITY_UNKNOWN",
        path: lineagePath(edges, residualId),
        residual_id: residualId,
        source_id: observed.source_id,
      });
    }
  }

  const sortedBlockers = sortedProblems(blockers);
  const sortedUnknowns = sortedProblems(unknowns);
  const terminalQualified = sortedBlockers.length === 0 && sortedUnknowns.length === 0;
  const semantic = terminalQualified
    ? semanticClosureCone(bundle, cone, currentResiduals, edges)
    : null;

  return {
    blockers: sortedBlockers,
    pass: {
      scan_id: scan.scan_id,
      closure_cone_nodes: cone.size,
      terminal_qualified: terminalQualified,
      semantic_signature: semantic === null ? null : sha256Digest(semantic),
    },
    unknowns: sortedUnknowns,
  };
}

export function verifyClosure(bundle) {
  const invalid = validateEvidenceBundle(bundle);
  if (invalid) return invalid;

  const edgeLedger = new Map();
  const passes = [];
  const passDetails = [];

  for (const scan of bundle.scans) {
    const currentResiduals = new Map();
    for (const observation of scan.sources) {
      for (const residual of observation.residuals) {
        currentResiduals.set(residual.id, {
          residual,
          source_id: observation.source_id,
        });
      }
      for (const edge of observation.lineage_edges) {
        edgeLedger.set(edgeKey(edge), {
          from: edge.from,
          to: edge.to,
          type: edge.type,
        });
      }
    }
    const edges = [...edgeLedger.values()].sort(
      (left, right) =>
        compareText(left.from, right.from) ||
        compareText(left.to, right.to) ||
        compareText(left.type, right.type),
    );
    const cone = closureCone(edges);
    const detail = evaluatePass(bundle, scan, cone, currentResiduals, edges);
    passes.push(detail.pass);
    passDetails.push(detail);
  }

  const latestIndex = passes.length - 1;
  const latest = passDetails[latestIndex];
  const previous = latestIndex > 0 ? passDetails[latestIndex - 1] : null;
  let blockers = [...latest.blockers];
  let unknowns = [...latest.unknowns];
  let verdict;

  if (blockers.length > 0) {
    verdict = "INCOMPLETE";
  } else if (unknowns.length > 0) {
    verdict = "UNKNOWN";
  } else if (latest.pass.terminal_qualified && previous?.pass.terminal_qualified) {
    if (latest.pass.semantic_signature !== previous.pass.semantic_signature) {
      verdict = "INCOMPLETE";
      blockers = sortedProblems([
        {
          code: "CONE_NOT_STABLE",
          scan_ids: [previous.pass.scan_id, latest.pass.scan_id],
        },
      ]);
    } else {
      const confirmationUnknowns = boundedLagConfirmationUnknowns(
        bundle,
        bundle.scans[latestIndex - 1],
        bundle.scans[latestIndex],
      );
      if (confirmationUnknowns.length > 0) {
        verdict = "UNKNOWN";
        unknowns = confirmationUnknowns;
      } else {
        verdict = "CLOSED";
      }
    }
  } else {
    verdict = "UNKNOWN";
    unknowns = sortedProblems([
      ...unknowns,
      { code: "SECOND_CONFIRMATION_MISSING", scan_id: latest.pass.scan_id },
    ]);
  }

  let certificate = null;
  if (verdict === "CLOSED") {
    certificate = {
      claim: "CLOSED within RISU_AGENT_CLOSURE_V0 and the declared source contracts.",
      closure_cone_digest: latest.pass.semantic_signature,
      closure_cone_nodes: latest.pass.closure_cone_nodes,
      domain_status: Object.fromEntries(
        [...bundle.domain_bindings]
          .sort((left, right) => compareText(left.domain, right.domain))
          .map(({ domain, status }) => [domain, status]),
      ),
      evidence_bundle_digest: evidenceBundleDigest(bundle),
      profile_id: bundle.profile_id,
      root_id: bundle.root.id,
      scope_digest: scopeDigest(bundle),
      terminal_scan_ids: [previous.pass.scan_id, latest.pass.scan_id],
      unknown_count: 0,
    };
  }

  return {
    verdict,
    latest_scan_id: bundle.scans.at(-1).scan_id,
    blockers: sortedProblems(blockers),
    unknowns: sortedProblems(unknowns),
    passes,
    certificate,
  };
}
