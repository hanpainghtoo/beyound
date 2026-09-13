"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Phone, Shield, Key, Bell, Globe, Save, Upload } from 'lucide-react';

export default function AccountSettingsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState({
    firstName: "Htet",
    lastName: "Naing",
    email: "operator@zayos.com.mm",
    phone: "+95 9 780 123 456",
    role: "Administrator",
    department: "Platform Operations",
    timezone: "Asia/Yangon (MMT)",
  });

  const [security, setSecurity] = useState({
    twoFactorEnabled: true,
    emailNotifications: true,
    smsNotifications: false,
    loginAlerts: true,
  });

  const handleSaveProfile = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsLoading(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold kme-gradient-text">Account Settings</h1>
        <p className="text-gray-600 mt-2">Manage your account preferences and security settings</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your personal information and profile details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="w-20 h-20">
                  <AvatarImage src="/placeholder.svg?height=80&width=80" />
                  <AvatarFallback className="text-lg">JD</AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Button variant="outline" className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Photo
                  </Button>
                  <p className="text-sm text-gray-500">JPG, PNG or GIF. Max size 2MB.</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={profile.firstName}
                    onChange={(e) => setProfile({...profile, firstName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={profile.lastName}
                    onChange={(e) => setProfile({...profile, lastName: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({...profile, email: e.target.value})}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="phone"
                    value={profile.phone}
                    onChange={(e) => setProfile({...profile, phone: e.target.value})}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-kme-navy" />
                    <Badge variant="secondary">{profile.role}</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input value={profile.department} readOnly className="bg-gray-50" />
                </div>
              </div>

              <Button 
                onClick={handleSaveProfile} 
                disabled={isLoading}
                className="bg-kme-navy hover:bg-kme-navy-dark"
              >
                <Save className="w-4 h-4 mr-2" />
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Manage your account security and authentication preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Two-Factor Authentication</Label>
                  <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
                </div>
                <Switch
                  checked={security.twoFactorEnabled}
                  onCheckedChange={(checked) => setSecurity({...security, twoFactorEnabled: checked})}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Login Alerts</Label>
                  <p className="text-sm text-gray-500">Get notified when someone signs into your account</p>
                </div>
                <Switch
                  checked={security.loginAlerts}
                  onCheckedChange={(checked) => setSecurity({...security, loginAlerts: checked})}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-base">Change Password</Label>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input id="currentPassword" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input id="newPassword" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input id="confirmPassword" type="password" />
                  </div>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Update Password
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose how you want to be notified about platform activities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Email Notifications</Label>
                  <p className="text-sm text-gray-500">Receive notifications via email</p>
                </div>
                <Switch
                  checked={security.emailNotifications}
                  onCheckedChange={(checked) => setSecurity({...security, emailNotifications: checked})}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">SMS Notifications</Label>
                  <p className="text-sm text-gray-500">Receive critical alerts via SMS</p>
                </div>
                <Switch
                  checked={security.smsNotifications}
                  onCheckedChange={(checked) => setSecurity({...security, smsNotifications: checked})}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-base">Notification Types</Label>
                <div className="space-y-3">
                  {[
                    { id: "system", label: "System Updates", description: "Platform maintenance and updates" },
                    { id: "security", label: "Security Alerts", description: "Login attempts and security events" },
                    { id: "billing", label: "Billing Notifications", description: "Payment and subscription updates" },
                    { id: "tenant", label: "Tenant Activities", description: "New tenant registrations and activities" },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">{item.label}</Label>
                        <p className="text-xs text-gray-500">{item.description}</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Platform Preferences
              </CardTitle>
              <CardDescription>
                Customize your platform experience and regional settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={profile.timezone}
                  onChange={(e) => setProfile({...profile, timezone: e.target.value})}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-base">Dashboard Preferences</Label>
                <div className="space-y-3">
                  {[
                    { id: "autoRefresh", label: "Auto-refresh Dashboard", description: "Automatically refresh data every 30 seconds" },
                    { id: "compactView", label: "Compact View", description: "Show more information in less space" },
                    { id: "darkMode", label: "Dark Mode", description: "Use dark theme for the interface" },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">{item.label}</Label>
                        <p className="text-xs text-gray-500">{item.description}</p>
                      </div>
                      <Switch />
                    </div>
                  ))}
                </div>
              </div>

              <Button className="bg-kme-navy hover:bg-kme-navy-dark">
                <Save className="w-4 h-4 mr-2" />
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
