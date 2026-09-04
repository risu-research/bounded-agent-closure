#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math
from pathlib import Path

EXPECTED_EXECUTOR_SHA256='241f4497d18708012be4da00cd6fbc97643e594371641fff1de2ac9ac7c92c8f'
EXPECTED_API_VERSION='2026-08-26.dahlia'
EXPECTED_ATTESTATION_PHASE='LIVE_E0_V0_3_5_COMPLETE'
SECRET_MARKERS=(b'sk_test_',b'rk_test_',b'sk_live_',b'rk_live_',b'rkcs_')

def jdump(o): return json.dumps(o,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def sha(raw:bytes): return hashlib.sha256(raw).hexdigest()
def load(p:Path): return json.loads(p.read_text())
def clamp(x,lo,hi): return max(lo,min(hi,x))

def scan_public(path:Path):
    raw=path.read_bytes()
    for m in SECRET_MARKERS:
        if m in raw: raise SystemExit(f'E0.5 refused: secret-like marker {m.decode()} in {path.name}')

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--e0-result',type=Path,required=True)
    ap.add_argument('--calibration',type=Path,required=True)
    ap.add_argument('--attestation',type=Path,required=True)
    ap.add_argument('--out-dir',type=Path,required=True)
    a=ap.parse_args()
    for p in (a.e0_result,a.calibration,a.attestation):
        if not p.is_file(): raise SystemExit(f'E0.5 refused: missing {p}')
        scan_public(p)
    r=load(a.e0_result); c=load(a.calibration); att=load(a.attestation)
    if r.get('phase')!='STRIPE_E0_COMPLETE_PENDING_E0_5_SEAL': raise SystemExit('E0.5 refused: wrong E0 result phase')
    if r.get('primary_evidence_consumed') is not False: raise SystemExit('E0.5 refused: primary already consumed')
    if r.get('test_mode_confirmed') is not True: raise SystemExit('E0.5 refused: Stripe test mode not confirmed')
    if r.get('api_version')!=EXPECTED_API_VERSION: raise SystemExit('E0.5 refused: API version drift')
    if att.get('phase')!=EXPECTED_ATTESTATION_PHASE: raise SystemExit('E0.5 refused: wrong live attestation phase')
    if att.get('real_provider_interaction') is not True: raise SystemExit('E0.5 refused: synthetic/non-live attestation')
    if att.get('real_payment_mutations') is not True: raise SystemExit('E0.5 refused: no live payment mutation attested')
    if att.get('primary_evidence_consumed') is not False: raise SystemExit('E0.5 refused: attestation says primary consumed')
    if att.get('executor_sha256')!=EXPECTED_EXECUTOR_SHA256: raise SystemExit('E0.5 refused: executor identity mismatch')
    if att.get('live_mode_key_available') is not False: raise SystemExit('E0.5 refused: live-mode key availability not explicitly false')
    if sha(a.calibration.read_bytes())!=r.get('calibration_sha256'): raise SystemExit('E0.5 refused: calibration content hash mismatch')
    if r.get('calibration')!=c: raise SystemExit('E0.5 refused: embedded calibration differs from file')
    reps=r.get('repetitions')
    if not isinstance(reps,list) or len(reps)!=5: raise SystemExit('E0.5 refused: exactly five paired repetitions required')
    first=[]; terminal=[]
    for i,rep in enumerate(reps,1):
        if rep.get('rep')!=i: raise SystemExit('E0.5 refused: repetition numbering drift')
        s=rep.get('async_success') or {}; f=rep.get('async_failure') or {}
        if s.get('initial_status')!='pending' or s.get('terminal_status')!='succeeded': raise SystemExit('E0.5 refused: async-success control drift')
        if f.get('initial_status')!='succeeded' or f.get('terminal_status')!='failed': raise SystemExit('E0.5 refused: async-failure control drift')
        vals=[s.get('first_effect_latency'),f.get('first_effect_latency'),s.get('terminal_latency'),f.get('terminal_latency')]
        if any(not isinstance(x,(int,float)) or x<0 for x in vals): raise SystemExit('E0.5 refused: invalid latency')
        first.append(max(float(s['first_effect_latency']),float(f['first_effect_latency'])))
        terminal.append(max(float(s['terminal_latency']),float(f['terminal_latency'])))
    if [float(x) for x in c.get('first_effect_latencies',[])]!=first: raise SystemExit('E0.5 refused: first-effect vector mismatch')
    if [float(x) for x in c.get('terminal_latencies',[])]!=terminal: raise SystemExit('E0.5 refused: terminal vector mismatch')
    d=clamp(math.ceil(3*max(first)),10,120)
    h=clamp(math.ceil(3*max(terminal)),30,600)
    gap=max(1.0,min(5.0,float(d)/2.0))
    if max(terminal)>600: raise SystemExit('E0.5 refused: terminal ceiling exceeded')
    if c.get('provider')!='stripe' or c.get('repetitions')!=5: raise SystemExit('E0.5 refused: calibration metadata drift')
    if c.get('D_obs_seconds')!=d or c.get('H_check_seconds')!=h or float(c.get('observation_max_gap_seconds'))!=gap:
        raise SystemExit('E0.5 refused: calibration formula mismatch')
    a.out_dir.mkdir(parents=True,exist_ok=True)
    lock={
      'status':'SEALED_LIVE_E0_QUALIFIED_READY_FOR_STRIPE_PRIMARY',
      'provider':'stripe','api_version':EXPECTED_API_VERSION,
      'execution_compatibility_version':'0.3.5','executor_sha256':EXPECTED_EXECUTOR_SHA256,
      'D_obs_seconds':d,'H_check_seconds':h,'observation_max_gap_seconds':gap,
      'repetitions':5,
      'e0_result_sha256':sha(a.e0_result.read_bytes()),
      'calibration_sha256':sha(a.calibration.read_bytes()),
      'live_attestation_sha256':sha(a.attestation.read_bytes()),
      'source_run_id':att.get('github_run_id'),
      'credential_class':att.get('credential_class'),
      'generic_core_changes':0,'provider_semantic_changes':0,'judgment_changes':0,
      'primary_evidence_consumed':False,
    }
    lp=a.out_dir/'STRIPE_E0_5_LOCK.json'; lp.write_bytes(jdump(lock))
    manifest={'STRIPE_E0_5_LOCK.json':sha(lp.read_bytes())}
    mp=a.out_dir/'STRIPE_E0_5_MANIFEST.json'; mp.write_bytes(jdump(manifest))
    print(json.dumps({'status':'PASS','lock_sha256':manifest['STRIPE_E0_5_LOCK.json'],'D_obs_seconds':d,'H_check_seconds':h,'observation_max_gap_seconds':gap},sort_keys=True))
    return 0

if __name__=='__main__': raise SystemExit(main())
