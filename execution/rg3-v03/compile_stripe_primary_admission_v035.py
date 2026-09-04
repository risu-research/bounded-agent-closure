#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

EXPECTED_STATUS='SEALED_LIVE_E0_QUALIFIED_READY_FOR_STRIPE_PRIMARY'
EXPECTED_PROVIDER='stripe'
EXPECTED_API='2026-08-26.dahlia'
EXPECTED_EXECUTOR='241f4497d18708012be4da00cd6fbc97643e594371641fff1de2ac9ac7c92c8f'
FROZEN_BINDING='sha256:f41fbe34bb0319471327f6b0fcf5f3bba730f1fc1ed904199e41b0c9c9fde09f'
FROZEN_SOURCE_COMMIT='455184caf716751148b7c9c2a372b66084dcaa30'
SCENARIOS=[
 'S1_ORDINARY_REFUND_SUCCESS','S2_SAME_KEY_RETRY_AFTER_RESPONSE_GUILLOTINE',
 'S3_DIFFERENT_KEY_DUPLICATE_NEGATIVE_CONTROL','S4_ASYNC_PENDING_TO_SUCCEEDED',
 'S5_ASYNC_SUCCEEDED_TO_FAILED','S6_PARTIAL_EVIDENCE_COMPLETENESS_REMOVAL',
 'S7_WEBHOOK_DUPLICATE_REORDERING_NONAUTHORITATIVE_CONTROL']
SECRET_MARKERS=(b'sk_test_',b'rk_test_',b'sk_live_',b'rk_live_',b'rkcs_')

def sha256(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()
def canon(o)->bytes: return json.dumps(o,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def load(p:Path): return json.loads(p.read_text())
def no_secret(p:Path):
    raw=p.read_bytes()
    for m in SECRET_MARKERS:
        if m in raw: raise SystemExit(f'admission refused: secret-like marker {m.decode()} in {p.name}')

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--e05-lock',type=Path,required=True); ap.add_argument('--e05-manifest',type=Path,required=True)
    ap.add_argument('--final-seal',type=Path,required=True); ap.add_argument('--scenario-prelock',type=Path,required=True)
    ap.add_argument('--out-dir',type=Path,required=True); a=ap.parse_args()
    for p in (a.e05_lock,a.e05_manifest,a.final_seal,a.scenario_prelock):
        if not p.is_file(): raise SystemExit(f'admission refused: missing {p}')
        no_secret(p)
    lock=load(a.e05_lock); man=load(a.e05_manifest); seal=load(a.final_seal); sp=load(a.scenario_prelock)
    if lock.get('status')!=EXPECTED_STATUS: raise SystemExit('admission refused: E0.5 not sealed-ready')
    if lock.get('provider')!=EXPECTED_PROVIDER or lock.get('api_version')!=EXPECTED_API: raise SystemExit('admission refused: provider/API mismatch')
    if lock.get('execution_compatibility_version')!='0.3.5' or lock.get('executor_sha256')!=EXPECTED_EXECUTOR: raise SystemExit('admission refused: executor lineage mismatch')
    if lock.get('generic_core_changes')!=0 or lock.get('provider_semantic_changes')!=0 or lock.get('judgment_changes')!=0: raise SystemExit('admission refused: forbidden semantic/core mutation')
    if lock.get('primary_evidence_consumed') is not False: raise SystemExit('admission refused: primary already consumed')
    if lock.get('repetitions')!=5: raise SystemExit('admission refused: calibration repetitions mismatch')
    for k in ('D_obs_seconds','H_check_seconds','observation_max_gap_seconds','e0_result_sha256','calibration_sha256','live_attestation_sha256'):
        if k not in lock: raise SystemExit(f'admission refused: missing lock field {k}')
    lock_sha=sha256(a.e05_lock)
    if man.get('STRIPE_E0_5_LOCK.json')!=lock_sha: raise SystemExit('admission refused: E0.5 manifest/lock hash mismatch')
    if seal.get('source_commit') not in (None,FROZEN_SOURCE_COMMIT): raise SystemExit('admission refused: frozen source commit mismatch')
    if sp.get('provider')!='stripe' or sp.get('api_version')!=EXPECTED_API or sp.get('execution_compatibility_version')!='0.3.5': raise SystemExit('admission refused: scenario prelock lineage mismatch')
    if sp.get('stripe_binding_sha256')!=FROZEN_BINDING.removeprefix('sha256:'): raise SystemExit('admission refused: scenario prelock binding mismatch')
    if sp.get('generic_core_changes')!=0 or sp.get('provider_binding_changes')!=0 or sp.get('judgment_changes')!=0 or sp.get('primary_evidence_consumed') is not False: raise SystemExit('admission refused: scenario prelock mutation/evidence contamination')
    ids=[x.get('scenario_id') for x in sp.get('scenarios',[])]
    if ids!=SCENARIOS: raise SystemExit(f'admission refused: scenario order mismatch {ids}')
    contract=sp.get('logical_contract') or {}
    if contract!={'amount_minor':100,'currency':'usd','j8_expected':'UNKNOWN_IN_SANDBOX','original_payment_amount_minor':2000}: raise SystemExit('admission refused: logical contract drift')
    nonneg=sp.get('nonnegotiable') or {}
    if not nonneg or any(v is not True for v in nonneg.values()): raise SystemExit('admission refused: nonnegotiable primary rule weakened')
    precommit={
      'status':'STRIPE_PRIMARY_ADMISSION_PRECOMMIT_ONLY','primary_execution_authorized':False,
      'reason':'Scenario implementation/oracle-vault and arm-commit machinery must be separately frozen and independently qualified before authorization.',
      'provider':'stripe','api_version':EXPECTED_API,'frozen_source_commit':FROZEN_SOURCE_COMMIT,'frozen_stripe_binding':FROZEN_BINDING,
      'execution_compatibility_version':'0.3.5','executor_sha256':EXPECTED_EXECUTOR,
      'e05_lock_sha256':lock_sha,'e05_manifest_sha256':sha256(a.e05_manifest),'preprimary_final_seal_sha256':sha256(a.final_seal),
      'scenario_prelock_sha256':sha256(a.scenario_prelock),'scenario_order':SCENARIOS,'logical_contract':contract,
      'calibration':{'D_obs_seconds':lock['D_obs_seconds'],'H_check_seconds':lock['H_check_seconds'],'observation_max_gap_seconds':lock['observation_max_gap_seconds']},
      'nonnegotiable_rules':sorted(nonneg.keys()),'provider_calls':0,'provider_mutations':0,'primary_evidence_consumed':False}
    a.out_dir.mkdir(parents=True,exist_ok=True)
    pp=a.out_dir/'STRIPE_PRIMARY_ADMISSION_PRECOMMIT.json'; pp.write_bytes(canon(precommit))
    manifest={'STRIPE_PRIMARY_ADMISSION_PRECOMMIT.json':sha256(pp)}
    mp=a.out_dir/'STRIPE_PRIMARY_ADMISSION_MANIFEST.json'; mp.write_bytes(canon(manifest))
    print(json.dumps({'status':'PASS','authorization':False,'precommit_sha256':manifest['STRIPE_PRIMARY_ADMISSION_PRECOMMIT.json'],'scenario_prelock_sha256':precommit['scenario_prelock_sha256'],'provider_calls':0,'primary_evidence_consumed':False},sort_keys=True)); return 0
if __name__=='__main__': raise SystemExit(main())
