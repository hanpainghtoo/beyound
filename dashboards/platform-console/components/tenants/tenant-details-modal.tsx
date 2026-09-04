// components/tenants/tenant-details-modal.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tenant } from "@/types/tenant";
import {
  Building2,
  Users,
  DollarSign,
  Calendar,
  Activity,
  BarChart3,
  Mail,
  UserPlus,
} from "lucide-react";

interface TenantDetailsModalProps {
  tenant: Tenant | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (tenant: Tenant) => void;
  onViewUsage: (tenant: Tenant) => void;
}

export function TenantDetailsModal({
  tenant,
  isOpen,
  onClose,
  onEdit,
  onViewUsage,
}: TenantDetailsModalProps) {
  if (!tenant) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "inactive":
        return "bg-gray-100 text-gray-800";
      case "suspended":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case "Enterprise":
        return "bg-purple-100 text-purple-800";
      case "Professional":
        return "bg-blue-100 text-blue-800";
      case "Basic":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-kme-navy text-white">
                {tenant.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                {tenant.name}
                <Badge className={getStatusColor(tenant.status)}>
                  {tenant.status}
                </Badge>
              </div>
              <p className="text-sm font-normal text-gray-500 mt-1">
                {tenant.domain}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Left Column - Basic Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <Users className="w-6 h-6 text-blue-600 mb-2" />
                <p className="text-2xl font-bold text-gray-900">
                  {tenant.users}
                </p>
                <p className="text-xs text-gray-500">Users</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <DollarSign className="w-6 h-6 text-green-600 mb-2" />
                <p className="text-2xl font-bold text-gray-900">
                  ${tenant.revenue}
                </p>
                <p className="text-xs text-gray-500">Monthly Revenue</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <Calendar className="w-6 h-6 text-purple-600 mb-2" />
                <p className="text-sm font-medium text-gray-900">
                  {new Date(tenant.createdAt).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-500">Created</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <Activity className="w-6 h-6 text-orange-600 mb-2" />
                <p className="text-sm font-medium text-gray-900">
                  {tenant.lastActivity}
                </p>
                <p className="text-xs text-gray-500">Last Activity</p>
              </div>
            </div>

            {/* Plan Information */}
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                Subscription Plan
              </h3>
              <div className="flex items-center justify-between">
                <Badge className={getPlanColor(tenant.plan)}>
                  {tenant.plan}
                </Badge>
                <Button variant="outline" size="sm">
                  Change Plan
                </Button>
              </div>
            </div>

            {/* Usage Information */}
            {tenant.usage && (
              <div className="bg-white border rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">
                  Resource Usage
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Users</span>
                      <span>
                        {tenant.usage.users} /{" "}
                        {tenant.usage.limits.users === 0
                          ? "Unlimited"
                          : tenant.usage.limits.users}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${
                            tenant.usage.limits.users === 0
                              ? 0
                              : Math.min(
                                  100,
                                  (tenant.usage.users /
                                    tenant.usage.limits.users) *
                                    100
                                )
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>API Calls</span>
                      <span>
                        {(tenant.usage.apiCalls / 1000000).toFixed(1)}M /{" "}
                        {(tenant.usage.limits.apiCalls / 1000000).toFixed(1)}M
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (tenant.usage.apiCalls /
                              tenant.usage.limits.apiCalls) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Storage</span>
                      <span>
                        {tenant.usage.storage}GB / {tenant.usage.limits.storage}
                        GB
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (tenant.usage.storage /
                              tenant.usage.limits.storage) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Actions */}
          <div className="space-y-4">
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                Quick Actions
              </h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => onEdit(tenant)}
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Edit Tenant
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => onViewUsage(tenant)}
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  View Usage
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Mail className="w-4 h-4 mr-2" />
                  Send Message
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Login as Tenant
                </Button>
              </div>
            </div>

            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Plan Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Billing Cycle</span>
                  <span className="font-medium">Monthly</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Next Billing</span>
                  <span className="font-medium">
                    {new Date(
                      new Date().setMonth(new Date().getMonth() + 1)
                    ).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <Badge className={getStatusColor(tenant.status)}>
                    {tenant.status}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => onEdit(tenant)}
            className="bg-kme-navy hover:bg-kme-navy-dark"
          >
            Edit Tenant
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
