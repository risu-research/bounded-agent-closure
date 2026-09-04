#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
BASE="$REPO_ROOT/execution/rg3-v03"
WORK=/tmp/rg3-live-v034
PUBLIC=/tmp/rg3-public-v034
PRIVATE=/tmp/rg3-private-v034
STRIPE_HOME=/tmp/rg3-stripe-home-v034
STRIPE_XDG=/tmp/rg3-stripe-xdg-v034
SECRET=""; CRED_CLASS=""; CURRENT_PHASE="BOOT"
rm -rf "$WORK" "$PUBLIC" "$PRIVATE" "$STRIPE_HOME" "$STRIPE_XDG"
mkdir -p "$WORK/minimal" "$WORK/e0" "$PUBLIC" "$PRIVATE"; chmod 700 "$PRIVATE"

write_json_state() {
  python - "$PUBLIC/EXECUTION_STATE.json" "$1" "$2" <<'PY'
from pathlib import Path
import json,sys
Path(sys.argv[1]).write_text(json.dumps({'phase':sys.argv[2],'status':sys.argv[3],'primary_evidence_consumed':False},sort_keys=True,separators=(',',':')))
PY
}
record_failure() {
  local phase="$1" private_log="${2:-}" mutation_flag="${3:-false}" etype="${4:-UNKNOWN}"
  python - "$PUBLIC/E0_FAILURE.json" "$phase" "$private_log" "$mutation_flag" "$etype" <<'PY'
from pathlib import Path
import hashlib,json,sys
src=Path(sys.argv[3]) if sys.argv[3] else None
raw=src.read_bytes() if src and src.exists() else b''
et=sys.argv[5]
if et=='UNKNOWN':
  try:
    lines=[x for x in raw.decode('utf-8','replace').splitlines() if x.strip()]
    obj=json.loads(lines[-1]) if lines else {}; et=str(obj.get('error_type') or 'UNKNOWN')
  except Exception: pass
Path(sys.argv[1]).write_text(json.dumps({'phase':sys.argv[2],'status':'FAIL','error_type':et,'private_error_sha256':hashlib.sha256(raw).hexdigest(),'e0_payment_mutations_may_have_occurred':sys.argv[4].lower()=='true','primary_evidence_consumed':False},sort_keys=True,separators=(',',':')))
PY
}
seal_public() {
  python - "$PUBLIC" "${SECRET:-}" <<'PY'
from pathlib import Path
import hashlib,json,sys
root=Path(sys.argv[1]); secret=sys.argv[2].encode() if len(sys.argv)>2 and sys.argv[2] else b''; files={}
for p in sorted(root.rglob('*')):
  if not p.is_file() or p.name=='PUBLIC_E0_INDEX.json': continue
  raw=p.read_bytes()
  if secret and secret in raw: raise SystemExit(f'secret leaked into public artifact: {p}')
  files[str(p.relative_to(root))]=hashlib.sha256(raw).hexdigest()
out=root/'PUBLIC_E0_INDEX.json'; out.write_text(json.dumps({'phase':'STRIPE_E0_V034_PUBLIC_SEAL','files':files,'primary_evidence_consumed':False,'private_oracle_uploaded':False},sort_keys=True,separators=(',',':')))
print('PUBLIC_E0_FILES='+str(len(files))); print('PUBLIC_E0_INDEX_SHA256='+hashlib.sha256(out.read_bytes()).hexdigest())
PY
}
cleanup() { rm -rf "$PRIVATE" "$STRIPE_HOME" "$STRIPE_XDG"; unset STRIPE_SECRET_KEY RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED || true; }
trap cleanup EXIT
write_json_state "$CURRENT_PHASE" STARTED

CURRENT_PHASE=FROZEN_RECONSTRUCTION
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
python "$BASE/patch_e0_v034.py" --script "$CAP/scripts/stripe_e0.py" --receipt "$PUBLIC/E0_V034_PATCH_RECEIPT.json"
(cd "$CAP" && pytest -q tests/test_capsule.py)
write_json_state "$CURRENT_PHASE" PASS

CURRENT_PHASE=SHADOW_PRE_PROVIDER
python "$BASE/shadow_stripe_e0_v034.py" --executor "$CAP/scripts/stripe_e0.py" --sealed-root "$SEALED" --out "$PUBLIC/shadow-pre-provider"
write_json_state "$CURRENT_PHASE" PASS
echo 'PRE_PROVIDER_SHADOW_GATE=PASS; REAL_PROVIDER_CALLS=0; PRIMARY_EVIDENCE=0'

CURRENT_PHASE=CREDENTIAL_ACQUISITION
PROVIDED="${RG3_STRIPE_TEST_KEY:-}"
if [[ -n "$PROVIDED" ]]; then
  case "$PROVIDED" in
    sk_test_*) CRED_CLASS='sk_test_' ;;
    rk_test_*) CRED_CLASS='rk_test_' ;;
    *) record_failure "$CURRENT_PHASE" '' false 'REFUSED_NON_TEST_PROVIDED_KEY'; write_json_state "$CURRENT_PHASE" FAIL; seal_public; exit 2 ;;
  esac
  SECRET="$PROVIDED"; echo "::add-mask::$SECRET"; export STRIPE_SECRET_KEY="$SECRET"
  python - "$PUBLIC/CREDENTIAL_RECEIPT.json" "$CRED_CLASS" <<'PY'
