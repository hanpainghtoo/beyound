import 'reflect-metadata';
import { validate } from 'class-validator';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { LinkOrderAttachmentDto } from './dto/link-order-attachment.dto';
import { AUDIT_LOG_KEY } from '../logging/decorators/audit-log.decorator';

describe('Order payment-proof attachment linking', () => {
  const file = {
    id: '11111111-1111-4111-8111-111111111111',
    purpose: 'order-payment-proof',
    uploadedAt: '2026-10-09T00:00:00Z',
    contentType: 'image/png',
    sizeBytes: 1000,
  };
  const make = (overrides: Record<string, unknown> = {}) => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      status: 'pending',
      attachments: [],
      ...overrides,
    } as any;
    const repo = {
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({
            getRepository: () => ({
              findOne: jest.fn().mockResolvedValue(order),
              save: jest.fn().mockResolvedValue(order),
            }),
          }),
        ),
      },
    };
    const media = { getDownloadUrl: jest.fn().mockResolvedValue({ file }) };
    const service = new OrderService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      media as any,
    );
    return { service, repo, media, order };
  };

  it('rejects registered but not uploaded files and cross-tenant file errors', async () => {
    const { service, media } = make();
    media.getDownloadUrl.mockResolvedValueOnce({
      file: { ...file, uploadedAt: undefined },
    });
    await expect(
      service.linkAttachment('tenant-1', 'order-1', {
        fileId: file.id,
        role: 'payment_proof',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    media.getDownloadUrl.mockRejectedValueOnce(new NotFoundException());
    await expect(
      service.linkAttachment('tenant-1', 'order-1', {
        fileId: file.id,
        role: 'payment_proof',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent and enforces status and ten-attachment cap', async () => {
    const existing = [{ fileId: file.id, role: 'payment_proof' }];
    const duplicate = make({ attachments: existing });
    await expect(
      duplicate.service.linkAttachment('tenant-1', 'order-1', {
        fileId: file.id,
        role: 'payment_proof',
      }),
    ).resolves.toBeDefined();
    expect(duplicate.order.attachments).toHaveLength(1);
    const invalid = make({ status: 'cancelled' });
    await expect(
      invalid.service.linkAttachment('tenant-1', 'order-1', {
        fileId: file.id,
        role: 'payment_proof',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const capped = make({
      attachments: Array.from({ length: 10 }, (_, index) => ({
        fileId: `file-${index}`,
        role: 'attachment',
      })),
    });
    await expect(
      capped.service.linkAttachment('tenant-1', 'order-1', {
        fileId: file.id,
        role: 'payment_proof',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates proof type and ten MB size', async () => {
    const { service, media } = make();
    media.getDownloadUrl.mockResolvedValueOnce({
      file: { ...file, contentType: 'video/mp4' },
    });
    await expect(
      service.linkAttachment('tenant-1', 'order-1', {
        fileId: file.id,
        role: 'payment_proof',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    media.getDownloadUrl.mockResolvedValueOnce({
      file: { ...file, sizeBytes: 10 * 1024 * 1024 + 1 },
    });
    await expect(
      service.linkAttachment('tenant-1', 'order-1', {
        fileId: file.id,
        role: 'payment_proof',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const dto = new LinkOrderAttachmentDto();
    dto.fileId = file.id;
    dto.role = 'payment_proof';
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('has audit metadata and the required role matrix', () => {
    expect(
      Reflect.getMetadata(
        AUDIT_LOG_KEY,
        OrderController.prototype.linkAttachment,
      ),
    ).toEqual({ action: 'order_attachment_linked', resourceType: 'order' });
    expect(
      Reflect.getMetadata('roles', OrderController.prototype.linkAttachment),
    ).toEqual(['owner', 'admin', 'supervisor', 'agent']);
  });
});
