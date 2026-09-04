#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
BASE="$REPO_ROOT/execution/rg3-v03"
DERIVE=/tmp/rg3-live-runtime-derivation-v035
PUBLIC=/tmp/rg3-public-v035
EXPECTED='99d2fec286ad2b1ffabf5e73eb65bdad6f66c3cf4470cc3d6e3891a8e9ae5651'
rm -rf "$DERIVE"; mkdir -p "$DERIVE" "$PUBLIC"
python "$BASE/derive_live_e0_v035.py" \
  --source "$BASE/run_live_e0_v034.sh" \
  --out "$DERIVE/run_live_e0_v035.derived.sh" \
  --receipt "$DERIVE/LIVE_DERIVATION_V035.json"
GOT="$(sha256sum "$DERIVE/run_live_e0_v035.derived.sh" | awk '{print $1}')"
if [[ "$GOT" != "$EXPECTED" ]]; then
  cp "$DERIVE/LIVE_DERIVATION_V035.json" "$PUBLIC/LIVE_DERIVATION_V035.json" || true
  printf '{"phase":"LIVE_DERIVATION","status":"FAIL","expected_sha256":"%s","actual_sha256":"%s","primary_evidence_consumed":false}\n' "$EXPECTED" "$GOT" > "$PUBLIC/E0_FAILURE.json"
  echo "v0.3.5 live runner derivation identity mismatch: $GOT" >&2
  exit 2
fi
bash -n "$DERIVE/run_live_e0_v035.derived.sh"
echo 'LIVE_V035_DERIVED_RUNNER_IDENTITY=PASS; PROVIDER_CALLS=0; PRIMARY_EVIDENCE=0'
set +e
bash "$DERIVE/run_live_e0_v035.derived.sh"
rc=$?
set -e
mkdir -p "$PUBLIC"
cp "$DERIVE/LIVE_DERIVATION_V035.json" "$PUBLIC/LIVE_DERIVATION_V035.json" || true
exit "$rc"