from pathlib import Path
import json,sys
Path(sys.argv[1]).write_text(json.dumps({'phase':'CREDENTIAL_ACQUISITION','source':'configured_actions_secret','credential_class':sys.argv[2],'live_mode_key_available':False,'primary_evidence_consumed':False},sort_keys=True,separators=(',',':')))
PY
else
  curl --proto '=https' --tlsv1.2 -fsSLo "$WORK/stripe-cli.deb" 'https://github.com/stripe/stripe-cli/releases/download/v1.50.10/stripe_1.50.10_linux_amd64.deb'
  printf '%s  %s\n' 'ad3e9c89a6c464a88a7b2808f5430c8a04908196be233e870d973fd4c67ec474' "$WORK/stripe-cli.deb" | sha256sum -c -
  mkdir -p "$WORK/stripe-cli-root"; dpkg-deb -x "$WORK/stripe-cli.deb" "$WORK/stripe-cli-root"
  STRIPE_BIN="$(find "$WORK/stripe-cli-root" -type f -name stripe -perm -111 | head -n1)"; "$STRIPE_BIN" version | grep -F '1.50.10'
  export HOME="$STRIPE_HOME" XDG_CONFIG_HOME="$STRIPE_XDG" STRIPE_CONFIG_DIR="$STRIPE_XDG/stripe" STRIPE_CLI_TELEMETRY_OPTOUT=1
  mkdir -p "$HOME" "$STRIPE_CONFIG_DIR"; : > "$STRIPE_CONFIG_DIR/config.toml"
  EMAIL="$(git -C "$REPO_ROOT" log -1 --format=%ae)"; RAW="$PRIVATE/sandbox.out"; ERR="$PRIVATE/sandbox.err"
  if ! "$STRIPE_BIN" sandbox create --email "$EMAIL" --non-interactive >"$RAW" 2>"$ERR"; then record_failure "$CURRENT_PHASE" "$ERR" false 'STRIPE_SANDBOX_COMMAND_FAILED'; write_json_state "$CURRENT_PHASE" FAIL; seal_public; exit 2; fi
  PARSE_ERR="$PRIVATE/sandbox.parse.err"
  if ! python - "$RAW" "$STRIPE_CONFIG_DIR/config.toml" "$PRIVATE" "$PUBLIC/CREDENTIAL_RECEIPT.json" 2>"$PARSE_ERR" <<'PY'
from pathlib import Path
import json,os,sys,tomllib
raw=Path(sys.argv[1]); cfgp=Path(sys.argv[2]); private=Path(sys.argv[3]); receipt=Path(sys.argv[4]); text=raw.read_text(errors='replace')
def objs(text):
 d=json.JSONDecoder(); out=[]
 for i,c in enumerate(text):
  if c!='{': continue
  try: o,_=d.raw_decode(text[i:])
  except Exception: continue
  if isinstance(o,dict): out.append(o)
 return out
def walk(o,k):
 out=[]
 if isinstance(o,dict):
  for a,v in o.items():
   if a==k and isinstance(v,str) and v: out.append(v)
   out.extend(walk(v,k))
 elif isinstance(o,list):
  for v in o: out.extend(walk(v,k))
 return out
js=objs(text)
if any(walk(o,'next_step') or walk(o,'browser_url') for o in js): raise SystemExit('FALLBACK_LOGIN_REQUIRED')
cfg={}
if cfgp.exists() and cfgp.stat().st_size:
 with cfgp.open('rb') as f: cfg=tomllib.load(f)
secrets=list(dict.fromkeys([x for o in js for x in walk(o,'secret_key') if x.startswith('rkcs_')]+[x for x in walk(cfg,'test_mode_api_key') if x.startswith('rkcs_')]))
live=walk(cfg,'live_mode_api_key'); claim=walk(cfg,'sandbox_claim_url'); expiry=walk(cfg,'sandbox_expires_at')
if len(secrets)!=1: raise SystemExit(f'CLAIMABLE_KEY_COUNT_{len(secrets)}')
if live: raise SystemExit('LIVE_KEY_PRESENT')
if not claim or not expiry: raise SystemExit('CLAIMABLE_PROVENANCE_MISSING')
(private/'secret').write_text(secrets[0]); os.chmod(private/'secret',0o600)
(private/'claim').write_text(claim[0]); os.chmod(private/'claim',0o600)
receipt.write_text(json.dumps({'phase':'CREDENTIAL_ACQUISITION','source':'stripe_cli_claimable_sandbox','credential_class':'rkcs_','claimable_claim_url_present':True,'claimable_expiry_present':True,'live_mode_key_available':False,'primary_evidence_consumed':False},sort_keys=True,separators=(',',':')))
PY
  then
    if grep -q 'FALLBACK_LOGIN_REQUIRED' "$PARSE_ERR"; then ETYPE='STRIPE_SANDBOX_FALLBACK_LOGIN_REQUIRED'; else ETYPE='STRIPE_SANDBOX_PROVISION_PARSE_OR_PROVENANCE_FAILURE'; fi
    record_failure "$CURRENT_PHASE" "$PARSE_ERR" false "$ETYPE"; write_json_state "$CURRENT_PHASE" FAIL; seal_public; exit 2
  fi
  SECRET="$(cat "$PRIVATE/secret")"; CLAIM="$(cat "$PRIVATE/claim")"; echo "::add-mask::$SECRET"; echo "::add-mask::$CLAIM"; export STRIPE_SECRET_KEY="$SECRET" RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED=1; CRED_CLASS='rkcs_'
  "$STRIPE_BIN" whoami --format json > "$PRIVATE/whoami.json"
  python - "$PRIVATE/whoami.json" <<'PY'
