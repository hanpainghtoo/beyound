import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateAddOnProductDto } from './create-add-on-product.dto';

/**
 * All editable fields are optional. `status` is intentionally omitted: product
 * status changes only through the dedicated publish/archive endpoints, so a
 * direct status edit can never bypass the publish invariant or make a
 * previously-active product look never-published for the delete guard.
 *
 * When `components` is provided it replaces the full component set atomically;
 * when omitted, the existing components stay.
 */
export class UpdateAddOnProductDto extends PartialType(
  OmitType(CreateAddOnProductDto, ['status'] as const),
) {}
