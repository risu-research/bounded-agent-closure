#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, subprocess, sys
from pathlib import Path

V034_SHA='0be42e97bb8a0e9ef966cadadfea2211f2443fac4bceff9bebea21a56be41603'
V035_SHA='241f4497d18708012be4da00cd6fbc97643e594371641fff1de2ac9ac7c92c8f'

INSERT='''def assert_refund_object(obj:dict, *, what:str, payment_intent:str|None=None):\n    if obj.get("object") != "refund":\n        raise RuntimeError(f"{what} is not a Stripe Refund object")\n    if payment_intent is not None and obj.get("payment_intent") != payment_intent:\n        raise RuntimeError(f"{what} is not bound to expected PaymentIntent")\n    if "livemode" in obj and obj.get("livemode") is not False:\n        raise RuntimeError(f"{what} carries livemode but it is not false")\n\n'''
REPLS=[
('def idem(prefix:str)->str:\n', INSERT+'def idem(prefix:str)->str:\n'),
('assert_test_object(refund,what="Refund")','assert_refund_object(refund,what="Refund",payment_intent=pi["id"])'),
('assert_test_object(got,what="Refund")','assert_refund_object(got,what="Refund",payment_intent=pi["id"])'),
('"refund":{"id":refund["id"],"livemode":refund["livemode"],"status":refund["status"]},','"refund":{"id":refund["id"],"payment_intent":refund.get("payment_intent"),"status":refund["status"],"test_context":"derived_from_test_only_credential_and_parent_payment_intent"},'),
('assert_test_object(upstream,what="guillotine upstream Refund")','assert_refund_object(upstream,what="guillotine upstream Refund",payment_intent=payment_intent)'),
('assert_test_object(c_ref,what="clean Refund")','assert_refund_object(c_ref,what="clean Refund",payment_intent=c_pi["id"])'),
('assert_test_object(retry,what="guillotine Retry Refund")','assert_refund_object(retry,what="guillotine Retry Refund",payment_intent=g_pi["id"])'),
('assert_test_object(upstream,what="private guillotine upstream Refund")','assert_refund_object(upstream,what="private guillotine upstream Refund",payment_intent=g_pi["id"])'),
('assert_test_object(different,what="different-key Refund")','assert_refund_object(different,what="different-key Refund",payment_intent=g_pi["id"])'),
('assert_test_object(r,what=f"{label} Refund")','assert_refund_object(r,what=f"{label} Refund",payment_intent=pi["id"])'),
('assert_test_object(r,what="Refund")','assert_refund_object(r,what="Refund")'),
]

def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()

def main()->int:
    ap=argparse.ArgumentParser(); ap.add_argument('--script',type=Path,required=True); ap.add_argument('--receipt',type=Path); a=ap.parse_args()
    base=Path(__file__).with_name('patch_e0_v034.py')
    subprocess.run([sys.executable,str(base),'--script',str(a.script)],check=True)
    if sha(a.script)!=V034_SHA: raise SystemExit('v0.3.5 refused: v0.3.4 preimage mismatch')
    s=a.script.read_text(); applied=[]
    for i,(old,new) in enumerate(REPLS,1):
        n=s.count(old)
        if n!=1: raise SystemExit(f'v0.3.5 refund-context patch {i} preimage count={n}')
        s=s.replace(old,new,1); applied.append(i)
    a.script.write_text(s)
    got=sha(a.script)
    if got!=V035_SHA: raise SystemExit(f'v0.3.5 output SHA mismatch: {got}')
    receipt={'compatibility_version':'0.3.5','preimage_executor_sha256':V034_SHA,'patched_executor_sha256':V035_SHA,'reality_trigger':'Stripe Refund object omits livemode; official Refund schema does not define that field','test_mode_proof':'test-only credential provenance + parent PaymentIntent livemode=false; Refund object identity and payment_intent binding enforced','generic_core_changes':0,'provider_binding_changes':0,'judgment_changes':0,'primary_evidence_consumed':False}
    if a.receipt:
        a.receipt.parent.mkdir(parents=True,exist_ok=True); a.receipt.write_text(json.dumps(receipt,sort_keys=True,separators=(',',':')))
    print(json.dumps(receipt,sort_keys=True)); return 0
if __name__=='__main__': raise SystemExit(main())