from pathlib import Path
import json,sys
w=json.loads(Path(sys.argv[1]).read_text()); assert w['authenticated'] is True; assert w['test_mode_key']['available'] is True; assert w['live_mode_key']['available'] is False
PY
fi
write_json_state "$CURRENT_PHASE" PASS
echo "CREDENTIAL_GATE=PASS; CLASS=$CRED_CLASS; LIVE_MODE_KEY_AVAILABLE=FALSE"

CURRENT_PHASE=LIVE_PREFLIGHT
python "$CAP/scripts/stripe_e0.py" preflight --sealed-root "$SEALED" --out "$PUBLIC/preflight"
write_json_state "$CURRENT_PHASE" PASS

CURRENT_PHASE=LIVE_SMOKE; mkdir -p "$PUBLIC/smoke"; SO="$PRIVATE/smoke.out"; SE="$PRIVATE/smoke.err"
if ! python "$CAP/scripts/stripe_e0.py" live-smoke --sealed-root "$SEALED" --out "$PUBLIC/smoke" >"$SO" 2>"$SE"; then record_failure "$CURRENT_PHASE" "$SE" true; write_json_state "$CURRENT_PHASE" FAIL; seal_public; exit 2; fi
write_json_state "$CURRENT_PHASE" PASS; echo 'STRIPE_LIVE_E0_SMOKE=PASS; PRIMARY_EVIDENCE=0'

CURRENT_PHASE=LIVE_FULL; mkdir -p "$PUBLIC/full" "$PRIVATE/oracle"; chmod 700 "$PRIVATE/oracle"; FO="$PRIVATE/full.out"; FE="$PRIVATE/full.err"
if ! python "$CAP/scripts/stripe_e0.py" live-full --sealed-root "$SEALED" --out "$PUBLIC/full" --oracle-vault "$PRIVATE/oracle" >"$FO" 2>"$FE"; then record_failure "$CURRENT_PHASE" "$FE" true; write_json_state "$CURRENT_PHASE" FAIL; seal_public; exit 2; fi
rm -rf "$PRIVATE/oracle"; write_json_state "$CURRENT_PHASE" PASS; echo 'STRIPE_LIVE_E0_FULL=PASS; PRIMARY_EVIDENCE=0'

CURRENT_PHASE=E0_5_SEAL
python - "$PUBLIC/LIVE_E0_ATTESTATION.json" "$CRED_CLASS" "${GITHUB_RUN_ID:-unknown}" <<'PY'
from pathlib import Path
import json,sys
Path(sys.argv[1]).write_text(json.dumps({'phase':'LIVE_E0_V0_3_4_COMPLETE','real_provider_interaction':True,'real_payment_mutations':True,'primary_evidence_consumed':False,'executor_sha256':'0be42e97bb8a0e9ef966cadadfea2211f2443fac4bceff9bebea21a56be41603','live_mode_key_available':False,'credential_class':sys.argv[2],'github_run_id':sys.argv[3],'generic_core_changes':0,'provider_semantic_changes':0,'judgment_changes':0},sort_keys=True,separators=(',',':')))
PY
python "$BASE/seal_stripe_e05_v034.py" --e0-result "$PUBLIC/full/STRIPE_E0_RESULT.json" --calibration "$PUBLIC/full/STRIPE_E0_CALIBRATION.json" --attestation "$PUBLIC/LIVE_E0_ATTESTATION.json" --out-dir "$PUBLIC/e0_5"
write_json_state "$CURRENT_PHASE" PASS

CURRENT_PHASE=PUBLIC_SEAL; seal_public; write_json_state "$CURRENT_PHASE" PASS; seal_public
echo 'PRIVATE_ORACLE_DESTROYED_BEFORE_UPLOAD=TRUE'
echo 'RG3_STRIPE_E0_V034_AND_E05=PASS; READY_FOR_STRIPE_PRIMARY=TRUE; PRIMARY_EVIDENCE=0'
