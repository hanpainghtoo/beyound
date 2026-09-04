import { BadRequestException } from '@nestjs/common';

type AttachmentContext = {
  defaultRole?: string;
  source?: string;
  sourceMessageId?: string;
  linkedAt?: string;
};

const stringFields = [
  'fileName',
  'contentType',
  'url',
  'downloadUrl',
  'thumbnailFileId',
  'optimizedFileId',
  'externalAttachmentId',
  'provider',
];

export function normalizeAttachmentLinks(
  input: unknown,
  context: AttachmentContext = {},
): Record<string, any>[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    throw new BadRequestException('attachments must be an array');
  }

  const linkedAt = context.linkedAt || new Date().toISOString();

  return input.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BadRequestException(`attachments[${index}] must be an object`);
    }

    const attachment = item as Record<string, any>;
    const fileId = stringValue(attachment.fileId) || stringValue(attachment.id);
    if (!fileId) {
      throw new BadRequestException(`attachments[${index}].fileId is required`);
    }

    const normalized: Record<string, any> = {
      fileId,
      role: stringValue(attachment.role) || context.defaultRole || 'attachment',
      linkedAt,
    };

    for (const field of stringFields) {
      const value = stringValue(attachment[field]);
      if (value) normalized[field] = value;
    }

    const sizeBytes = Number(attachment.sizeBytes);
    if (Number.isFinite(sizeBytes) && sizeBytes >= 0) {
      normalized.sizeBytes = sizeBytes;
    }

    const source = stringValue(attachment.source) || context.source;
    if (source) normalized.source = source;

    const sourceMessageId =
      stringValue(attachment.sourceMessageId) || context.sourceMessageId;
    if (sourceMessageId) normalized.sourceMessageId = sourceMessageId;

    if (isPlainObject(attachment.metadata)) {
      normalized.metadata = attachment.metadata;
    }

    if (Array.isArray(attachment.mediaOutputs)) {
      normalized.mediaOutputs = attachment.mediaOutputs;
    }

    return normalized;
  });
}

export function mergeAttachmentLinks(
  ...groups: Array<Record<string, any>[]>
): Record<string, any>[] {
  const merged = new Map<string, Record<string, any>>();

  for (const group of groups) {
    for (const attachment of group) {
      const key = [
        attachment.fileId,
        attachment.sourceMessageId || '',
        attachment.role || '',
      ].join(':');
      merged.set(key, attachment);
    }
  }

  return [...merged.values()];
}

export function attachmentFileIds(
  attachments: Record<string, any>[] | undefined,
): string[] {
  return (attachments || [])
    .map((attachment) => stringValue(attachment.fileId))
    .filter((fileId): fileId is string => Boolean(fileId));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
