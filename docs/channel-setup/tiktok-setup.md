# TikTok Channel Setup

Use this runbook to prepare a tenant TikTok integration for Commerce OS.

## Current Status

TikTok support is implemented in Commerce OS for credential storage, webhook verification, and inbound lead/comment capture normalization.
The 2026-06-26 launch audit did not confirm a public TikTok direct-message send/inbox API surface suitable for Commerce OS csr messaging.
For public launch, treat TikTok as an approved inbound lead/comment capture channel unless a tenant provides written approval for a specific TikTok Business/API messaging surface.

## Required Access

- Access to the relevant TikTok developer or business product.
- Client key and client secret.
- Access token, Open ID, and advertiser ID when required by the approved API surface.
- Access to the ZayOS Business Workspace.

## Commerce OS Fields

| Field | Required | Notes |
| --- | --- | --- |
| Client key | Yes | TikTok app/client identifier. |
| Client secret | Yes | Secret used for API access. Commerce OS stores this encrypted. |
| Access token | No | Required only for some approved TikTok surfaces. Commerce OS stores this encrypted. |
| Open ID | No | Required only for some identity-specific surfaces. |
| Advertiser ID | No | Required only for approved ad/lead surfaces. |
| Webhook URL | No | Use the generated webhook endpoint when TikTok webhook support is confirmed. |

## Setup Steps

1. Confirm which TikTok API surface the tenant is approved to use. Do not assume direct-message sending is available.
2. Collect the client key and client secret.
3. Collect access token and Open ID if the approved surface requires them.
4. In Commerce OS tenant dashboard, open `Channels`.
5. Add a `TikTok` channel.
6. Enter the available TikTok credentials.
7. Save the channel.
8. Click `Test Connection`.

## Verification

- Credential status should show `configured` or `encrypted` when required credentials are present.
- Provider status may remain pending until live TikTok API access is confirmed.
- Outbound sends should return `unsupported_message_type` until a tenant-specific approved messaging API is implemented.
- Normalized TikTok lead events should create `messageType: lead`, stable external lead IDs, captured form fields in metadata, and readable lead summary content.
- Normalized TikTok comment events should create `messageType: comment`, stable external comment IDs, commenter/video metadata, and the comment text.

## Troubleshooting

- `Missing required provider credential: clientKey`: enter the TikTok client key.
- `Missing required provider credential: clientSecret`: enter the TikTok client secret.
- `unsupported_message_type`: Commerce OS is correctly blocking outbound TikTok messaging until the tenant has an approved messaging API surface.
- API access errors: verify the tenant has approval for the exact TikTok product surface being used.
