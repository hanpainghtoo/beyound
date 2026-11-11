import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantPaymentMethodVersion } from './entities/payment-method-version.entity';
import { TenantPaymentMethod } from './entities/payment-method.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { Order } from '../order/entities/order.entity';
import { AuditLogService } from '../logging/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { EmailService } from '../email/email.service';
import { MediaLibraryService } from '../media/media-library.service';
import { PaymentImageUploadDto } from './dto/payment-image-upload.dto';

export type PaymentMethodInput = {
  id?: string;
  kind: 'kbzpay' | 'aya_pay' | 'other';
  name?: string;
  enabled: boolean;
  displayOrder: number;
  accountName: string;
  accountNumber: string;
  qrMediaId?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(TenantPaymentMethodVersion)
    private readonly versions: Repository<TenantPaymentMethodVersion>,
    @InjectRepository(TenantPaymentMethod)
    private readonly methods: Repository<TenantPaymentMethod>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(TenantUser)
    private readonly users: Repository<TenantUser>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly mediaLibrary?: MediaLibraryService,
  ) {}

  private canEdit(role: string, user: TenantUser, tenant: Tenant) {
    return (
      ['owner', 'admin'].includes(role) ||
      (role === 'supervisor' &&
        tenant.orderSettings?.paymentMethodsEdit === true)
    );
  }

  private safeMethod(method: TenantPaymentMethod, reveal: boolean) {
    return {
      id: method.id,
      kind: method.kind,
      name: method.name,
      enabled: method.enabled,
      displayOrder: method.displayOrder,
      accountName: method.accountName,
      accountNumber: reveal
        ? method.accountNumber
        : maskAccount(method.accountNumber),
      ...(reveal
        ? { qrMediaId: method.qrMediaId }
        : { hasImage: Boolean(method.qrMediaId) }),
      metadata: method.metadata,
    };
  }

  private async paymentMethodImage(
    mediaLibrary: MediaLibraryService | undefined,
    tenantId: string,
    fileId: string | null,
  ) {
    if (!mediaLibrary || !fileId) return null;
    try {
      return await mediaLibrary.getPaymentMethodImage(tenantId, fileId);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  async createImageUpload(
    tenantId: string,
    actorId: string,
    role: string,
    input: PaymentImageUploadDto,
  ) {
    const tenant = await this.tenants.findOneBy({ id: tenantId });
    const actor = await this.users.findOneBy({ id: actorId, tenantId });
    if (!tenant || !actor || !this.canEdit(role, actor, tenant))
      throw new ForbiddenException('tenant.payment_methods.edit is required');
    if (!this.mediaLibrary)
      throw new NotFoundException('Payment image storage is unavailable');
    const created = (await this.mediaLibrary.createPaymentMethodImageUpload(
      tenantId,
      actorId,
      input,
    )) as {
      file: { id: string };
      upload: {
        url: string;
        headers?: Record<string, string>;
        expiresAt: string;
      };
    };
    const download = (await this.mediaLibrary.getDownloadUrl(
      tenantId,
      created.file.id,
    )) as {
      download?: { url?: string; expiresAt?: string };
    };
    return {
      fileId: created.file.id,
      downloadUrl: download.download?.url || null,
      expiresAt: download.download?.expiresAt || created.upload.expiresAt,
      upload: created.upload,
    };
  }

  async getSettings(tenantId: string, reveal = false) {
    const version = await this.versions.findOne({
      where: { tenantId, status: 'published' },
      order: { version: 'DESC' },
      relations: ['methods'],
    });
    if (!version)
      return { version: null, methods: [], canRevealAccountNumbers: reveal };
    const methods = await Promise.all(
      [...version.methods]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(async (m) => {
          const image = await this.paymentMethodImage(
            this.mediaLibrary,
            tenantId,
            m.qrMediaId,
          );
          const validatedMethod = {
            ...m,
            qrMediaId: image ? m.qrMediaId : null,
          };
          return {
            ...this.safeMethod(validatedMethod, reveal),
            ...(reveal ? { image } : { hasImage: Boolean(image) }),
          };
        }),
    );
    return {
      version: version.version,
      status: version.status,
      publishedAt: version.publishedAt,
      publishedBy: version.publishedBy,
      methods,
    };
  }

  async hasEnabledMethod(tenantId: string) {
    return Boolean(
      await this.methods.findOne({ where: { tenantId, enabled: true } }),
    );
  }

  async getEnabledMethods(tenantId: string) {
    const version = await this.versions.findOne({
      where: { tenantId, status: 'published' },
      order: { version: 'DESC' },
      relations: ['methods'],
    });
    return version
      ? version.methods
          .filter((method) => method.enabled)
          .sort((a, b) => a.displayOrder - b.displayOrder)
      : [];
  }

  async saveAndPublish(
    tenantId: string,
    actorId: string,
    role: string,
    input: { expectedVersion: number | null; methods: PaymentMethodInput[] },
  ) {
    const tenant = await this.tenants.findOneBy({ id: tenantId });
    const actor = await this.users.findOneBy({ id: actorId, tenantId });
    if (!tenant || !actor || !this.canEdit(role, actor, tenant))
      throw new ForbiddenException('tenant.payment_methods.edit is required');
    const current = await this.versions.findOne({
      where: { tenantId },
      order: { version: 'DESC' },
      relations: ['methods'],
    });
    if ((current?.version ?? null) !== input.expectedVersion)
      throw new ConflictException('config_version_conflict');
    validateMethods(input.methods);
    const methods = await this.normalizeImageReferences(
      tenantId,
      input.methods,
      current,
    );
    let saved: TenantPaymentMethodVersion;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        if (current) {
          await manager.update(
            TenantPaymentMethodVersion,
            { id: current.id },
            { status: 'draft' },
          );
        }
        const version = manager.create(TenantPaymentMethodVersion, {
          tenantId,
          version: (current?.version ?? 0) + 1,
          status: 'published',
          publishedBy: actorId,
          publishedAt: new Date(),
        });
        const created = await manager.save(version);
        await manager.save(
          TenantPaymentMethod,
          methods.map((m) =>
            manager.create(TenantPaymentMethod, {
              ...m,
              tenantId,
              versionId: created.id,
              name:
                m.kind === 'other'
                  ? m.name
                  : m.kind === 'kbzpay'
                    ? 'KBZPay'
                    : 'AYA Pay',
              qrMediaId: m.qrMediaId ?? null,
              metadata: m.metadata ?? {},
            }),
          ),
        );
        return created;
      });
    } catch (error) {
      // Uploads are registered before this version is published. The media
      // library refuses to archive anything referenced by a historical method
      // or order snapshot, so this is a safe best-effort orphan cleanup.
      if (this.mediaLibrary) {
        await Promise.all(
          methods.map(async (method) => {
            if (!method.qrMediaId) return;
            try {
              await this.mediaLibrary?.archiveFile(tenantId, method.qrMediaId);
            } catch {
              /* referenced or already unavailable */
            }
          }),
        );
      }
      throw error;
    }
    await this.archiveReplacedImages(tenantId, current, methods);
    await this.audit.logTenantUserAction(tenantId, actorId, {
      action: 'payment_methods_published',
      resourceType: 'payment_method_version',
      resourceId: saved.id,
      newValues: {
        version: saved.version,
        methodKinds: methods.map((m) => m.kind),
        changedFields: ['methods'],
      },
    });
    const owner = await this.users.findOne({
      where: { tenantId, role: 'owner', status: 'active' },
    });
    if (owner && owner.id !== actorId)
      await this.notifications.createMany([
        {
          tenantId,
          userId: owner.id,
          type: 'info',
          title: 'Payment methods updated',
          message: `${actor.fullName || actor.email} published payment method version ${saved.version}.`,
          actionUrl: '/settings/payment-methods',
        },
      ]);
    if (owner && owner.id !== actorId && owner.email && this.emailService) {
      try {
        await this.emailService.sendPaymentMethodsPublished(owner.email, {
          actorName: actor.fullName || actor.email,
          version: saved.version,
          methodKinds: methods
            .filter((method) => method.enabled)
            .map((method) => method.kind),
        });
      } catch {
        // In-app delivery is durable; EmailService records SMTP failures.
      }
    }
    return this.getSettings(tenantId, true);
  }

  async selectMethod(
    tenantId: string,
    orderId: string,
    methodId: string,
    actorId?: string,
    expectedCustomerId?: string,
  ) {
    const order = await this.orders.findOne({
      where: { id: orderId, tenantId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (expectedCustomerId && order.customerId !== expectedCustomerId)
      throw new NotFoundException('Order not found');
    if (!['pending', 'rejected'].includes(order.status))
      throw new ConflictException('payment_method_selection_locked');
    if (order.paymentSubmittedAt)
      throw new ConflictException('payment_method_selection_locked');
    const method = await this.methods.findOne({
      where: { id: methodId, tenantId, enabled: true },
      relations: ['version'],
    });
    if (!method)
      throw new NotFoundException('Enabled payment method not found');
    order.paymentMethodId = method.id;
    order.paymentMethodConfigVersion = method.version.version;
    order.paymentMethodSnapshot = {
      id: method.id,
      kind: method.kind,
      name: method.name,
      accountName: method.accountName,
      accountNumber: method.accountNumber,
      qrMediaId: method.qrMediaId,
    };
    order.paymentTotalSnapshot = {
      amount: String(order.totalAmount),
      currency: order.currency,
    };
    order.paymentMethodSelectedAt = new Date();
    order.paymentMethodSelectedBy = actorId ?? null;
    return this.orders.save(order);
  }

  private async normalizeImageReferences(
    tenantId: string,
    methods: PaymentMethodInput[],
    current: TenantPaymentMethodVersion | null,
  ) {
    if (!this.mediaLibrary) return methods;
    const currentImages = new Map(
      (current?.methods || []).map((method) => [method.id, method.qrMediaId]),
    );
    return Promise.all(
      methods.map(async (method) => {
        if (!method.qrMediaId) return method;
        try {
          await this.mediaLibrary!.getPaymentMethodImage(
            tenantId,
            method.qrMediaId,
          );
          return method;
        } catch (error) {
          if (
            error instanceof NotFoundException &&
            currentImages.get(method.id || '') === method.qrMediaId
          ) {
            return { ...method, qrMediaId: null };
          }
          throw error;
        }
      }),
    );
  }

  private async archiveReplacedImages(
    tenantId: string,
    current: TenantPaymentMethodVersion | null,
    nextMethods: PaymentMethodInput[],
  ) {
    if (!this.mediaLibrary || !current) return;
    const nextIds = new Set(
      nextMethods
        .map((method) => method.qrMediaId)
        .filter((id): id is string => Boolean(id)),
    );
    const oldIds = new Set(
      current.methods
        .map((method) => method.qrMediaId)
        .filter((id): id is string => Boolean(id)),
    );
    await Promise.all(
      [...oldIds]
        .filter((fileId) => !nextIds.has(fileId))
        .map(async (fileId) => {
          try {
            await this.mediaLibrary?.archiveFile(tenantId, fileId);
          } catch {
            // Historical versions and order snapshots intentionally keep the file.
          }
        }),
    );
  }
}

export function maskAccount(value: string) {
  if (!value) return '';
  const clean = String(value);
  return clean.length <= 4
    ? '••••'
    : `${'•'.repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`;
}
/**
 * Tenant payment methods are intentionally unlimited: a tenant may save any
 * number of cards, including duplicate built-in kinds (e.g. two KBZPay QRs
 * for different accounts). Only structural validity is enforced here — the
 * DB-level caps (trigger `trg_payment_method_limits`, partial unique index
 * `uq_payment_method_builtin_version`) were removed by migration
 * RemovePaymentMethodLimits for the same reason. Tenant data stays isolated
 * by `tenant_id` scoping on every read/write path, not by count.
 */
export function validateMethods(methods: PaymentMethodInput[]) {
  if (methods.some((m) => m.kind === 'other' && !m.name?.trim()))
    throw new ConflictException('custom_payment_method_name_required');
}
