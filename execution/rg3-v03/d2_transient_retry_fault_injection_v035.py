#!/usr/bin/env python3
from __future__ import annotations
import io, json, sys, urllib.error, urllib.request
from email.message import Message
from pathlib import Path

RETRIABLE={429,500,502,503,504}
MAX_ATTEMPTS=4
BACKOFF=[0.25,0.5,1.0]

class FakeResponse:
    def __init__(self,obj): self.raw=json.dumps(obj).encode()
    def __enter__(self): return self
    def __exit__(self,*a): return False
    def read(self): return self.raw

def http_error(req,status,body,reason='synthetic'):
    hdr=Message(); hdr['Content-Type']='application/json'
    if status==429: hdr['Stripe-Rate-Limited-Reason']='endpoint-rate'
    return urllib.error.HTTPError(req.full_url,status,reason,hdr,io.BytesIO(json.dumps(body).encode()))

class SequenceURLopener:
    def __init__(self,steps): self.steps=list(steps); self.calls=[]
    def __call__(self,req,timeout=30.0):
        self.calls.append({'method':req.get_method(),'url':req.full_url,'idempotency_key':req.headers.get('Idempotency-key') or req.headers.get('Idempotency-Key')})
        if not self.steps: raise AssertionError('fake transport exhausted')
        s=self.steps.pop(0)
        if isinstance(s,BaseException): raise s
        if callable(s): return s(req)
        return FakeResponse(s)

def candidate_request(transport,method,path,*,params=None,idempotency_key=None,sleeps=None):
    safe=(method=='GET') or (method=='POST' and bool(idempotency_key))
    sleeps=sleeps if sleeps is not None else []
    for attempt in range(1,MAX_ATTEMPTS+1):
        try:
            return transport.stripe_request(method,path,params=params,idempotency_key=idempotency_key)
        except transport.ProviderHTTPError as e:
            if (not safe) or e.status not in RETRIABLE or attempt>=MAX_ATTEMPTS:
                raise
            sleeps.append(BACKOFF[attempt-1])

def run_case(transport,name,method,path,steps,*,params=None,idempotency_key=None,candidate=True,expect_status=None,expect_calls=None):
    fake=SequenceURLopener([])
    # Need request URL to construct HTTPError, so convert status descriptors lazily.
    def opener(req,timeout=30.0):
        fake.calls.append({'method':req.get_method(),'url':req.full_url,'idempotency_key':req.headers.get('Idempotency-key') or req.headers.get('Idempotency-Key')})
        if not steps: raise AssertionError('steps exhausted')
        s=steps.pop(0)
        if isinstance(s,tuple) and s[0]=='HTTP':
            status=s[1]; code=s[2]
            body={'error':{'type':'api_error' if status>=500 else 'invalid_request_error','code':code,'message':'synthetic '+code}}
            raise http_error(req,status,body)
        return FakeResponse(s)
    original=urllib.request.urlopen; urllib.request.urlopen=opener
    sleeps=[]; outcome={'case':name,'candidate':candidate}
    try:
        try:
            if candidate:
                obj=candidate_request(transport,method,path,params=params,idempotency_key=idempotency_key,sleeps=sleeps)
            else:
                obj=transport.stripe_request(method,path,params=params,idempotency_key=idempotency_key)
            outcome.update({'result':'SUCCESS','object':obj})
        except transport.ProviderHTTPError as e:
            outcome.update({'result':'PROVIDER_HTTP_ERROR','http_status':e.status})
    finally:
        urllib.request.urlopen=original
    outcome['calls']=len(fake.calls); outcome['call_trace']=fake.calls; outcome['backoff_schedule_requested']=sleeps
    if expect_status is not None and outcome['result']!=expect_status:
        raise AssertionError(f'{name}: expected {expect_status}, got {outcome}')
    if expect_calls is not None and outcome['calls']!=expect_calls:
        raise AssertionError(f'{name}: expected calls={expect_calls}, got {outcome}')
    return outcome

