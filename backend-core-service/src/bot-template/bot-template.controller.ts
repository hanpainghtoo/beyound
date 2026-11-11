import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CommerceTemplateGuard } from '../common/guards/commerce-template.guard';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BotTemplateService } from './bot-template.service';
import {
  CreateBotTemplateDto,
  SetShopSettingsDto,
  UpdateBotTemplateDto,
} from './dto/bot-template.dto';

@ApiTags('BotTemplates')
@ApiBearerAuth()
@UseGuards(
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
  CommerceTemplateGuard,
)
@Controller()
export class BotTemplateController {
  constructor(private readonly templates: BotTemplateService) {}

  @Get('tenant/bot-templates')
  @Roles('owner', 'admin', 'supervisor', 'agent')
  list(@CurrentTenant() tenant: { id: string }) {
    return this.templates.listTemplates(tenant.id);
  }

  @Get('tenant/bot-templates/:id')
  @Roles('owner', 'admin', 'supervisor', 'agent')
  get(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.getTemplate(tenant.id, id);
  }

  @Post('tenant/bot-templates')
  @Roles('owner', 'admin')
  create(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Body() body: CreateBotTemplateDto,
  ) {
    return this.templates.createTemplate(
      tenant.id,
      { name: body.name, fields: body.fields },
      user.id,
    );
  }

  @Put('tenant/bot-templates/:id')
  @Roles('owner', 'admin')
  update(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBotTemplateDto,
  ) {
    return this.templates.updateTemplate(
      tenant.id,
      id,
      { name: body.name, fields: body.fields },
      user.id,
    );
  }

  @Delete('tenant/bot-templates/:id')
  @Roles('owner', 'admin')
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.templates.deleteTemplate(tenant.id, id, user.id);
  }

  @Get('tenant/channels/:id/bot-template')
  @Roles('owner', 'admin', 'supervisor', 'agent')
  getChannelSelection(
    @CurrentTenant() tenant: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.getChannelTemplate(tenant.id, id);
  }

  @Put('tenant/channels/:id/shop-settings')
  @Roles('owner', 'admin')
  setShopSettings(
    @CurrentTenant() tenant: { id: string },
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetShopSettingsDto,
  ) {
    return this.templates.setShopSettings(
      tenant.id,
      id,
      {
        shopEnabled: body.shopEnabled,
        orderingEnabled: body.orderingEnabled,
      },
      user.id,
    );
  }
}
