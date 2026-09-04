#!/usr/bin/env python3
from __future__ import annotations
import shadow_stripe_e0_v034 as v034

v034.PATCHED_EXECUTOR_SHA256='241f4497d18708012be4da00cd6fbc97643e594371641fff1de2ac9ac7c92c8f'

def refund_obj_without_livemode(self,r):
    return {k:r[k] for k in ('id','object','amount','currency','payment_intent','status','created')}

v034.ShadowStripe._refund_obj=refund_obj_without_livemode

if __name__=='__main__':
    raise SystemExit(v034.main())
