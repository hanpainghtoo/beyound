import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { PlatformAuditLog } from './entities/platform-audit-log.entity';
import { TenantAuditLog } from './entities/tenant-audit-log.entity';
import { LoggingService } from './logging.service';
import type { PaginationDto } from '../common/dto/pagination.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { redactSensitiveData } from './redaction.util';

const auditLogSortColumns: Record<string, string> = {
  createdAt: 'log.createdAt',
  action: 'log.action',
  resourceType: 'log.resourceType',
};

export interface AuditLogData {
  action: string;
  resourceType?: string;
  resourceId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(PlatformAuditLog)
    private platformAuditRepository: Repository<PlatformAuditLog>,
    @InjectRepository(TenantAuditLog)
    private tenantAuditRepository: Repository<TenantAuditLog>,
    private loggingService: LoggingService,
  ) {}

  async logPlatformAdminAction(
    adminId: string,
    data: AuditLogData,
  ): Promise<void> {
    try {
      const safeData = redactSensitiveData(data);
      const auditLog = this.platformAuditRepository.create({
        adminId,
        action: safeData.action,
        resourceType: safeData.resourceType,
        resourceId: safeData.resourceId,
        oldValues: safeData.oldValues,
        newValues: safeData.newValues,
        ipAddress: safeData.ipAddress,
        userAgent: safeData.userAgent,
      });

      await this.platformAuditRepository.save(auditLog);

      // Also log to Winston for immediate visibility
      this.loggingService.logSecurityEvent(
        'Platform Admin Action',
        {
          adminId,
          action: safeData.action,
          resourceType: safeData.resourceType,
          resourceId: safeData.resourceId,
          ipAddress: safeData.ipAddress,
        },
        'PlatformAudit',
      );
    } catch (error) {
      this.loggingService.error(
        `Failed to log platform admin action: ${error.message}`,
        error.stack,
        'AuditLogService',
      );
    }
  }

  async getPlatformAuditLogs(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<PlatformAuditLog>> {
    const { page = 1, limit = 50, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.platformAuditRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.admin', 'admin');

    if (search) {
      queryBuilder.where(
        'log.action ILIKE :search OR log.resource_type ILIKE :search',
        { search: `%${search}%` },
      );
    }

    queryBuilder.orderBy(
      auditLogSortColumns[sortBy || 'createdAt'] || 'log.createdAt',
      sortOrder || 'DESC',
    );

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getTenantAuditLogs(
    tenantId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<TenantAuditLog>> {
    const { page = 1, limit = 50, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.tenantAuditRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .where('log.tenant_id = :tenantId', { tenantId });

    if (search) {
      queryBuilder.andWhere(
        'log.action ILIKE :search OR log.resource_type ILIKE :search',
        { search: `%${search}%` },
      );
    }

    queryBuilder.orderBy(
      auditLogSortColumns[sortBy || 'createdAt'] || 'log.createdAt',
      sortOrder || 'DESC',
    );

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async logTenantUserAction(
    tenantId: string,
    userId: string | null,
    data: AuditLogData,
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const safeData = redactSensitiveData(data);
      // When a transaction manager is supplied, write the audit row on the
      // same connection. This avoids FK key-share waits against row locks the
      // caller's transaction already holds (e.g. pessimistic tenant locks).
      const repository =
        manager?.getRepository(TenantAuditLog) || this.tenantAuditRepository;
      const auditLog = repository.create({
        tenantId,
        userId,
        action: safeData.action,
        resourceType: safeData.resourceType,
        resourceId: safeData.resourceId,
        oldValues: safeData.oldValues,
        newValues: safeData.newValues,
        ipAddress: safeData.ipAddress,
        userAgent: safeData.userAgent,
      });

      await repository.save(auditLog);

      // Also log to Winston
      this.loggingService.logSecurityEvent(
        'Tenant User Action',
        {
          tenantId,
          userId,
          action: safeData.action,
          resourceType: safeData.resourceType,
          resourceId: safeData.resourceId,
          ipAddress: safeData.ipAddress,
        },
        'TenantAudit',
      );
    } catch (error) {
      this.loggingService.error(
        `Failed to log tenant user action: ${error.message}`,
        error.stack,
        'AuditLogService',
      );
    }
  }

  // Convenience methods for common audit actions
  async logLogin(
    userId: string,
    tenantId?: string,
    ipAddress?: string,
    userAgent?: string,
    success = true,
  ) {
    const action = success ? 'user_login_success' : 'user_login_failed';

    if (tenantId) {
      await this.logTenantUserAction(tenantId, userId, {
        action,
        resourceType: 'authentication',
        ipAddress,
        userAgent,
      });
    }

    this.loggingService.logSecurityEvent(action, {
      userId,
      tenantId,
      ipAddress,
      userAgent,
    });
  }

  async logLogout(userId: string, tenantId?: string, ipAddress?: string) {
    if (tenantId) {
      await this.logTenantUserAction(tenantId, userId, {
        action: 'user_logout',
        resourceType: 'authentication',
        ipAddress,
      });
    }

    this.loggingService.logSecurityEvent('user_logout', {
      userId,
      tenantId,
      ipAddress,
    });
  }

  async logResourceCreate(
    userId: string,
    tenantId: string,
    resourceType: string,
    resourceId: string,
    newValues: any,
    ipAddress?: string,
  ) {
    await this.logTenantUserAction(tenantId, userId, {
      action: `${resourceType}_created`,
      resourceType,
      resourceId,
      newValues,
      ipAddress,
    });
  }

  async logResourceUpdate(
    userId: string,
    tenantId: string,
    resourceType: string,
    resourceId: string,
    oldValues: any,
    newValues: any,
    ipAddress?: string,
  ) {
    await this.logTenantUserAction(tenantId, userId, {
      action: `${resourceType}_updated`,
      resourceType,
      resourceId,
      oldValues,
      newValues,
      ipAddress,
    });
  }

  async logResourceDelete(
    userId: string,
    tenantId: string,
    resourceType: string,
    resourceId: string,
    oldValues: any,
    ipAddress?: string,
  ) {
    await this.logTenantUserAction(tenantId, userId, {
      action: `${resourceType}_deleted`,
      resourceType,
      resourceId,
      oldValues,
      ipAddress,
    });
  }
}
