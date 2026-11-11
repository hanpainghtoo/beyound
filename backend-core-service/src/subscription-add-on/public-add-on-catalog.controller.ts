import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { PublicAddOnProductResponseDto } from './dto/public-add-on-product-response.dto';
import { SubscriptionAddOnService } from './subscription-add-on.service';

const PUBLIC_ADD_ON_CATALOG_CACHE_CONTROL = 'public, max-age=300';

/**
 * Public, read-only top-up catalog for marketing pricing pages.
 *
 * This deliberately uses the service's active-product filter rather than the
 * tenant-scoped catalog endpoint: unauthenticated visitors must only see
 * published products, never draft, inactive, or archived catalog entries.
 */
@ApiTags('Public Top-Up Catalog')
@Controller('public/add-on-products')
export class PublicAddOnCatalogController {
  constructor(private readonly addOnService: SubscriptionAddOnService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_ADD_ON_CATALOG_CACHE_CONTROL)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'List published top-up products',
    description:
      'Public, unauthenticated catalog of active add-on products. Results contain only products currently available for purchase.',
  })
  @ApiResponse({
    status: 200,
    type: PublicAddOnProductResponseDto,
    isArray: true,
  })
  async listProducts(): Promise<PublicAddOnProductResponseDto[]> {
    const products = await this.addOnService.listActiveProducts();
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      components: product.components,
    }));
  }
}
