# RG3 Disposition — 2026-09-04

## Decision

**RG3 is SUSPENDED, not abandoned. Do not spend the next unit of work on a Stripe v0.5 repair or another live E0 run.**

The v0.3.5 autopsy already established that the live failure is in provider-observation transport robustness, not in the generic consequence semantics. D1 established that the two Stripe asynchronous refund test primitives behave as expected in a fresh claimable sandbox. D2 established, provider-free against the exact frozen transport, that a single transient HTTP fault kills the current observer and that a bounded retry policy can repair that failure without relaxing non-transient failures, non-idempotent mutation safety, or any semantic claim.

That is sufficient to show the engineering defect is repairable. Repairing it now would mostly increase the probability of a green Stripe E0; it would not materially answer the larger question.

## Larger question

The strategic objective is not to make a refund experiment pass. It is to decide whether there is a durable, valuable infrastructure category between an agent's authorized action and the real-world consequence that action is intended to establish.

The strongest version of the thesis is:

> Existing agentic stacks increasingly prove **who may act, what was authorized, what protocol messages were valid, and what a payment or API accepted**. A separate consequence layer is valuable only if those artifacts systematically fail to establish the consequential postcondition the principal actually cares about, and if one reusable mechanism can compile the missing evidence obligations across materially different systems more cheaply and reliably than bespoke code or a capable LLM.

A receipt is evidence. A successful API response is evidence. Neither is automatically the intended consequence.

## Why elevate now

The market has moved rapidly toward authorization, identity, mandate, wallet, and payment-rail infrastructure:

- Stripe Machine Payments Protocol / Agentic Commerce: https://stripe.com/blog/machine-payments-protocol
- AP2: https://ap2-protocol.org/ap2/specification/
- Mastercard agentic commerce / Verifiable Intent: https://www.mastercard.com/us/en/news-and-trends/stories/2026/mastercard-agentic-commerce-vision.html
- Visa Intelligent Commerce: https://corporate.visa.com/en/solutions/intelligent-commerce/vcs-agentic-ai.html

Those systems strengthen authorization and transaction validity. That makes a consequence layer more, not less, interesting — but only if it catches a distinct class of failures after authorization/protocol success.

## Why RG3 alone is insufficient

Even a perfect Stripe/Plaid result would primarily show that two payment providers share reusable semantic/evidence families under the frozen substrate. That is scientifically useful but strategically underpowered:

1. Payments may be unusually similar, so reuse there does not establish a horizontal category.
2. A high semantic-reuse score does not show that anyone needs the layer.
3. A provider adapter that becomes a polling/retry maintenance project can consume large engineering effort while contributing almost no category evidence.
4. A strong LLM plus ordinary provider-specific checks may be sufficient; if so, the generic layer should be killed rather than defended.

## New immediate objective

Run **Consequence Category Kill Gate v0.1** before any RG3 v0.5 live repair.

The gate must be allowed to kill one or both of these claims:

- **Horizontal category claim:** a reusable consequence/evidence compiler exists across heterogeneous consequential systems.
- **Payment wedge claim:** agentic payments are an unusually urgent first market for that compiler.

If the category gate fails, stop broad substrate expansion. Preserve the RG3/BAC/RISU results as research assets and pivot to a narrower vertical only if the vertical itself passes a buyer-value gate.

If the category gate passes, return to RG3 only as one executable provider leg of a larger consequence-contract compiler, not as an end in itself.

## Frozen RG3 status

Until the category gate resolves:

- no Stripe v0.5 live E0;
- no Plaid primary;
- no result-driven relaxation of judgments;
- no new generic operator or Observation ABI verb;
- D1/D2/autopsy artifacts remain immutable evidence;
- the bounded transient-retry repair is retained as an engineering candidate, not yet promoted into the frozen payment binding.

## Strategic success condition

The next milestone is not `STRIPE_E0_PASS`.

It is:

> **A falsifiable demonstration that current protocol/API success artifacts leave consequentially important claims undecidable, and that a reusable consequence-contract/evidence-plan mechanism resolves or precisely exposes those gaps across multiple domains with zero false decisive claims and materially less bespoke semantic work than strong baselines.**
