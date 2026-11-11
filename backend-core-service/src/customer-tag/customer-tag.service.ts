import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CustomerTag } from './entities/customer-tag.entity';

export type CustomerTagInput = { name?: string };

@Injectable()
export class CustomerTagService {
  constructor(
    @InjectRepository(CustomerTag)
    private readonly tags: Repository<CustomerTag>,
  ) {}

  list(tenantId: string) {
    return this.tags.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  async create(tenantId: string, input: CustomerTagInput) {
    const name = this.normalizeName(input.name);
    await this.assertNameFree(tenantId, name);
    return this.tags.save(this.tags.create({ tenantId, name }));
  }

  async rename(tenantId: string, id: string, input: CustomerTagInput) {
    const name = this.normalizeName(input.name);
    const tag = await this.tags.findOne({ where: { id, tenantId } });
    if (!tag) throw new NotFoundException('customer_tag_not_found');
    if (tag.name.toLowerCase() !== name.toLowerCase()) {
      await this.assertNameFree(tenantId, name);
    }
    tag.name = name;
    return this.tags.save(tag);
  }

  async remove(tenantId: string, id: string) {
    const tag = await this.tags.findOne({ where: { id, tenantId } });
    if (!tag) throw new NotFoundException('customer_tag_not_found');
    await this.tags.remove(tag);
  }

  private normalizeName(value?: string) {
    const name = (value || '').trim();
    if (!name) throw new ConflictException('customer_tag_name_required');
    if (name.length > 60) throw new ConflictException('customer_tag_name_too_long');
    return name;
  }

  private async assertNameFree(tenantId: string, name: string) {
    // Tenant tag lists are small, and repository equality is collation-
    // dependent, so fold case in a scan instead of a second exact query.
    const listed = await this.tags.find({ where: { tenantId } });
    if (listed.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictException('customer_tag_exists');
    }
  }
}
