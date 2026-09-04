import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type Repository } from 'typeorm';

import { SubscriptionAddOnProduct } from './entities/subscription-add-on-product.entity';
import { SubscriptionAddOnProductComponent } from './entities/subscription-add-on-product-component.entity';
import { SubscriptionAddOnEvent } from './entities/subscription-add-on-event.entity';
import {
  assertActiveProductHasComponents,
  assertValidProductInput,
  type AddOnComponentInput,
  type AddOnProductInput,
} from './subscription-add-on.validation';
import {
  ADD_ON_COMPONENT_TYPE_UNITS,
  ADD_ON_PRODUCT_DEFAULT_STATUS,
  type AddOnEventType,
  type AddOnProductStatus,
} from './subscription-add-on.types';
import { AddOnProductResponseDto } from './dto/add-on-product-response.dto';

export interface CatalogActor {
  type: string;
  id?: string | null;
}

export interface AddOnMutationOptions {
  actor?: CatalogActor;
  source?: string;
  reason?: string;
  idempotencyKey?: string;
}

const DEFAULT_ACTOR: CatalogActor = { type: 'platform_admin', id: null };

@Injectable()
export class SubscriptionAddOnService {
  constructor(
    @InjectRepository(SubscriptionAddOnProduct)
    private productRepository: Repository<SubscriptionAddOnProduct>,
    @InjectRepository(SubscriptionAddOnProductComponent)
    private componentRepository: Repository<SubscriptionAddOnProductComponent>,
    @InjectRepository(SubscriptionAddOnEvent)
    private eventRepository: Repository<SubscriptionAddOnEvent>,
    private dataSource: DataSource,
  ) {}

  async listProducts(): Promise<AddOnProductResponseDto[]> {
    return this.listProductsByStatus();
  }

  async listActiveProducts(): Promise<AddOnProductResponseDto[]> {
    return this.listProductsByStatus('active');
  }

