import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import type { PaginatedResult } from '../interfaces/paginated-result.interface';
import { buildPaginatedResult } from './paginated-result.dto';

export type SortOrder = 'ASC' | 'DESC';

export interface PaginateOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
  columnMap: Record<string, string>;
  defaultSort: string;
  tieBreaker?: string;
  nulls?: 'NULLS FIRST' | 'NULLS LAST';
}

/** Resolve a UI sort key against the whitelist; bogus keys fall back to default (never 400). */
export function resolveSortColumn(
  sortBy: string | undefined,
  columnMap: Record<string, string>,
  defaultSort: string,
): string {
  if (sortBy && columnMap[sortBy]) return columnMap[sortBy];
  return defaultSort;
}

/**
 * Single shared paginator: applies whitelisted ordering + skip/take and
 * builds the standard envelope. Replaces the copy-pasted blocks in every
 * domain service.
 */
export async function paginateQueryBuilder<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  options: PaginateOptions,
): Promise<PaginatedResult<T>> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const sortColumn = resolveSortColumn(
    options.sortBy,
    options.columnMap,
    options.defaultSort,
  );
  qb.orderBy(sortColumn, options.sortOrder || 'DESC', options.nulls);
  if (options.tieBreaker) {
    qb.addOrderBy(options.tieBreaker, options.sortOrder || 'DESC');
  }
  const [data, total] = await qb
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();
  return buildPaginatedResult(data, total, page, limit);
}
