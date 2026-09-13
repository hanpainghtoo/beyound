import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

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
};

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

  async getCustomerTimeline(
    tenantId: string,
    customerId: string,
  ): Promise<DomainEvent[]> {
    return this.domainEventRepository
      .createQueryBuilder('event')
      .where('event.tenant_id = :tenantId', { tenantId })
      .andWhere(
        "(event.entity_type = :customerEntity AND event.entity_id = :customerId OR event.payload ->> 'customerId' = :customerId)",
        { customerEntity: 'customer', customerId },
      )
      .orderBy('event.createdAt', 'ASC')
      .getMany();
  }
}
