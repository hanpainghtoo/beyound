// components/tenants/edit-tenant-modal.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tenant } from "@/types/tenant";
import { toast } from "sonner";
import {
  updatePlatformTenant,
  type SubscriptionPlanDto,
  type UpdatePlatformTenantInput,
} from "@/lib/api";

interface EditTenantModalProps {
  tenant: Tenant | null;
  subscriptionPlans: SubscriptionPlanDto[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (tenant: Tenant) => void;
}

export function EditTenantModal({
  tenant,
  subscriptionPlans,
  isOpen,
  onClose,
  onSave,
}: EditTenantModalProps) {
  const [formData, setFormData] = useState({
    name: tenant?.name || "",
    domain: tenant?.domain || "",
    subscriptionPlanId: tenant?.subscriptionPlanId || "",
    status: tenant?.status === "inactive" || tenant?.status === "deleted" ? "active" : tenant?.status || "active",
    users: tenant?.users || 0,
    revenue: tenant?.revenue || 0,
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tenant) return;

    setFormData({
      name: tenant.name,
      domain: tenant.domain,
      subscriptionPlanId: tenant.subscriptionPlanId || "",
      status: tenant.status === "inactive" || tenant.status === "deleted" ? "active" : tenant.status,
      users: tenant.users,
      revenue: tenant.revenue,
    });
  }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;

    setIsLoading(true);
    try {
      const payload: UpdatePlatformTenantInput = {
        companyName: formData.name,
        website: formData.domain,
        status: formData.status as UpdatePlatformTenantInput["status"],
      };

      if (formData.subscriptionPlanId) {
        payload.subscriptionPlanId = formData.subscriptionPlanId;
      }

      const updatedTenantDto = await updatePlatformTenant(tenant.id, payload);
      const selectedPlan = updatedTenantDto.subscriptionPlanId
        ? subscriptionPlans.find((plan) => plan.id === updatedTenantDto.subscriptionPlanId)
        : undefined;

      const updatedTenant: Tenant = {
        ...tenant,
        name: updatedTenantDto.companyName,
        domain: updatedTenantDto.website || updatedTenantDto.contactEmail || updatedTenantDto.tenantCode,
        contactEmail: updatedTenantDto.contactEmail,
        subscriptionPlanId: updatedTenantDto.subscriptionPlanId,
        plan: selectedPlan?.name || "Unassigned",
        status: updatedTenantDto.status as Tenant["status"],
      };

      onSave(updatedTenant);
      toast.success("Tenant updated successfully");
      onClose();
    } catch {
      toast.error("Failed to update tenant");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (!tenant) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Tenant</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tenant Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Enter tenant name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={formData.domain}
                onChange={(e) => handleChange("domain", e.target.value)}
                placeholder="example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plan">Subscription Plan</Label>
              <Select
                value={formData.subscriptionPlanId}
                onValueChange={(value) => handleChange("subscriptionPlanId", value)}
              >
                <SelectTrigger id="plan">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {subscriptionPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleChange("status", value)}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="users">Number of Users</Label>
              <Input
                id="users"
                type="number"
                value={formData.users}
                onChange={(e) =>
                  handleChange("users", parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revenue">Monthly Revenue ($)</Label>
              <Input
                id="revenue"
                type="number"
                value={formData.revenue}
                onChange={(e) =>
                  handleChange("revenue", parseInt(e.target.value) || 0)
                }
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-kme-navy hover:bg-kme-navy-dark"
          >
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