  private async listProductsByStatus(
    status?: AddOnProductStatus,
  ): Promise<AddOnProductResponseDto[]> {
    const products = await this.productRepository.find({
      ...(status ? { where: { status } } : {}),
      order: { createdAt: 'DESC' },
    });
    const components = await this.componentRepository.find({
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
    const byProduct = new Map<string, SubscriptionAddOnProductComponent[]>();
    for (const component of components) {
      const list = byProduct.get(component.productId) || [];
      list.push(component);
      byProduct.set(component.productId, list);
    }
    return products.map((product) =>
      this.toResponse(product, byProduct.get(product.id) || []),
    );
  }

  async getProductById(id: string): Promise<AddOnProductResponseDto> {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Top-up product not found');
    }
    const components = await this.componentRepository.find({
      where: { productId: id },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
    return this.toResponse(product, components);
  }

  async createProduct(
    input: CreateCatalogInput,
    options: AddOnMutationOptions = {},
  ): Promise<AddOnProductResponseDto> {
    // Idempotency short-circuits before any validation or guard so a replay of
    // an already-succeeded mutation returns the stored result unchanged.
    const replayed = await this.replayOrNull(options.idempotencyKey);
    if (replayed) return replayed as AddOnProductResponseDto;

    assertValidProductInput(input);

    const existingCode = await this.productRepository.findOne({
      where: { code: input.code },
    });
    if (existingCode) {
      throw new ConflictException(
        `A top-up product with code '${input.code}' already exists.`,
      );
    }

    const status = (input.status ||
      ADD_ON_PRODUCT_DEFAULT_STATUS) as AddOnProductStatus;
    assertActiveProductHasComponents(status, input.components.length);

    const actor = options.actor || DEFAULT_ACTOR;

    return this.dataSource.transaction(async (manager) => {
      const product = manager.create(SubscriptionAddOnProduct, {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        currency: input.currency || 'MMK',
        status,
        version: 1,
        metadata: input.metadata || {},
      });
      const savedProduct = await manager.save(
        SubscriptionAddOnProduct,
        product,
      );

      const components = this.buildComponents(
        savedProduct.id,
        input.components,
      );
      await manager.save(SubscriptionAddOnProductComponent, components);

      const result = this.toResponse(savedProduct, components);
      await manager.save(
        manager.create(SubscriptionAddOnEvent, {
          productId: savedProduct.id,
          eventType: 'add_on_product_created',
          actorType: actor.type,
          actorId: actor.id ?? null,
          source: options.source || 'platform_admin',
          reason: options.reason || 'Top-up product created',
          idempotencyKey: options.idempotencyKey ?? null,
          metadata: { result, version: savedProduct.version },
        }),
      );

      return result;
    });
  }

  async updateProduct(
    id: string,
    patch: Partial<AddOnProductInput>,
    options: AddOnMutationOptions = {},
  ): Promise<AddOnProductResponseDto> {
    const replayed = await this.replayOrNull(options.idempotencyKey);
    if (replayed) return replayed as AddOnProductResponseDto;

    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Top-up product not found');
    }
    if (product.status === 'archived') {
      throw new ConflictException(
        'Archived top-up products cannot be edited; create a new product instead.',
      );
    }

    // Re-validate the merged input so partial updates cannot corrupt the model.
    const merged: AddOnProductInput = {
      code: patch.code ?? product.code,
      name: patch.name ?? product.name,
      description:
        patch.description !== undefined
          ? patch.description
          : product.description,
      price: patch.price ?? Number(product.price),
      currency: patch.currency ?? product.currency,
      status: patch.status ?? product.status,
      metadata: patch.metadata ?? product.metadata,
      components:
        patch.components ??
        (await this.componentRepository.find({
          where: { productId: id },
          order: { displayOrder: 'ASC' },
        })),
    };
    assertValidProductInput(merged);
    const nextStatus = (merged.status || product.status) as AddOnProductStatus;
    assertActiveProductHasComponents(nextStatus, merged.components.length);

    const actor = options.actor || DEFAULT_ACTOR;

    return this.dataSource.transaction(async (manager) => {
      const before = await this.toResponse(
        product,
        await manager.find(SubscriptionAddOnProductComponent, {
          where: { productId: id },
          order: { displayOrder: 'ASC' },
        }),
      );

      product.code = merged.code;
      product.name = merged.name;
      product.description = merged.description ?? null;
      product.price = merged.price;
      product.currency = merged.currency || 'MMK';
      product.status = nextStatus;
      product.version = product.version + 1;
      product.metadata = merged.metadata || {};
      const savedProduct = await manager.save(
        SubscriptionAddOnProduct,
        product,
      );

      let components: SubscriptionAddOnProductComponent[] = [];
      if (patch.components) {
        await manager.delete(SubscriptionAddOnProductComponent, {
          productId: id,
        });
        components = this.buildComponents(savedProduct.id, patch.components);
        await manager.save(SubscriptionAddOnProductComponent, components);
      } else {
        components = await manager.find(SubscriptionAddOnProductComponent, {
          where: { productId: id },
          order: { displayOrder: 'ASC' },
        });
      }

      const after = this.toResponse(savedProduct, components);
      const eventType: AddOnEventType = patch.components
        ? 'add_on_product_component_changed'
        : 'add_on_product_updated';
      await manager.save(
        manager.create(SubscriptionAddOnEvent, {
          productId: savedProduct.id,
          eventType,
          actorType: actor.type,
          actorId: actor.id ?? null,
          source: options.source || 'platform_admin',
          reason: options.reason || 'Top-up product updated',
          idempotencyKey: options.idempotencyKey ?? null,
          metadata: {
            before,
            after,
            result: after,
            version: savedProduct.version,
          },
        }),
      );

      return after;
    });
  }

  async publishProduct(
    id: string,
    options: AddOnMutationOptions = {},
  ): Promise<AddOnProductResponseDto> {
    return this.setStatus(
      id,
      'active',
      'add_on_product_published',
      'Top-up product published',
      options,
    );
  }

  async archiveProduct(
    id: string,
    options: AddOnMutationOptions = {},
  ): Promise<AddOnProductResponseDto> {
    return this.setStatus(
      id,
      'archived',
      'add_on_product_archived',
      'Top-up product archived',
      options,
    );
  }

  async deleteProduct(id: string, options: AddOnMutationOptions = {}) {
    const replayed = await this.replayOrNull(options.idempotencyKey);
    if (replayed) return replayed;

    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Top-up product not found');
    }
    // Only a product that was never published and never had meaningful
    // mutation history may be hard-deleted. Anything else must be archived
    // instead so historical audit and potential Phase 4 purchase references
    // stay intact. Refund/cancellation flows are intentionally out of scope.
    if (product.status !== 'inactive') {
      throw new ConflictException(
        `Only never-published top-up products can be deleted (status is '${product.status}'); archive it instead.`,
      );
    }
    const history = await this.eventRepository.find({
      where: { productId: id },
    });
    const meaningfulEvents = history.filter(
      (event) => event.eventType !== 'add_on_product_created',
    );
    if (meaningfulEvents.length > 0) {
      throw new ConflictException(
        'Top-up products with mutation history cannot be hard-deleted; archive them instead.',
      );
    }

    const actor = options.actor || DEFAULT_ACTOR;
    await this.dataSource.transaction(async (manager) => {
      // Delete the product first, then record the delete event with a null
      // product_id (FK is ON DELETE SET NULL + nullable) so the audit trail
      // survives the row deletion instead of being cascade-removed.
      await manager.delete(SubscriptionAddOnProduct, { id });
      await manager.save(
        manager.create(SubscriptionAddOnEvent, {
          productId: null,
          eventType: 'add_on_product_deleted',
          actorType: actor.type,
          actorId: actor.id ?? null,
          source: options.source || 'platform_admin',
          reason: options.reason || 'Top-up product deleted (never published)',
          idempotencyKey: options.idempotencyKey ?? null,
          metadata: {
            result: { message: 'Top-up product deleted successfully' },
            deletedProductId: product.id,
            code: product.code,
            name: product.name,
            version: product.version,
          },
        }),
      );
    });
    return { message: 'Top-up product deleted successfully' };
  }

  private async setStatus(
    id: string,
    nextStatus: AddOnProductStatus,
    eventType: AddOnEventType,
    reason: string,
    options: AddOnMutationOptions,
  ): Promise<AddOnProductResponseDto> {
    const replayed = await this.replayOrNull(options.idempotencyKey);
    if (replayed) return replayed as AddOnProductResponseDto;

    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Top-up product not found');
    }

    if (nextStatus === 'active') {
      const componentCount = await this.componentRepository.count({
        where: { productId: id },
      });
      assertActiveProductHasComponents(nextStatus, componentCount);
    }
    if (product.status === nextStatus) {
      return this.getProductById(id);
    }
    if (product.status === 'archived' && nextStatus !== 'archived') {
      throw new ConflictException(
        'Archived top-up products cannot be reactivated; create a new product instead.',
      );
    }

    const actor = options.actor || DEFAULT_ACTOR;
    return this.dataSource.transaction(async (manager) => {
      const before = await this.toResponse(
        product,
        await manager.find(SubscriptionAddOnProductComponent, {
          where: { productId: id },
          order: { displayOrder: 'ASC' },
        }),
      );
      product.status = nextStatus;
      product.version = product.version + 1;
      const savedProduct = await manager.save(
        SubscriptionAddOnProduct,
        product,
      );
      const after = this.toResponse(
        savedProduct,
        await manager.find(SubscriptionAddOnProductComponent, {
          where: { productId: id },
          order: { displayOrder: 'ASC' },
        }),
      );
      await manager.save(
        manager.create(SubscriptionAddOnEvent, {
          productId: savedProduct.id,
          eventType,
          actorType: actor.type,
          actorId: actor.id ?? null,
          source: options.source || 'platform_admin',
          reason: options.reason || reason,
          idempotencyKey: options.idempotencyKey ?? null,
          metadata: {
            before,
            after,
            result: after,
            version: savedProduct.version,
          },
        }),
      );
      return after;
    });
  }

