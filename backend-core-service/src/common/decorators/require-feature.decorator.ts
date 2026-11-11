import { SetMetadata } from '@nestjs/common';

/**
 * Plan 55: marks a route as requiring an enabled tenant feature.
 *
 * Applied at controller or handler level and enforced by
 * {@link FeatureGuard}. Without the decorator the guard passes through, so
 * modules that are not toggleable are unaffected.
 */
export const REQUIRE_FEATURE_KEY = 'requiredFeature';

export const RequireFeature = (key: string) =>
  SetMetadata(REQUIRE_FEATURE_KEY, key);
