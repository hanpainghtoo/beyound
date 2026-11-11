// components/tenants/usage-analytics-modal.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tenant } from "@/types/tenant";
import { Users, Cpu, Database, TrendingUp } from "lucide-react";

interface UsageAnalyticsModalProps {
  tenant: Tenant | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UsageAnalyticsModal({
  tenant,
  isOpen,
  onClose,
}: UsageAnalyticsModalProps) {
  if (!tenant || !tenant.usage) return null;
  const { usage } = tenant;

  const { limits } = tenant.usage;

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const getProgressColor = (percentage: number) => {
    if (percentage > 90) return "bg-red-500";
    if (percentage > 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Usage Analytics - {tenant.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Usage Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{usage.users}</div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground">
                    {limits.users === 0 ? "Unlimited" : `of ${limits.users}`}
                  </p>
                  {limits.users > 0 && (
                    <Badge
                      variant={
                        getUsagePercentage(usage.users, limits.users) > 80
                          ? "destructive"
                          : "default"
                      }
                    >
                      {getUsagePercentage(usage.users, limits.users)}%
                    </Badge>
                  )}
                </div>
                {limits.users > 0 && (
                  <Progress
                    value={getUsagePercentage(usage.users, limits.users)}
                    className="mt-2"
                    indicatorClassName={getProgressColor(
                      getUsagePercentage(usage.users, limits.users)
                    )}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">API Calls</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(usage.apiCalls / 1000000).toFixed(1)}M
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground">
                    of {(limits.apiCalls / 1000000).toFixed(1)}M
                  </p>
                  <Badge
                    variant={
                      getUsagePercentage(usage.apiCalls, limits.apiCalls) > 80
                        ? "destructive"
                        : "default"
                    }
                  >
                    {getUsagePercentage(usage.apiCalls, limits.apiCalls)}%
                  </Badge>
                </div>
                <Progress
                  value={getUsagePercentage(usage.apiCalls, limits.apiCalls)}
                  className="mt-2"
                  indicatorClassName={getProgressColor(
                    getUsagePercentage(usage.apiCalls, limits.apiCalls)
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Storage</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{usage.storage}GB</div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground">
                    of {limits.storage}GB
                  </p>
                  <Badge
                    variant={
                      getUsagePercentage(usage.storage, limits.storage) > 80
                        ? "destructive"
                        : "default"
                    }
                  >
                    {getUsagePercentage(usage.storage, limits.storage)}%
                  </Badge>
                </div>
                <Progress
                  value={getUsagePercentage(usage.storage, limits.storage)}
                  className="mt-2"
                  indicatorClassName={getProgressColor(
                    getUsagePercentage(usage.storage, limits.storage)
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* Detailed Usage Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Current Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className={`text-2xl font-bold ${getUsagePercentage(usage.users, limits.users) > 80 ? "text-red-600" : "text-green-600"}`}>
                      {limits.users === 0 ? "—" : `${getUsagePercentage(usage.users, limits.users)}%`}
                    </p>
                    <p className="text-sm text-gray-600">User Capacity</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className={`text-2xl font-bold ${getUsagePercentage(usage.apiCalls, limits.apiCalls) > 80 ? "text-red-600" : "text-blue-600"}`}>
                      {limits.apiCalls === 0 ? "—" : `${getUsagePercentage(usage.apiCalls, limits.apiCalls)}%`}
                    </p>
                    <p className="text-sm text-gray-600">API Capacity</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className={`text-2xl font-bold ${getUsagePercentage(usage.storage, limits.storage) > 80 ? "text-red-600" : "text-purple-600"}`}>
                      {limits.storage === 0 ? "—" : `${getUsagePercentage(usage.storage, limits.storage)}%`}
                    </p>
                    <p className="text-sm text-gray-600">Storage Capacity</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">
                      {getUsagePercentage(usage.users, limits.users) > 90 ? "At risk" : getUsagePercentage(usage.users, limits.users) > 70 ? "Healthy" : "Normal"}
                    </p>
                    <p className="text-sm text-gray-600">Health Status</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          {getUsagePercentage(usage.users, limits.users) > 80 && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="text-yellow-800">
                  Upgrade Recommendation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-yellow-700">
                  This tenant is approaching their user limit. Consider
                  upgrading to a higher plan to avoid service interruptions.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
