# Consequence Category Kill Gate v0.1 — Outside-In Source Audit

Date: 2026-09-04
Status: SOURCE QUALIFICATION ONLY — NOT AN ARM RESULT

This audit asks only whether each frozen corpus case is supported by an independent source boundary. It does not score Project X or either baseline.

## P1 — AP2 payment receipt vs fulfillment

Source: https://ap2-protocol.org/ap2/specification/

Source boundary:

- AP2 defines authorization/payment mandates, verification responsibilities, and signed Checkout/Payment receipts.
- AP2 explicitly describes itself as a security feature within a Commerce Protocol and places catalog APIs, checkout updates, and specific commerce communication outside its scope.

Qualification: **PASS**

A valid AP2 payment/checkout authorization artifact can establish that an authorized payment flow was accepted without, by itself, establishing downstream merchant fulfillment of the intended good/service.

## P2 — x402 settlement vs resource delivery

Source: https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md

Source boundary:

- x402 separates payment verification/settlement from representation and resource execution.
- `/settle` durably commits payment state from the resource-server perspective.
- The specification states that settlement semantics vary by scheme: it may establish escrow, record a charge, consume a challenge, or transfer funds.

Qualification: **PASS**

A settlement response has a payment-side claim boundary. Resource delivery/usability is a distinct consequence unless the application binds it explicitly.

## P3 — Stripe refund succeeded vs broader finality

Source: https://docs.stripe.com/refunds

Source boundary:

- Stripe refund objects have provider states.
- Stripe test behavior includes asynchronous refund transitions, including a path in which a refund can be observed succeeded and later fail.

Qualification: **PASS**

A provider-state observation must not be upgraded automatically into an unbounded economic/commercial finality claim.

## O1 — Kubernetes DELETE 202 vs object absent

Source: https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/

Source boundary:

- DELETE on an object with finalizers sets `metadata.deletionTimestamp` and returns HTTP 202 Accepted.
- The object remains in Terminating until finalizer work completes and finalizers are removed.

Qualification: **PASS**

Request acceptance and complete deletion are explicitly different states in the platform contract.

## O2 — EC2 TerminateInstances response vs terminal consequence

Source: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_TerminateInstances.html

Source boundary:

- A successful termination response can report `currentState=shutting-down`.
- AWS documents that termination may take time and can appear stuck.
- Attached-volume consequences differ according to `DeleteOnTermination` and attachment history.

Qualification: **PASS**

The request response is not sufficient to prove terminal instance state plus the full intended resource disposition.

## W1 — GitHub workflow cancel 202 vs execution ceased

Sources:

- https://docs.github.com/en/rest/actions/workflow-runs
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation

Source boundary:

- REST cancellation returns HTTP 202 Accepted.
- GitHub then performs a multi-stage cancellation process.
- Jobs/steps whose conditions re-evaluate true can continue running; runners receive signals, and a forced server-side termination boundary exists later.

Qualification: **PASS**

Cancellation acceptance does not establish immediate cessation of all run-attributable execution or side effects.

## I1 — RFC 7009 HTTP 200 vs effective revocation everywhere

Source: https://www.rfc-editor.org/rfc/rfc7009.html

Source boundary:

- HTTP 200 is returned both for successful revocation and when an invalid token was submitted.
- The RFC explicitly acknowledges propagation delay.
- Revocation of related access/refresh tokens depends on authorization-server policy.

Qualification: **PASS**

A 200 response does not prove the broader consequence "all relevant authorization paths are unusable at every resource boundary that matters."

## I2 — Google Cloud service-account key deletion vs existing short-lived credentials

Source: https://docs.cloud.google.com/iam/docs/keys-create-delete

Source boundary:

- Deleting a service-account key prevents future authentication using that key.
- Google explicitly states that deleting the key does **not** revoke short-lived credentials already issued from it.

Qualification: **PASS — STRONG COUNTEREXAMPLE**

This is stronger than an asynchronous ambiguity: a successful key deletion and a still-valid derived credential can coexist by documented design.

## Source-audit result

Qualified cases: **8 / 8**

Material domains represented:

- agentic payments / commerce;
- cloud / infrastructure operations;
- workflow execution;
- identity / credential revocation.

The corpus therefore passes source qualification and may proceed to arm construction.

## Important limitation

This result does **not** establish that Project X is useful. It establishes only that the external systems contain real claim boundaries worth testing.

A baseline may still handle all eight boundaries cleanly with less machinery. If so, the horizontal Project X thesis should be killed.
