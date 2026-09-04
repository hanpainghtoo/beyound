"use client"

import { useEffect, useState, type ReactNode } from "react"
import { AlertCircle, Lock, Save } from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { getApiErrorMessage, profileApi, updateStoredUser, type AuthUser } from "@/lib/api"

const preferenceLabels: Record<string, string> = {
  email: "Email notifications",
  push: "Browser push notifications",
  sound: "Sound alerts",
  desktop: "Desktop notifications",
  newMessages: "New customer messages",
  orderUpdates: "Order updates",
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    profileApi
      .get()
      .then(setProfile)
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Unable to load profile")))
  }, [])

  const saveProfile = async () => {
    if (!profile) return
    setError("")
    setMessage("")
    try {
      const updated = await profileApi.update({
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        department: profile.department,
        notificationPreferences: profile.notificationPreferences || {},
      })
      setProfile(updated)
      updateStoredUser(updated)
      setMessage("Profile saved.")
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to save profile"))
    }
  }

  const changePassword = async () => {
    setError("")
    setMessage("")
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match")
      return
    }
    try {
      const result = await profileApi.changePassword(currentPassword, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setMessage(result.message)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to change password"))
    }
  }

  if (!profile) {
    return (
      <>
        <WorkspaceHeader eyebrow="Team Member" title="Profile" description="Load your personal workspace profile." />
        <WorkspacePage>
          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading profile...
            </p>
          )}
        </WorkspacePage>
      </>
    )
  }

  const initials = profile.fullName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  return (
    <>
      <WorkspaceHeader eyebrow="Team Member" title="Profile" description="Manage your personal account details and security." />

      <WorkspacePage containerClassName="max-w-4xl">
        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">{message}</div> : null}

        <Tabs defaultValue="profile">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <WorkspaceSection title="Personal information" description="This lives with your user account, not the workspace company settings.">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={profile.avatarUrl || undefined} alt={profile.fullName} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{profile.fullName}</p>
                  <p className="text-sm text-muted-foreground">{profile.role}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Full Name">
                  <Input value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} />
                </Field>
                <Field label="Email">
                  <Input value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={profile.phone || ""} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
                </Field>
                <Field label="Department">
                  <Input value={profile.department || ""} onChange={(event) => setProfile({ ...profile, department: event.target.value })} />
                </Field>
                <Field label="Role">
                  <Input value={profile.role} disabled />
                </Field>
                <Field label="Employee ID">
                  <Input value={profile.employeeId || "Not assigned"} disabled />
                </Field>
              </div>

              <Button onClick={saveProfile}>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </WorkspaceSection>
          </TabsContent>

          <TabsContent value="notifications">
            <WorkspaceSection title="Notification preferences" description="These preferences belong to your user profile.">
              <div className="space-y-4">
                {Object.entries(preferenceLabels).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                    <Label>{label}</Label>
                    <Switch
                      checked={profile.notificationPreferences?.[key] ?? false}
                      onCheckedChange={(checked) =>
                        setProfile({
                          ...profile,
                          notificationPreferences: {
                            ...(profile.notificationPreferences || {}),
                            [key]: checked,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              <Button onClick={saveProfile}>
                <Save className="mr-2 h-4 w-4" />
                Save Preferences
              </Button>
            </WorkspaceSection>
          </TabsContent>

          <TabsContent value="security">
            <WorkspaceSection title="Change password" description="Keep your personal workspace account secure.">
              <Field label="Current Password">
                <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </Field>
              <Field label="New Password">
                <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </Field>
              <Field label="Confirm New Password">
                <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </Field>
              <Button onClick={changePassword} disabled={!currentPassword || newPassword.length < 8 || !confirmPassword}>
                <Lock className="mr-2 h-4 w-4" />
                Update Password
              </Button>
            </WorkspaceSection>
          </TabsContent>
        </Tabs>
      </WorkspacePage>
    </>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
