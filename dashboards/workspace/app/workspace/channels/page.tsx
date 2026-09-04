"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  KeyRound,
  Link2,
  Lock,
  MoreHorizontal,
  Pencil,
  PhoneCall,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Webhook,
  X,
} from "lucide-react";

import { WorkspaceHeader } from "@/components/workspace-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkspaceCard, WorkspacePage } from "@/components/workspace";
import {
  getApiErrorMessage,
  getStoredSession,
  tenantChannelsApi,
  tenantTelegramManagedBotApi,
  type CreateTenantChannelInput,
  type TelegramManagedBotRequestDto,
  type TenantChannelDto,
  type ValidateTelegramTokenResult,
} from "@/lib/api";
import { useSubscriptionGate } from "@/lib/queries/billing";
import { getPublicRuntimeConfig } from "@/lib/public-runtime-config";
import { cn } from "@/lib/utils";

type ConnectProvider = "messenger" | "viber" | "tiktok" | "telegram";

type ReadinessCheck = {
  title: string;
  detail: string;
};

type ProviderFlow = {
  provider: ConnectProvider;
  label: string;
  connectTitle: string;
  actionLabel: string;
  iconSrc: string;
  iconBadge: string;
  accent: string;
  panel: string;
  description?: string;
  steps: string[];
  readiness: ReadinessCheck[];
};

/*
type CredentialField = {
  key: string
  label: string
  required: boolean
  secret?: boolean
  description?: string
}
*/

type Feedback = {
  tone: "success" | "error";
  message: string;
};

/*
const providerCredentialSchemas: Record<CreateTenantChannelInput["channelType"], CredentialField[]> = {
  messenger: [
    { key: "pageId", label: "Page ID", required: true, secret: false },
    { key: "pageAccessToken", label: "Page access token", required: true, secret: true },
    { key: "appSecret", label: "App secret", required: true, secret: true },
    { key: "verifyToken", label: "Webhook verify token", required: true, secret: true },
  ],
  telegram: [
    { key: "botToken", label: "Bot token", required: true, secret: true, description: "Telegram BotFather token used for outbound sends." },
    { key: "botUsername", label: "Bot username", required: false, secret: false },
    {
      key: "secretToken",
      label: "Webhook secret token",
      required: false,
      secret: true,
      description: "Used to verify Telegram callbacks. Leave blank to keep the current token, or create a new one.",
    },
  ],
  viber: [
    { key: "authToken", label: "Auth token", required: true, secret: true },
    { key: "botName", label: "Bot name", required: false, secret: false },
    { key: "botAvatar", label: "Bot avatar URL", required: false, secret: false },
  ],
  tiktok: [
    { key: "clientKey", label: "Client key", required: true, secret: false },
    { key: "clientSecret", label: "Client secret", required: true, secret: true },
    { key: "accessToken", label: "Access token", required: false, secret: true },
    { key: "openId", label: "Open ID", required: false, secret: false },
  ],
}
*/

/*
const providerSupport: Record<
  CreateTenantChannelInput["channelType"],
  {
    modeLabel: string
    summary: string
    guidance: string
    tone: string
  }
> = {
  messenger: {
    modeLabel: "Inbound + outbound",
    summary: "Messenger channels can receive conversations and send CSR replies when credentials are complete.",
    guidance: "Keep the Page access token, app secret, and verify token aligned with your Meta app and webhook settings.",
    tone: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100",
  },
  telegram: {
    modeLabel: "Inbound + outbound",
    summary: "Telegram is fully supported when the bot token is stored and the webhook secret token matches incoming callbacks.",
    guidance: "If you leave the webhook secret token blank during registration, ZayOS will generate and store one automatically.",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100",
  },
  viber: {
    modeLabel: "Inbound + outbound",
    summary: "Viber channels can receive and send messages once the auth token is configured.",
    guidance: "Use the Viber auth token from the connected business account and verify the callback URL before going live.",
    tone: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-100",
  },
  tiktok: {
    modeLabel: "Inbound capture only",
    summary: "TikTok currently supports inbound lead and comment capture. CSR replies are intentionally blocked until approved provider access exists.",
    guidance: "Use TikTok to capture demand, then continue fulfilment in orders, deliveries, notes, and customer records inside ZayOS.",
    tone: "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
  },
}
*/

/*
const defaultForm: ChannelFormState = {
  channelType: "messenger",
  channelName: "",
  displayName: "",
  webhookUrl: "",
  welcomeMessage: "",
  autoReplyEnabled: false,
  assignmentRule: "round_robin",
  configurationJson: "{}",
  credentials: {},
}
*/

const defaultTelegramForm = {
  channelName: "",
  displayName: "",
  botToken: "",
};

const defaultTelegramManagedBotForm = {
  displayName: "",
  suggestedUsername: "",
};

const defaultViberForm = {
  channelName: "",
  displayName: "",
  authToken: "",
  botName: "",
  botAvatar: "",
};

const providerOrder: ConnectProvider[] = [
  "messenger",
  "telegram",
  "tiktok",
  "viber",
];

const providerFlows: ProviderFlow[] = [
  {
    provider: "messenger",
    label: "Facebook Messenger",
    connectTitle: "Connect Facebook Messenger",
    actionLabel: "Connect Facebook",
    iconSrc: "/icons/channels/messenger.svg",
    iconBadge:
      "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200",
    accent: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-100",
    panel: "border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10",
    description:
      "Connect your Facebook Page to receive and send messages from customers.",
    steps: [
      "Authorize with Facebook",
      "Select your Page",
      "Test the connection",
    ],
    readiness: [
      {
        title: "Credentials",
        detail:
          "Facebook Page access token and app credentials are stored securely.",
      },
      {
        title: "Webhook route",
        detail: "Messenger webhook is registered for incoming events.",
      },
      {
        title: "Connection test",
        detail: "The connection to Facebook Graph API is verified.",
      },
      {
        title: "Production ready",
        detail: "The channel is ready for customer conversations.",
      },
    ],
  },
  {
    provider: "telegram",
    label: "Telegram",
    connectTitle: "Connect Telegram",
    actionLabel: "Connect Telegram",
    iconSrc: "/icons/channels/telegram.svg",
    iconBadge:
      "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-200",
    accent:
      "border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-100",
    panel:
      "border-cyan-200 bg-cyan-50 dark:border-cyan-500/20 dark:bg-cyan-500/10",
    description:
      "Connect your Telegram bot to receive and send messages from customers, or create a new managed bot.",
    steps: ["Enter your bot token", "Register webhook", "Test the connection"],
    readiness: [
      {
        title: "Credentials",
        detail: "Telegram bot token is stored securely.",
      },
      {
        title: "Webhook route",
        detail: "Telegram webhook is registered for incoming updates.",
      },
      {
        title: "Connection test",
        detail: "The connection to Telegram Bot API is verified.",
      },
      {
        title: "Production ready",
        detail: "The channel is ready for customer conversations.",
      },
    ],
  },
  {
    provider: "viber",
    label: "Viber",
    connectTitle: "Connect Viber",
    actionLabel: "Connect Viber",
    iconSrc: "/icons/channels/viber.svg",
    iconBadge:
      "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200",
    accent:
      "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-100",
    panel:
      "border-violet-200 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10",
    description:
      "Connect your Viber Business Account to receive and send messages from customers.",
    steps: [
      "Enter your auth token",
      "Set up callback URL",
      "Test the connection",
    ],
    readiness: [
      { title: "Credentials", detail: "Viber auth token is stored securely." },
      {
        title: "Webhook route",
        detail: "Viber callback URL is available for incoming events.",
      },
      {
        title: "Connection test",
        detail: "The connection to Viber API is verified.",
      },
      {
        title: "Production ready",
        detail: "The channel is ready for customer conversations.",
      },
    ],
  },
  {
    provider: "tiktok",
    label: "TikTok Business",
    connectTitle: "Connect TikTok Business",
    actionLabel: "Connect TikTok",
    iconSrc: "/icons/channels/tiktok.png",
    iconBadge:
      "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
    accent:
      "border-slate-500/30 bg-slate-500/10 text-slate-800 dark:text-slate-100",
    panel:
      "border-slate-200 bg-slate-50 dark:border-slate-500/20 dark:bg-slate-950/70",
    description:
      "Connect your TikTok Business Account to capture leads and comments (incoming only).",
    steps: [
      "Authorize with TikTok",
      "Connect your business account",
      "Test the connection",
    ],
    readiness: [
      {
        title: "Credentials",
        detail: "TikTok Business API credentials are stored securely.",
      },
      {
        title: "Webhook route",
        detail: "TikTok webhook is set up for incoming events.",
      },
      {
        title: "Connection test",
        detail: "The connection to TikTok API is verified.",
      },
      {
        title: "Production ready",
        detail: "The channel is ready for lead capture.",
      },
    ],
  },
];

