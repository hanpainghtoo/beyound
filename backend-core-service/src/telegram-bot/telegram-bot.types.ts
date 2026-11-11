export type TelegramSessionState = {
  version: number;
  state: string;
  data: Record<string, unknown>;
  expiresAt: string;
};

export type TelegramBotUpdate = {
  tenantId: string;
  channelId: string;
  userId: string;
  chatId: string;
  chatType?: string;
  callbackData?: string;
  callbackQueryId?: string;
};

export type TelegramCallback = {
  action: string;
  id?: string;
  page?: number;
  version?: number;
};

export const TELEGRAM_CALLBACK_MAX_BYTES = 64;

export function telegramCustomerKey(
  input: Pick<TelegramBotUpdate, 'tenantId' | 'channelId' | 'userId'>,
) {
  return `${input.tenantId}:${input.channelId}:${input.userId}`;
}

export function telegramSessionKey(
  input: Pick<TelegramBotUpdate, 'tenantId' | 'channelId' | 'userId'>,
) {
  return `telegram:session:${telegramCustomerKey(input)}`;
}

export function encodeTelegramCallback(
  action: string,
  id: string | undefined,
  page: number | undefined,
  version: number,
) {
  const compactId = id && isUuid(id) ? uuidToBase64Url(id) : id || '';
  return [action, compactId, page ?? '', version].join(':');
}

export function decodeTelegramCallbackId(id?: string) {
  if (!id || id.length !== 22) return id || undefined;
  try {
    const bytes = Buffer.from(id, 'base64url');
    if (bytes.length !== 16) return id;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return id;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function uuidToBase64Url(value: string) {
  return Buffer.from(value.replaceAll('-', ''), 'hex').toString('base64url');
}
