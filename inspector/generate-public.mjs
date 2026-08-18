import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyClosure } from "../src/verify-closure.mjs";
import { PHASE1_PROVENANCE, presentEvaluation } from "./presentation.mjs";

const META_URL = new URL("./case-meta.json", import.meta.url);
const FIXTURES_URL = new URL("../fixtures/", import.meta.url);
const CASES_URL = new URL("./public/cases/", import.meta.url);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function generatePublicArtifacts({ write = true } = {}) {
  const caseMeta = JSON.parse(await readFile(META_URL, "utf8"));
  const artifacts = [];

  for (const metadata of caseMeta) {
    const bundle = JSON.parse(
      await readFile(new URL(metadata.file, FIXTURES_URL), "utf8"),
    );
    const evaluation = verifyClosure(bundle);
    const artifact = {
      metadata,
      provenance: PHASE1_PROVENANCE,
      bundle,
      evaluation,
      presentation: presentEvaluation(bundle, evaluation, metadata),
    };
    artifacts.push(artifact);
    if (write) {
      await writeFile(new URL(metadata.file, CASES_URL), stableJson(artifact));
    }
  }

  const index = artifacts.map(({ metadata, evaluation, provenance }) => ({
    ...metadata,
    verdict: evaluation.verdict,
    provenance,
  }));
  if (write) {
    await writeFile(new URL("index.json", CASES_URL), stableJson(index));
  }
  return { index, artifacts };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  await generatePublicArtifacts();
  console.log(
    `Generated 8 canonical Inspector artifacts in ${fileURLToPath(CASES_URL)}`,
  );
}
