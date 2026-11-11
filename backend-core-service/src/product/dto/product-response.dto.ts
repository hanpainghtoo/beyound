import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Product } from '../entities/product.entity';

export class ProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ required: false, nullable: true })
  categoryId: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false, nullable: true })
  sku: string;

  @ApiProperty({ required: false, nullable: true })
  barcode: string | null;

  @ApiProperty({ enum: ['product', 'service'] })
  type: string;

  @ApiProperty({ required: false, nullable: true })
  description: string;

  @ApiProperty({ required: false, nullable: true })
  shortDescription: string;

  @ApiProperty()
  price: number;

  @ApiProperty({ required: false, nullable: true })
  costPrice: number;

  @ApiProperty()
  stockQuantity: number;

  @ApiProperty()
  lowStockThreshold: number;

  @ApiProperty()
  trackInventory: boolean;

  @ApiProperty({ required: false, nullable: true })
  weight: number;

  @ApiProperty({ required: false, nullable: true })
  dimensions: Record<string, any>;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ enum: ['active', 'inactive', 'out_of_stock'] })
  status: string;

  @ApiProperty()
  isFeatured: boolean;

  @ApiProperty({ required: false, nullable: true })
  seoTitle: string;

  @ApiProperty({ required: false, nullable: true })
  seoDescription: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  category?: { id: string; name: string } | null;

  @ApiProperty({
    type: [String],
    description:
      'Resolved display URLs for images (direct URLs pass through, media IDs resolve to signed download URLs).',
  })
  imageUrls: string[];

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Primary display image URL (first resolved image, if any).',
  })
  primaryImageUrl: string | null;
}

export function toProductResponse(
  product: Product,
  resolvedUrls: string[],
): ProductResponseDto {
  return {
    ...product,
    imageUrls: resolvedUrls,
    primaryImageUrl: resolvedUrls[0] ?? null,
  };
}
