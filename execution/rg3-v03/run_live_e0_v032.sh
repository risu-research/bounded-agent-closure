#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
BASE="$REPO_ROOT/execution/rg3-v03"
WORK=/tmp/rg3-live-v032
PUBLIC=/tmp/rg3-public-v032
PRIVATE=/tmp/rg3-private-v032
STRIPE_HOME=/tmp/rg3-stripe-home-v032
STRIPE_XDG=/tmp/rg3-stripe-xdg-v032
SECRET=""
CURRENT_PHASE="BOOT"
mkdir -p "$WORK/minimal" "$WORK/e0" "$PUBLIC" "$PRIVATE"
chmod 700 "$PRIVATE"

write_state() {
  python - "$PUBLIC/EXECUTION_STATE.json" "$1" "$2" <<'PY'
from pathlib import Path
import json,sys
p=Path(sys.argv[1]); phase=sys.argv[2]; status=sys.argv[3]
p.write_text(json.dumps({"phase":phase,"status":status,"primary_evidence_consumed":False},sort_keys=True,separators=(",",":")))
PY
}

record_failure() {
  local phase="$1" private_log="${2:-}"
  python - "$PUBLIC/E0_FAILURE.json" "$phase" "$private_log" <<'PY'
from pathlib import Path
import hashlib,json,sys
out=Path(sys.argv[1]); phase=sys.argv[2]; src=Path(sys.argv[3]) if sys.argv[3] else None
raw=src.read_bytes() if src and src.exists() else b""
error_type="UNKNOWN"
try:
    lines=[x for x in raw.decode("utf-8","replace").splitlines() if x.strip()]
    obj=json.loads(lines[-1]) if lines else {}
    error_type=str(obj.get("error_type") or "UNKNOWN")
except Exception:
    pass
out.write_text(json.dumps({
    "phase":phase,
    "status":"FAIL",
    "error_type":error_type,
    "error_sha256":hashlib.sha256(raw).hexdigest(),
    "primary_evidence_consumed":False
},sort_keys=True,separators=(",",":")))
PY
}

seal_public() {
  python - "$PUBLIC" "${SECRET:-}" <<'PY'
from pathlib import Path
import hashlib,json,sys
root=Path(sys.argv[1]); secret=sys.argv[2].encode() if len(sys.argv)>2 and sys.argv[2] else b""
files={}
for p in sorted(root.rglob('*')):
    if not p.is_file() or p.name=='PUBLIC_E0_INDEX.json':
        continue
    raw=p.read_bytes()
    if secret and secret in raw:
        raise SystemExit(f"secret leaked into public artifact: {p}")
    files[str(p.relative_to(root))]=hashlib.sha256(raw).hexdigest()
index={"phase":"STRIPE_E0_PUBLIC_SEAL","files":files,"primary_evidence_consumed":False,"private_oracle_uploaded":False}
out=root/'PUBLIC_E0_INDEX.json'
out.write_text(json.dumps(index,sort_keys=True,separators=(",",":")))
print('PUBLIC_E0_FILES='+str(len(files)))
print('PUBLIC_E0_INDEX_SHA256='+hashlib.sha256(out.read_bytes()).hexdigest())
PY
}

cleanup_private() {
  rm -rf "$PRIVATE" "$STRIPE_HOME" "$STRIPE_XDG"
  unset STRIPE_SECRET_KEY RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED || true
}
trap cleanup_private EXIT

write_state "$CURRENT_PHASE" STARTED

CURRENT_PHASE="FROZEN_RECONSTRUCTION"
cat "$BASE/minimal/00.b64" "$BASE/minimal/01.b64" \
    "$BASE"/minimal02b/{00,01,02}.txt \
    "$BASE"/minimal03/{00,01}.txt "$BASE/minimal03c/00.txt" \
    "$BASE/minimal03d/00.txt" "$BASE"/minimal03e/{00,01}.txt \
    "$BASE/minimal/04.b64" "$BASE/minimal/05.b64" \
    "$BASE/minimal/06.b64" "$BASE/minimal/07.b64" \
    "$BASE"/minimal08/{00,01}.txt > "$WORK/minimal/minimal.b64"
