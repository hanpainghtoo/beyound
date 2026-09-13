import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export type ProviderCredentialSchemaField = {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  description?: string;
};

export type ProviderCredentialEnvelope = {
  encrypted: true;
  algorithm: typeof ALGORITHM;
  iv: string;
  tag: string;
  ciphertext: string;
  fields: string[];
};

export const providerCredentialSchemas: Record<
  string,
  ProviderCredentialSchemaField[]
> = {
  telegram: [
    {
      key: 'botToken',
      label: 'Bot token',
      required: true,
      secret: true,
      description: 'Telegram bot token issued by BotFather.',
    },
    {
      key: 'botUsername',
      label: 'Bot username',
      required: false,
      secret: false,
    },
    {
      key: 'secretToken',
      label: 'Webhook secret token',
      required: false,
      secret: true,
      description:
        'Secret token Telegram includes in webhook headers for callback verification.',
    },
  ],
  messenger: [
    {
      key: 'pageId',
      label: 'Page ID',
      required: true,
      secret: false,
    },
    {
      key: 'pageAccessToken',
      label: 'Page access token',
      required: true,
      secret: true,
    },
    {
      key: 'appSecret',
      label: 'App secret',
      required: true,
      secret: true,
    },
    {
      key: 'verifyToken',
      label: 'Webhook verify token',
      required: true,
      secret: true,
    },
  ],
  tiktok: [
    {
      key: 'clientKey',
      label: 'Client key',
      required: true,
      secret: false,
    },
    {
      key: 'clientSecret',
      label: 'Client secret',
      required: true,
      secret: true,
    },
    {
      key: 'accessToken',
      label: 'Access token',
      required: false,
      secret: true,
    },
    {
      key: 'openId',
      label: 'Open ID',
      required: false,
      secret: false,
    },
  ],
  viber: [
    {
      key: 'authToken',
      label: 'Viber auth token',
      required: true,
      secret: true,
      description: 'Viber Business Messages bot/account authentication token.',
    },
    {
      key: 'botName',
      label: 'Bot display name',
      required: false,
      secret: false,
    },
    {
      key: 'botAvatar',
      label: 'Bot avatar URL',
      required: false,
      secret: false,
    },
  ],
};

export function getProviderCredentialSchema(
  channelType: string,
): ProviderCredentialSchemaField[] {
  return providerCredentialSchemas[channelType] || [];
}

export function validateProviderCredentials(
  channelType: string,
  credentials: Record<string, any>,
): { valid: boolean; errors: string[]; missingFields: string[] } {
  const schema = getProviderCredentialSchema(channelType);
  const missingFields = schema
    .filter((field) => field.required && !credentials?.[field.key])
    .map((field) => field.key);

  return {
    valid: missingFields.length === 0,
    errors: missingFields.map(
      (field) => `Missing required provider credential: ${field}`,
    ),
    missingFields,
  };
}

export function encryptProviderCredentials(
  credentials: Record<string, any>,
  secret: string,
): ProviderCredentialEnvelope {
  const iv = randomBytes(12);
  const key = deriveCredentialKey(secret);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(credentials || {});
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: true,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    fields: Object.keys(credentials || {}),
  };
}

export function decryptProviderCredentials(
  credentials:
    | Record<string, any>
    | ProviderCredentialEnvelope
    | null
    | undefined,
  secret: string,
): Record<string, any> {
  if (!credentials) return {};
  if (!isProviderCredentialEnvelope(credentials)) return credentials;

  const key = deriveCredentialKey(secret);
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(credentials.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(credentials.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(credentials.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(plaintext);
}

export function redactProviderCredentials(
  channelType: string,
  credentials:
    | Record<string, any>
    | ProviderCredentialEnvelope
    | null
    | undefined,
): Record<string, any> {
  if (!credentials) return {};

  const schema = getProviderCredentialSchema(channelType);
  const secretFields = new Set(
    schema.filter((field) => field.secret).map((field) => field.key),
  );
  const fields = isProviderCredentialEnvelope(credentials)
    ? credentials.fields
    : Object.keys(credentials);

  return {
    configured: fields.length > 0,
    encrypted: isProviderCredentialEnvelope(credentials),
    fields,
    values: fields.reduce(
      (acc, field) => {
        acc[field] = secretFields.has(field) ? '********' : 'configured';
        return acc;
      },
      {} as Record<string, string>,
    ),
  };
}

export function isProviderCredentialEnvelope(
  value: any,
): value is ProviderCredentialEnvelope {
  return Boolean(
    value?.encrypted &&
    value?.algorithm === ALGORITHM &&
    value?.iv &&
    value?.tag &&
    value?.ciphertext,
  );
}

function deriveCredentialKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}