function getProviderFlow(provider: ConnectProvider): ProviderFlow {
  return (
    providerFlows.find((flow) => flow.provider === provider) || providerFlows[0]
  );
}

function providerLabel(provider: ConnectProvider): string {
  return getProviderFlow(provider).label;
}

/*
function getCredentialSchema(channel: TenantChannelDto | null, channelType: CreateTenantChannelInput["channelType"]): CredentialField[] {
  return providerCredentialSchemas[channelType] || []
}

function sanitizeConfiguration(config: Record<string, unknown>): Record<string, unknown> {
  const {
    // adapterValidation, credentialValidation — stripped before round-tripping through JSON form field
    ...rest
  } = config
  return rest
}
*/

function buildTelegramPayload(
  form: typeof defaultTelegramForm,
): CreateTenantChannelInput {
  return {
    channelType: "telegram",
    channelName: form.channelName.trim() || "telegram-main",
    displayName: form.displayName.trim() || "Telegram",
    credentials: {
      botToken: form.botToken.trim(),
    },
    configuration: { provider: "telegram" },
    assignmentRule: "round_robin",
    autoReplyEnabled: false,
  };
}

function oauthUrl(provider: "messenger" | "tiktok"): string | null {
  const config = getPublicRuntimeConfig();
  if (provider === "messenger") {
    const appId = config.metaAppId || process.env.NEXT_PUBLIC_META_APP_ID;
    if (!appId) return null;
    const redirectUri = `${typeof window !== "undefined" ? window.location.origin : ""}/workspace/channels/meta/callback`;
    const state = "zayos-messenger-connect";
    const scope =
      "pages_show_list,pages_messaging,pages_manage_metadata,business_management";
    return `https://www.facebook.com/v25.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}`;
  }
  return null;
}

/*
function channelBadgeTone(status: string) {
  if (status === "connected" || status === "ready" || status === "credentials_verified" || status === "active") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
  }
  if (status === "webhook_registering" || status === "awaiting_first_event") {
    return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-200"
  }
  if (status === "error" || status === "failed" || status === "disabled") {
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200"
  }
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
}
*/

type ChannelBadgeState =
  "connected" | "error" | "pending_configuration" | "disconnected";

function channelBadgeState(
  channel?: TenantChannelDto | null,
): ChannelBadgeState {
  if (!channel) return "pending_configuration";

  // connectionStatus is the provider-specific source of truth. Fall back to
  // the legacy status field only for older records without that value.
    if (channel.connectionStatus) {
    if (channel.connectionStatus === "error") return "error";
    if (channel.connectionStatus === "disabled") return "disconnected";
    if (
      channel.connectionStatus === "connected" ||
      channel.connectionStatus === "ready" ||
      channel.connectionStatus === "credentials_verified" ||
      channel.connectionStatus === "awaiting_first_event" ||
      channel.connectionStatus === "webhook_registering"
    )
      return "connected";
    return "pending_configuration";
  }

  if (channel.status === "error") return "error";
  if (channel.status === "inactive") return "disconnected";
  if (channel.status === "active") return "connected";
  return "pending_configuration";
}

function isConnected(channel?: TenantChannelDto | null) {
  return channelBadgeState(channel) === "connected";
}

function channelBadgeLabel(state: ChannelBadgeState) {
  if (state === "connected") return "Connected";
  if (state === "error") return "error";
  if (state === "disconnected") return "disconnected";
  return "pending configuration";
}

function channelBadgeTone(state: ChannelBadgeState) {
  if (state === "connected")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  if (state === "error")
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200";
  if (state === "disconnected")
    return "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200";
}

function providerStepIndex(
  provider: ConnectProvider,
  channel?: TenantChannelDto | null,
) {
  if (!channel) return 0;
  if (isConnected(channel)) return getProviderFlow(provider).steps.length;
  if (channel.connectionStatus === "awaiting_first_event")
    return Math.max(getProviderFlow(provider).steps.length - 1, 1);
  if (channel.webhookRegistrationStatus === "registered")
    return Math.max(getProviderFlow(provider).steps.length - 1, 1);
  if (channel.connectionStatus === "webhook_registering")
    return Math.max(getProviderFlow(provider).steps.length - 2, 1);
  if (
    channel.connectionStatus === "credentials_verified" ||
    channel.credentialStatus === "configured" ||
    channel.credentialStatus === "encrypted"
  )
    return Math.min(2, getProviderFlow(provider).steps.length - 1);
  return 1;
}

function channelTitle(channel: TenantChannelDto) {
  return (
    channel.displayName ||
    channel.channelName ||
    providerLabel(channel.channelType as ConnectProvider)
  );
}

/*
function getCredentialValues(channel: TenantChannelDto | null) {
  const values = channel?.credentials && typeof channel.credentials === "object" ? (channel.credentials as Record<string, unknown>) : {}
  const configuredValues = values.values && typeof values.values === "object" ? (values.values as Record<string, string>) : {}
  const fields = Array.isArray(values.fields) ? values.fields.map((field) => String(field)) : []
  return { configuredValues, fields }
}
*/

