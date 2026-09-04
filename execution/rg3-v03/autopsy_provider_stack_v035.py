#!/usr/bin/env python3
from __future__ import annotations
import ast, hashlib, json, re, sys
from pathlib import Path

TARGETS=(
    'ProviderHTTPError','stripe_get_refund','stripe_create_refund','stripe_create_payment_intent',
    'stripe_all_refunds','stripe_all_refund_events','api.stripe.com','HTTPError','urlopen','Request('
)

def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()

def main()->int:
    if len(sys.argv)!=3: raise SystemExit('usage: autopsy_provider_stack_v035.py SEALED_ROOT OUT')
    root,out=Path(sys.argv[1]),Path(sys.argv[2])
    if not root.is_dir(): raise SystemExit('sealed root missing')
    hits=[]; defs=[]
    for p in sorted(root.rglob('*.py')):
        try: text=p.read_text()
        except Exception: continue
        if not any(t in text for t in TARGETS): continue
        lines=text.splitlines()
        try: tree=ast.parse(text)
        except Exception: tree=None
        if tree:
            for n in ast.walk(tree):
                if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):
                    seg='\n'.join(lines[n.lineno-1:getattr(n,'end_lineno',n.lineno)])
                    if any(t in n.name or t in seg for t in TARGETS):
                        defs.append({
                            'file':str(p.relative_to(root)),'kind':type(n).__name__,'name':n.name,
                            'line_start':n.lineno,'line_end':getattr(n,'end_lineno',n.lineno),
                            'source':seg,'file_sha256':sha(p)
                        })
        for i,line in enumerate(lines,1):
            if any(t in line for t in TARGETS):
                lo=max(1,i-4); hi=min(len(lines),i+8)
                hits.append({'file':str(p.relative_to(root)),'line':i,'match':line.strip(),
                             'context':'\n'.join(lines[lo-1:hi]),'file_sha256':sha(p)})
    report={
      'status':'PASS','scope':'PROVIDER_FREE_FROZEN_PROVIDER_STACK_AUTOPSY',
      'provider_calls':0,'provider_mutations':0,'primary_evidence_consumed':False,
      'targets':list(TARGETS),'definitions':defs,'hits':hits,
      'matching_files':sorted({h['file'] for h in hits}|{d['file'] for d in defs})
    }
    out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,sort_keys=True,separators=(',',':')))
    print(json.dumps({'status':'PASS','matching_files':report['matching_files'],'definitions':len(defs),'hits':len(hits),'provider_calls':0},sort_keys=True))
    return 0

if __name__=='__main__': raise SystemExit(main())
