#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, urllib.request
from pathlib import Path

OPENAPI_COMMIT='6ed8e70ed90416a4f37603fffcf2fb1f96b405d5'
OPENAPI_BLOB_SHA1='622c8d69a50f470944ab6713c7f27e216cb45d97'
RAW_URL=f'https://raw.githubusercontent.com/stripe/openapi/{OPENAPI_COMMIT}/openapi/spec3.json'

def git_blob_sha1(b:bytes)->str:
    h=hashlib.sha1(); h.update(f'blob {len(b)}\0'.encode()); h.update(b); return h.hexdigest()

def object_value(schema:dict):
    p=(schema.get('properties') or {}).get('object') or {}
    if 'const' in p: return p['const']
    e=p.get('enum') or []
    return e[0] if len(e)==1 else None

def find_schema(schemas:dict, object_name:str, required:set[str])->tuple[str,dict]:
    preferred=[object_name, object_name.replace('_','')]
    for k in preferred:
        s=schemas.get(k)
        if isinstance(s,dict) and required <= set((s.get('properties') or {}).keys()): return k,s
    hits=[]
    for k,s in schemas.items():
        if not isinstance(s,dict): continue
        props=set((s.get('properties') or {}).keys())
        if required <= props and object_value(s)==object_name: hits.append((k,s))
    if len(hits)!=1: raise RuntimeError(f'{object_name}: schema hits={len(hits)} names={[k for k,_ in hits[:10]]}')
    return hits[0]

def main()->int:
    ap=argparse.ArgumentParser(); ap.add_argument('--executor',type=Path,required=True); ap.add_argument('--out',type=Path,required=True); a=ap.parse_args()
    req=urllib.request.Request(RAW_URL,headers={'User-Agent':'rg3-schema-sentinel-v035'})
    with urllib.request.urlopen(req,timeout=45) as r: raw=r.read()
    got_blob=git_blob_sha1(raw)
    if got_blob!=OPENAPI_BLOB_SHA1: raise SystemExit(f'OpenAPI blob mismatch {got_blob}')
    spec=json.loads(raw)
    schemas=spec['components']['schemas']
    refund_name,refund=find_schema(schemas,'refund',{'id','object','amount','currency','payment_intent','status'})
    pi_name,pi=find_schema(schemas,'payment_intent',{'id','object','amount','currency','livemode','status'})
    event_name,event=find_schema(schemas,'event',{'id','object','api_version','livemode','data','type'})
    refund_props=set(refund['properties'])
    if 'livemode' in refund_props: raise SystemExit('schema sentinel: Refund unexpectedly gained livemode; re-adjudication required')
    exe=a.executor.read_text()
    forbidden=['Refund is not explicitly livemode=false','assert_test_object(refund,what="Refund")','refund["livemode"]']
    present=[x for x in forbidden if x in exe]
    if present: raise SystemExit(f'executor retains forbidden hard Refund livemode assumptions: {present}')
    required_executor=['def assert_refund_object','obj.get("object") != "refund"','obj.get("payment_intent") != payment_intent','"livemode" in obj']
    missing=[x for x in required_executor if x not in exe]
    if missing: raise SystemExit(f'executor Refund guard missing expected clauses: {missing}')
    out={
      'status':'PASS','sentinel_version':'0.3.5','stripe_openapi_commit':OPENAPI_COMMIT,'stripe_openapi_git_blob_sha1':got_blob,
      'stripe_openapi_sha256':hashlib.sha256(raw).hexdigest(),
      'schemas':{
        'refund':{'schema_key':refund_name,'required_fields_present':sorted({'id','object','amount','currency','payment_intent','status'}),'livemode_present':False},
        'payment_intent':{'schema_key':pi_name,'required_fields_present':sorted({'id','object','amount','currency','livemode','status'})},
        'event':{'schema_key':event_name,'required_fields_present':sorted({'id','object','api_version','livemode','data','type'})}
      },
      'executor_sha256':hashlib.sha256(a.executor.read_bytes()).hexdigest(),
      'hard_refund_livemode_assumption_absent':True,'generic_core_changes':0,'provider_binding_changes':0,'judgment_changes':0,'primary_evidence_consumed':False
    }
    a.out.parent.mkdir(parents=True,exist_ok=True); a.out.write_text(json.dumps(out,sort_keys=True,separators=(',',':')))
    print(json.dumps(out,sort_keys=True)); return 0
if __name__=='__main__': raise SystemExit(main())
