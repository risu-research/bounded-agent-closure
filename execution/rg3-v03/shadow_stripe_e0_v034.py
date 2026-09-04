#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, importlib.util, json, os, shutil, urllib.parse, urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

API_VERSION='2026-08-26.dahlia'
PATCHED_EXECUTOR_SHA256='0be42e97bb8a0e9ef966cadadfea2211f2443fac4bceff9bebea21a56be41603'


def jdump(o:Any)->bytes:
    return json.dumps(o,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()

def sha(raw:bytes)->str: return hashlib.sha256(raw).hexdigest()

def write_json(p:Path,o:Any)->str:
    p.parent.mkdir(parents=True,exist_ok=True); raw=jdump(o); p.write_bytes(raw); return sha(raw)

@dataclass
class Response:
    obj:dict
    def __enter__(self): return self
    def __exit__(self,*_): return False
    def read(self): return json.dumps(self.obj,separators=(',',':')).encode()

class ShadowStripe:
    """Deterministic provider twin for execution qualification only.

    It is intentionally NOT an empirical substitute for Stripe. It exists to drive the exact
    actions->transport->collector->binding->kernel->report path through clean, duplicate,
    truncation, schema-fail-closed, async-success, async-failure, and stable-rescan-race cases.
    """
    def __init__(self):
        self.pi_n=0; self.r_n=0; self.e_n=0
        self.pis={}; self.refunds={}; self.events=[]; self.idem={}
        self.http_calls=0; self.post_calls=0
        self.race_payment_intent=None; self.race_injected=False
        self.lifecycle_race_refund=None; self.lifecycle_race_injected=False
    def _refund_obj(self,r):
        return {k:r[k] for k in ('id','object','amount','currency','payment_intent','status','livemode','created')}
    def _event(self,typ,r):
        self.e_n+=1
        self.events.insert(0,{
            'id':f'evt_shadow_{self.e_n:05d}','object':'event','type':typ,'api_version':API_VERSION,
            'data':{'object':self._refund_obj(r)},
        })
    def _new_refund(self,pid,amount,pm,idem_key=None):
        self.r_n+=1; rid=f're_shadow_{self.r_n:05d}'
        initial='pending' if pm=='pm_card_pendingRefund' else 'succeeded'
        r={'id':rid,'object':'refund','amount':int(amount),'currency':'usd','payment_intent':pid,
           'status':initial,'livemode':False,'created':1700001000+self.r_n,
           '_pm':pm,'_gets':0}
        self.refunds[rid]=r
        if idem_key is not None: self.idem[('refund',idem_key)]=r
        self._event('refund.created',r)
        return r
    def _parse(self,req):
        method=req.get_method(); u=urllib.parse.urlparse(req.full_url); q=urllib.parse.parse_qs(u.query)
        if req.data:
            for k,v in urllib.parse.parse_qs(req.data.decode()).items(): q[k]=v
        return method,u.path,{k:(v[-1] if len(v)==1 else v) for k,v in q.items()}
    def urlopen(self,req,timeout=30.0):
        self.http_calls+=1
        method,path,p=self._parse(req)
        hdr={k.lower():v for k,v in req.header_items()}
        if hdr.get('stripe-version')!=API_VERSION: raise AssertionError('wrong Stripe-Version header')
        if not str(hdr.get('authorization','')).startswith('Basic '): raise AssertionError('missing Basic auth')
        if method=='POST': self.post_calls+=1
        if method=='POST' and path=='/v1/payment_intents':
            ik=hdr.get('idempotency-key'); key=('pi',ik)
            if key in self.idem: return Response(dict(self.idem[key]))
            self.pi_n+=1; pid=f'pi_shadow_{self.pi_n:05d}'
            obj={'id':pid,'object':'payment_intent','amount':int(p['amount']),'currency':p['currency'],
                 'payment_method':p['payment_method'],'status':'succeeded','livemode':False,'created':1700000000+self.pi_n}
            self.pis[pid]=obj; self.idem[key]=dict(obj); return Response(dict(obj))
        if method=='POST' and path=='/v1/refunds':
            ik=hdr.get('idempotency-key'); key=('refund',ik)
            if key in self.idem: return Response(self._refund_obj(self.idem[key]))
            pid=p['payment_intent']; r=self._new_refund(pid,int(p['amount']),self.pis[pid]['payment_method'],ik)
            return Response(self._refund_obj(r))
        if method=='GET' and path.startswith('/v1/refunds/'):
            rid=path.rsplit('/',1)[-1]; r=self.refunds[rid]; r['_gets']+=1
            if rid==self.lifecycle_race_refund and not self.lifecycle_race_injected:
                self.lifecycle_race_injected=True; self._event('refund.updated',r)
            if r['_pm']=='pm_card_pendingRefund' and r['_gets']>=2 and r['status']!='succeeded':
                r['status']='succeeded'; self._event('refund.updated',r)
            if r['_pm']=='pm_card_refundFail' and r['_gets']>=2 and r['status']!='failed':
                r['status']='failed'; self._event('refund.failed',r)
            return Response(self._refund_obj(r))
        if method=='GET' and path=='/v1/refunds':
            pid=p['payment_intent']; limit=int(p.get('limit',100)); starting=p.get('starting_after')
            arr=[self._refund_obj(r) for r in self.refunds.values() if r['payment_intent']==pid]
            arr=list(reversed(arr))
            if pid==self.race_payment_intent and not self.race_injected and starting is None:
                response_arr=list(arr)
                self.race_injected=True
                self._new_refund(pid,100,self.pis[pid]['payment_method'])
                arr=response_arr
            start=0
            if starting:
                ids=[x['id'] for x in arr]; start=ids.index(starting)+1
            page=arr[start:start+limit]; more=start+limit<len(arr)
            return Response({'object':'list','data':page,'has_more':more,'url':'/v1/refunds'})
        if method=='GET' and path=='/v1/events':
            limit=int(p.get('limit',100)); starting=p.get('starting_after'); arr=list(self.events); start=0
            if starting:
                ids=[x['id'] for x in arr]; start=ids.index(starting)+1
            page=arr[start:start+limit]; more=start+limit<len(arr)
            return Response({'object':'list','data':page,'has_more':more,'url':'/v1/events'})
        raise AssertionError((method,path,p))


def load_executor(path:Path):
    if sha(path.read_bytes())!=PATCHED_EXECUTOR_SHA256:
        raise SystemExit('shadow refused: patched executor identity mismatch')
    spec=importlib.util.spec_from_file_location('rg3_e0_v034',path)
    m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--executor',type=Path,required=True)
    ap.add_argument('--sealed-root',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    a=ap.parse_args(); shutil.rmtree(a.out,ignore_errors=True); a.out.mkdir(parents=True)
    vault=a.out/'.private-vault'; vault.mkdir(); os.chmod(vault,0o700)
    e0=load_executor(a.executor); shadow=ShadowStripe()
    original_urlopen=urllib.request.urlopen
    import time as time_module
    original_sleep=time_module.sleep
    urllib.request.urlopen=shadow.urlopen; time_module.sleep=lambda _:None
    os.environ['STRIPE_SECRET_KEY']='sk_test_shadow_e0_v034'
    try:
        e0.live_smoke(a.sealed_root,a.out/'smoke')
        full=e0.live_full(a.sealed_root,a.out/'full',vault)
        expected_clean={
            'J1_EFFECT_EXISTS':'PASS','J2_AT_MOST_ONE':'PASS','J3_AMOUNT_CURRENCY_MATCH':'PASS',
            'J4_ORIGINAL_PAYMENT_BOUND':'PASS','J5_PROVIDER_SUCCESS_AT_EPOCH':'PASS',
            'J6_STABLE_AT_CHECKPOINT':'UNKNOWN','J7_EVIDENCE_WITHIN_DEADLINE':'PASS',
            'J8_ECONOMIC_FINALITY':'UNKNOWN'}
        if full['clean_full_path']['judgments']!=expected_clean: raise AssertionError('clean judgment vector drift')
        if full['completeness_negative_control']!={'complete_J2':'FAIL','truncated_J2':'UNKNOWN'}:
            raise AssertionError('completeness negative control drift')
        if not all(x.get('rejected') is True for x in full['schema_negative_controls']):
            raise AssertionError('schema negative control not fail-closed')
        if not full['guillotine']['same_key_retry_same_refund'] or not full['guillotine']['different_key_distinct_refund']:
            raise AssertionError('guillotine idempotency control drift')
        if full['pagination']['pages']<2 or full['pagination']['first_has_more'] is not True or full['pagination']['last_has_more'] is not False:
            raise AssertionError('refund pagination path not exercised')
        if full['calibration']['repetitions']!=5: raise AssertionError('async repetition count drift')

        actions,collect,*_=e0.import_sealed(a.sealed_root)
        pi=actions.stripe_create_payment_intent(amount_minor=1000,payment_method='pm_card_bypassPending',idempotency_key=e0.idem('race-pi'))
        first=actions.stripe_create_refund(payment_intent=pi['id'],amount_minor=100,idempotency_key=e0.idem('race-r0'))
        shadow.race_payment_intent=pi['id']; shadow.lifecycle_race_refund=first['id']
        before_calls=shadow.http_calls
        race=e0.timed_stable_collect(collect,actions,pi['id'],max_rounds=4,sleep_seconds=0,refund_limit=100)
        after_calls=shadow.http_calls
        ids=e0._refund_ids(race['refund_scan_after'])
        if len(ids)!=2 or not shadow.race_injected or not shadow.lifecycle_race_injected:
            raise AssertionError('stable-rescan race injectors were not fully exercised')
        if after_calls-before_calls <= 5:
            raise AssertionError('stable-rescan did not retry after adversarial population/lifecycle change')

        result={
          'phase':'SHADOW_E0_V0_3_4_COMPLETE','status':'PASS',
          'executor_sha256':PATCHED_EXECUTOR_SHA256,
          'sealed_final_seal_sha256':sha((a.sealed_root/'FINAL_SEAL.json').read_bytes()),
          'smoke_pass':True,'full_pass':True,'clean_judgments':expected_clean,
          'guillotine':{'same_key_retry_same_refund':True,'different_key_distinct_refund':True},
          'pagination':full['pagination'],'completeness_negative_control':full['completeness_negative_control'],
          'schema_negative_controls':[x['label'] for x in full['schema_negative_controls']],
          'async_control_repetitions':5,
          'stable_rescan_race':{'population_race_injected':True,'lifecycle_race_injected':True,'final_refund_count':2,'retried':True},
          'synthetic_http_calls':shadow.http_calls,'synthetic_post_calls':shadow.post_calls,
          'real_provider_calls':0,'real_payment_mutations':0,'primary_evidence_consumed':False,
          'scientific_interpretation':'execution qualification only; synthetic provider twin is not Stripe evidence and does not calibrate live latency',
        }
        shutil.rmtree(vault)
        write_json(a.out/'SHADOW_E0_V034_RESULT.json',result)
        files={}
        for p in sorted(a.out.rglob('*')):
            if p.is_file() and p.name!='SHADOW_E0_V034_MANIFEST.json': files[str(p.relative_to(a.out))]=sha(p.read_bytes())
        manifest={'files':files,'real_provider_calls':0,'primary_evidence_consumed':False}
        write_json(a.out/'SHADOW_E0_V034_MANIFEST.json',manifest)
        print(json.dumps(result,sort_keys=True)); return 0
    finally:
        urllib.request.urlopen=original_urlopen; time_module.sleep=original_sleep
        os.environ.pop('STRIPE_SECRET_KEY',None)
        shutil.rmtree(vault,ignore_errors=True)

if __name__=='__main__': raise SystemExit(main())
