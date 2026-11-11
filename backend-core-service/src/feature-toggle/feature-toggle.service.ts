import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, Repository } from 'typeorm';

import { FeatureCategory } from './entities/feature-category.entity';
import { TenantFeatureConfig } from './entities/tenant-feature-config.entity';

/** Shape returned to the workspace frontend for one catalog entry. */
export interface TenantFeatureView {
  key: string;
  displayName: string;
  description: string | null;
  isEnabled: boolean;
  isLockable: boolean;
  dependsOn: string | null;
  displayOrder: number;
  /** False when a dependency is currently off, so the switch is inert. */
  canDisable: boolean;
}

/**
 * Plan 55: per-tenant feature toggles.
 *
 * - Absent `tenant_feature_configs` row means the category is enabled.
 * - Locked categories (`inbox`) can never be switched off.
 * - Disabling a parent cascades to its dependents in one transaction.
 *   Re-enabling a parent deliberately does NOT restore dependents — the
 *   dependent stays off until it is explicitly switched back on.
 */
@Injectable()
export class FeatureToggleService {
  private readonly logger = new Logger(FeatureToggleService.name);

  constructor(
    @InjectRepository(FeatureCategory)
    private readonly categoryRepository: Repository<FeatureCategory>,
    @InjectRepository(TenantFeatureConfig)
    private readonly configRepository: Repository<TenantFeatureConfig>,
    private readonly dataSource: DataSource,
  ) {}

  /** Full catalog with the tenant's resolved state, ordered for display. */
  async getForTenant(tenantId: string): Promise<TenantFeatureView[]> {
    return this.buildViews(this.dataSource.manager, tenantId);
  }

  /** Single-key lookup used by the guard and guard-adjacent services. */
  async isEnabled(tenantId: string, key: string): Promise<boolean> {
    if (!tenantId || !key) return true;
    const category = await this.categoryRepository.findOne({
      where: { key },
    });
    if (!category) return true;
    const config = await this.configRepository.findOne({
      where: { tenantId, featureCategoryId: category.id },
    });
    return config?.isEnabled ?? true;
  }

  /**
   * Flip one toggle for a tenant. Rejects unknown keys, locked keys, and
   * enabling a module whose dependency is currently off.
   */
  async setEnabled(
    tenantId: string,
    key: string,
    isEnabled: boolean,
    actorUserId?: string | null,
  ): Promise<TenantFeatureView[]> {
    return this.dataSource.transaction(async (manager) => {
      const categories = await manager.find(FeatureCategory);
      const category = categories.find((c) => c.key === key);
      if (!category) {
        throw new BadRequestException(`Unknown feature "${key}"`);
      }
      if (!category.isLockable) {
        throw new BadRequestException(`Feature "${key}" cannot be disabled`);
      }

      const current = await manager.findOne(TenantFeatureConfig, {
        where: { tenantId, featureCategoryId: category.id },
      });
      const currentlyEnabled = current?.isEnabled ?? true;

      if (isEnabled && !currentlyEnabled && category.dependsOn) {
        const dependency = categories.find((c) => c.key === category.dependsOn);
        const dependencyEnabled = dependency
          ? await this.resolveEnabled(manager, tenantId, dependency)
          : true;
        if (!dependencyEnabled) {
          throw new BadRequestException(
            `Enable "${category.dependsOn}" before enabling "${key}"`,
          );
        }
      }

      if (current) {
        current.isEnabled = isEnabled;
        current.updatedBy = actorUserId ?? null;
        await manager.save(TenantFeatureConfig, current);
      } else {
        await manager.save(
          manager.create(TenantFeatureConfig, {
            tenantId,
            featureCategoryId: category.id,
            isEnabled,
            updatedBy: actorUserId ?? null,
          }),
        );
      }

      if (!isEnabled && currentlyEnabled) {
        await this.cascadeDisable(manager, tenantId, key, actorUserId);
      }

      return this.buildViews(manager, tenantId);
    });
  }

  /**
   * Seed every catalog category as enabled for a freshly created tenant.
   * Pass the tenant-creation `EntityManager` so it joins that transaction.
   */
  async seedDefaultsForTenant(
    tenantId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const categoryRepo = manager
      ? manager.getRepository(FeatureCategory)
      : this.categoryRepository;
    const configRepo = manager
      ? manager.getRepository(TenantFeatureConfig)
      : this.configRepository;

    const categories = await categoryRepo.find();
    if (categories.length === 0) return;

    await configRepo
      .createQueryBuilder()
      .insert()
      .into(TenantFeatureConfig)
      .values(
        categories.map((category) => ({
          tenantId,
          featureCategoryId: category.id,
          isEnabled: true,
          updatedBy: null,
        })),
      )
      .orIgnore()
      .execute();
  }

  /** Force every category that depends on `key` off. Never auto-restores. */
  private async cascadeDisable(
    manager: EntityManager,
    tenantId: string,
    key: string,
    actorUserId?: string | null,
  ): Promise<void> {
    const dependents = await manager.find(FeatureCategory, {
      where: { dependsOn: key },
    });
    if (dependents.length === 0) return;

    const dependentIds = dependents.map((d) => d.id);
    const existing = await manager.find(TenantFeatureConfig, {
      where: { tenantId, featureCategoryId: In(dependentIds) },
    });
    const byCategoryId = new Map(
      existing.map((row) => [row.featureCategoryId, row]),
    );

    for (const dependent of dependents) {
      const row = byCategoryId.get(dependent.id);
      if (row) {
        if (row.isEnabled) {
          row.isEnabled = false;
          row.updatedBy = actorUserId ?? null;
        }
      } else {
        byCategoryId.set(
          dependent.id,
          manager.create(TenantFeatureConfig, {
            tenantId,
            featureCategoryId: dependent.id,
            isEnabled: false,
            updatedBy: actorUserId ?? null,
          }),
        );
      }
    }

    await manager.save(TenantFeatureConfig, [...byCategoryId.values()]);
    this.logger.log(
      `Cascaded disable of ${dependents
        .map((d) => d.key)
        .join(', ')} for tenant ${tenantId}`,
    );
  }

  private async resolveEnabled(
    manager: EntityManager,
    tenantId: string,
    category: FeatureCategory,
  ): Promise<boolean> {
    const config = await manager.findOne(TenantFeatureConfig, {
      where: { tenantId, featureCategoryId: category.id },
    });
    return config?.isEnabled ?? true;
  }

  private async buildViews(
    manager: EntityManager,
    tenantId: string,
  ): Promise<TenantFeatureView[]> {
    const categories = await manager.find(FeatureCategory, {
      order: { displayOrder: 'ASC', key: 'ASC' },
    });
    const configs = await manager.find(TenantFeatureConfig, {
      where: { tenantId },
    });
    const enabledById = new Map<string, boolean>(
      configs.map((row) => [row.featureCategoryId, row.isEnabled]),
    );

    const enabledByKey = new Map<string, boolean>();
    for (const category of categories) {
      enabledByKey.set(category.key, enabledById.get(category.id) ?? true);
    }

    return categories.map((category) => ({
      key: category.key,
      displayName: category.displayName,
      description: category.description,
      isEnabled: enabledByKey.get(category.key) ?? true,
      isLockable: category.isLockable,
      dependsOn: category.dependsOn,
      displayOrder: category.displayOrder,
      canDisable:
        !category.dependsOn || enabledByKey.get(category.dependsOn) !== false,
    }));
  }
}
