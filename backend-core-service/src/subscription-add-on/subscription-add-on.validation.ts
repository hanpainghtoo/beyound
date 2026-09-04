import { BadRequestException, ConflictException } from '@nestjs/common';

import {
  ADD_ON_COMPONENT_TYPE_UNITS,
  ADD_ON_COMPONENT_TYPES,
  ADD_ON_PRODUCT_STATUSES,
  type AddOnComponentType,
} from './subscription-add-on.types';

export interface AddOnComponentInput {
  componentType: string;
  quantity: number;
  unit?: string;
  displayOrder?: number;
}

export interface AddOnProductInput {
  code: string;
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  components: AddOnComponentInput[];
}

/**
 * Plan 9 Phase 3 task 3.2: product/component validation.
 *
 * Rules (from the blueprint §4.1):
 * - A product must contain one or more components.
 * - A component type occurs at most once per product in the first release.
 * - Component quantities are positive; 0 and negative are invalid.
 * - `null` is not a valid component quantity (null only means unlimited on a
 *   base plan limit, never on a bundle component).
 * - `unit` must match the canonical unit for the component type.
 * - An active/published product cannot exist without at least one valid
 *   component.
 *
 * These checks are pure and throw Nest HTTP exceptions so they are reusable
 * from both the service and tests.
 */
export function assertValidComponents(components: AddOnComponentInput[]) {
  if (!Array.isArray(components) || components.length === 0) {
    throw new BadRequestException(
      'A top-up product must contain at least one component.',
    );
  }

  const seen = new Set<AddOnComponentType>();
  for (const component of components) {
    if (!component || typeof component !== 'object') {
      throw new BadRequestException('Each component must be an object.');
    }
    const { componentType, quantity } = component;
    if (!ADD_ON_COMPONENT_TYPES.includes(componentType as AddOnComponentType)) {
      throw new BadRequestException(
        `Unknown component type '${String(componentType)}'.`,
      );
    }
    const type = componentType as AddOnComponentType;
    if (seen.has(type)) {
      throw new ConflictException(
        `Component type '${type}' may occur at most once per product.`,
      );
    }
    seen.add(type);

    if (
      quantity === null ||
      quantity === undefined ||
      typeof quantity !== 'number' ||
      !Number.isFinite(quantity) ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > 1_000_000_000
    ) {
      throw new BadRequestException(
        `Component '${type}' quantity must be a positive integer up to 1,000,000,000.`,
      );
    }

    const canonicalUnit = ADD_ON_COMPONENT_TYPE_UNITS[type];
    if (
      component.unit !== undefined &&
      component.unit !== null &&
      component.unit !== canonicalUnit
    ) {
      throw new BadRequestException(
        `Component '${type}' unit must be '${canonicalUnit}', got '${component.unit}'.`,
      );
    }
  }
}

/** Validates the full product input (identity, price, currency, status). */
export function assertValidProductInput(input: AddOnProductInput) {
  if (!input.code || typeof input.code !== 'string' || !input.code.trim()) {
    throw new BadRequestException('Product code is required.');
  }
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    throw new BadRequestException('Product name is required.');
  }
  if (
    typeof input.price !== 'number' ||
    !Number.isFinite(input.price) ||
    input.price < 0
  ) {
    throw new BadRequestException('Product price must be zero or greater.');
  }
  if (input.currency !== undefined && input.currency !== null) {
    if (
      typeof input.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(input.currency.trim())
    ) {
      throw new BadRequestException(
        'Currency must be a 3-letter ISO code (e.g. MMK).',
      );
    }
  }
  if (input.status !== undefined && input.status !== null) {
    if (!ADD_ON_PRODUCT_STATUSES.includes(input.status as never)) {
      throw new BadRequestException(
        `Product status must be one of: ${ADD_ON_PRODUCT_STATUSES.join(', ')}.`,
      );
    }
  }
  assertValidComponents(input.components);
}

/** The active-product invariant: publishing requires at least one component. */
export function assertActiveProductHasComponents(
  status: string,
  componentCount: number,
) {
  if (status === 'active' && componentCount < 1) {
    throw new BadRequestException(
      'An active top-up product must have at least one component.',
    );
  }
}
