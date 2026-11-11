import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('order_creation_idempotencies')
@Index('UQ_order_creation_idempotencies_tenant_key', ['tenantId', 'key'], {
  unique: true,
})
export class OrderCreationIdempotency {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'customer_id', type: 'uuid', nullable: true }) customerId:
    | string
    | null;
  @Column({ type: 'varchar' }) key: string;
  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string;
  @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId:
    | string
    | null;
  @Column({ name: 'result', type: 'jsonb', default: {} }) result: Record<
    string,
    any
  >;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
