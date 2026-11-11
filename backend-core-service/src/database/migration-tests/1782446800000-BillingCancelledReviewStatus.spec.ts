import { BillingCancelledReviewStatus1782446800000 } from '../migrations/1782446800000-BillingCancelledReviewStatus';
import type { QueryRunner } from 'typeorm';

type TestQueryRunner = {
  queries: string[];
  query: jest.Mock<Promise<unknown[]>, [string]>;
};

function createQueryRunner(): TestQueryRunner {
  const queries: string[] = [];
  return {
    queries,
    query: jest.fn((sql: string): Promise<unknown[]> => {
      queries.push(sql);
      return Promise.resolve([]);
    }),
  };
}

describe('BillingCancelledReviewStatus migration', () => {
  it('widens the review-status CHECK with the cancelled value', async () => {
    const migration = new BillingCancelledReviewStatus1782446800000();
    const queryRunner = createQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain('DROP CONSTRAINT IF EXISTS');
    expect(all).toContain('CHK_tenant_billing_records_review_status');
    expect(all).toContain(`'cancelled'`);
  });

  it('restores the pre-cancel check on rollback', async () => {
    const migration = new BillingCancelledReviewStatus1782446800000();
    const queryRunner = createQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const all = queryRunner.queries.join('\n');
    expect(all).toContain(
      'ADD CONSTRAINT "CHK_tenant_billing_records_review_status"',
    );
    expect(all).not.toContain(`'cancelled'`);
  });
});
