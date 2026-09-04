import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, type Repository } from 'typeorm';

import { Lead } from './entities/lead.entity';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { UpdateLeadDto } from './dto/update-lead.dto';
import type { ReviewPlanChangeRequestDto } from './dto/review-plan-change-request.dto';

@Injectable()
export class LeadService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
  ) {}

  async createLead(input: CreateLeadDto) {
    const lead = this.leadRepository.create({
      intent: input.intent || 'general',
      status: 'new',
      fullName: input.fullName.trim(),
      companyName: input.companyName.trim(),
      emailAddress: input.emailAddress.trim().toLowerCase(),
      phoneNumber: input.phoneNumber?.trim() || null,
      businessType: input.businessType?.trim() || null,
      teamSize: input.teamSize?.trim() || null,
      interestedIn: input.interestedIn?.trim() || null,
      message: input.message?.trim() || null,
      source: input.source?.trim() || null,
      metadata: input.metadata || {},
    });

    return this.leadRepository.save(lead);
  }

  async listLeads(query: {
    status?: string;
    intent?: string;
    search?: string;
    limit?: string;
    page?: string;
  }) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 50)));
    const where: Record<string, any>[] = [];
    const base: Record<string, any> = {};
    if (query.status && query.status !== 'all') base.status = query.status;
    if (query.intent && query.intent !== 'all') base.intent = query.intent;

    const search = query.search?.trim();
    if (search) {
      where.push(
        { ...base, fullName: ILike(`%${search}%`) },
        { ...base, companyName: ILike(`%${search}%`) },
        { ...base, emailAddress: ILike(`%${search}%`) },
      );
    }

    const [data, total] = await this.leadRepository.findAndCount({
      where: where.length ? where : base,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }

  async updateLead(id: string, input: UpdateLeadDto) {
    const lead = await this.leadRepository.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    if (input.status) lead.status = input.status;
    if (input.contactedAt !== undefined) {
      const contactedAt = new Date(input.contactedAt);
      if (Number.isNaN(contactedAt.getTime()))
        throw new BadRequestException('contactedAt must be a valid date');
      lead.contactedAt = contactedAt;
    } else if (input.status === 'contacted' && !lead.contactedAt) {
      lead.contactedAt = new Date();
    }
    if (input.note !== undefined) {
      const note = input.note.trim();
      lead.metadata = {
        ...(lead.metadata || {}),
        notes: [
          ...(lead.metadata?.notes || []),
          ...(note ? [{ note, at: new Date().toISOString() }] : []),
        ],
      };
    }
    if (input.metadata !== undefined) {
      lead.metadata = { ...(lead.metadata || {}), ...input.metadata };
    }

    return this.leadRepository.save(lead);
  }

  async approvePlanChangeRequest(
    id: string,
    input: ReviewPlanChangeRequestDto,
  ) {
    const lead = await this.getPlanChangeLead(id);
    if (lead.status === 'converted')
      throw new BadRequestException(
        'Plan change request has already been applied',
      );
    if (lead.status === 'closed')
      throw new BadRequestException(
        'Closed plan change requests cannot be approved',
      );

    const note = input.note?.trim() || null;
    lead.status = 'qualified';
    lead.metadata = {
      ...(lead.metadata || {}),
      reviewOutcome: 'approved',
      reviewedAt: new Date().toISOString(),
      resolvedAt: null,
      ...(note
        ? {
            notes: [
              ...(Array.isArray(lead.metadata?.notes)
                ? lead.metadata.notes
                : []),
              { note, at: new Date().toISOString() },
            ],
          }
        : {}),
    };

    return this.leadRepository.save(lead);
  }

  async rejectPlanChangeRequest(id: string, input: ReviewPlanChangeRequestDto) {
    const lead = await this.getPlanChangeLead(id);
    if (lead.status === 'converted')
      throw new BadRequestException(
        'Applied plan change requests cannot be rejected',
      );
    if (lead.status === 'closed')
      throw new BadRequestException(
        'Closed plan change requests cannot be rejected again',
      );

    const note = input.note?.trim() || null;
    lead.status = 'closed';
    lead.metadata = {
      ...(lead.metadata || {}),
      outcome: 'rejected',
      reviewOutcome: 'rejected',
      reviewedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      ...(note
        ? {
            notes: [
              ...(Array.isArray(lead.metadata?.notes)
                ? lead.metadata.notes
                : []),
              { note, at: new Date().toISOString() },
            ],
          }
        : {}),
    };

    return this.leadRepository.save(lead);
  }

  private async getPlanChangeLead(id: string) {
    const lead = await this.leadRepository.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (
      lead.source !== 'workspace-plan-change' ||
      lead.metadata?.requestType !== 'plan_change'
    ) {
      throw new BadRequestException(
        'Lead is not a workspace plan change request',
      );
    }

    return lead;
  }
}
