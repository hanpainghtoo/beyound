"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Camera, Lock, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { WorkspaceHeader } from "@/components/workspace-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkspacePage, WorkspaceSection } from "@/components/workspace"
import { agentMediaApi, getApiErrorMessage, profileApi, updateStoredUser, type AuthUser } from "@/lib/api"
import { useI18n } from "@/components/providers/i18n-provider"

export default function ProfilePage() {
  const { t } = useI18n()
  const preferenceLabels: Record<string, string> = {
    email: t("workspace.profile.channelEmail"),
    push: t("workspace.profile.channelPush"),
    sound: t("workspace.profile.channelSound"),
    desktop: t("workspace.profile.channelDesktop"),
    newMessages: t("workspace.profile.eventNewMessages"),
    orderUpdates: t("workspace.profile.eventOrderUpdates"),
  }

  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loadFailed, setLoadFailed] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isRemovingImage, setIsRemovingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadProfile = useCallback(async () => {
    setLoadFailed(false)
    try {
      setProfile(await profileApi.get())
    } catch (requestError) {
      setLoadFailed(true)
      toast.error(getApiErrorMessage(requestError, t("workspace.profile.unableLoad")))
    }
  }, [t])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const saveProfile = async () => {
    if (!profile) return
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
      toast.success(t("workspace.profile.saved"))
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.profile.unableSave")))
    }
  }

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t("workspace.profile.passwordMismatch"))
      return
    }
    try {
      const result = await profileApi.changePassword(currentPassword, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success(result.message)
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t("workspace.profile.unableChangePassword")))
    }
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if (!validTypes.includes(file.type)) {
      toast.error("Please select a valid image (JPEG, PNG, WebP, or GIF).")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller.")
      return
    }

    setIsUploadingImage(true)
    try {
      const uploaded = await agentMediaApi.upload(file, "profile-image")
      const result = await profileApi.updateProfileImage(profile.id, uploaded.file.id)
      setProfile({ ...profile, avatarUrl: result.avatarUrl })
      toast.success(t("workspace.profile.photoUpdated"))
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, "Couldn't upload profile photo. Please try again."))
    } finally {
      setIsUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleImageRemove = async () => {
    if (!profile) return
    setIsRemovingImage(true)
    try {
      const result = await profileApi.updateProfileImage(profile.id, "")
      setProfile({ ...profile, avatarUrl: result.avatarUrl })
      toast.success(t("workspace.profile.photoRemoved"))
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, "Couldn't remove profile photo. Please try again."))
    } finally {
      setIsRemovingImage(false)
    }
  }

  if (!profile) {
    return (
      <>
        <WorkspaceHeader eyebrow={t("workspace.profile.eyebrow")} title={t("workspace.profile.title")} description={t("workspace.profile.loadingDescription")} />
        <WorkspacePage>
          {loadFailed ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("workspace.profile.unableLoadState")}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadProfile()}>{t("workspace.profile.retry")}</Button>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {t("workspace.profile.loadingProfile")}
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
      <WorkspaceHeader eyebrow={t("workspace.profile.eyebrow")} title={t("workspace.profile.title")} description={t("workspace.profile.manageDescription")} />

      <WorkspacePage containerClassName="max-w-4xl">
        <Tabs defaultValue="profile">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">{t("workspace.profile.tabProfile")}</TabsTrigger>
            <TabsTrigger value="notifications">{t("workspace.profile.tabNotifications")}</TabsTrigger>
            <TabsTrigger value="security">{t("workspace.profile.tabSecurity")}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <WorkspaceSection title={t("workspace.profile.personalInfoTitle")} description={t("workspace.profile.personalInfoDescription")}>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profile.avatarUrl || undefined} alt={profile.fullName} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void handleImageUpload(e)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    title={t("workspace.profile.uploadPhoto")}
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="font-medium">{profile.fullName}</p>
                    <p className="text-sm text-muted-foreground">{profile.role}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                    >
                      <Camera className="mr-1.5 h-3.5 w-3.5" />
                      {isUploadingImage ? t("workspace.profile.uploading") : t("workspace.profile.changePhoto")}
                    </Button>
                    {profile.avatarUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleImageRemove()}
                        disabled={isRemovingImage}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {isRemovingImage ? t("workspace.profile.removing") : t("workspace.profile.remove")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("workspace.profile.fullName")}>
                  <Input value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} />
                </Field>
                <Field label={t("workspace.profile.emailLabel")}>
                  <Input value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} />
                </Field>
                <Field label={t("workspace.profile.phoneLabel")}>
                  <Input value={profile.phone || ""} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
                </Field>
                <Field label={t("workspace.profile.departmentLabel")}>
                  <Input value={profile.department || ""} onChange={(event) => setProfile({ ...profile, department: event.target.value })} />
                </Field>
                <Field label={t("workspace.profile.roleLabel")}>
                  <Input value={profile.role} disabled />
                </Field>
                <Field label={t("workspace.profile.employeeIdLabel")}>
                  <Input value={profile.employeeId || t("workspace.profile.notAssigned")} disabled />
                </Field>
              </div>

              <Button onClick={saveProfile}>
                <Save className="mr-2 h-4 w-4" />
                {t("workspace.profile.saveChanges")}
              </Button>
            </WorkspaceSection>
          </TabsContent>

          <TabsContent value="notifications">
            <WorkspaceSection title={t("workspace.profile.preferencesTitle")} description={t("workspace.profile.preferencesDescription")}>
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
                {t("workspace.profile.savePreferences")}
              </Button>
            </WorkspaceSection>
          </TabsContent>

          <TabsContent value="security">
            <WorkspaceSection title={t("workspace.profile.changePasswordTitle")} description={t("workspace.profile.changePasswordDescription")}>
              <Field label={t("workspace.profile.currentPassword")}>
                <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </Field>
              <Field label={t("workspace.profile.newPassword")}>
                <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </Field>
              <Field label={t("workspace.profile.confirmNewPassword")}>
                <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </Field>
              <Button onClick={changePassword} disabled={!currentPassword || newPassword.length < 8 || !confirmPassword}>
                <Lock className="mr-2 h-4 w-4" />
                {t("workspace.profile.updatePassword")}
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
