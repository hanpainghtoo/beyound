import {
  assertActiveProductHasComponents,
  assertValidComponents,
  assertValidProductInput,
} from './subscription-add-on.validation';

describe('add-on catalog validation', () => {
  describe('assertValidComponents', () => {
    it('rejects an empty component list', () => {
      expect(() => assertValidComponents([])).toThrow(
        'must contain at least one component',
      );
    });

    it('rejects zero quantity', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'inbound_messages', quantity: 0 },
        ]),
      ).toThrow('quantity must be a positive integer');
    });

    it('rejects negative quantity', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'outbound_messages', quantity: -5 },
        ]),
      ).toThrow('quantity must be a positive integer');
    });

    it('rejects null quantity (null is not a valid bundle quantity)', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'storage_gb', quantity: null as never },
        ]),
      ).toThrow('quantity must be a positive integer');
    });

    it('rejects fractional quantities', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'inbound_messages', quantity: 1.5 },
        ]),
      ).toThrow('quantity must be a positive integer');
    });

    it('rejects quantities above the maximum', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'api_requests', quantity: 1_000_000_001 },
        ]),
      ).toThrow('quantity must be a positive integer');
    });

    it('rejects a duplicate component type within one product', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'api_requests', quantity: 100 },
          { componentType: 'api_requests', quantity: 50 },
        ]),
      ).toThrow('may occur at most once per product');
    });

    it('rejects an unknown component type', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'crypto_tokens', quantity: 1 },
        ]),
      ).toThrow('Unknown component type');
    });

    it('rejects an invalid unit for the component type', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'inbound_messages', quantity: 100, unit: 'gb' },
        ]),
      ).toThrow("unit must be 'messages'");
    });

    it('accepts a valid multi-component product', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'inbound_messages', quantity: 10000 },
          { componentType: 'outbound_messages', quantity: 2000 },
          { componentType: 'api_requests', quantity: 5000 },
          { componentType: 'channel_slots', quantity: 3 },
          { componentType: 'storage_gb', quantity: 5, unit: 'gb' },
        ]),
      ).not.toThrow();
    });

    it('defaults the unit to the canonical type unit when omitted', () => {
      expect(() =>
        assertValidComponents([
          { componentType: 'channel_slots', quantity: 2 },
        ]),
      ).not.toThrow();
    });
  });

  describe('assertValidProductInput', () => {
    it('rejects a missing code', () => {
      expect(() =>
        assertValidProductInput({
          code: '',
          name: 'Message Boost',
          price: 100,
          components: [{ componentType: 'inbound_messages', quantity: 100 }],
        }),
      ).toThrow('Product code is required');
    });

    it('rejects a missing name', () => {
      expect(() =>
        assertValidProductInput({
          code: 'msg_boost',
          name: ' ',
          price: 100,
          components: [{ componentType: 'inbound_messages', quantity: 100 }],
        }),
      ).toThrow('Product name is required');
    });

    it('rejects a negative price', () => {
      expect(() =>
        assertValidProductInput({
          code: 'msg_boost',
          name: 'Message Boost',
          price: -1,
          components: [{ componentType: 'inbound_messages', quantity: 100 }],
        }),
      ).toThrow('Product price must be zero or greater');
    });

    it('rejects a malformed currency', () => {
      expect(() =>
        assertValidProductInput({
          code: 'msg_boost',
          name: 'Message Boost',
          price: 100,
          currency: 'MMK123',
          components: [{ componentType: 'inbound_messages', quantity: 100 }],
        }),
      ).toThrow('3-letter ISO code');
    });

    it('rejects an invalid status', () => {
      expect(() =>
        assertValidProductInput({
          code: 'msg_boost',
          name: 'Message Boost',
          price: 100,
          status: 'deleted',
          components: [{ componentType: 'inbound_messages', quantity: 100 }],
        }),
      ).toThrow('Product status must be one of');
    });
  });

  describe('assertActiveProductHasComponents', () => {
    it('blocks publishing an active product with no components', () => {
      expect(() => assertActiveProductHasComponents('active', 0)).toThrow(
        'must have at least one component',
      );
    });

    it('allows inactive products without components', () => {
      expect(() =>
        assertActiveProductHasComponents('inactive', 0),
      ).not.toThrow();
    });
  });
});
