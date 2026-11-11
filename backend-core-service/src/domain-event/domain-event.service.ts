import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DomainEvent } from './entities/domain-event.entity';

export type AppendDomainEventInput = {
  tenantId: string;
  actorId?: string;
  actorType?: string;
  entityType: string;
  entityId: string;
  eventType: string;
  payload?: Record<string, any>;
  source?: string;
  eventId?: string;
};

export type TimelineQueryOptions = {
  /** 1-based page number; values below 1 clamp to 1. */
  page?: number | string;
  /** Page size; clamped to 1..100, default 20. */
  limit?: number | string;
};

export type PaginatedTimeline = {
  data: DomainEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

const TIMELINE_DEFAULT_LIMIT = 20;
const TIMELINE_MAX_LIMIT = 100;

function clampPage(value: number | string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

function clampLimit(value: number | string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return TIMELINE_DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), TIMELINE_MAX_LIMIT);
}

@Injectable()
export class DomainEventService {
  constructor(
    @InjectRepository(DomainEvent)
    private domainEventRepository: Repository<DomainEvent>,
  ) {}

  async append(input: AppendDomainEventInput): Promise<DomainEvent> {
    const event = this.domainEventRepository.create({
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorType: input.actorType || 'system',
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      payload: input.payload || {},
      source: input.source || 'api',
    });

    return this.domainEventRepository.save(event);
  }

  appendInManager(manager: EntityManager, input: AppendDomainEventInput) {
    const event = manager.getRepository(DomainEvent).create({
      id: input.eventId,
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorType: input.actorType || 'system',
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      payload: input.payload || {},
      source: input.source || 'api',
      processedAt: null,
    });
    return manager.getRepository(DomainEvent).save(event);
  }

  async getEntityEvents(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<DomainEvent[]> {
    return this.domainEventRepository.find({
      where: { tenantId, entityType, entityId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Newest-first, paginated customer timeline. The old shape returned the
   * full ASC array, which grows unbounded on long-lived tenants — the
   * workspace detail pane now pages through it instead.
   */
  async getCustomerTimeline(
    tenantId: string,
    customerId: string,
    options: TimelineQueryOptions = {},
  ): Promise<PaginatedTimeline> {
    const page = clampPage(options.page);
    const limit = clampLimit(options.limit);
    const builder = this.domainEventRepository
      .createQueryBuilder('event')
      .where('event.tenant_id = :tenantId', { tenantId })
      .andWhere(
        "(event.entity_type = :customerEntity AND event.entity_id = :customerId OR event.payload ->> 'customerId' = :customerId)",
        { customerEntity: 'customer', customerId },
      )
      .orderBy('event.createdAt', 'DESC');
    const total = await builder.getCount();
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const data = await builder
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
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
}
