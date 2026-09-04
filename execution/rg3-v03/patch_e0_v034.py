#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

BASE_SHA256='9d9f6ac66663a3bc9786b4f2d61e90d90ec04e6a47da632081f39d69ad13e01f'
PATCHED_SHA256='0be42e97bb8a0e9ef966cadadfea2211f2443fac4bceff9bebea21a56be41603'

KEY_OLD='''    if not key.startswith(("sk_test_","rk_test_")):\n        raise SystemExit("REFUSED: unrecognized Stripe secret-key prefix; expected sk_test_ or rk_test_")\n    return key\n'''
KEY_NEW='''    if key.startswith("rkcs_"):\n        if os.environ.get("RG3_STRIPE_CLAIMABLE_SANDBOX_VERIFIED") != "1":\n            raise SystemExit("REFUSED: rkcs_ key requires verified Stripe CLI claimable-sandbox provenance")\n        return key\n    if not key.startswith(("sk_test_","rk_test_")):\n        raise SystemExit("REFUSED: unrecognized Stripe secret-key prefix; expected sk_test_, rk_test_, or provenance-verified rkcs_")\n    return key\n'''

IMPORT_OLD='''def import_sealed(root:Path):\n    sys.path.insert(0,str(root))\n    from payments_rg3 import actions, collect, stripe_binding, evaluator, calibration\n    from payments_rg3.binding_lock import load_lock\n    from payments_rg3.binding_common import UnsupportedProviderSchema\n    return actions,collect,stripe_binding,evaluator,calibration,load_lock,UnsupportedProviderSchema\n'''
IMPORT_NEW='''def load_lock(path:Path)->dict:\n    return json.loads(Path(path).read_text())\n\ndef import_sealed(root:Path):\n    sys.path.insert(0,str(root))\n    from payments_rg3 import actions, collect, stripe_binding, evaluator, calibration\n    from payments_rg3.binding_common import UnsupportedProviderSchema\n    return actions,collect,stripe_binding,evaluator,calibration,load_lock,UnsupportedProviderSchema\n'''

TRUNC_OLD='''    out["current_refunds"]=[r for r in out["current_refunds"] if r.get("id") in visible]\n    if set(r.get("id") for r in out["current_refunds"]) != visible:\n        raise RuntimeError("truncated control current-state coverage mismatch")\n    out["refund_scan_truncated"]=True\n    return out\n'''
TRUNC_NEW='''    out["current_refunds"]=[r for r in out["current_refunds"] if r.get("id") in visible]\n    if set(r.get("id") for r in out["current_refunds"]) != visible:\n        raise RuntimeError("truncated control current-state coverage mismatch")\n    for a in out.get("observation_attempts",[]):\n        a["observed_refund_ids"]=[rid for rid in a.get("observed_refund_ids",[]) if rid in visible]\n    out["refund_scan_truncated"]=True\n    return out\n'''

PATCHES=[
    ('claimable_sandbox_credential_gate', KEY_OLD, KEY_NEW),
    ('sealed_binding_lock_loader_bridge', IMPORT_OLD, IMPORT_NEW),
    ('truncated_observation_scope_alignment', TRUNC_OLD, TRUNC_NEW),
]

def sha(raw:bytes)->str: return hashlib.sha256(raw).hexdigest()

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--script',type=Path,required=True)
    ap.add_argument('--receipt',type=Path)
    a=ap.parse_args()
    raw=a.script.read_bytes(); got=sha(raw)
    if got!=BASE_SHA256:
        raise SystemExit(f'v0.3.4 patch refused: base executor SHA mismatch: {got}')
    s=raw.decode()
    applied=[]
    for name,old,new in PATCHES:
        n=s.count(old)
        if n!=1: raise SystemExit(f'v0.3.4 patch refused: {name} preimage count={n}')
        s=s.replace(old,new)
        applied.append(name)
    a.script.write_text(s)
    out_sha=sha(a.script.read_bytes())
    if out_sha!=PATCHED_SHA256:
        raise SystemExit(f'v0.3.4 patch output SHA mismatch: {out_sha}')
    receipt={
        'compatibility_version':'0.3.4',
        'base_executor_sha256':BASE_SHA256,
        'patched_executor_sha256':PATCHED_SHA256,
        'patches':applied,
        'generic_core_changes':0,
        'provider_semantic_changes':0,
        'judgment_changes':0,
        'primary_evidence_consumed':False,
    }
    if a.receipt:
        a.receipt.parent.mkdir(parents=True,exist_ok=True)
        a.receipt.write_text(json.dumps(receipt,sort_keys=True,separators=(',',':')))
    print(json.dumps(receipt,sort_keys=True))
    return 0

if __name__=='__main__': raise SystemExit(main())
