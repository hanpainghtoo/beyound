import {
  IsOptional,
  IsString,
  IsDateString,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  DELIVERY_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from '../../order/order-transition.service';
import { CONVERSATION_INTENTS } from '../conversation-intent';

export class ConversationFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: [
      'all',
      'unread',
      'assigned',
      'team',
      'hot_leads',
      'vip',
      'overdue',
      'needs_attention',
    ],
  })
  @IsOptional()
  @IsIn([
    'all',
    'unread',
    'assigned',
    'team',
    'hot_leads',
    'vip',
    'overdue',
    'needs_attention',
  ])
  filter?: string;

  @ApiPropertyOptional({ enum: ['open', 'pending', 'resolved', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'pending', 'resolved', 'closed'])
  declare status?: string;

  /**
   * Conversations whose status is resolved OR closed, as one filter.
   *
   * `status` above is single-valued, but the inbox's "Resolved" chip means
   * both — an agent does not care which of the two it was.
   */
  @ApiPropertyOptional({
    description: 'Match conversations that are resolved or closed.',
  })
  @IsOptional()
  // Query params arrive as strings, so `?resolvedOnly=true` would otherwise
  // fail @IsBoolean with a 400. Deliberately NOT `@Type(() => Boolean)`:
  // Boolean("false") is true, which would make `?resolvedOnly=false` filter
  // *for* resolved conversations. Compare explicitly instead.
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true' ? true : undefined,
  )
  @IsBoolean()
  resolvedOnly?: boolean;

  /** Conversations nobody has picked up. `assignedAgentId` cannot express this. */
  @ApiPropertyOptional({
    description: 'Match conversations with no assigned agent.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true' ? true : undefined,
  )
  @IsBoolean()
  unassigned?: boolean;

  /**
   * Queue intent, resolved server-side. The dashboard used to classify these
   * itself, which meant the API filtered on one classifier while the card
   * coloured itself with another. See `conversation-intent.ts`.
   */
  @ApiPropertyOptional({ enum: CONVERSATION_INTENTS })
  @IsOptional()
  @IsIn(CONVERSATION_INTENTS)
  intent?: string;

  /**
   * Facets over the conversation's NEWEST linked order.
   *
   * `intent` classifies the conversation; these describe the actual order the
   * chat head renders, so "Payment review" becomes "unpaid" and "Delivery"
   * becomes a concrete delivery state. All three are evaluated against the same
   * row (see `buildLatestOrderPredicate`) so combined filters cannot match
   * statuses from different orders in a multi-order thread.
   */
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  orderStatus?: string;

  @ApiPropertyOptional({ enum: DELIVERY_STATUSES })
  @IsOptional()
  @IsIn(DELIVERY_STATUSES)
  deliveryStatus?: string;

  // PaginationDto already declares `paymentStatus` for the order-style lists;
  // redeclare to tighten its allowed values to the order status vocabulary.
  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  declare paymentStatus?: string;

  @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'urgent'] })
  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channelType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedAgentId?: string;

  @ApiPropertyOptional({ enum: ['normal', 'due_soon', 'overdue'] })
  @IsOptional()
  @IsIn(['normal', 'due_soon', 'overdue'])
  slaState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  declare dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  declare dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;
}
