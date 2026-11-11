export class DeliveryDto {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: Date;
  deliveryDate: Date | null;
  deliveryAssigneeName: string | null;
  deliveryAssigneePhone: string | null;
  customer: { id: string; fullName: string; phone: string | null } | null;
  statusHistory: Record<string, unknown>[];
}