/*
function toForm(channel: TenantChannelDto): ChannelFormState {
  const schema = getCredentialSchema(channel, channel.channelType)
  const safeConfiguration = channel.configuration && typeof channel.configuration === "object" ? channel.configuration : {}
  return {
    channelType: channel.channelType,
    channelName: channel.channelName || "",
    displayName: channel.displayName || "",
    webhookUrl: String(safeConfiguration.webhookUrl || channel.webhookUrl || ""),
    welcomeMessage: channel.welcomeMessage || "",
    autoReplyEnabled: Boolean(channel.autoReplyEnabled),
    assignmentRule: channel.assignmentRule || "round_robin",
    configurationJson: JSON.stringify(sanitizeConfiguration(safeConfiguration), null, 2),
    credentials: Object.fromEntries(schema.map((field) => [field.key, ""])),
  }
}
*/

/*
function parseJson(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return {}
  return JSON.parse(trimmed) as Record<string, unknown>
}
*/

/*
function getCallbackPathPreview(channelType: CreateTenantChannelInput["channelType"], channelId?: string) {
  if (channelType === 'messenger') {
    return '/webhooks/messenger/shared';
  }
  return `/webhooks/${channelType}/${channelId || "{channel-uuid-after-save}"}`
}
*/

function formatStatus(value?: string | null) {
  return value ? value.replaceAll("_", " ") : "not recorded";
}

/*
function isConnectionReady(channel: TenantChannelDto) {
  return ["ready", "connected", "credentials_verified", "awaiting_first_event"].includes(channel.connectionStatus || "")
}
*/

/*
function getChannelSetupSteps(channel: TenantChannelDto) {
  const credentialStatus = channel.credentialStatus || "missing_required"
  const connectionStatus = channel.connectionStatus || "pending_configuration"
  return [
    {
      label: "Credentials",
      detail: credentialStatus === "missing_required" ? "Required provider credentials are missing." : "Provider credentials are stored.",
      complete: credentialStatus !== "missing_required",
    },
    {
      label: "Connection test",
      detail: channel.lastConnectionTestAt
        ? `Last tested ${new Date(channel.lastConnectionTestAt).toLocaleString()}`
        : "Run a test before using this channel with customers.",
      complete: Boolean(channel.lastConnectionTestAt) && connectionStatus !== "error",
    },
    {
      label: "Webhook callback",
      detail: channel.webhookUrl || String(channel.configuration?.webhookUrl || "") ? "Callback URL is available for provider setup." : "Callback URL is not available yet.",
      complete: Boolean(channel.webhookUrl || channel.configuration?.webhookUrl),
    },
  ]
}
*/

function buildViberPayload(
  form: typeof defaultViberForm,
): CreateTenantChannelInput {
  const botName = form.botName.trim();
  const botAvatar = form.botAvatar.trim();

  return {
    channelType: "viber",
    channelName: form.channelName.trim() || "viber-main",
    displayName: form.displayName.trim() || "Viber",
    credentials: {
      authToken: form.authToken.trim(),
      ...(botName ? { botName } : {}),
      ...(botAvatar ? { botAvatar } : {}),
    },
    configuration: { provider: "viber" },
    assignmentRule: "round_robin",
    autoReplyEnabled: false,
  };
}