def main()->int:
    if len(sys.argv)!=4: raise SystemExit('usage: d2 SCRIPT SEALED_ROOT OUT')
    precommit=Path(sys.argv[1]); root=Path(sys.argv[2]); out=Path(sys.argv[3])
    pc=json.loads(precommit.read_text())
    assert pc['probe_id']=='D2_TRANSIENT_RETRY_DIFFERENTIAL_FAULT_INJECTION'
    sys.path.insert(0,str(root))
    from payments_rg3 import transport
    import os
    os.environ['STRIPE_SECRET_KEY']='sk_test_d2_synthetic_never_sent'
    cases=[]
    # Baseline vulnerabilities.
    cases.append(run_case(transport,'C1_BASELINE_LOCK_TIMEOUT','GET','/v1/refunds/re_d2',[('HTTP',429,'lock_timeout'),{'object':'refund','id':'re_d2','status':'succeeded'}],candidate=False,expect_status='PROVIDER_HTTP_ERROR',expect_calls=1))
    cases.append(run_case(transport,'C1_CANDIDATE_LOCK_TIMEOUT','GET','/v1/refunds/re_d2',[('HTTP',429,'lock_timeout'),{'object':'refund','id':'re_d2','status':'succeeded'}],candidate=True,expect_status='SUCCESS',expect_calls=2))
    cases.append(run_case(transport,'C2_CANDIDATE_ENDPOINT_RATE','GET','/v1/refunds/re_d2',[('HTTP',429,'rate_limit'),{'object':'refund','id':'re_d2','status':'succeeded'}],candidate=True,expect_status='SUCCESS',expect_calls=2))
    cases.append(run_case(transport,'C3_CANDIDATE_503_GET','GET','/v1/refunds/re_d2',[('HTTP',503,'service_unavailable'),{'object':'refund','id':'re_d2','status':'succeeded'}],candidate=True,expect_status='SUCCESS',expect_calls=2))
    idem='rg3-d2-fixed-idempotency-key'
    cases.append(run_case(transport,'C4_CANDIDATE_503_IDEMPOTENT_POST','POST','/v1/refunds',[('HTTP',503,'service_unavailable'),{'object':'refund','id':'re_d2','status':'succeeded'}],params={'payment_intent':'pi_d2','amount':100},idempotency_key=idem,candidate=True,expect_status='SUCCESS',expect_calls=2))
    assert all(x['idempotency_key']==idem for x in cases[-1]['call_trace'])
    cases.append(run_case(transport,'C5_503_NONIDEMPOTENT_POST','POST','/v1/refunds',[('HTTP',503,'service_unavailable'),{'object':'refund'}],params={'payment_intent':'pi_d2','amount':100},candidate=True,expect_status='PROVIDER_HTTP_ERROR',expect_calls=1))
    for name,status,code in [('C6_400',400,'parameter_invalid'),('C7_401',401,'api_key_expired')]:
        cases.append(run_case(transport,name,'GET','/v1/refunds/re_d2',[('HTTP',status,code),{'object':'refund'}],candidate=True,expect_status='PROVIDER_HTTP_ERROR',expect_calls=1))
    cases.append(run_case(transport,'C8_PERSISTENT_429','GET','/v1/refunds/re_d2',[('HTTP',429,'lock_timeout') for _ in range(4)],candidate=True,expect_status='PROVIDER_HTTP_ERROR',expect_calls=4))
    # C9: same logical async history; baseline dies on one transient, candidate preserves eventual terminal state.
    baseline=run_case(transport,'C9_BASELINE_ASYNC','GET','/v1/refunds/re_d2',[{'object':'refund','id':'re_d2','status':'pending'},('HTTP',429,'lock_timeout'),{'object':'refund','id':'re_d2','status':'succeeded'}],candidate=False,expect_status='SUCCESS',expect_calls=1)
    # Explicitly model next poll on baseline and show it aborts.
    baseline2=run_case(transport,'C9_BASELINE_ASYNC_SECOND_POLL','GET','/v1/refunds/re_d2',[('HTTP',429,'lock_timeout'),{'object':'refund','id':'re_d2','status':'succeeded'}],candidate=False,expect_status='PROVIDER_HTTP_ERROR',expect_calls=1)
    candidate=run_case(transport,'C9_CANDIDATE_ASYNC_TRANSIENT_TO_TERMINAL','GET','/v1/refunds/re_d2',[('HTTP',429,'lock_timeout'),{'object':'refund','id':'re_d2','status':'succeeded'}],candidate=True,expect_status='SUCCESS',expect_calls=2)
    cases.extend([baseline,baseline2,candidate])
    result={
      'probe_id':pc['probe_id'],'status':'PASS','provider_calls':0,'provider_mutations':0,'primary_evidence_consumed':False,
      'frozen_transport_retry_count':0,'candidate_policy':pc['candidate_policy'],'cases':cases,
      'findings':{
        'frozen_transport_single_transient_http_error_is_fatal':True,
        'bounded_retry_recovers_retriable_get':True,
        'bounded_retry_recovers_idempotent_post_with_same_key':True,
        'nontransient_4xx_fail_closed':True,
        'nonidempotent_post_not_retried':True,
        'persistent_transient_failure_bounded':True,
        'semantic_claims_changed':False
      }
    }
    out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(result,sort_keys=True,separators=(',',':')))
    print(json.dumps({'status':'PASS','cases':len(cases),'provider_calls':0,'frozen_transport_vulnerable_to_single_transient':True},sort_keys=True))
    return 0

if __name__=='__main__': raise SystemExit(main())
