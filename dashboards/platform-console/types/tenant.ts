export interface Tenant {
  id: string;
  tenantCode?: string;
  name: string;
  domain: string;
  contactEmail?: string;
  subscriptionPlanId?: string | null;
  plan: string;
  status: "pending" | "active" | "inactive" | "suspended" | "rejected" | "deleted";
  users: number;
  createdAt: string;
  lastActivity: string;
  revenue: number;
  health?: "healthy" | "warning" | "critical";
  usage?: {
    apiCalls: number;
    storage: number;
    users: number;
    limits: {
      users: number;
      apiCalls: number;
      storage: number;
    };
  };
}
