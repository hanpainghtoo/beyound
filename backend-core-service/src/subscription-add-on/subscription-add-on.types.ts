/**
 * Plan 9 Phase 3: multi-component top-up (add-on) catalog types.
 *
 * A product is the sellable bundle; components are normalized child rows, so a
 * single item can contain one or many typed quota/capacity dimensions. The
 * catalog defines what can be purchased — it grants no quota until a purchase
 * is paid and attached to a target period (Phase 4).
 *
 * Plan 36: the `api_requests` component type was removed from the sellable
 * catalog (no commercial API quota). Legacy rows may still exist in the
 * database and stay readable; validation and purchase reject them.
 */

export const ADD_ON_COMPONENT_TYPES = [
  'inbound_messages',
  'outbound_messages',
  'channel_slots',
  'storage_gb',
] as const;
export type AddOnComponentType = (typeof ADD_ON_COMPONENT_TYPES)[number];

export const ADD_ON_COMPONENT_UNITS = [
  'messages',
  'requests',
  'channels',
  'gb',
] as const;
export type AddOnComponentUnit = (typeof ADD_ON_COMPONENT_UNITS)[number];

/** Canonical unit for each component type. */
export const ADD_ON_COMPONENT_TYPE_UNITS: Record<
  AddOnComponentType,
  AddOnComponentUnit
> = {
  inbound_messages: 'messages',
  outbound_messages: 'messages',
  channel_slots: 'channels',
  storage_gb: 'gb',
};

export const ADD_ON_PRODUCT_STATUSES = [
  'active',
  'inactive',
  'archived',
] as const;
export type AddOnProductStatus = (typeof ADD_ON_PRODUCT_STATUSES)[number];

/** Default status for a newly created product: not sellable until published. */
export const ADD_ON_PRODUCT_DEFAULT_STATUS: AddOnProductStatus = 'inactive';

export const ADD_ON_EVENT_TYPES = [
  'add_on_product_created',
  'add_on_product_updated',
  'add_on_product_published',
  'add_on_product_archived',
  'add_on_product_deleted',
  'add_on_product_component_changed',
] as const;
export type AddOnEventType = (typeof ADD_ON_EVENT_TYPES)[number];
