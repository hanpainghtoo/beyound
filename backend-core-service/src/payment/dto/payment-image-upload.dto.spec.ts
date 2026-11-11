import 'reflect-metadata';
import { validate } from 'class-validator';
import { PaymentImageUploadDto } from './payment-image-upload.dto';

function input(contentType: string, sizeBytes: number) {
  const dto = new PaymentImageUploadDto();
  dto.fileName = 'payment.png';
  dto.contentType = contentType;
  dto.sizeBytes = sizeBytes;
  return dto;
}

describe('PaymentImageUploadDto', () => {
  it.each([
    ['image/png', 1024],
    ['image/jpeg', 1024],
    ['image/webp', 1024],
  ])('accepts %s within the 2 MiB limit', async (contentType, sizeBytes) => {
    await expect(validate(input(contentType, sizeBytes))).resolves.toHaveLength(
      0,
    );
  });

  it.each([
    ['image/svg+xml', 1024],
    ['image/png', 2 * 1024 * 1024 + 1],
  ])(
    'rejects %s outside the payment-image contract',
    async (contentType, sizeBytes) => {
      await expect(
        validate(input(contentType, sizeBytes)),
      ).resolves.not.toHaveLength(0);
    },
  );
});
