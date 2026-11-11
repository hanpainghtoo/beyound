import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProductController } from './product.controller';
import { ProductService } from './product.service';

import { Product } from './entities/product.entity';
import { ProductCategory } from './entities/product-category.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    EntitlementModule,
    MediaModule,
    TypeOrmModule.forFeature([Product, ProductCategory]),
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
