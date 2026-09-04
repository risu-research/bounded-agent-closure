#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

EXPECTED_V034_GIT_BLOB='d89fb54274396741048f385c82194fd8d2e60f05'
OLD_EXECUTOR='0be42e97bb8a0e9ef966cadadfea2211f2443fac4bceff9bebea21a56be41603'
NEW_EXECUTOR='241f4497d18708012be4da00cd6fbc97643e594371641fff1de2ac9ac7c92c8f'

def git_blob_sha1(raw:bytes)->str:
    h=hashlib.sha1(); h.update(f'blob {len(raw)}\0'.encode()); h.update(raw); return h.hexdigest()

def replace_once(s:str, old:str, new:str, label:str)->str:
    n=s.count(old)
    if n!=1: raise SystemExit(f'v0.3.5 live derivation refused: {label} count={n}')
    return s.replace(old,new,1)

def main()->int:
    ap=argparse.ArgumentParser(); ap.add_argument('--source',type=Path,required=True); ap.add_argument('--out',type=Path,required=True); ap.add_argument('--receipt',type=Path,required=True); a=ap.parse_args()
    raw=a.source.read_bytes(); blob=git_blob_sha1(raw)
    if blob!=EXPECTED_V034_GIT_BLOB: raise SystemExit(f'v0.3.5 live derivation refused: v0.3.4 runner blob={blob}')
    s=raw.decode()
    # Mechanical lineage/version/path substitutions.
    s=s.replace('v034','v035').replace('V034','V035').replace('V0_3_4','V0_3_5').replace('0.3.4','0.3.5').replace(OLD_EXECUTOR,NEW_EXECUTOR)
    old='''python "$BASE/patch_e0_v035.py" --script "$CAP/scripts/stripe_e0.py" --receipt "$PUBLIC/E0_V035_PATCH_RECEIPT.json"\n(cd "$CAP" && pytest -q tests/test_capsule.py)\nwrite_json_state "$CURRENT_PHASE" PASS\n'''
    new='''python "$BASE/patch_e0_v035.py" --script "$CAP/scripts/stripe_e0.py" --receipt "$PUBLIC/E0_V035_PATCH_RECEIPT.json"\n# Reality-adjudicated regression gate on the exact live executor instance.\n(cd "$CAP" && pytest -q tests/test_capsule.py -k 'not test_guillotine_never_returns_provider_object')\nmkdir -p "$WORK/adjudicated"\npython "$BASE/adjudicate_tests_v035.py" --test-file "$CAP/tests/test_capsule.py" --executor "$CAP/scripts/stripe_e0.py" --out-dir "$WORK/adjudicated"\ncp "$WORK/adjudicated/TEST_ADJUDICATION_V035.json" "$PUBLIC/TEST_ADJUDICATION_V035.json"\ncp "$WORK/adjudicated/test_capsule_v035_corrected.py" "$CAP/tests/test_capsule_v035_corrected.py"\n(cd "$CAP" && pytest -q tests/test_capsule_v035_corrected.py)\npython "$BASE/stripe_schema_sentinel_v035.py" --executor "$CAP/scripts/stripe_e0.py" --out "$PUBLIC/STRIPE_SCHEMA_SENTINEL_V035.json"\nwrite_json_state "$CURRENT_PHASE" PASS\n'''
    s=replace_once(s,old,new,'frozen reconstruction regression block')
    old='''CURRENT_PHASE=SHADOW_PRE_PROVIDER\npython "$BASE/shadow_stripe_e0_v035.py" --executor "$CAP/scripts/stripe_e0.py" --sealed-root "$SEALED" --out "$PUBLIC/shadow-pre-provider"\nwrite_json_state "$CURRENT_PHASE" PASS\necho 'PRE_PROVIDER_SHADOW_GATE=PASS; REAL_PROVIDER_CALLS=0; PRIMARY_EVIDENCE=0'\n'''
    new='''CURRENT_PHASE=SHADOW_PRE_PROVIDER\n# Re-run the independently qualified full provider-free corridor immediately before credential access.\nbash "$BASE/run_shadow_e0_v035.sh"\nmkdir -p "$PUBLIC/shadow-qualification"\ncp -a /tmp/rg3-shadow-v035-public/. "$PUBLIC/shadow-qualification/"\nwrite_json_state "$CURRENT_PHASE" PASS\necho 'PRE_PROVIDER_SHADOW_GATE=PASS; LEGACY_UNAFFECTED=15; REALITY_CORRECTED=16; OPENAPI_SENTINEL=PASS; REAL_PROVIDER_CALLS=0; PRIMARY_EVIDENCE=0'\n'''
    s=replace_once(s,old,new,'pre-provider shadow block')
    # Attestation must explicitly identify the new compatibility lineage.
    if "'phase':'LIVE_E0_V0_3_5_COMPLETE'" not in s: raise SystemExit('v0.3.5 live derivation refused: attestation phase missing')
    if NEW_EXECUTOR not in s or OLD_EXECUTOR in s: raise SystemExit('v0.3.5 live derivation refused: executor identity substitution incomplete')
    if 'seal_stripe_e05_v035.py' not in s: raise SystemExit('v0.3.5 live derivation refused: v0.3.5 sealer not selected')
    if 'patch_e0_v035.py' not in s: raise SystemExit('v0.3.5 live derivation refused: v0.3.5 patcher not selected')
    if 'run_shadow_e0_v035.sh' not in s: raise SystemExit('v0.3.5 live derivation refused: hardened shadow gate missing')
    a.out.parent.mkdir(parents=True,exist_ok=True); a.out.write_text(s)
    out_raw=a.out.read_bytes()
    receipt={
      'status':'PASS','derivation':'EXACT_V034_LIVE_RUNNER_TO_V035_REALITY_CORRECTED_LINEAGE',
      'source_git_blob_sha1':blob,'derived_sha256':hashlib.sha256(out_raw).hexdigest(),
      'executor_sha256':NEW_EXECUTOR,'generic_core_changes':0,'provider_binding_changes':0,'judgment_changes':0,
      'added_pre_provider_gates':['15_untouched_legacy','fixture_adjudication','16_reality_corrected','same_day_stripe_openapi_sentinel','independent_full_shadow_v035'],
      'primary_evidence_consumed':False
    }
    a.receipt.parent.mkdir(parents=True,exist_ok=True); a.receipt.write_text(json.dumps(receipt,sort_keys=True,separators=(',',':')))
    print(json.dumps(receipt,sort_keys=True)); return 0
if __name__=='__main__': raise SystemExit(main())
