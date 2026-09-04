# Facebook Messenger Channel Setup

Use this runbook to connect a tenant Facebook Page Messenger channel to Commerce OS.

## Required Access

- Admin access to the Facebook Page.
- Access to the Meta developer app connected to the Page.
- Page access token, app secret, and webhook verify token.
- Access to the ZayOS Business Workspace.

## Commerce OS Fields

| Field | Required | Notes |
| --- | --- | --- |
| Page ID | Yes | Facebook Page identifier. |
| Page access token | Yes | Secret token used for Messenger Send API calls. Commerce OS stores this encrypted. |
| App secret | Yes | Used for webhook signature validation. Commerce OS stores this encrypted. |
| Webhook verify token | Yes | Must match the token configured in Meta webhook settings. Commerce OS stores this encrypted. |
| Webhook URL | No | A single shared callback URL is used for all Messenger channels. Configure it once in the Meta app dashboard. |

## Setup Steps

1. In Meta for Developers, open the app connected to the tenant Page.
2. Enable Messenger for the app and generate a Page access token.
3. Choose a webhook verify token and keep it available.
4. In Commerce OS tenant dashboard, open `Channels`.
5. Add a `Facebook Messenger` channel.
6. Enter the Page ID, Page access token, app secret, and webhook verify token.
7. Save the channel.
8. Click `Test Connection`.
9. In the Meta app dashboard, set the shared webhook callback URL and verify token.
10. Subscribe the Page webhook to `messages`, `messaging_postbacks`,
    `message_deliveries`, and `message_reads`.

## Verification

- Credential status should show `configured` or `encrypted`.
- Provider status should show `connected` after a successful test.
- Meta webhook verification should return the challenge when the verify token matches.
- A test reply should return a Meta message ID and persist the outbound message as `sent`.
- Delivery callbacks should advance matching outbound messages to `delivered`.
- Read callbacks should advance eligible outbound messages through the provider
  watermark to `read`.
- Multiple tenants can share the same Meta app; webhook events are routed to the
  correct tenant based on the Facebook Page ID in the payload.

## Troubleshooting

- Webhook verification fails: confirm the verify token in Meta exactly matches the Commerce OS channel token.
- Signature validation fails: confirm the app secret belongs to the same Meta app.
- Send API errors: regenerate the Page access token and update the Commerce OS channel.
- Permission errors: confirm the app has the required Messenger permissions and
  that the recipient has initiated a conversation with the Page.
