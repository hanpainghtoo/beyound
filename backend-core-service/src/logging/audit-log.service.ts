import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { PlatformAuditLog } from './entities/platform-audit-log.entity';
import { TenantAuditLog } from './entities/tenant-audit-log.entity';
import { LoggingService } from './logging.service';
import type { PaginationDto } from '../common/dto/pagination.dto';
import type { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import type { TenantAuditSummaryQueryDto } from './dto/tenant-audit-summary-query.dto';
import { redactSensitiveData } from './redaction.util';
import {
  mapTenantAuditSummaryRows,
  type TenantAuditSummaryRow,
  type TenantAuditUserSummary,
} from './audit-summary.util';
import { TenantUser } from '../auth/entities/tenant-user.entity';

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

  /**
   * Per-member audit rollup for the workspace audit screen.
   *
   * Aggregated in SQL so event counts and last-activity timestamps are exact
   * rather than derived from a fixed window of rows. Members with no events are
   * included via LEFT JOIN so the screen does not hide quiet accounts.
   */
  async getTenantAuditSummary(
    tenantId: string,
    query: TenantAuditSummaryQueryDto,
  ): Promise<PaginatedResult<TenantAuditUserSummary> & { totalEvents: number }> {
    const { page = 1, limit = 20, search, role, status } = query;
    const skip = (page - 1) * limit;

    const memberRepository = this.tenantAuditRepository.manager.getRepository(
      TenantUser,
    );

    const applyFilters = (qb: ReturnType<typeof memberRepository.createQueryBuilder>) => {
      if (search?.trim()) {
        const term = `%${search.trim()}%`;
        qb.andWhere(
          '(member.full_name ILIKE :search OR member.email ILIKE :search OR member.role ILIKE :search)',
          { search: term },
        );
      }
      if (role) {
        qb.andWhere('member.role = :role', { role });
      }
      if (status) {
        qb.andWhere('member.status = :status', { status });
      }
      return qb;
    };

    // `tenant_users.tenant_id` is varchar while `tenant_audit_logs.tenant_id`
    // is uuid, so the join is constrained by the validated tenant parameter
    // rather than by comparing the two columns directly.
    const baseQuery = applyFilters(
      memberRepository
        .createQueryBuilder('member')
        .select('member.id', 'id')
        .addSelect('member.full_name', 'full_name')
        .addSelect('member.email', 'email')
        .addSelect('member.role', 'role')
        .addSelect('member.status', 'status')
        .addSelect('member.is_online', 'is_online')
        .addSelect('member.last_seen_at', 'last_seen_at')
        .addSelect('member.created_at', 'created_at')
        .addSelect('COUNT(log.id)', 'event_count')
        .addSelect('MAX(log.created_at)', 'last_activity_at')
        .leftJoin(
          // Signature is (entity, alias, condition) — the alias is the 2nd
          // argument and the condition the 3rd, not the other way round.
          TenantAuditLog,
          'log',
          'log.user_id = member.id AND log.tenant_id = CAST(:tenantIdUuid AS uuid)',
          // Deliberately a separate parameter name from the WHERE below:
          // sharing one placeholder makes Postgres infer a single type from its
          // first use (uuid, from the cast) and then fail comparing varchar to uuid.
          { tenantIdUuid: tenantId },
        )
        .where('member.tenant_id = :tenantIdText', {
          tenantIdText: tenantId,
        }),
    ).groupBy('member.id');

    // Counted with the same filters but without the GROUP BY, so the total is
    // a member count rather than a group count.
    const totalUsers = await applyFilters(
      memberRepository
        .createQueryBuilder('member')
        .where('member.tenant_id = :tenantIdText', {
          tenantIdText: tenantId,
        }),
    ).getCount();

    // True event total across the whole tenant, independent of member paging.
    const totalEventsRaw = await this.tenantAuditRepository
      .createQueryBuilder('log')
      .select('COUNT(*)', 'count')
      .where('log.tenant_id = CAST(:tenantId AS uuid)', { tenantId })
      .getRawOne<{ count: string }>();
    const totalEvents = Number(totalEventsRaw?.count ?? 0) || 0;

    const rows = await baseQuery
      .clone()
      .orderBy('MAX(log.created_at)', 'DESC', 'NULLS LAST')
      .addOrderBy('COUNT(log.id)', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany<TenantAuditSummaryRow>();

    const totalPages = Math.ceil(totalUsers / limit);

    return {
      data: mapTenantAuditSummaryRows(rows),
      total: totalUsers,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      totalEvents,
    };
  }

  async getTenantAuditLogs(
    tenantId: string,
    paginationDto: PaginationDto,
    userId?: string,
  ): Promise<PaginatedResult<TenantAuditLog>> {
    const { page = 1, limit = 50, search, sortBy, sortOrder } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.tenantAuditRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .where('log.tenant_id = :tenantId', { tenantId });

    if (userId) {
      queryBuilder.andWhere('log.user_id = :userId', { userId });
    }

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
