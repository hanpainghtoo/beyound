import 'reflect-metadata';
import { validate } from 'class-validator';
import {
  CreateOrderPaymentDto,
  MarkOrderUnpaidDto,
} from './create-order-payment.dto';
import { LinkOrderAttachmentDto } from './link-order-attachment.dto';

const payment = (overrides: Record<string, unknown> = {}) =>
  Object.assign(new CreateOrderPaymentDto(), { amount: 100, ...overrides });

const link = (overrides: Record<string, unknown> = {}) =>
  Object.assign(new LinkOrderAttachmentDto(), {
    role: 'payment_proof',
    ...overrides,
  });

describe('order payment DTOs', () => {
  // File-storage ids are `file-<timestamp>-<random>`, not UUIDs. Validating
  // them as UUIDs silently rejected every saved payment proof.
  it.each([
    'file-1794000000000-abc123',
    'file-1-zz',
  ])('accepts the file-storage id %s as a proof reference', async (fileId) => {
    await expect(
      validate(payment({ proofFileId: fileId })),
    ).resolves.toHaveLength(0);
    await expect(validate(link({ fileId }))).resolves.toHaveLength(0);
  });

  it('rejects a non-string proof reference', async () => {
    await expect(
      validate(payment({ proofFileId: { id: 'file-1' } })),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(link({ fileId: { id: 'file-1' } })),
    ).resolves.not.toHaveLength(0);
  });

  it.each([0, -100])('rejects the non-positive payment amount %s', async (amount) => {
    await expect(validate(payment({ amount }))).resolves.not.toHaveLength(0);
  });

  it('requires a reason when marking an order unpaid', async () => {
    await expect(
      validate(Object.assign(new MarkOrderUnpaidDto(), {})),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(Object.assign(new MarkOrderUnpaidDto(), { reason: 'Reversal' })),
    ).resolves.toHaveLength(0);
  });
});
