import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { ChannelTemplate } from '../channel/entities/channel-template.entity';
import type {
  CreateChannelTemplateDto,
  UpdateChannelTemplateDto,
} from './dto/channel-template.dto';

@Injectable()
export class ChannelTemplateService {
  constructor(
    @InjectRepository(ChannelTemplate)
    private channelTemplateRepository: Repository<ChannelTemplate>,
  ) {}

  async getAllChannelTemplates(): Promise<ChannelTemplate[]> {
    return this.channelTemplateRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getChannelTemplateById(id: string): Promise<ChannelTemplate> {
    const template = await this.channelTemplateRepository.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('Channel template not found');
    }

    return template;
  }

  async getChannelTemplatesByType(
    channelType: string,
  ): Promise<ChannelTemplate[]> {
    return this.channelTemplateRepository.find({
      where: { channelType, status: 'active' },
      order: { createdAt: 'DESC' },
    });
  }

  async createChannelTemplate(
    createTemplateDto: CreateChannelTemplateDto,
  ): Promise<ChannelTemplate> {
    const template = this.channelTemplateRepository.create(createTemplateDto);
    return this.channelTemplateRepository.save(template);
  }

  async updateChannelTemplate(
    id: string,
    updateTemplateDto: UpdateChannelTemplateDto,
  ): Promise<ChannelTemplate> {
    const template = await this.getChannelTemplateById(id);
    Object.assign(template, updateTemplateDto);
    return this.channelTemplateRepository.save(template);
  }

  async deleteChannelTemplate(id: string): Promise<void> {
    const template = await this.getChannelTemplateById(id);
    await this.channelTemplateRepository.remove(template);
  }
}
