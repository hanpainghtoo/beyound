#!/usr/bin/env node

import { serviceAuthHeaders } from '@zayos/internal-service-auth';

const channelId = process.argv[2];
const coreApiUrl = process.env.CORE_API_URL;

if (!channelId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(channelId)) {
  console.error('Usage: node scripts/certify-telegram-channel.mjs <channel-uuid>');
  process.exit(2);
}

if (!coreApiUrl) {
  console.error('CORE_API_URL is required.');
  process.exit(2);
}

const report = {
  certifiedAt: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development',
  channelId,
  provider: 'telegram',
  checks: [],
  limitations: [],
  overall: 'pending',
};

try {
  const resolution = await coreGet(
    `/internal/channels/${encodeURIComponent(channelId)}/providers/telegram/webhook-resolution`,
    ['channel:webhook:resolve'],
  );
  report.checks.push({
    name: 'channel_resolution',
    ok: true,
    status: resolution.connectionStatus,
    webhookRegistrationStatus: resolution.webhookRegistrationStatus,
  });

  const verification = await coreGet(
    `/internal/channels/${encodeURIComponent(channelId)}/providers/telegram/verification`,
    ['channel:credentials:read'],
  );
  report.checks.push({
    name: 'channel_secret_configured',
    ok: Boolean(verification?.verification?.secretToken),
  });

  report.limitations.push(
    'Live Telegram getMe/getWebhookInfo/inbound/outbound certification requires a deployed public webhook URL, a real BotFather token, and a controlled Telegram user message.',
  );
  report.overall = 'implementation_checked_live_certification_pending';
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.checks.push({
    name: 'certification_script_failed',
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
  report.overall = 'failed';
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

async function coreGet(path, scopes) {
  const response = await fetch(`${coreApiUrl.replace(/\/$/, '')}${path}`, {
    method: 'GET',
    headers: {
      ...serviceAuthHeaders({
        audience: 'core-service',
        subject: 'platform-operations',
        scopes,
      }),
    },
  });
  if (!response.ok) {
    throw new Error(`Core API returned HTTP ${response.status} for ${path}`);
  }
  return response.json();
}