base64 --decode "$WORK/minimal/minimal.b64" > "$WORK/minimal/minimal.zip"
printf '%s  %s\n' '3baffd98c72c4eb498eef77628e89ec884bd56e911670fca6e8d1e944019c73f' "$WORK/minimal/minimal.zip" | sha256sum -c -
unzip -q "$WORK/minimal/minimal.zip" -d "$WORK/minimal/root"
SEALED="$WORK/minimal/root/rg3_v04_minimal"
python "$SEALED/scripts/verify_preprimary.py" "$SEALED"

R="$BASE/e0_03_01_repair"
cat "$R"/{00,01,02,03,04,05,06,07,08,09}.txt > "$WORK/e0/03_01.txt"
printf '%s  %s\n' '716c05a7a40a6d58c81930057b53553899642fcc5f664de8155ebfd78425db02' "$WORK/e0/03_01.txt" | sha256sum -c -
cat "$BASE/e0/00_00.txt" "$BASE/e0/00_01.txt" "$BASE/e0/00_02.txt" \
    "$BASE/e0/01_00.txt" "$BASE/e0/01_01.txt" "$BASE/e0/01_02.txt" \
    "$BASE/e0/02_00.txt" "$BASE/e0/02_01.txt" "$BASE/e0/02_02.txt" \
    "$BASE/e0/03_00.txt" "$WORK/e0/03_01.txt" "$BASE/e0/03_02.txt" \
    "$BASE/e0/04_00.txt" "$BASE/e0/04_01.txt" > "$WORK/e0/e0.b64"
base64 --decode "$WORK/e0/e0.b64" > "$WORK/e0/e0.zip"
printf '%s  %s\n' 'df016b10ae72439a24d5611b6cacee42973d8d25f2a632b65e11eed6691d2495' "$WORK/e0/e0.zip" | sha256sum -c -
unzip -q "$WORK/e0/e0.zip" -d "$WORK/e0/root"
CAP="$WORK/e0/root/rg3_stripe_e0_capsule_v0_3"
(cd "$CAP" && sha256sum -c MANIFEST.sha256)

CURRENT_PHASE="EXECUTION_COMPAT_0_3_2"
python - "$CAP/scripts/stripe_e0.py" <<'PY'
from pathlib import Path
import hashlib,sys
p=Path(sys.argv[1]); s=p.read_text()
old_key='''    if not key.startswith(("sk_test_","rk_test_")):\n        raise SystemExit("REFUSED: unrecognized Stripe secret-key prefix; expected sk_test_ or rk_test_")\n    return key\n'''
new_key='''    if key.startswith("rkcs_"):\n        if os.environ.get("RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED") != "1":\n            raise SystemExit("REFUSED: rkcs_ key requires verified Stripe CLI claimable-sandbox provenance")\n        return key\n    if not key.startswith(("sk_test_","rk_test_")):\n        raise SystemExit("REFUSED: unrecognized Stripe secret-key prefix; expected sk_test_, rk_test_, or provenance-verified rkcs_")\n    return key\n'''
old_import='''def import_sealed(root:Path):\n    sys.path.insert(0,str(root))\n    from payments_rg3 import actions, collect, stripe_binding, evaluator, calibration\n    from payments_rg3.binding_lock import load_lock\n    from payments_rg3.binding_common import UnsupportedProviderSchema\n    return actions,collect,stripe_binding,evaluator,calibration,load_lock,UnsupportedProviderSchema\n'''
new_import='''def load_lock(path:Path)->dict:\n    return json.loads(Path(path).read_text())\n\ndef import_sealed(root:Path):\n    sys.path.insert(0,str(root))\n    from payments_rg3 import actions, collect, stripe_binding, evaluator, calibration\n    from payments_rg3.binding_common import UnsupportedProviderSchema\n    return actions,collect,stripe_binding,evaluator,calibration,load_lock,UnsupportedProviderSchema\n'''
if s.count(old_key)!=1 or s.count(old_import)!=1:
    raise SystemExit('execution compatibility patch preimage mismatch')
