#!/usr/bin/env node
import { createHmac } from 'node:crypto';

const integrationServiceUrl = normalizeBaseUrl(process.env.INTEGRATION_SERVICE_URL || 'http://localhost:3004');
const webhookHandlerUrl = normalizeBaseUrl(process.env.WEBHOOK_HANDLER_URL || 'http://localhost:3003');
const selectedProviders = (process.env.PROVIDER_SMOKE_PROVIDERS || 'telegram,messenger,tiktok')
  .split(',')
  .map((provider) => provider.trim().toLowerCase())
  .filter(Boolean);
const requireAll = process.env.PROVIDER_SMOKE_REQUIRE_ALL === 'true';
const smokeMessage =
  process.env.PROVIDER_SMOKE_MESSAGE || `Commerce OS provider smoke ${new Date().toISOString()}`;

const results = [];

for (const provider of selectedProviders) {
  if (provider === 'telegram') {
    await smokeTelegram();
  } else if (provider === 'messenger' || provider === 'facebook') {
    await smokeMessenger();
  } else if (provider === 'tiktok') {
    await smokeTikTok();
  } else {
    record('skipped', provider, `Unsupported provider in PROVIDER_SMOKE_PROVIDERS: ${provider}`);
  }
}

const failed = results.filter((result) => result.status === 'failed');
const skipped = results.filter((result) => result.status === 'skipped');
const passed = results.filter((result) => result.status === 'passed');

console.log(
  JSON.stringify(
    {
      event: 'provider_credential_smoke_complete',
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
      results,
    },
    null,
    2,
  ),
);

if (failed.length > 0 || passed.length === 0 || (requireAll && skipped.length > 0)) {
  process.exitCode = 1;
}

async function smokeTelegram() {
  const channelId = process.env.TELEGRAM_CHANNEL_ID || 'telegram-smoke';
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    record('skipped', 'telegram.send', 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required');
  } else {
    await postSmoke('telegram.send', `${integrationServiceUrl}/providers/telegram/send`, {
      channelId,
      recipientId: chatId,
      content: smokeMessage,
      credentials: { botToken },
      metadata: { source: 'provider_credential_smoke' },
    }, (body) => body?.accepted === true);
  }

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (!botToken || !webhookUrl) {
    record('skipped', 'telegram.webhook', 'TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_URL are required');
    return;
  }

  await postSmoke('telegram.webhook', `${webhookHandlerUrl}/webhooks/telegram/${encodeURIComponent(channelId)}/register`, {
    botToken,
    webhookUrl,
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowedUpdates: ['message', 'edited_message', 'callback_query'],
    dropPendingUpdates: process.env.TELEGRAM_DROP_PENDING_UPDATES === 'true',
  }, (body) => body?.ok === true && body?.registered === true);
}

async function smokeMessenger() {
  const channelId = process.env.MESSENGER_CHANNEL_ID || process.env.MESSENGER_PAGE_ID || 'messenger-smoke';
  const pageId = process.env.MESSENGER_PAGE_ID;
  const pageAccessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  const recipientId = process.env.MESSENGER_RECIPIENT_ID;

  if (!pageId || !pageAccessToken || !recipientId) {
    record(
      'skipped',
      'messenger.send',
      'MESSENGER_PAGE_ID, MESSENGER_PAGE_ACCESS_TOKEN, and MESSENGER_RECIPIENT_ID are required',
    );
  } else {
    await postSmoke('messenger.send', `${integrationServiceUrl}/providers/messenger/send`, {
      channelId,
      recipientId,
      content: smokeMessage,
      credentials: { pageId, pageAccessToken },
      metadata: { source: 'provider_credential_smoke' },
    }, (body) => body?.accepted === true);
  }

  const verifyToken = process.env.MESSENGER_VERIFY_TOKEN;
  if (!verifyToken) {
    record('skipped', 'messenger.verify', 'MESSENGER_VERIFY_TOKEN is required');
    return;
  }

  const challenge = `commerce-os-smoke-${Date.now()}`;
  const verifyUrl = new URL(`${webhookHandlerUrl}/webhooks/messenger/${encodeURIComponent(channelId)}`);
  verifyUrl.searchParams.set('hub.mode', 'subscribe');
  verifyUrl.searchParams.set('hub.verify_token', verifyToken);
  verifyUrl.searchParams.set('hub.challenge', challenge);

  try {
    const response = await fetch(verifyUrl);
    const body = await response.text();
    if (response.ok && body === challenge) {
      record('passed', 'messenger.verify', 'Messenger webhook challenge matched');
      return;
    }

    record('failed', 'messenger.verify', `HTTP ${response.status}: ${body}`);
  } catch (error) {
    record('failed', 'messenger.verify', errorMessage(error));
  }
}

async function smokeTikTok() {
  const channelId = process.env.TIKTOK_CHANNEL_ID || 'tiktok-smoke';
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientSecret) {
    record('skipped', 'tiktok.inbound_capture', 'TIKTOK_CLIENT_SECRET is required');
    return;
  }

  const leadId = `smoke-${Date.now()}`;
  const payload = {
    event: 'lead.created',
    event_id: leadId,
    lead: {
      lead_id: leadId,
      form_id: process.env.TIKTOK_FORM_ID || 'smoke-form',
      advertiser_id: process.env.TIKTOK_ADVERTISER_ID || 'smoke-advertiser',
      user: {
        open_id: process.env.TIKTOK_OPEN_ID || 'smoke-open-id',
        username: 'commerce_os_smoke',
      },
      field_data: [
        { name: 'source', value: 'provider_credential_smoke' },
        { name: 'message', value: smokeMessage },
      ],
    },
  };
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', clientSecret).update(`${timestamp}.${body}`).digest('hex');

  await postSmoke(
    'tiktok.inbound_capture',
    `${webhookHandlerUrl}/webhooks/tiktok/${encodeURIComponent(channelId)}`,
    body,
    (responseBody) => responseBody?.accepted === true && responseBody?.eventId === `tiktok-${leadId}`,
    {
      'TikTok-Signature': `t=${timestamp},s=${signature}`,
    },
  );
}

async function postSmoke(name, url, payload, isSuccess, extraHeaders = {}) {
  try {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body,
    });
    const responseBody = await safeJson(response);

    if (response.ok && isSuccess(responseBody)) {
      record('passed', name, `HTTP ${response.status}`, summarizeResponse(responseBody));
      return;
    }

    record('failed', name, `HTTP ${response.status}: ${JSON.stringify(redact(responseBody))}`);
  } catch (error) {
    record('failed', name, errorMessage(error));
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function summarizeResponse(body) {
  if (!body || typeof body !== 'object') return undefined;
  return redact({
    provider: body.provider,
    status: body.status,
    accepted: body.accepted,
    ok: body.ok,
    eventId: body.eventId,
    externalMessageId: body.externalMessageId,
    registered: body.registered,
  });
}

function record(status, check, message, details) {
  const result = {
    status,
    check,
    message,
    ...(details ? { details } : {}),
  };
  results.push(result);
  console.log(JSON.stringify({ event: 'provider_credential_smoke_check', ...result }));
}

function normalizeBaseUrl(value) {
  return value.replace(/\/$/, '');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function redact(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item));

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      /token|secret|authorization|access/i.test(key) ? '********' : redact(entryValue),
    ]),
  );
}
