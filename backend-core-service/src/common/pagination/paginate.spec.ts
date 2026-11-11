import {
  buildPaginatedResult,
  PaginatedResponseDto,
} from './paginated-result.dto';
import { paginateQueryBuilder, resolveSortColumn } from './paginate';

describe('pagination', () => {
  it('builds an empty envelope with totalPages 0', () => {
    expect(buildPaginatedResult([], 0, 1, 8)).toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 8,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });

  it('computes totalPages/hasNext/hasPrev', () => {
    const first = buildPaginatedResult([1], 25, 1, 10);
    expect(first.totalPages).toBe(3);
    expect(first.hasNext).toBe(true);
    expect(first.hasPrev).toBe(false);
    const last = buildPaginatedResult([1], 25, 3, 10);
    expect(last.hasNext).toBe(false);
    expect(last.hasPrev).toBe(true);
  });

  it('falls back to the default sort column for bogus keys', () => {
    const map = { createdAt: 't.createdAt' };
    expect(resolveSortColumn('bogus', map, 't.createdAt')).toBe('t.createdAt');
    expect(resolveSortColumn('createdAt', map, 't.createdAt')).toBe(
      't.createdAt',
    );
  });

  it('paginates a query builder with whitelisted ordering', async () => {
    const qb = {
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(() => Promise.resolve([[{ id: 1 }], 25])),
    };
    const result = await paginateQueryBuilder(qb as any, {
      page: 2,
      limit: 10,
      sortBy: 'bogus',
      sortOrder: 'ASC',
      columnMap: { createdAt: 't.createdAt' },
      defaultSort: 't.createdAt',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'ASC', undefined);
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ total: 25, page: 2, limit: 10 });
    expect(result instanceof Object).toBe(true);
    expect(PaginatedResponseDto).toBeDefined();
  });
});