export default function ChannelsPage() {
  const searchParams = useSearchParams();
  const [channels, setChannels] = useState<TenantChannelDto[]>([]);
  const [activeDialog, setActiveDialog] = useState<ConnectProvider | null>(
    null,
  );
  const [detailsChannel, setDetailsChannel] = useState<TenantChannelDto | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<ConnectProvider | "all">(
    "all",
  );
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [draftDisplayName, setDraftDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [telegramForm, setTelegramForm] = useState(defaultTelegramForm);
  const [telegramManagedBotForm, setTelegramManagedBotForm] = useState(
    defaultTelegramManagedBotForm,
  );
  const [telegramManagedRequest, setTelegramManagedRequest] =
    useState<TelegramManagedBotRequestDto | null>(null);
  const [validatedBot, setValidatedBot] =
    useState<ValidateTelegramTokenResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [viberForm, setViberForm] = useState(defaultViberForm);

  const { quota, hasActivePeriod, allowedProviders } = useSubscriptionGate();
  const canCreateTelegramManagedBot =
    ["owner", "admin"].includes(getStoredSession()?.user.role || "");

  const loadChannels = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await tenantChannelsApi.list();
      const visibleRows = rows.filter((channel) =>
        providerOrder.includes(channel.channelType as ConnectProvider),
      );
      setChannels(visibleRows);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to load channels"),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    const requestId = telegramManagedRequest?.requestId;
    if (
      !requestId ||
      ["connected", "failed", "expired", "cancelled"].includes(
        telegramManagedRequest.status,
      )
    )
      return;

    const interval = window.setInterval(async () => {
      try {
        const request = await tenantTelegramManagedBotApi.getRequest(requestId);
        setTelegramManagedRequest(request);
        if (request.status === "connected") {
          await loadChannels();
          setFeedback({
            tone: "success",
            message: "Telegram business bot is connected to ZayOS.",
          });
        }
      } catch (error) {
        setFeedback({
          tone: "error",
          message: getApiErrorMessage(
            error,
            "Unable to refresh Telegram onboarding status",
          ),
        });
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [
    telegramManagedRequest?.requestId,
    telegramManagedRequest?.status,
    loadChannels,
  ]);

  useEffect(() => {
    const connect = searchParams.get("connect");
    if (connect === "success") {
      const pageName = searchParams.get("page") || "Facebook Page";
      setFeedback({
        tone: "success",
        message: `${pageName} is connected to ZayOS.`,
      });
    } else if (connect === "error") {
      setFeedback({
        tone: "error",
        message:
          searchParams.get("message") ||
          "Facebook Messenger connection did not complete.",
      });
    }
  }, [searchParams]);

  const filteredChannels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return channels.filter((channel) => {
      const matchesType =
        channelFilter === "all" || channel.channelType === channelFilter;
      const matchesQuery =
        !normalized ||
        `${channel.channelName} ${channel.displayName || ""} ${channel.channelType}`
          .toLowerCase()
          .includes(normalized);
      return matchesType && matchesQuery;
    });
  }, [channels, channelFilter, query]);

  const createTelegramChannel = async () => {
    if (!telegramForm.botToken.trim()) {
      setFeedback({
        tone: "error",
        message: "Enter the Telegram bot token before continuing.",
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    setValidatedBot(null);
    try {
      const payload = buildTelegramPayload(telegramForm);
      const channel = await tenantChannelsApi.create(payload);
      const tested = await tenantChannelsApi.testConnection(channel.id);
      setChannels((current) => {
        const withoutUpdated = current.filter(
          (item) => item.id !== tested.channel.id,
        );
        return [tested.channel, ...withoutUpdated];
      });
      setActiveDialog(null);
      setTelegramForm(defaultTelegramForm);
      setFeedback({
        tone: tested.ok ? "success" : "error",
        message: tested.ok
          ? "Telegram bot validated and webhook registration started."
          : tested.errors.join(" ") || "Telegram validation did not pass.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to connect Telegram"),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const validateTelegramToken = async () => {
    const token = telegramForm.botToken.trim();
    if (!token) {
      setFeedback({
        tone: "error",
        message: "Enter the Telegram bot token before validating.",
      });
      return;
    }

    setIsValidating(true);
    setFeedback(null);
    setValidatedBot(null);
    try {
      const result = await tenantChannelsApi.validateTelegramToken(token);
      setValidatedBot(result);
      if (result.ok) {
        setFeedback({
          tone: "success",
          message: result.firstName
            ? `Bot identity confirmed: ${result.firstName}${result.username ? ` (@${result.username})` : ""}`
            : "Bot token is valid.",
        });
      } else {
        setFeedback({
          tone: "error",
          message: result.error || "Token validation failed.",
        });
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to validate Telegram token"),
      });
    } finally {
      setIsValidating(false);
    }
  };

  const initiateTelegramManagedBot = async () => {
    const displayName = telegramManagedBotForm.displayName.trim();
    const suggestedUsername = telegramManagedBotForm.suggestedUsername
      .trim()
      .replace(/^@/, "");
    if (!displayName || !suggestedUsername) {
      setFeedback({
        tone: "error",
        message: "Enter the business bot name and suggested Telegram username.",
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const request = await tenantTelegramManagedBotApi.initiate({
        displayName,
        suggestedUsername,
      });
      setTelegramManagedRequest(request);
      if (request.telegramUrl) {
        window.open(request.telegramUrl, "_blank", "noopener,noreferrer");
      }
      setFeedback({
        tone: "success",
        message: "Continue in Telegram to create your business bot.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(
          error,
          "Unable to start Telegram bot creation",
        ),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelTelegramManagedBot = async () => {
    if (!telegramManagedRequest?.requestId) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const request = await tenantTelegramManagedBotApi.cancel(
        telegramManagedRequest.requestId,
      );
      setTelegramManagedRequest(request);
      setFeedback({
        tone: "success",
        message: "Telegram bot creation request was cancelled.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(
          error,
          "Unable to cancel Telegram bot creation",
        ),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const createViberChannel = async () => {
    if (!viberForm.authToken.trim()) {
      setFeedback({
        tone: "error",
        message: "Enter the Viber auth token before continuing.",
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const payload = buildViberPayload(viberForm);
      const channel = await tenantChannelsApi.create(payload);
      const tested = await tenantChannelsApi.testConnection(channel.id);
      setChannels((current) => [
        tested.channel,
        ...current.filter((item) => item.id !== tested.channel.id),
      ]);

      setActiveDialog(null);
      setViberForm(defaultViberForm);
      setFeedback({
        tone: tested.ok ? "success" : "error",
        message: tested.ok
          ? "Viber sender validated and production readiness state updated."
          : tested.errors.join(" ") || "Viber validation did not pass.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to connect Viber"),
      });
    } finally {
      setIsSaving(false);
    }
  };
  const testChannel = async (channel: TenantChannelDto) => {
    setFeedback(null);
    try {
      const result = await tenantChannelsApi.testConnection(channel.id);
      setChannels((current) =>
        current.map((item) =>
          item.id === result.channel.id ? result.channel : item,
        ),
      );
      setDetailsChannel((current) =>
        current?.id === result.channel.id ? result.channel : current,
      );
      setFeedback({
        tone: result.ok ? "success" : "error",
        message: result.ok
          ? `${providerLabel(result.provider as ConnectProvider)} connection check passed.`
          : result.errors.join(" ") || "Connection check failed.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to test channel"),
      });
    }
  };

  const saveChannelName = async (channel: TenantChannelDto) => {
    const displayName = draftDisplayName.trim();
    if (!displayName || displayName === channelTitle(channel)) {
      setEditingChannelId(null);
      return;
    }

    try {
      const updated = await tenantChannelsApi.update(channel.id, {
        displayName,
      });
      setChannels((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingChannelId(null);
      setFeedback({ tone: "success", message: `${displayName} was renamed.` });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to rename channel"),
      });
    }
  };

  const disconnectChannel = async (channel: TenantChannelDto) => {
    if (
      !confirm(
        `Disconnect ${channelTitle(channel)}? The saved record will remain available.`,
      )
    )
      return;
    setFeedback(null);
    try {
      const disconnected = await tenantChannelsApi.disconnect(channel.id);
      setChannels((current) =>
        current.map((item) =>
          item.id === disconnected.id ? disconnected : item,
        ),
      );
      setDetailsChannel((current) =>
        current?.id === disconnected.id ? disconnected : current,
      );
      setFeedback({
        tone: "success",
        message: `${channelTitle(channel)} was disconnected. The record was kept.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to disconnect channel"),
      });
    }
  };

  const deleteChannel = async (channel: TenantChannelDto) => {
    if (
      !confirm(
        `Delete ${channelTitle(channel)} permanently? This removes the saved record and channel data.`,
      )
    )
      return;
    setFeedback(null);
    try {
      await tenantChannelsApi.delete(channel.id);
      setChannels((current) =>
        current.filter((item) => item.id !== channel.id),
      );
      setDetailsChannel((current) =>
        current?.id === channel.id ? null : current,
      );
      setFeedback({
        tone: "success",
        message: `${channelTitle(channel)} was deleted.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to delete channel"),
      });
    }
  };

  const setRetention = async (channel: TenantChannelDto, selected: boolean) => {
    try {
      const updated = await tenantChannelsApi.setRetention(
        channel.id,
        selected,
      );
      setChannels((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setDetailsChannel((current) =>
        current?.id === updated.id ? updated : current,
      );
      setFeedback({
        tone: "success",
        message: selected
          ? `${channelTitle(channel)} is marked to retain at capacity expiry.`
          : `${channelTitle(channel)} retention preference cleared.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(
          error,
          "Unable to update retention preference",
        ),
      });
    }
  };

  const reactivateChannel = async (channel: TenantChannelDto) => {
    try {
      const updated = await tenantChannelsApi.reactivate(channel.id);
      setChannels((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setDetailsChannel((current) =>
        current?.id === updated.id ? updated : current,
      );
      setFeedback({
        tone: "success",
        message: `${channelTitle(channel)} was reactivated within available channel capacity.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to reactivate channel"),
      });
    }
  };

  return (
    <>
      <WorkspaceHeader
        eyebrow="Management"
        title="Channels"
        description="Connect Messenger, Viber, TikTok Business, and Telegram with guided provider verification."
      />

      <Dialog
        open={Boolean(activeDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
            setValidatedBot(null);
          }
        }}
      >
        {activeDialog ? (
          <ConnectDialog
            flow={getProviderFlow(activeDialog)}
            isSaving={isSaving}
            telegramForm={telegramForm}
            setTelegramForm={setTelegramForm}
            onTelegramSubmit={createTelegramChannel}
            validatedBot={validatedBot}
            onTelegramValidate={validateTelegramToken}
            onTelegramValidateClear={() => setValidatedBot(null)}
            isValidating={isValidating}
            telegramManagedBotForm={telegramManagedBotForm}
            setTelegramManagedBotForm={setTelegramManagedBotForm}
            telegramManagedRequest={telegramManagedRequest}
            onTelegramManagedSubmit={initiateTelegramManagedBot}
            onTelegramManagedCancel={cancelTelegramManagedBot}
            canCreateTelegramManagedBot={canCreateTelegramManagedBot}
            viberForm={viberForm}
            setViberForm={setViberForm}
            onViberSubmit={createViberChannel}
            onClose={() => {
              setActiveDialog(null);
              setValidatedBot(null);
            }}
            onConnectSuccess={loadChannels}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(detailsChannel)}
        onOpenChange={(open) => {
          if (!open) setDetailsChannel(null);
        }}
      >
        {detailsChannel ? (
          <ChannelDetailsDialog
            channel={detailsChannel}
            flow={getProviderFlow(
              detailsChannel.channelType as ConnectProvider,
            )}
            onVerify={() => void testChannel(detailsChannel)}
            onDisconnect={() => void disconnectChannel(detailsChannel)}
            onDelete={() => void deleteChannel(detailsChannel)}
            onRetention={(selected) =>
              void setRetention(detailsChannel, selected)
            }
            onReactivate={() => void reactivateChannel(detailsChannel)}
          />
        ) : null}
      </Dialog>

      <WorkspacePage>
        {feedback ? (
          <FeedbackBanner tone={feedback.tone}>
            {feedback.message}
          </FeedbackBanner>
        ) : null}

        <WorkspaceCard className="overflow-hidden py-0">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-5 dark:border-slate-800 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                Connected Channels
              </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Saved channel records and current provider verification state.
          </p>
          {hasActivePeriod && allowedProviders.length > 0 ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Included in your plan: {allowedProviders
                .map((p) =>
                  p === "messenger"
                    ? "Messenger"
                    : p === "tiktok"
                    ? "TikTok"
                    : p === "telegram"
                    ? "Telegram"
                    : p === "viber"
                    ? "Viber"
                    : getProviderFlow(p as ConnectProvider).label,
                )
                .join(", ")}
            </p>
          ) : null}
          {!hasActivePeriod ? (
            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              Channel connections are paused because there&apos;s no active
              subscription period.
            </p>
          ) : null}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              <div className="relative min-w-0 flex-1 sm:min-w-[220px] sm:flex-none sm:w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Search channels"
                  className="h-9 pl-9"
                  placeholder="Search channels"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <Select
                value={channelFilter}
                onValueChange={(value) =>
                  setChannelFilter(value as ConnectProvider | "all")
                }
              >
                <SelectTrigger
                  aria-label="Filter channels by type"
                  size="sm"
                  className="w-full sm:w-[170px]"
                >
                  <SelectValue placeholder="All channel types" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="all">All channel types</SelectItem>
                  {providerOrder.map((provider) => {
                    const flow = getProviderFlow(provider);
                    return (
                      <SelectItem key={provider} value={provider}>
                        <span className="flex items-center gap-2">
                          <img
                            src={flow.iconSrc}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded-md object-contain"
                            loading="lazy"
                          />
                          {provider === "messenger"
                            ? "Messenger"
                            : provider === "tiktok"
                              ? "Tiktok"
                              : flow.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={!hasActivePeriod || !quota.channel_slots?.canConsume}
                    title={
                      !hasActivePeriod
                        ? "No active subscription — renew or start a plan to connect channels."
                        : !quota.channel_slots?.canConsume
                          ? `Channel limit reached (${quota.channel_slots?.used ?? 0}/${quota.channel_slots?.limit ?? 0}).`
                          : undefined
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add channel
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                {providerOrder.map((provider) => {
                  const flow = getProviderFlow(provider);
                  const isAllowed =
                    allowedProviders.length === 0 ||
                    allowedProviders.includes(provider);
                  const showLock =
                    hasActivePeriod &&
                    allowedProviders.length > 0 &&
                    !isAllowed;
                  return (
                    <DropdownMenuItem
                      key={provider}
                      onClick={() => setActiveDialog(provider)}
                      disabled={showLock || !hasActivePeriod || !quota.channel_slots?.canConsume}
                    >
                      <img
                        src={flow.iconSrc}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded-md object-contain"
                        loading="lazy"
                      />
                      <span className="ml-2">{provider === "messenger"
                        ? "Messenger"
                        : provider === "tiktok"
                        ? "Tiktok"
                        : flow.label}</span>
                      {showLock && (
                        <Lock className="ml-1 h-3 w-3 text-muted-foreground" />
                      )}
                    </DropdownMenuItem>
                  );
                })}

                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {isLoading ? (
            <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading channels...
            </p>
          ) : filteredChannels.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No connected channel records yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredChannels.map((channel) => {
                const flow = getProviderFlow(
                  channel.channelType as ConnectProvider,
                );
                const editing = editingChannelId === channel.id;
                const badgeState = channelBadgeState(channel);
                return (
                  <div
                    key={channel.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-900/50 sm:px-5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <img
                        src={flow.iconSrc}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-contain"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <div className="flex max-w-md items-center gap-2">
                            <Input
                              autoFocus
                              value={draftDisplayName}
                              onChange={(event) =>
                                setDraftDisplayName(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter")
                                  void saveChannelName(channel);
                                if (event.key === "Escape")
                                  setEditingChannelId(null);
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Save channel name"
                              onClick={() => void saveChannelName(channel)}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Cancel editing"
                              onClick={() => setEditingChannelId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="group flex items-center gap-2">
                            <p className="truncate font-medium text-slate-950 dark:text-slate-50">
                              {channelTitle(channel)}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                              aria-label={`Rename ${channelTitle(channel)}`}
                              onClick={() => {
                                setEditingChannelId(channel.id);
                                setDraftDisplayName(channelTitle(channel));
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {flow.label} -{" "}
                          {formatStatus(
                            channel.connectionStatus || channel.status,
                          )}{" "}
                          <span className="mx-1 text-slate-300">•</span>{" "}
                          {channel.entitlementOrigin === "top_up"
                            ? "Top-up capacity"
                            : "Plan capacity"}{" "}
                          <span className="mx-1 text-slate-300">•</span> Last
                          modified on{" "}
                          {new Date(channel.updatedAt).toLocaleDateString()}
                        </p>
                        {channel.status === "disabled" ? (
                          <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                            Disabled after capacity expiry; configuration is
                            preserved.
                          </p>
                        ) : channel.retentionSelected ? (
                          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                            Selected for retention at the next capacity
                            boundary.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={channelBadgeTone(badgeState)}
                        variant="outline"
                      >
                        {channelBadgeLabel(badgeState)}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Manage ${channelTitle(channel)}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={6}
                          className="w-40"
                        >
                          <DropdownMenuItem
                            onClick={() => void testChannel(channel)}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Verify
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDetailsChannel(channel)}
                          >
                            <FileCheck2 className="mr-2 h-4 w-4" />
                            Details
                          </DropdownMenuItem>
                          {channel.status === "disabled" ? (
                            <DropdownMenuItem
                              onClick={() => void reactivateChannel(channel)}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Reactivate
                            </DropdownMenuItem>
                          ) : null}
                          {channel.status !== "inactive" &&
                          channel.status !== "disabled" ? (
                            <DropdownMenuItem
                              onClick={() =>
                                void setRetention(
                                  channel,
                                  !channel.retentionSelected,
                                )
                              }
                            >
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              {channel.retentionSelected
                                ? "Clear retention"
                                : "Retain at expiry"}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            disabled={badgeState === "disconnected"}
                            onClick={() => void disconnectChannel(channel)}
                          >
                            <Link2 className="mr-2 h-4 w-4" />
                            Disconnect
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => void deleteChannel(channel)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </WorkspaceCard>
      </WorkspacePage>
    </>
  );
}

function ChannelDetailsDialog({
  channel,
  flow,
  onVerify,
  onDisconnect,
  onDelete,
  onRetention,
  onReactivate,
}: {
  channel: TenantChannelDto;
  flow: ProviderFlow;
  onVerify: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
  onRetention: (selected: boolean) => void;
  onReactivate: () => void;
}) {
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <div className="flex items-start gap-3">
          <img
            src={flow.iconSrc}
            alt=""
            className="h-10 w-10 shrink-0 rounded-md object-contain"
            loading="lazy"
          />
          <div>
            <DialogTitle>{channelTitle(channel)}</DialogTitle>
            <DialogDescription>
              {flow.label} connection details and provider verification state.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <ConnectionFact label="Provider" value={flow.label} />
          <ConnectionFact
            label="Status"
            value={
              isConnected(channel)
                ? "Connected"
                : formatStatus(channel.connectionStatus || channel.status)
            }
          />
          <ConnectionFact
            label="Last modified"
            value={new Date(channel.updatedAt).toLocaleString()}
          />
          <ConnectionFact
            label="Last verified"
            value={
              channel.lastConnectionTestAt
                ? new Date(channel.lastConnectionTestAt).toLocaleString()
                : "Not verified"
            }
          />
          <ConnectionFact
            label="Webhook"
            value={channel.webhookUrl || "Not generated"}
          />
        </div>
        <div className="rounded-md border bg-muted/30 p-4">
          <p className="text-sm font-semibold">Connection path</p>
          <div className="mt-4">
            <FlowStepper flow={flow} channel={channel} />
          </div>
        </div>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
          Provider authorization
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {flow.provider === "messenger"
            ? "Facebook Page authorization is scoped to this saved Messenger instance. Re-authorize from Add Channel if the credentials need to be replaced."
            : flow.provider === "telegram"
              ? "This Telegram bot credential and webhook registration belong only to this saved bot instance."
              : flow.provider === "viber"
                ? "This Viber sender authorization is scoped to this saved business account."
                : "This TikTok Business authorization is scoped to this saved business account."}
        </p>
      </div>
      <ProductionReadiness flow={flow} channel={channel} />
      {channel.errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {channel.errorMessage}
        </div>
      ) : null}
      {channel.status === "disabled" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          This channel was disabled after capacity expiry. Its credentials,
          configuration, and history are preserved. Reactivation requires
          available current-period channel capacity.
        </div>
      ) : channel.status !== "inactive" ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
          <span>
            {channel.retentionSelected
              ? "Selected to be retained at capacity expiry."
              : "Base-plan channels are retained first by default."}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRetention(!channel.retentionSelected)}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {channel.retentionSelected
              ? "Clear selection"
              : "Select for retention"}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {channel.status === "disabled" ? (
          <Button onClick={onReactivate}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Reactivate
          </Button>
        ) : null}
        <Button
          variant="outline"
          onClick={onVerify}
          disabled={channel.status === "disabled"}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Verify
        </Button>
        <Button
          variant="outline"
          disabled={
            channel.status === "inactive" ||
            channel.connectionStatus === "disabled"
          }
          onClick={onDisconnect}
        >
          <Link2 className="mr-2 h-4 w-4" />
          Disconnect
        </Button>
        <Button variant="destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </DialogContent>
  );
}

function FlowStepper({
  flow,
  channel,
}: {
  flow: ProviderFlow;
  channel?: TenantChannelDto | null;
}) {
  const completedSteps = providerStepIndex(flow.provider, channel);

  return (
    <div className="space-y-4">
      {flow.steps.map((step, index) => {
        const complete = index < completedSteps;
        const current = index === completedSteps && !isConnected(channel);
        const Icon =
          index === 0
            ? ExternalLink
            : index === flow.steps.length - 1
              ? CheckCircle2
              : [Building2, FileCheck2, ShieldCheck, Webhook][index % 4];

        return (
          <div key={step} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border",
                complete
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : current
                    ? "border-slate-950 bg-white text-slate-950 dark:border-slate-100 dark:bg-slate-950 dark:text-slate-100"
                    : "border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900",
              )}
            >
              {complete ? (
                <Check className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 pb-3">
              <p
                className={cn(
                  "text-sm font-medium",
                  complete || current
                    ? "text-slate-950 dark:text-slate-50"
                    : "text-slate-500 dark:text-slate-400",
                )}
              >
                {step}
              </p>
              {current ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Current step
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConnectDialog({
  flow,
  isSaving,
  telegramForm,
  setTelegramForm,
  onTelegramSubmit,
  validatedBot,
  onTelegramValidate,
  onTelegramValidateClear,
  isValidating,
  telegramManagedBotForm,
  setTelegramManagedBotForm,
  telegramManagedRequest,
  onTelegramManagedSubmit,
  onTelegramManagedCancel,
  canCreateTelegramManagedBot,
  viberForm,
  setViberForm,
  onViberSubmit,
  onClose,
  onConnectSuccess,
}: {
  flow: ProviderFlow;
  isSaving: boolean;
  telegramForm: typeof defaultTelegramForm;
  setTelegramForm: (
    value:
      | typeof defaultTelegramForm
      | ((current: typeof defaultTelegramForm) => typeof defaultTelegramForm),
  ) => void;
  onTelegramSubmit: () => void;
  validatedBot: ValidateTelegramTokenResult | null;
  onTelegramValidate: () => void;
  onTelegramValidateClear: () => void;
  isValidating: boolean;
  telegramManagedBotForm: typeof defaultTelegramManagedBotForm;
  setTelegramManagedBotForm: (
    value:
      | typeof defaultTelegramManagedBotForm
      | ((
          current: typeof defaultTelegramManagedBotForm,
        ) => typeof defaultTelegramManagedBotForm),
  ) => void;
  telegramManagedRequest: TelegramManagedBotRequestDto | null;
  onTelegramManagedSubmit: () => void;
  onTelegramManagedCancel: () => void;
  canCreateTelegramManagedBot: boolean;
  viberForm: typeof defaultViberForm;
  setViberForm: (
    value:
      | typeof defaultViberForm
      | ((current: typeof defaultViberForm) => typeof defaultViberForm),
  ) => void;
  onViberSubmit: () => void;
  onClose: () => void;
  onConnectSuccess?: () => void;
}) {
  return (
    <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-200 bg-white p-0 sm:max-w-5xl dark:border-slate-800 dark:bg-slate-950">
      <DialogHeader>
        <div className={cn("border-b p-6", flow.panel)}>
          <div className="flex items-start gap-4">
            <img
              src={flow.iconSrc}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md object-contain"
              loading="lazy"
            />
            <div>
              <DialogTitle className="text-2xl text-slate-950 dark:text-slate-50">
                {flow.connectTitle}
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {flow.description}
              </DialogDescription>
            </div>
          </div>
        </div>
      </DialogHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {flow.provider === "telegram" ? (
            <TelegramConnectForm
              form={telegramForm}
              setForm={setTelegramForm}
              managedForm={telegramManagedBotForm}
              setManagedForm={setTelegramManagedBotForm}
              managedRequest={telegramManagedRequest}
              onSubmit={onTelegramSubmit}
              validatedBot={validatedBot}
              onValidate={onTelegramValidate}
              onValidateClear={onTelegramValidateClear}
              isValidating={isValidating}
              onManagedSubmit={onTelegramManagedSubmit}
              onManagedCancel={onTelegramManagedCancel}
              isSaving={isSaving}
              canCreateManagedBot={canCreateTelegramManagedBot}
            />
          ) : flow.provider === "viber" ? (
            <ViberConnectForm
              form={viberForm}
              setForm={setViberForm}
              onSubmit={onViberSubmit}
              isSaving={isSaving}
            />
          ) : (
            <OAuthConnectPanel
              flow={flow as ProviderFlow & { provider: "messenger" | "tiktok" }}
              onConnectSuccess={onConnectSuccess}
            />
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            Connection path
          </p>
          <div className="mt-5">
            <FlowStepper flow={flow} />
          </div>
          <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
            <ProductionReadiness flow={flow} compact />
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t border-slate-200 px-6 py-4 dark:border-slate-800">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </DialogContent>
  );
}

function OAuthConnectPanel({
  flow,
  onConnectSuccess,
}: {
  flow: ProviderFlow;
  onConnectSuccess?: () => void;
}) {
  if (flow.provider !== "messenger" && flow.provider !== "tiktok") return null;
  const url = oauthUrl(flow.provider);

  if (!url) {
    return (
      <div className="space-y-5">
        <div className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            Provider authorization
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {flow.provider === "messenger"
              ? "ZayOS will request Facebook Page messaging permissions, then return here with the selected Business and Page."
              : "ZayOS will request TikTok Business messaging access, then return here with the selected Business Account."}
          </p>
          <div className="mt-5">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    Provider app handoff is not configured in this environment.
                  </p>
                  <p className="mt-1">
                    {flow.provider === "messenger"
                      ? "Set META_APP_ID to enable Facebook authorization."
                      : "Set TIKTOK_CLIENT_KEY to enable TikTok Business authorization."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white/85 p-5 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-slate-100 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Link2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Webhook callback
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {flow.provider === "messenger"
                  ? "Messenger uses a single shared callback URL across all channels in this workspace. Configure it once in the Meta app dashboard."
                  : "The callback endpoint should normally be generated by the platform. Your team copies it into the provider console after the channel exists."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleConnect = () => {
    const popup = window.open(
      url,
      "messenger-oauth",
      "width=600,height=700,scrollbars=yes,resizable=yes",
    );
    if (!popup) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (
        event.data?.type === "messenger-connected" ||
        event.data?.type === "messenger-error"
      ) {
        window.removeEventListener("message", handleMessage);
        if (event.data.type === "messenger-connected" && onConnectSuccess) {
          onConnectSuccess();
        }
      }
    };
    window.addEventListener("message", handleMessage);

    const pollClosed = () => {
      if (popup.closed) {
        clearInterval(interval);
        window.removeEventListener("message", handleMessage);
      }
    };
    const interval = window.setInterval(pollClosed, 500);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
          Provider authorization
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {flow.provider === "messenger"
            ? "ZayOS will request Facebook Page messaging permissions, then return here with the selected Business and Page."
            : "ZayOS will request TikTok Business messaging access, then return here with the selected Business Account."}
        </p>
        <div className="mt-5">
          <Button onClick={handleConnect}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {flow.actionLabel}
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white/85 p-5 dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-slate-100 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Webhook callback
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {flow.provider === "messenger"
                ? "Messenger uses a single shared callback URL across all channels in this workspace. Configure it once in the Meta app dashboard."
                : "The callback endpoint should normally be generated by the platform. Your team copies it into the provider console after the channel exists."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function telegramManagedStatusLabel(
  status: TelegramManagedBotRequestDto["status"],
) {
  const labels: Record<TelegramManagedBotRequestDto["status"], string> = {
    pending: "Ready",
    telegram_started: "Waiting for Telegram",
    awaiting_creation: "Waiting for bot creation",
    provisioning: "Provisioning",
    connected: "Connected",
    failed: "Failed",
    expired: "Expired",
    cancelled: "Cancelled",
  };
  return labels[status];
}

function TelegramConnectForm({
  form,
  setForm,
  managedForm,
  setManagedForm,
  managedRequest,
  onSubmit,
  validatedBot,
  onValidate,
  onValidateClear,
  isValidating,
  onManagedSubmit,
  onManagedCancel,
  isSaving,
  canCreateManagedBot,
}: {
  form: typeof defaultTelegramForm;
  setForm: (
    value:
      | typeof defaultTelegramForm
      | ((current: typeof defaultTelegramForm) => typeof defaultTelegramForm),
  ) => void;
  managedForm: typeof defaultTelegramManagedBotForm;
  setManagedForm: (
    value:
      | typeof defaultTelegramManagedBotForm
      | ((
          current: typeof defaultTelegramManagedBotForm,
        ) => typeof defaultTelegramManagedBotForm),
  ) => void;
  managedRequest: TelegramManagedBotRequestDto | null;
  onSubmit: () => void;
  validatedBot: ValidateTelegramTokenResult | null;
  onValidate: () => void;
  onValidateClear: () => void;
  isValidating: boolean;
  onManagedSubmit: () => void;
  onManagedCancel: () => void;
  isSaving: boolean;
  canCreateManagedBot: boolean;
}) {
  const terminalRequest =
    managedRequest &&
    ["connected", "failed", "expired", "cancelled"].includes(
      managedRequest.status,
    );

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100">
        <div className="flex gap-3">
          <Bot className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This creates a Telegram bot owned by your business. Customers will
            message your business bot directly. The manager bot is used only
            during setup.
          </p>
        </div>
      </div>

      <div className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 md:grid-cols-2">
        <div className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Create My Business Bot
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {canCreateManagedBot
                  ? "Default onboarding through the Telegram manager bot."
                  : "Workspace owner or administrator access is required."}
              </p>
            </div>
            <Badge
              className="border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200"
              variant="outline"
            >
              {managedRequest ? formatStatus(managedRequest.status) : "Ready"}
            </Badge>
          </div>
        </div>
        <Field label="Business bot name">
          <Input
            value={managedForm.displayName}
            placeholder="Golden Mobile"
            onChange={(event) =>
              setManagedForm((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="Suggested username">
          <Input
            value={managedForm.suggestedUsername}
            placeholder="GoldenMobileMMBot"
            onChange={(event) =>
              setManagedForm((current) => ({
                ...current,
                suggestedUsername: event.target.value,
              }))
            }
          />
        </Field>
        {managedRequest ? (
          <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            <p className="font-medium text-slate-950 dark:text-slate-50">
              {telegramManagedStatusLabel(managedRequest.status)}
            </p>
            <p className="mt-1">
              Expires {new Date(managedRequest.expiresAt).toLocaleString()}
            </p>
            {managedRequest.failureMessage ? (
              <p className="mt-1 text-red-600 dark:text-red-300">
                {managedRequest.failureMessage}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button
            onClick={onManagedSubmit}
            disabled={
              !canCreateManagedBot ||
              isSaving ||
              Boolean(managedRequest && !terminalRequest)
            }
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {isSaving ? "Opening..." : "Continue in Telegram"}
          </Button>
          {managedRequest && !terminalRequest ? (
            <Button
              variant="outline"
              onClick={onManagedCancel}
              disabled={isSaving}
            >
              Cancel request
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 md:grid-cols-2">
        <div className="md:col-span-2">
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            Connect Existing Bot
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Supported for merchants who already own a Telegram bot token.
          </p>
        </div>

        {validatedBot?.ok ? (
          <div className="md:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  {validatedBot.firstName || "Telegram bot"}
                </p>
                {validatedBot.username ? (
                  <a
                    className="mt-1 inline-flex items-center text-sm text-cyan-700 hover:underline dark:text-cyan-200"
                    href={`https://t.me/${validatedBot.username.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Link2 className="mr-1.5 h-4 w-4" />@
                    {validatedBot.username.replace(/^@/, "")}
                  </a>
                ) : null}
              </div>
              <Badge
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                variant="outline"
              >
                Validated
              </Badge>
            </div>
          </div>
        ) : null}

        <Field label="Internal name">
          <Input
            value={form.channelName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                channelName: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="Display name">
          <Input
            value={form.displayName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Bot token">
            <Input
              type="password"
              value={form.botToken}
              placeholder="123456789:AA..."
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  botToken: event.target.value,
                }));
                onValidateClear();
              }}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button
            variant="outline"
            onClick={onValidate}
            disabled={isValidating || isSaving}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {isValidating ? "Validating..." : "Validate token"}
          </Button>
          {validatedBot?.ok ? (
            <Button onClick={onSubmit} disabled={isSaving}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {isSaving ? "Connecting..." : "Connect bot"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-5 opacity-75 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Connect Telegram Business Account
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Business account automation is planned as a separate connector
              type.
            </p>
          </div>
          <Badge variant="outline">Not connected</Badge>
        </div>
      </div>
    </div>
  );
}

function ViberConnectForm({
  form,
  setForm,
  onSubmit,
  isSaving,
}: {
  form: typeof defaultViberForm;
  setForm: (
    value:
      | typeof defaultViberForm
      | ((current: typeof defaultViberForm) => typeof defaultViberForm),
  ) => void;
  onSubmit: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 md:grid-cols-2">
        <Field label="Internal name">
          <Input
            value={form.channelName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                channelName: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="Display name">
          <Input
            value={form.displayName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Viber auth token">
            <Input
              type="password"
              value={form.authToken}
              placeholder="Viber Business auth token"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  authToken: event.target.value,
                }))
              }
            />
          </Field>
        </div>
        <Field label="Bot display name">
          <Input
            value={form.botName}
            placeholder="Mingalar Mobile"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                botName: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="Bot avatar URL">
          <Input
            value={form.botAvatar}
            placeholder="https://..."
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                botAvatar: event.target.value,
              }))
            }
          />
        </Field>
      </div>

      <div className="rounded-md border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-100">
        <div className="flex gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            ZayOS stores the sender token encrypted and prepares a stable Viber
            webhook route for signed callbacks.
          </p>
        </div>
      </div>

      <Button onClick={onSubmit} disabled={isSaving}>
        <PhoneCall className="mr-2 h-4 w-4" />
        {isSaving ? "Connecting..." : "Validate Viber sender"}
      </Button>
    </div>
  );
}

function ProductionReadiness({
  flow,
  channel,
  compact = false,
}: {
  flow: ProviderFlow;
  channel?: TenantChannelDto | null;
  compact?: boolean;
}) {
  const checks = [
    {
      title: flow.readiness[0]?.title || "Credentials",
      detail:
        flow.readiness[0]?.detail ||
        "Provider credentials are stored for this channel.",
      ready: Boolean(
        channel &&
        (channel.credentialStatus === "encrypted" ||
          channel.credentialStatus === "configured"),
      ),
    },
    {
      title: flow.readiness[1]?.title || "Webhook route",
      detail:
        flow.readiness[1]?.detail ||
        "A channel-specific webhook route is available.",
      ready: Boolean(channel?.webhookUrl || channel?.configuration?.webhookUrl),
    },
    {
      title: flow.readiness[2]?.title || "Provider verification",
      detail:
        flow.readiness[2]?.detail || "The latest provider check has completed.",
      ready: Boolean(
        channel?.lastConnectionTestAt ||
        channel?.credentialsVerifiedAt ||
        isConnected(channel),
      ),
    },
    {
      title: flow.readiness[3]?.title || "Operational state",
      detail:
        flow.readiness[3]?.detail ||
        "The channel is ready for production traffic.",
      ready: isConnected(channel),
    },
  ];
  const readyCount = checks.filter((check) => check.ready).length;

  return (
    <div
      className={cn(
        compact
          ? "p-0"
          : "rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
          Production readiness
        </p>
        <Badge
          className={
            readyCount === checks.length
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200"
          }
          variant="outline"
        >
          {readyCount}/{checks.length}
        </Badge>
      </div>
      <div className="mt-4 space-y-3">
        {checks.map((check) => (
          <div
            key={check.title}
            className="grid grid-cols-[24px_minmax(0,1fr)] gap-3"
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border",
                check.ready
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900",
              )}
            >
              {check.ready ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-950 dark:text-slate-50">
                {check.title}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {check.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/*
function ConnectionRequirement({ icon: Icon, title }: { icon: typeof Building2; title: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <Icon className="h-5 w-5 text-slate-700 dark:text-slate-200" />
      <p className="mt-3 text-sm font-medium text-slate-950 dark:text-slate-50">{title}</p>
    </div>
  )
}
*/

function ConnectionFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-sm text-slate-950 dark:text-slate-50">
        {value}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FeedbackBanner({
  tone,
  children,
}: {
  tone: Feedback["tone"];
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
        tone === "success"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
          : "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-100",
      )}
    >
      {tone === "success" ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div>{children}</div>
    </div>
  );
}
