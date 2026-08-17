#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { canonicalStringify } from "./canonicalize.mjs";
import { verifyClosure } from "./verify-closure.mjs";

function fail(code, details = {}) {
  process.stdout.write(
    `${canonicalStringify({ runner_state: "VALIDATION_ERROR", errors: [{ code, ...details }] })}\n`,
  );
  process.exitCode = 1;
}

const filePath = process.argv[2];
if (!filePath || process.argv.length !== 3) {
  fail("USAGE_ERROR", { expected: "node src/cli.mjs <evidence-bundle.json>" });
} else {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    fail("FILE_READ_ERROR", { path: filePath });
  }

  if (text !== undefined) {
    let bundle;
    try {
      bundle = JSON.parse(text);
    } catch {
      fail("MALFORMED_JSON", { path: filePath });
    }

    if (bundle !== undefined) {
      const result = verifyClosure(bundle);
      process.stdout.write(`${canonicalStringify(result)}\n`);
      if (result.runner_state === "VALIDATION_ERROR") process.exitCode = 1;
    }
  }
}
