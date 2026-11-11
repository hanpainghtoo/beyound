import { OrderCreationService } from './order-creation.service';

describe('OrderCreationService helpers', () => {
  const service = Object.create(OrderCreationService.prototype) as {
    hash(value: unknown): string;
    normalizeAddress(value: string): string;
  };

  it('changes the request hash when the shipping address changes', () => {
    expect(
      service.hash({ productId: 'p1', deliveryData: 'No. 1 Yangon' }),
    ).not.toBe(service.hash({ productId: 'p1', deliveryData: 'No. 2 Yangon' }));
  });

  it('trims addresses and rejects empty or overlong values', () => {
    expect(service.normalizeAddress('  No. 528, Yangon  ')).toBe(
      'No. 528, Yangon',
    );
    expect(() => service.normalizeAddress('')).toThrow('required');
    expect(() => service.normalizeAddress('x'.repeat(501))).toThrow('500');
  });
});
