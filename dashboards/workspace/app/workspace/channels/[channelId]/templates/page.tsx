"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { ArrowLeft } from "lucide-react"

import { WorkspaceHeader } from "@/components/workspace-header"
import { WorkspacePage } from "@/components/workspace"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChannelHealthPanel } from "@/components/bot-templates/channel-health-panel"
import { ChannelTemplateField } from "@/components/bot-templates/channel-template-field"
import { TemplateManager } from "@/components/bot-templates/template-manager"
import { useChannelOptions } from "@/lib/queries/channels"
import { useCommerceEnabled } from "@/lib/queries/bot-templates"

// Plan 74: per-channel template home. Opened from the channel row menu
// (Templates). Tab 1 wires the sale flow to this channel; tab 2 manages
// the merchant's templates.
//
// Plan 78: when the platform has commerce switched off the page is not
// reachable at all — the row menu hides the entry and a direct URL is sent
// back to the channel list, rather than showing an explanation the merchant
// cannot act on.
export default function ChannelTemplatesPage() {
  const params = useParams()
  const router = useRouter()
  const channelId = Array.isArray(params.channelId)
    ? params.channelId[0]
    : params.channelId
  const channelsQuery = useChannelOptions()
  const channel =
    channelsQuery.data?.find((item) => item.id === channelId) ?? null
  const commerceQuery = useCommerceEnabled()
  const commerceEnabled =
    commerceQuery.data?.telegramBotTemplate === "commerce"

  useEffect(() => {
    if (commerceQuery.isSuccess && !commerceEnabled) {
      router.replace("/workspace/channels")
    }
  }, [commerceQuery.isSuccess, commerceEnabled, router])

  // Hold the page until the switch resolves, so an enabled tenant never sees
  // a flash of the redirect.
  if (!commerceQuery.isSuccess || !commerceEnabled) return null

  return (
    <>
      <WorkspaceHeader
        eyebrow="Channels"
        title={channel ? `Templates · ${channel.channelName}` : "Templates"}
        description="Attach a bot template to run this channel's sale flow, or manage templates."
      />
      <WorkspacePage>
      <div className="mb-4">
        <Link
          href="/workspace/channels"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to channels
        </Link>
      </div>
      {channelsQuery.isPending ? (
        <p className="text-sm text-slate-400">Loading channel…</p>
      ) : !channel ? (
        <p className="text-sm text-rose-300">Channel not found.</p>
      ) : channel.channelType !== "telegram" ? (
        <p className="text-sm text-slate-400">
          Bot templates apply to Telegram channels only.
        </p>
      ) : (
        <Tabs defaultValue="integration" className="w-full">
          <TabsList className="w-fit">
            <TabsTrigger value="integration">Integration</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
          <TabsContent value="integration" className="mt-4 space-y-4">
            <ChannelTemplateField
              channelId={channel.id}
              channelName={channel.channelName}
            />
            <ChannelHealthPanel channelId={channel.id} />
          </TabsContent>
          <TabsContent value="templates" className="mt-4">
            <TemplateManager />
          </TabsContent>
        </Tabs>
      )}
      </WorkspacePage>
    </>
  )
}
