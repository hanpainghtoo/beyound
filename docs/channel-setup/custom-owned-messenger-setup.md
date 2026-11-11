# Custom-Owned Messenger App Setup

This runbook connects a Facebook Page to ZayOS using the merchant's **own Meta app**
instead of the shared ZayOS one-click app.

Use this flow when:

- the merchant wants to own the Meta app, permissions, and rate limits, or
- the platform admin has switched the merchant to **Customer-owned app** mode.

## Prerequisites

- Platform admin access to the platform console (`/platform-console`).
- Merchant workspace access (`/workspace`).
- A Facebook Page and a Facebook account with **admin** role on that Page.
- A Meta for Developers account.
- The merchant's subscription plan must include **Messenger** in **Allowed providers**,
  and the subscription period must be active.

## Who does what

| Step | Owner |
|---|---|
| 1 | Platform admin |
| 2–3 | Merchant |
| 4 | Platform admin |
| 5–7 | Merchant |
| 8 | Platform admin |
| 9 | Merchant |

---

## Step 1 — Select "Customer-owned app"

1. Open the platform console.
2. Go to **Merchants** → select the merchant.
3. Open the **Channel settings** tab.
4. Under **Facebook Messenger connection**, click **Customer-owned app**.

Do not leave it on **ZayOS one-click**.

---

## Step 2 — Create the Meta app

1. Open <https://developers.facebook.com/apps>.
2. Click **Create app**.
3. Choose the use case **"Engage with customers on Messenger from Meta"** under
   **Business messaging**.
4. Complete the app creation.
5. Add the **Messenger** product if it is not added automatically.
6. Add **Facebook Login for Business** if you intend to use a Login configuration
   (optional; ZayOS also supports scope-based login).

---

## Step 3 — Copy the App ID and App Secret

1. In the Meta app, open **App settings** → **Basic**.
2. Copy the **App ID**.
3. Click **Show** next to **App Secret** and copy it.
4. In the platform console → **Merchants** → merchant → **Channel settings** →
   **Customer-owned app**:
   - paste the **App ID** into **App ID**
   - paste the **App Secret** into **App Secret (write-only)**
   - optionally add **Login config ID** if you created a Facebook Login for Business
     configuration
5. Do not share the App Secret outside this form.

---

## Step 4 — Save and copy the webhook values

1. Click **Save** in Channel settings.
2. ZayOS generates a per-merchant webhook URL and a new verify token.
3. Copy both values immediately:
   - **Webhook URL**, for example
     `https://webhooks.zayos.com.mm/webhooks/messenger/t_xxxxxxxx`
   - **Verify token**
4. The full verify token is shown **only once**. Later reads show a masked value such as
   `****cdef`.
5. Once the Meta app is actually in **Live** mode, tick
   **Live mode confirmed (required to activate)** and save again if needed.

> Validation cannot reach `valid` without Live mode confirmed.

---

## Step 5 — Configure the Meta webhook

1. In the Meta app, open the **Messenger** product settings (the use case customization
   for "Engage with customers on Messenger from Meta").
2. Open **Webhooks** / **Callback URL**.
3. Paste the **Webhook URL** from Step 4 into **Callback URL**.
4. Paste the **Verify token** from Step 4 into **Verify token**.
5. Click **Verify and save**. Meta will call ZayOS; a matching token returns the
   challenge.
6. Subscribe the following four webhook fields:
   - `messages`
   - `messaging_postbacks`
   - `message_deliveries`
   - `message_reads`

---

## Step 6 — Connect the Page to the app

1. In the Meta app, open **Messenger** → **Settings**.
2. Under **Access tokens** / **Pages**, click **Add or remove Pages**.
3. Select the Facebook Page you want ZayOS to use.
4. Grant the requested Page permissions.

---

## Step 7 — Register the OAuth redirect URI

1. In the Meta app, open **Facebook Login for Business** → **Settings**.
2. Under **Valid OAuth Redirect URIs**, add:

```text
https://zayos.com.mm/workspace/channels/meta/callback
```

3. Save the change.

> Use the exact **OAuth redirect URI** shown in ZayOS Channel settings. In production it
> is `https://zayos.com.mm/workspace/channels/meta/callback`. If the workspace runs on a
> different origin, register that origin's `/workspace/channels/meta/callback` instead.
> ZayOS rejects a mismatch.

---

## Step 8 — Validate the app

1. Return to platform console → **Merchants** → merchant → **Channel settings**.
2. Confirm **Live mode confirmed** is ticked.
3. Click **Validate**.

Expected status:

| Status | Meaning |
|---|---|
| `valid` | App ID/Secret are correct and Live mode is confirmed |
| `pending` | Credentials are correct, but Live mode is not confirmed |
| `invalid` | Meta rejected the App ID/Secret |

If you see **"Concurrent modification detected. Please retry."**, save again. If you see
**"App state changed during validation"**, click **Validate** again.

---

## Step 9 — Connect Messenger from the merchant workspace

1. Open the merchant workspace.
2. Go to **Channels**.
3. Click **Add channel** → **Messenger**.
4. Click **Connect Facebook**.
5. A Facebook popup opens. Log in with an account that has admin access to the Page.
6. Approve the requested permissions.
7. If multiple Pages are available, select the Page to connect.
8. The popup closes and the Messenger channel appears as **Connected**.

ZayOS exchanges the login code using the stored App Secret, creates the channel, links it
to the merchant's Meta app, subscribes the Page, and runs a connection test.

---

## Verification

- Channel status shows **Connected**.
- Send a message to the Page → it appears **once** in the workspace **Inbox**.
- Reply from the inbox → the message arrives in Messenger and advances to **delivered** /
  **read**.
- Webhook deliveries and read receipts update the outbound message state.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Workspace shows "Facebook setup is being prepared by our team" | BYO app is not `valid` yet | Tick Live mode confirmed and click Validate |
| `Invalid App Secret` | App Secret does not match the app | Re-enter the correct secret, Save, Validate |
| `Redirect URI mismatch` / `not registered` | Redirect URI differs from ZayOS | Copy the exact URI from Channel settings into Meta |
| `App not live` | Meta app is still in Development mode | Switch to Live, tick Live mode confirmed, validate |
| `No eligible pages` | Signed-in user does not admin a Page, or permissions were not granted | Use a Page admin account and re-approve permissions |
| Webhook verification fails | Verify token mismatch | Re-copy the token from ZayOS and paste again |
| Signature validation fails | App Secret belongs to a different app | Confirm App ID/Secret come from the same Meta app |
| Messenger is locked in the workspace | Plan does not include Messenger | Enable `messenger` in the plan's Allowed providers |

## Notes

- Validation checks the app credentials against Meta. It does **not** configure the
  webhook or probe `subscribed_apps`; Steps 5–7 are required.
- With **Standard Access**, Meta only delivers messages from users who have a role on the
  app or Page. For public traffic, submit the app for **Advanced Access** for
  `pages_messaging`, `pages_show_list`, and `pages_manage_metadata`.
- The App Secret is stored encrypted and is never returned to the browser.
- The verify token is shown in full only once, immediately after Save.
