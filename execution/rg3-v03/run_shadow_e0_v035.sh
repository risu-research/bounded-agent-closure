#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="${GITHUB_WORKSPACE:-$(pwd)}"; BASE="$REPO_ROOT/execution/rg3-v03"
WORK=/tmp/rg3-shadow-v035; OUT=/tmp/rg3-shadow-v035-public
rm -rf "$WORK" "$OUT"; mkdir -p "$WORK/minimal" "$WORK/e0" "$OUT"
cat "$BASE/minimal/00.b64" "$BASE/minimal/01.b64" "$BASE"/minimal02b/{00,01,02}.txt "$BASE"/minimal03/{00,01}.txt "$BASE/minimal03c/00.txt" "$BASE/minimal03d/00.txt" "$BASE"/minimal03e/{00,01}.txt "$BASE/minimal/04.b64" "$BASE/minimal/05.b64" "$BASE/minimal/06.b64" "$BASE/minimal/07.b64" "$BASE"/minimal08/{00,01}.txt > "$WORK/minimal/minimal.b64"
base64 --decode "$WORK/minimal/minimal.b64" > "$WORK/minimal/minimal.zip"
printf '%s  %s\n' '3baffd98c72c4eb498eef77628e89ec884bd56e911670fca6e8d1e944019c73f' "$WORK/minimal/minimal.zip" | sha256sum -c -
unzip -q "$WORK/minimal/minimal.zip" -d "$WORK/minimal/root"; SEALED="$WORK/minimal/root/rg3_v04_minimal"
python "$SEALED/scripts/verify_preprimary.py" "$SEALED"
R="$BASE/e0_03_01_repair"; cat "$R"/{00,01,02,03,04,05,06,07,08,09}.txt > "$WORK/e0/03_01.txt"
printf '%s  %s\n' '716c05a7a40a6d58c81930057b53553899642fcc5f664de8155ebfd78425db02' "$WORK/e0/03_01.txt" | sha256sum -c -
cat "$BASE/e0/00_00.txt" "$BASE/e0/00_01.txt" "$BASE/e0/00_02.txt" "$BASE/e0/01_00.txt" "$BASE/e0/01_01.txt" "$BASE/e0/01_02.txt" "$BASE/e0/02_00.txt" "$BASE/e0/02_01.txt" "$BASE/e0/02_02.txt" "$BASE/e0/03_00.txt" "$WORK/e0/03_01.txt" "$BASE/e0/03_02.txt" "$BASE/e0/04_00.txt" "$BASE/e0/04_01.txt" > "$WORK/e0/e0.b64"
base64 --decode "$WORK/e0/e0.b64" > "$WORK/e0/e0.zip"
printf '%s  %s\n' 'df016b10ae72439a24d5611b6cacee42973d8d25f2a632b65e11eed6691d2495' "$WORK/e0/e0.zip" | sha256sum -c -
unzip -q "$WORK/e0/e0.zip" -d "$WORK/e0/root"; CAP="$WORK/e0/root/rg3_stripe_e0_capsule_v0_3"
(cd "$CAP" && sha256sum -c MANIFEST.sha256)
python "$BASE/patch_e0_v035.py" --script "$CAP/scripts/stripe_e0.py" --receipt "$OUT/E0_V035_PATCH_RECEIPT.json"
(cd "$CAP" && pytest -q tests/test_capsule.py)
python "$BASE/shadow_stripe_e0_v035.py" --executor "$CAP/scripts/stripe_e0.py" --sealed-root "$SEALED" --out "$OUT/shadow"
python - "$OUT/shadow/SHADOW_E0_V034_RESULT.json" <<'PY'
from pathlib import Path
import json,sys
r=json.loads(Path(sys.argv[1]).read_text())
assert r['status']=='PASS' and r['real_provider_calls']==0 and r['real_payment_mutations']==0 and r['primary_evidence_consumed'] is False
assert r['executor_sha256']=='241f4497d18708012be4da00cd6fbc97643e594371641fff1de2ac9ac7c92c8f'
assert r['stable_rescan_race']['retried'] is True
assert r['completeness_negative_control']=={'complete_J2':'FAIL','truncated_J2':'UNKNOWN'}
print('RG3_SHADOW_E0_V035=PASS; REFUND_LIVEMODE_ABSENT=TRUE; REAL_PROVIDER_CALLS=0; PRIMARY_EVIDENCE=0')
PY
