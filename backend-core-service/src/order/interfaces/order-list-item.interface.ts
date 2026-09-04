export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  totalAmount: number;
  currency: string;
  conversationId: string | null;
  createdAt: Date;
  customer: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    tags: string[];
  } | null;
}