  /**
   * Returns the stored result of a previous mutation for the same idempotency
   * key, or null when this is a fresh mutation. Replays are pure reads: they
   * never re-run guards or writes, so replaying against a product that was
   * subsequently edited or archived still returns the original result.
   */
  private async replayOrNull(idempotencyKey?: string): Promise<unknown | null> {
    if (!idempotencyKey) return null;
    const existingEvent = await this.eventRepository.findOne({
      where: { idempotencyKey },
    });
    return existingEvent?.metadata?.result ?? null;
  }

  private buildComponents(
    productId: string,
    components: AddOnComponentInput[],
  ): SubscriptionAddOnProductComponent[] {
    return components.map((component, index) =>
      this.componentRepository.create({
        productId,
        componentType: component.componentType as never,
        quantity: component.quantity,
        unit: (component.unit ||
          ADD_ON_COMPONENT_TYPE_UNITS[
            component.componentType as never
          ]) as never,
        displayOrder: component.displayOrder ?? index,
      }),
    );
  }

  private toResponse(
    product: SubscriptionAddOnProduct,
    components: SubscriptionAddOnProductComponent[],
  ): AddOnProductResponseDto {
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      price: Number(product.price),
      currency: product.currency,
      status: product.status,
      version: product.version,
      metadata: product.metadata || {},
      components: components.map((component) => ({
        id: component.id,
        componentType: component.componentType,
        quantity: component.quantity,
        unit: component.unit,
        displayOrder: component.displayOrder,
      })),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}

export type CreateCatalogInput = AddOnProductInput;
