import { ReportService } from './report.service';

function queryBuilder(rawOne: unknown, rawMany: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawOne),
    getRawMany: jest.fn().mockResolvedValue(rawMany),
  };
}

describe('ReportService revenue report', () => {
  it('reports binary payment and independent five-value delivery breakdowns', async () => {
    const summary = queryBuilder(
      {
        totalRevenue: '300',
        totalPaid: '100',
        totalOrders: '3',
        avgOrderValue: '100',
      },
      [],
    );
    const paymentDelivery = queryBuilder(null, [
      { paymentStatus: 'paid', deliveryStatus: 'packed', orderCount: '1' },
      { paymentStatus: 'unpaid', deliveryStatus: 'delivered', orderCount: '1' },
      {
        paymentStatus: 'unpaid',
        deliveryStatus: 'failed_delivery',
        orderCount: '1',
      },
    ]);
    const byChannel = queryBuilder(null, []);
    const byAgent = queryBuilder(null, []);
    const byProduct = queryBuilder(null, []);
    const orderRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(summary)
        .mockReturnValueOnce(paymentDelivery)
        .mockReturnValueOnce(byChannel)
        .mockReturnValueOnce(byAgent),
    };
    const orderItemRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(byProduct),
    };
    const service = new ReportService(
      orderRepo as never,
      orderItemRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.getRevenueReport('tenant-1', 'monthly');

    expect(result.paymentStatusBreakdown).toEqual({ paid: 1, unpaid: 2 });
    expect(result.deliveryStatusBreakdown).toEqual({
      packed: 1,
      out_for_delivery: 0,
      delivered: 1,
      failed_delivery: 1,
      returned: 0,
    });
    expect(JSON.stringify(paymentDelivery.select.mock.calls)).toContain(
      'payment_status',
    );
    expect(JSON.stringify(paymentDelivery.select.mock.calls)).toContain(
      'delivery_status',
    );
  });
});
