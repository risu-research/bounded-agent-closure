# Prospective Holdout Contamination Ledger v0.1

Date: 2026-09-04
Purpose: preserve a genuinely unseen zero-shot holdout.

## Rule

Any operation/source whose consequence boundary was inspected while designing the compiler crucible is **ineligible for the official prospective holdout**.

These examples may later be used only as development or negative-control cases. They may not contribute to the official zero-shot pass rate.

## Excluded reconnaissance cases

### AWS Lambda asynchronous Invoke

Sources inspected:

- https://docs.aws.amazon.com/cli/latest/reference/lambda/invoke.html
- https://docs.aws.amazon.com/lambda/latest/dg/invocation-async.html

Observed boundary: asynchronous `InvocationType=Event` returns `202`; the API response does not reflect function execution errors; retries and duplicate delivery can occur.

Status: `EXCLUDED_FROM_OFFICIAL_HOLDOUT`

### Amazon SES SendEmail

Sources inspected:

- https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
- https://docs.aws.amazon.com/ses/latest/dg/send-email-concepts-process.html

Observed boundary: a successful request returns a MessageId when accepted, but SES can accept a message without subsequently sending it.

Status: `EXCLUDED_FROM_OFFICIAL_HOLDOUT`

### Twilio SendGrid Mail Send

Sources inspected:

- https://help.twilio.com/articles/47587887489563
- https://www.twilio.com/docs/sendgrid/for-developers/sending-email/web-api-vs-smtp

Observed boundary: HTTP 202 means accepted/queued, not delivered to the recipient; even downstream SMTP acceptance is not inbox delivery.

Status: `EXCLUDED_FROM_OFFICIAL_HOLDOUT`

### Azure Resource Manager asynchronous operations

Source inspected:

- https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations

Observed boundary: HTTP 201/202 can denote an unfinished operation; `Azure-AsyncOperation`/`Location` and retry semantics must be followed to terminal status.

Status: `EXCLUDED_FROM_OFFICIAL_HOLDOUT`

### AWS CloudFormation UpdateStack

Sources inspected:

- https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_UpdateStack.html
- https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-monitor-stack.html

Observed boundary: successful API call only starts the update; even stack `UPDATE_COMPLETE` can coexist with an old replacement resource that CloudFormation failed to delete and removed from stack management.

Status: `EXCLUDED_FROM_OFFICIAL_HOLDOUT`

### Amazon Route 53 ChangeResourceRecordSets / GetChange

Sources inspected:

- https://docs.aws.amazon.com/Route53/latest/APIReference/API_ChangeResourceRecordSets.html
- https://docs.aws.amazon.com/cli/latest/reference/route53/change-resource-record-sets.html

Observed boundary: `INSYNC` means propagation to Route 53 authoritative DNS servers; client/resolver observations also depend on DNS caching/TTL semantics.

Status: `EXCLUDED_FROM_OFFICIAL_HOLDOUT`

### Amazon SQS SendMessage / delivery semantics

Sources inspected:

- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html

Observed boundary: producer acceptance/storage is distinct from consumer processing; standard queues are at-least-once and may deliver duplicates/out of order.

Status: `EXCLUDED_FROM_OFFICIAL_HOLDOUT`

### Google Cloud Pub/Sub delivery / acknowledgement semantics

Sources inspected:

- https://docs.cloud.google.com/pubsub/docs/reference/rpc/google.pubsub.v1
- https://docs.cloud.google.com/pubsub/docs/exactly-once-delivery

Observed boundary: publication/delivery/acknowledgement/application processing are distinct; default delivery is at-least-once, and exactly-once guarantees have explicit subscription and regional scope.

Status: `EXCLUDED_FROM_OFFICIAL_HOLDOUT`

### GitHub repository_dispatch

Sources inspected:

- https://docs.github.com/en/rest/repos/repos
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

Observed boundary: creating `repository_dispatch` returns HTTP 204 and emits an event; downstream workflow existence, start, execution, and terminal outcome are separate conditions.

Status: `EXCLUDED_FROM_OFFICIAL_HOLDOUT`

## Also excluded because they are in the category-gate development corpus

- AP2 payment receipt / fulfillment
- x402 settlement / resource delivery
- Stripe refund success / economic finality
- Kubernetes finalizer deletion
- EC2 termination
- GitHub Actions cancellation
- OAuth RFC 7009 revocation
- Google Cloud service-account key deletion

## Official holdout eligibility

The official prospective holdout selector must reject:

1. every operation listed above;
2. semantically trivial renamings of the same operation from another SDK surface;
3. the same provider operation through CLI vs REST vs SDK;
4. any case for which holdout-specific evidence logic was added before reveal.

This ledger is monotonic. New contamination may be appended; entries may not be removed to improve the score.