s=s.replace(old_key,new_key).replace(old_import,new_import)
p.write_text(s)
got=hashlib.sha256(p.read_bytes()).hexdigest()
exp='e90a3cb1be4663a89888857715ec9e4d4a04291b8a6698a0bbe9bd9affba2dee'
if got!=exp: raise SystemExit(f'patched executor SHA mismatch: {got}')
print('E0_V032_PATCH_SHA=PASS')
PY
(cd "$CAP" && pytest -q tests/test_capsule.py)
python - "$CAP/scripts/stripe_e0.py" "$SEALED" <<'PY'
from pathlib import Path
import importlib.util,os,sys
p=Path(sys.argv[1]); root=Path(sys.argv[2])
spec=importlib.util.spec_from_file_location('e0',p); e0=importlib.util.module_from_spec(spec); spec.loader.exec_module(e0)
os.environ['STRIPE_SECRET_KEY']='rkcs_dummy'; os.environ['RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED']='1'; assert e0.require_test_key()=='rkcs_dummy'
os.environ.pop('RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED',None)
try: e0.require_test_key(); raise AssertionError('rkcs accepted without provenance')
except SystemExit: pass
os.environ['STRIPE_SECRET_KEY']='sk_live_dummy'; os.environ['RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED']='1'
try: e0.require_test_key(); raise AssertionError('live key accepted')
except SystemExit: pass
mods=e0.import_sealed(root)
lock=mods[5](root/'profiles/payment_binding.lock.json')
assert lock['stripe']=='sha256:f41fbe34bb0319471327f6b0fcf5f3bba730f1fc1ed904199e41b0c9c9fde09f'
print('E0_V032_EXECUTION_TESTS=4/4 PASS')
PY
env -u STRIPE_SECRET_KEY -u RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED \
  python "$CAP/scripts/stripe_e0.py" preflight --sealed-root "$SEALED" --out "$PUBLIC/pre-provider-preflight"
write_state "$CURRENT_PHASE" PASS

echo 'PRE_PROVIDER_LIVE_GATE=PASS; PAYMENT_MUTATIONS=0; PRIMARY_EVIDENCE=0'

CURRENT_PHASE="STRIPE_CLI_SUPPLY_CHAIN"
curl --proto '=https' --tlsv1.2 -fsSLo "$WORK/stripe-cli.deb" \
  'https://github.com/stripe/stripe-cli/releases/download/v1.50.10/stripe_1.50.10_linux_amd64.deb'
printf '%s  %s\n' 'ad3e9c89a6c464a88a7b2808f5430c8a04908196be233e870d973fd4c67ec474' "$WORK/stripe-cli.deb" | sha256sum -c -
mkdir -p "$WORK/stripe-cli-root"
dpkg-deb -x "$WORK/stripe-cli.deb" "$WORK/stripe-cli-root"
STRIPE_BIN="$(find "$WORK/stripe-cli-root" -type f -name stripe -perm -111 | head -n 1)"
test -n "$STRIPE_BIN"
"$STRIPE_BIN" version | grep -F '1.50.10'
echo 'STRIPE_CLI_SUPPLY_CHAIN_GATE=PASS'

CURRENT_PHASE="SANDBOX_PROVISION"
export HOME="$STRIPE_HOME" XDG_CONFIG_HOME="$STRIPE_XDG"
mkdir -p "$HOME" "$XDG_CONFIG_HOME"
EMAIL="$(git -C "$REPO_ROOT" log -1 --format=%ae)"
case "$EMAIL" in *@*) ;; *) record_failure "$CURRENT_PHASE"; seal_public; exit 2;; esac
RAW="$PRIVATE/sandbox-create.out"; ERR="$PRIVATE/sandbox-create.err"
if ! "$STRIPE_BIN" sandbox create --email "$EMAIL" --non-interactive >"$RAW" 2>"$ERR"; then
  record_failure "$CURRENT_PHASE" "$ERR"; seal_public; exit 2
fi
python - "$RAW" "$PRIVATE" "$PUBLIC/SANDBOX_PROVISION_RECEIPT.json" <<'PY'
from pathlib import Path
import json,os,sys
raw=Path(sys.argv[1]); private=Path(sys.argv[2]); receipt=Path(sys.argv[3])
text=raw.read_text(); i=text.find('{')
if i<0: raise SystemExit('sandbox create produced no JSON result')
obj,_=json.JSONDecoder().raw_decode(text[i:]); secret=obj.get('secret_key') or ''
if not secret: raise SystemExit('sandbox create produced no secret key')
prefix='rkcs_' if secret.startswith('rkcs_') else ('rk_test_' if secret.startswith('rk_test_') else ('sk_test_' if secret.startswith('sk_test_') else 'OTHER'))
if prefix=='OTHER': raise SystemExit('sandbox create returned an unrecognized key class')
for name,val in [('secret',secret),('publishable',obj.get('publishable_key') or ''),('claim_url',obj.get('claim_url') or '')]:
    p=private/name; p.write_text(val); os.chmod(p,0o600)
