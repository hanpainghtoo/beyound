export class DeliveryDto {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: Date;
  deliveryAssigneeName: string | null;
  deliveryAssigneePhone: string | null;
  deliveryZone: string | null;
  trackingNumber: string | null;
  customer: { id: string; fullName: string; phone: string | null } | null;
  statusHistory: Record<string, unknown>[];
}
