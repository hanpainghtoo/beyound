import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateOrderPaymentProofUploadDto } from './create-order-payment-proof-upload.dto';

const dto = (contentType: string, sizeBytes: number) =>
  Object.assign(new CreateOrderPaymentProofUploadDto(), {
    fileName: 'proof.png',
    contentType,
    sizeBytes,
  });

describe('CreateOrderPaymentProofUploadDto', () => {
  it.each([
    ['image/jpeg', 1],
    ['image/png', 10 * 1024 * 1024],
    ['application/pdf', 1],
  ])('accepts %s within the ten MB cap', async (contentType, sizeBytes) => {
    await expect(validate(dto(contentType, sizeBytes))).resolves.toHaveLength(
      0,
    );
  });

  it.each([
    ['video/mp4', 1],
    ['text/plain', 1],
    ['image/png', 10 * 1024 * 1024 + 1],
  ])('rejects %s or oversized files', async (contentType, sizeBytes) => {
    await expect(
      validate(dto(contentType, sizeBytes)),
    ).resolves.not.toHaveLength(0);
  });

  // The client sends `purpose` with every upload; the global ValidationPipe
  // forbids unknown properties, so an undeclared purpose rejected the whole
  // proof upload before any bytes were registered.
  it('accepts the purpose the client sends for this route', async () => {
    await expect(
      validate(
        Object.assign(dto('image/png', 10), {
          purpose: 'order-payment-proof',
        }),
      ),
    ).resolves.toHaveLength(0);
  });

  it('rejects any other purpose on the order-proof route', async () => {
    await expect(
      validate(
        Object.assign(dto('image/png', 10), { purpose: 'billing-payment-proof' }),
      ),
    ).resolves.not.toHaveLength(0);
  });
});