(private/'prefix').write_text(prefix)
receipt.write_text(json.dumps({
  'phase':'STRIPE_SANDBOX_PROVISION','stripe_cli_version':'1.50.10',
  'stripe_cli_deb_sha256':'ad3e9c89a6c464a88a7b2808f5430c8a04908196be233e870d973fd4c67ec474',
  'credential_class':prefix,'claimable_expiry_present':bool(obj.get('expires_at')),
  'primary_evidence_consumed':False
},sort_keys=True,separators=(',',':')))
PY
SECRET="$(cat "$PRIVATE/secret")"
PUB="$(cat "$PRIVATE/publishable")"; CLAIM="$(cat "$PRIVATE/claim_url")"; PREFIX="$(cat "$PRIVATE/prefix")"
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  echo "::add-mask::$SECRET"; [[ -z "$PUB" ]] || echo "::add-mask::$PUB"; [[ -z "$CLAIM" ]] || echo "::add-mask::$CLAIM"
fi
export STRIPE_SECRET_KEY="$SECRET"
"$STRIPE_BIN" whoami --format json > "$PRIVATE/whoami.json"
python - "$PRIVATE/whoami.json" "$PUBLIC/SANDBOX_PROVISION_RECEIPT.json" <<'PY'
from pathlib import Path
import json,sys
w=json.loads(Path(sys.argv[1]).read_text())
assert w['authenticated'] is True
assert w['test_mode_key']['available'] is True
assert w['live_mode_key']['available'] is False
p=Path(sys.argv[2]); r=json.loads(p.read_text())
r.update({'whoami_authenticated':True,'whoami_test_mode_key_available':True,'whoami_live_mode_key_available':False,'whoami_network_calls':False})
p.write_text(json.dumps(r,sort_keys=True,separators=(',',':')))
PY
if [[ "$PREFIX" == "rkcs_" ]]; then export RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED=1; fi
write_state "$CURRENT_PHASE" PASS
echo "FIRST_PROVIDER_INTERACTION=PASS; CREDENTIAL_CLASS=$PREFIX; LIVE_KEY_AVAILABLE=FALSE"

CURRENT_PHASE="LIVE_PREFLIGHT"
python "$CAP/scripts/stripe_e0.py" preflight --sealed-root "$SEALED" --out "$PUBLIC/preflight"
write_state "$CURRENT_PHASE" PASS

CURRENT_PHASE="LIVE_SMOKE"
mkdir -p "$PUBLIC/smoke"
SMOKE_OUT="$PRIVATE/smoke.stdout"; SMOKE_ERR="$PRIVATE/smoke.stderr"
if ! python "$CAP/scripts/stripe_e0.py" live-smoke --sealed-root "$SEALED" --out "$PUBLIC/smoke" >"$SMOKE_OUT" 2>"$SMOKE_ERR"; then
  record_failure "$CURRENT_PHASE" "$SMOKE_ERR"
  write_state "$CURRENT_PHASE" FAIL
  seal_public
  exit 2
fi
write_state "$CURRENT_PHASE" PASS
echo 'STRIPE_LIVE_E0_SMOKE=PASS; PRIMARY_EVIDENCE=0'

CURRENT_PHASE="LIVE_FULL"
mkdir -p "$PUBLIC/full" "$PRIVATE/oracle"
chmod 700 "$PRIVATE/oracle"
FULL_OUT="$PRIVATE/full.stdout"; FULL_ERR="$PRIVATE/full.stderr"
if ! python "$CAP/scripts/stripe_e0.py" live-full --sealed-root "$SEALED" --out "$PUBLIC/full" --oracle-vault "$PRIVATE/oracle" >"$FULL_OUT" 2>"$FULL_ERR"; then
  record_failure "$CURRENT_PHASE" "$FULL_ERR"
  write_state "$CURRENT_PHASE" FAIL
  seal_public
  exit 2
fi
write_state "$CURRENT_PHASE" PASS
echo 'STRIPE_LIVE_E0_FULL=PASS; PRIMARY_EVIDENCE=0'

CURRENT_PHASE="PUBLIC_SEAL"
seal_public
write_state "$CURRENT_PHASE" PASS
seal_public
rm -rf "$PRIVATE/oracle"
echo 'PRIVATE_ORACLE_DESTROYED_BEFORE_UPLOAD=TRUE'
echo 'RG3_STRIPE_E0_V032=PASS; PRIMARY_EVIDENCE=0'
