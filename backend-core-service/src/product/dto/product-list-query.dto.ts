import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class ProductListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'Category id to filter by, or "uncategorized" for products with no category',
    example: '1f2aed6d-0000-4000-8000-000000000000',
  })
  // products.category_id is uuid: a non-uuid value would reach Postgres as a
  // uuid comparison and surface as a 500 instead of a 400.
  @ValidateIf(
    (dto: ProductListQueryDto) =>
      dto.categoryId !== undefined && dto.categoryId !== 'uncategorized',
  )
  @IsUUID()
  categoryId?: string;
}
