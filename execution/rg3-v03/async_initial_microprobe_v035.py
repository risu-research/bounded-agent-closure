#!/usr/bin/env python3
from __future__ import annotations
import json, os, time, traceback
from pathlib import Path


def sanitize_provider_error(e):
    out={'error_type':type(e).__name__}
    if hasattr(e,'status'): out['http_status']=int(e.status)
    body=getattr(e,'body',None)
    if isinstance(body,str):
        try:
            j=json.loads(body); er=j.get('error') if isinstance(j,dict) else None
            if isinstance(er,dict):
                for k in ('type','code','decline_code','message'):
                    if er.get(k) is not None: out['stripe_'+k]=str(er[k])[:300]
        except Exception:
            out['body_parse']='NON_JSON_OR_UNAVAILABLE'
    return out


def main()->int:
    outp=Path(os.environ['RG3_D1_OUT'])
    from payments_rg3 import actions
    from payments_rg3.transport import ProviderHTTPError
    result={
      'probe_id':'D1_ASYNC_INITIAL_CAPABILITY_MICROPROBE',
      'execution_compatibility_version':'0.3.5',
      'api_version':'2026-08-26.dahlia',
      'fresh_claimable_sandbox':True,
      'uses_frozen_provider_stack':True,
      'terminal_polling_seconds':0,
      'provider_calls_budget':7,
      'provider_calls_completed':0,
      'provider_mutations':'TEST_SANDBOX_ONLY',
      'primary_evidence_consumed':False,
      'controls':{},
      'status':'STARTED'
    }
    calls=0
    def pi(amount,pm,key):
        nonlocal calls
        t=time.monotonic(); x=actions.stripe_create_payment_intent(amount_minor=amount,payment_method=pm,idempotency_key=key); calls+=1
        if x.get('object')!='payment_intent' or x.get('livemode') is not False or x.get('status')!='succeeded':
            raise RuntimeError(f'PaymentIntent invariant failed for {pm}')
        return x,time.monotonic()-t
    def refund(pid,key):
        nonlocal calls
        t=time.monotonic(); x=actions.stripe_create_refund(payment_intent=pid,amount_minor=100,idempotency_key=key); calls+=1
        if x.get('object')!='refund' or x.get('payment_intent')!=pid:
            raise RuntimeError('Refund invariant failed')
        return x,time.monotonic()-t
    def get_ref(rid,pid):
        nonlocal calls
        t=time.monotonic(); x=actions.stripe_get_refund(rid); calls+=1
        if x.get('object')!='refund' or x.get('id')!=rid or x.get('payment_intent')!=pid:
            raise RuntimeError('Refund GET invariant failed')
        return x,time.monotonic()-t
    try:
        seed,seed_dt=pi(5000,'pm_card_bypassPending','rg3-d1-seed-v035')
        result['seed']={'status':seed.get('status'),'latency_seconds':seed_dt}
        for pm,initial,terminal,label in [
          ('pm_card_pendingRefund','pending','succeeded','async_success'),
          ('pm_card_refundFail','succeeded','failed','async_failure')]:
            p,pdt=pi(500,pm,'rg3-d1-'+label+'-pi-v035')
            r,rdt=refund(p['id'],'rg3-d1-'+label+'-refund-v035')
            observed_initial=r.get('status')
            if observed_initial!=initial:
                raise RuntimeError(f'{label} initial status drift: {observed_initial!r}')
            g,gdt=get_ref(r['id'],p['id'])
            result['controls'][label]={
              'payment_method':pm,'expected_initial':initial,'expected_terminal':terminal,
              'create_refund_status':observed_initial,'immediate_get_status':g.get('status'),
              'payment_intent_latency_seconds':pdt,'refund_create_latency_seconds':rdt,'immediate_get_latency_seconds':gdt,
              'object_identity_checks':'PASS'
            }
        result['provider_calls_completed']=calls
        if calls!=7: raise RuntimeError(f'call budget drift: {calls}')
        result['status']='PASS'
        result['classification_effect']='REJECT_H3_SPECIAL_ASYNC_PM_UNSUPPORTED_IF_BOTH_CONTROLS_PRESENT'
        rc=0
    except ProviderHTTPError as e:
        result['provider_calls_completed']=calls
        result['status']='FAIL_PROVIDER_HTTP'
        result['provider_error']=sanitize_provider_error(e)
        rc=2
    except Exception as e:
        result['provider_calls_completed']=calls
        result['status']='FAIL_LOCAL_OR_SCHEMA'
        result['local_error_type']=type(e).__name__
        result['local_error_message']=str(e)[:500]
        rc=3
    outp.parent.mkdir(parents=True,exist_ok=True)
    outp.write_text(json.dumps(result,sort_keys=True,separators=(',',':')))
    print(json.dumps({'status':result['status'],'provider_calls_completed':calls,'primary_evidence_consumed':False},sort_keys=True))
    return rc

if __name__=='__main__': raise SystemExit(main())
