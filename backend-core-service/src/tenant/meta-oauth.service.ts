import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';

import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { MetaApp } from '../channel/entities/meta-app.entity';
import { MetaAppResolver } from '../channel/meta-app-resolver.service';
import {
  decryptProviderCredentials,
  encryptProviderCredentials,
} from '../channel/provider-credentials.util';
import { TenantService } from './tenant.service';
import type { ExchangeMetaOAuthCodeDto } from './dto/meta-oauth.dto';

/**
 * Tenant-aware Meta (Facebook) OAuth connect for BYO apps (plan task 3.3).
 *
 * The tenant (workspace owner/admin) connects through their own Meta app.
 * The app secret never leaves core: the Next.js route and the browser only
 * ever see the public App ID, the single-use `state`, and the redirect URI.
 * Code -> token exchange, page-token upgrade, channel creation, page
 * subscription, and test-connection all happen here under the tenant JWT.
 */
export const META_OAUTH_REDIS_CLIENT = Symbol('META_OAUTH_REDIS_CLIENT');

export const META_OAUTH_STATE_TTL_SECONDS = 600;
export const META_OAUTH_SELECTION_TTL_SECONDS = 300;
export const META_OAUTH_RATE_LIMIT_WINDOW_SECONDS = 60;

/** Machine-readable error codes returned by the BYO connect endpoints. */
export const META_OAUTH_ERROR_CODES = {
  BYO_APP_NOT_CONFIGURED: 'BYO_APP_NOT_CONFIGURED',
  OAUTH_STATE_INVALID: 'OAUTH_STATE_INVALID',
  REDIRECT_URI_MISMATCH: 'REDIRECT_URI_MISMATCH',
  INVALID_APP_SECRET: 'INVALID_APP_SECRET',
  REDIRECT_URI_NOT_REGISTERED: 'REDIRECT_URI_NOT_REGISTERED',
  APP_NOT_LIVE: 'APP_NOT_LIVE',
  NO_ELIGIBLE_PAGES: 'NO_ELIGIBLE_PAGES',
  PAGE_NOT_AUTHORIZED: 'PAGE_NOT_AUTHORIZED',
  PAGE_SELECTION_EXPIRED: 'PAGE_SELECTION_EXPIRED',
  META_SUBSCRIBE_FAILED: 'META_SUBSCRIBE_FAILED',
  META_UPSTREAM_ERROR: 'META_UPSTREAM_ERROR',
  META_OAUTH_RATE_LIMITED: 'META_OAUTH_RATE_LIMITED',
} as const;

const META_OAUTH_SCOPES =
  'pages_show_list,pages_messaging,pages_manage_metadata,business_management';

/**
 * Canonical public origin of the tenant workspace, used for the Meta OAuth
 * callback URL. WORKSPACE_ORIGIN is the single supported variable;
 * FRONTEND_URL is a deprecated fallback (warns once per process);
 * FRONTEND_URLS ordering is intentionally NOT consulted here so the callback
 * can never silently follow a list reorder. Returns '' when unset.
 */
const workspaceBaseUrlLogger = new Logger('WorkspaceBaseUrl');
let deprecatedFallbackWarned = false;

export function resolveWorkspaceBaseUrl(): string {
  const canonical = (process.env.WORKSPACE_ORIGIN || '').trim();
  if (canonical) return canonical;
  const legacy = (process.env.FRONTEND_URL || '').trim();
  if (legacy) {
    if (!deprecatedFallbackWarned) {
      deprecatedFallbackWarned = true;
      workspaceBaseUrlLogger.warn(
        'FRONTEND_URL is deprecated for the Meta OAuth callback URL; set WORKSPACE_ORIGIN to the public workspace origin instead.',
      );
    }
    return legacy;
  }
  return '';
}

/**
 * Redirect URI shown in platform-console Channel settings and required
 * verbatim by the exchange endpoint. Both sides build it with this helper
 * so the two can never drift apart.
 */
export function buildWorkspaceOAuthRedirectUri(): string {
  const base = resolveWorkspaceBaseUrl().replace(/\/$/, '');
  return `${base}/workspace/channels/meta/callback`;
}

export function buildMetaOAuthDialogUrl(options: {
  appId: string;
  redirectUri: string;
  state: string;
  loginConfigId?: string | null;
}): string {
  const version = (
    process.env.META_GRAPH_API_VERSION ||
    process.env.MESSENGER_GRAPH_API_VERSION ||
    'v25.0'
  ).replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams({
    client_id: options.appId,
    redirect_uri: options.redirectUri,
    state: options.state,
  });
  if (options.loginConfigId) {
    // Facebook Login for Business: config_id replaces scope-based login.
    params.set('config_id', options.loginConfigId);
  } else {
    params.set('scope', META_OAUTH_SCOPES);
  }
  return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
}

/** Minimal structural Redis surface (atomic consume via Lua; no GETDEL dependency). */
export type MetaOAuthRedisClient = {
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
  quit(): Promise<unknown>;
};

/** Atomically fetch + delete a single-use value. Returns null when absent. */
const CONSUME_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
`;

/** Atomic fixed-window counter. Returns the new count. */
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

type MetaOAuthState = {
  tenantId: string;
  userId?: string | null;
};

type MetaOAuthSelection = MetaOAuthState & {
  // Long-lived user token, AES-256-GCM envelope (same envelope as channel
  // credentials). Held server-side for at most SELECTION_TTL; never logged
  // or returned — only used to finish the pending page selection.
  userTokenEncrypted: Record<string, unknown>;
  pages: Array<{
    id: string;
    name?: string;
    access_token?: string;
    category?: string;
  }>;
};

type MetaGraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

type ResolvedMetaApp = {
  row: MetaApp;
  appSecret: string;
  verifyToken: string;
};

@Injectable()
export class MetaOAuthService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(MetaOAuthService.name);

  constructor(
    private readonly metaAppResolver: MetaAppResolver,
    private readonly tenantService: TenantService,
    @InjectRepository(TenantChannel)
    private readonly channelRepository: Repository<TenantChannel>,
    @Optional()
    @Inject(META_OAUTH_REDIS_CLIENT)
    private readonly redis?: MetaOAuthRedisClient,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'production') return;
    const base = resolveWorkspaceBaseUrl();
    if (
      !base ||
      /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base.trim())
    ) {
      this.logger.warn(
        'WORKSPACE_ORIGIN is unset or localhost in production; the Meta OAuth callback URL will be wrong. Set WORKSPACE_ORIGIN to the public workspace origin.',
      );
    }
  }

  async onModuleDestroy() {
    try {
      await this.redis?.quit();
    } catch {
      // Best effort: shutdown ordering may already have closed the client.
    }
  }

  private credentialSecret(): string {
    const secret =
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
      process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY ||
      process.env.JWT_SECRET;
    if (!secret)
      throw new Error('Provider credential encryption key is not configured');
    return secret;
  }

  private graphApiBaseUrl(): string {
    const version = (
      process.env.META_GRAPH_API_VERSION ||
      process.env.MESSENGER_GRAPH_API_VERSION ||
      'v25.0'
    ).replace(/^\/+|\/+$/g, '');
    return `https://graph.facebook.com/${version}`;
  }

  private requireRedis(): MetaOAuthRedisClient {
    if (!this.redis)
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
        message:
          'Facebook connect is temporarily unavailable. Please try again.',
      });
    return this.redis;
  }

  /**
   * Fixed-window rate limit scoped to (tenant, user, endpoint) in shared
   * Redis, so every PM2 instance enforces the same budget. The global
   * IP-based ThrottlerGuard still applies underneath.
   */
  private async checkRateLimit(
    tenantId: string,
    userId: string | undefined | null,
    endpoint: 'state' | 'exchange',
  ): Promise<void> {
    const limit =
      endpoint === 'state'
        ? Number(process.env.META_OAUTH_STATE_RATE_LIMIT || 30)
        : Number(process.env.META_OAUTH_EXCHANGE_RATE_LIMIT || 10);
    const key = `meta:oauth:rl:${endpoint}:${tenantId}:${userId ?? 'anon'}`;
    let count: unknown;
    try {
      count = await this.requireRedis().eval(RATE_LIMIT_SCRIPT, {
        keys: [key],
        arguments: [String(META_OAUTH_RATE_LIMIT_WINDOW_SECONDS)],
      });
    } catch (error) {
      this.logger.warn(
        `Meta OAuth rate-limit store unavailable for ${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
        message:
          'Facebook connect is temporarily unavailable. Please try again.',
      });
    }
    if (typeof count === 'number' && count > limit) {
      throw new HttpException(
        {
          code: META_OAUTH_ERROR_CODES.META_OAUTH_RATE_LIMITED,
          message:
            'Too many Facebook connect attempts. Please wait a minute and try again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Issue a single-use login state bound to (tenant, user). The frontend
   * builds the Meta dialog URL with the returned state + redirect URI and
   * the tenant App ID from the effective-settings endpoint.
   */
  async issueState(tenantId: string, userId?: string | null) {
    await this.checkRateLimit(tenantId, userId, 'state');
    await this.resolveAppOrThrow(tenantId);
    const state = randomBytes(32).toString('hex');
    const payload: MetaOAuthState = { tenantId, userId: userId ?? null };
    await this.requireRedis().set(
      `meta:oauth:state:${state}`,
      JSON.stringify(payload),
      { EX: META_OAUTH_STATE_TTL_SECONDS },
    );
    return {
      state,
      redirectUri: buildWorkspaceOAuthRedirectUri(),
      expiresIn: META_OAUTH_STATE_TTL_SECONDS,
    };
  }

  /**
   * Exchange a Meta authorization code (or finish a stored page selection)
   * for a connected channel. Never returns secrets.
   */
  async exchangeCode(
    tenantId: string,
    userId: string | undefined | null,
    dto: ExchangeMetaOAuthCodeDto,
  ) {
    await this.checkRateLimit(tenantId, userId, 'exchange');
    if (dto.selectionToken) {
      return this.finishPageSelection(
        tenantId,
        userId,
        dto.selectionToken,
        dto.pageId,
      );
    }

    const code = dto.code?.trim();
    const redirectUri = dto.redirectUri?.trim();
    const state = dto.state?.trim();
    if (!code || !redirectUri || !state) {
      throw new BadRequestException({
        code: META_OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message:
          'Meta authorization code, redirect URI, and state are required.',
      });
    }

    const stored = await this.consume<MetaOAuthState>(
      `meta:oauth:state:${state}`,
    );
    if (
      !stored ||
      stored.tenantId !== tenantId ||
      (stored.userId != null && userId != null && stored.userId !== userId)
    ) {
      throw new BadRequestException({
        code: META_OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message:
          'This Facebook login session is invalid or was already used. Please start Facebook connect again.',
      });
    }

    if (redirectUri !== buildWorkspaceOAuthRedirectUri()) {
      throw new BadRequestException({
        code: META_OAUTH_ERROR_CODES.REDIRECT_URI_MISMATCH,
        message:
          'The OAuth redirect URI does not match the callback URL shown in platform-console Channel settings.',
      });
    }

    const app = await this.resolveAppOrThrow(tenantId);
    const userToken = await this.exchangeCodeForUserToken(
      app,
      code,
      redirectUri,
    );
    const longLivedUserToken = await this.exchangeForLongLivedToken(
      app,
      userToken,
    );
    const pages = await this.fetchAuthorizedPages(longLivedUserToken);

    if (dto.pageId) {
      const selected = pages.find((page) => page.id === dto.pageId);
      if (!selected) {
        throw new BadRequestException({
          code: META_OAUTH_ERROR_CODES.PAGE_NOT_AUTHORIZED,
          message:
            'The selected Page was not in the list Meta authorized for this login. Please reconnect and pick a Page you were shown.',
        });
      }
      return this.completeChannelSetup(
        tenantId,
        userId,
        app,
        selected,
        pages.length,
      );
    }

    if (pages.length === 1) {
      return this.completeChannelSetup(tenantId, userId, app, pages[0], 1);
    }

    const selectionToken = randomBytes(24).toString('hex');
    const selection: MetaOAuthSelection = {
      tenantId,
      userId: userId ?? null,
      userTokenEncrypted: encryptProviderCredentials(
        { value: longLivedUserToken },
        this.credentialSecret(),
      ),
      pages,
    };
    await this.requireRedis().set(
      `meta:oauth:selection:${selectionToken}`,
      JSON.stringify(selection),
      { EX: META_OAUTH_SELECTION_TTL_SECONDS },
    );
    return {
      ok: false,
      needsPageSelection: true as const,
      selectionToken,
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        category: page.category,
      })),
    };
  }

  private async finishPageSelection(
    tenantId: string,
    userId: string | undefined | null,
    selectionToken: string,
    pageId?: string,
  ) {
    const stored = await this.consume<MetaOAuthSelection>(
      `meta:oauth:selection:${selectionToken.trim()}`,
    );
    if (!stored) {
      throw new GoneException({
        code: META_OAUTH_ERROR_CODES.PAGE_SELECTION_EXPIRED,
        message: 'Page selection expired. Please reconnect Facebook.',
      });
    }
    if (
      stored.tenantId !== tenantId ||
      (stored.userId != null && userId != null && stored.userId !== userId)
    ) {
      throw new BadRequestException({
        code: META_OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message:
          'This Facebook login session is invalid or was already used. Please start Facebook connect again.',
      });
    }
    const selected = stored.pages.find((page) => page.id === pageId?.trim());
    if (!selected) {
      throw new BadRequestException({
        code: META_OAUTH_ERROR_CODES.PAGE_NOT_AUTHORIZED,
        message:
          'The selected Page was not in the list Meta authorized for this login. Please reconnect and pick a Page you were shown.',
      });
    }
    const app = await this.resolveAppOrThrow(tenantId);
    const storedUserToken = decryptProviderCredentials(
      stored.userTokenEncrypted,
      this.credentialSecret(),
    ).value as string;
    return this.completeChannelSetup(
      tenantId,
      userId,
      app,
      {
        ...selected,
        access_token: await this.exchangeForLongLivedToken(
          app,
          storedUserToken,
        ),
      },
      stored.pages.length,
    );
  }

  /**
   * Resolve the tenant's Meta app. BYO tenants without a valid app get 409
   * BYO_APP_NOT_CONFIGURED — never a silent fallback to the platform app.
   */
  private async resolveAppOrThrow(tenantId: string): Promise<ResolvedMetaApp> {
    let row: MetaApp;
    try {
      row = await this.metaAppResolver.getMetaApp(tenantId);
    } catch (error) {
      if (
        error instanceof NotFoundException &&
        error.message === 'BYO_APP_NOT_CONFIGURED'
      ) {
        throw new ConflictException({
          code: META_OAUTH_ERROR_CODES.BYO_APP_NOT_CONFIGURED,
          message:
            'Facebook setup is being prepared by our team. Please try again once the platform team confirms your Meta app is ready.',
        });
      }
      throw error;
    }
    const { appSecret, verifyToken } = this.metaAppResolver.decrypt(row);
    return { row, appSecret, verifyToken };
  }

  private async consume<T>(key: string): Promise<T | null> {
    let raw: unknown;
    try {
      raw = await this.requireRedis().eval(CONSUME_SCRIPT, {
        keys: [key],
        arguments: [],
      });
    } catch (error) {
      this.logger.warn(
        `Meta OAuth store unavailable for ${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
        message:
          'Facebook connect is temporarily unavailable. Please try again.',
      });
    }
    if (typeof raw !== 'string' || !raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async graphGet(
    url: string,
    step: 'code' | 'token' | 'accounts' | 'page-token' | 'subscribe',
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { cache: 'no-store' });
    } catch {
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
        message: 'Meta Graph API is unreachable. Please try again.',
      });
    }
    const payload = (await response.json().catch(() => null)) as {
      error?: MetaGraphError;
    } | null;
    if (!response.ok) {
      this.throwMappedGraphError(step, payload);
    }
    return payload;
  }

  private async graphPost(
    url: string,
    step: 'code' | 'token' | 'accounts' | 'page-token' | 'subscribe',
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', cache: 'no-store' });
    } catch {
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
        message: 'Meta Graph API is unreachable. Please try again.',
      });
    }
    const payload = (await response.json().catch(() => null)) as {
      error?: MetaGraphError;
    } | null;
    if (!response.ok) {
      this.throwMappedGraphError(step, payload);
    }
    return payload;
  }

  /**
   * Map Meta Graph failures to distinct actionable errors. Only Meta's error
   * message is forwarded — request parameters (which carry secrets) never are.
   *
   * Note: Meta exposes no reliable server-side "app Live" flag on the calls
   * in this flow, so non-live apps are detected from Meta's own development
   * mode errors at exchange/subscribe time (and at the login dialog itself,
   * which Meta blocks for non-role users of non-live apps).
   */
  private throwMappedGraphError(
    step: 'code' | 'token' | 'accounts' | 'page-token' | 'subscribe',
    payload: { error?: MetaGraphError } | null,
  ): never {
    const error = payload?.error;
    const code = error?.code;
    const message = error?.message || '';
    // Log the machine-readable failure only: code/subcode/type are Meta
    // enums, while messages and request parameters may carry secrets.
    this.logger.warn(
      `Meta Graph ${step} failed (code=${code ?? 'n/a'}, subcode=${error?.error_subcode ?? 'n/a'}, type=${error?.type ?? 'n/a'})`,
    );
    if (code === 191 || /redirect_?uri/i.test(message)) {
      throw new BadRequestException({
        code: META_OAUTH_ERROR_CODES.REDIRECT_URI_NOT_REGISTERED,
        message:
          'This redirect URI is not registered in the Meta app. Add the callback URL shown in platform-console Channel settings under the Meta app’s Facebook Login settings, then reconnect.',
      });
    }
    if (
      code === 104 ||
      /client[_ ]secret|invalid[^.]{0,40}secret|secret[^.]{0,40}invalid/i.test(
        message,
      )
    ) {
      throw new BadRequestException({
        code: META_OAUTH_ERROR_CODES.INVALID_APP_SECRET,
        message:
          'The App Secret does not match this App ID. Ask the platform team to re-enter the App Secret in platform-console Channel settings, then reconnect.',
      });
    }
    if (/development mode|not live|live mode|go live/i.test(message)) {
      throw new ConflictException({
        code: META_OAUTH_ERROR_CODES.APP_NOT_LIVE,
        message:
          'This Meta app is not in Live mode yet. Switch it to Live in the Meta app dashboard (App Review), then reconnect.',
      });
    }
    if (step === 'subscribe') {
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_SUBSCRIBE_FAILED,
        message:
          message ||
          'Meta refused the Page webhook subscription. Check the Page webhook setup in the Meta app dashboard, then reconnect.',
      });
    }
    throw new BadGatewayException({
      code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
      message: message || 'Meta rejected the Facebook connect request.',
    });
  }

  private async exchangeCodeForUserToken(
    app: ResolvedMetaApp,
    code: string,
    redirectUri: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      client_id: app.row.appId,
      client_secret: app.appSecret,
      redirect_uri: redirectUri,
      code,
    });
    const payload = (await this.graphGet(
      `${this.graphApiBaseUrl()}/oauth/access_token?${params.toString()}`,
      'code',
    )) as { access_token?: string } | null;
    const token = payload?.access_token;
    if (!token) {
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
        message: 'Meta did not return a user token for this login.',
      });
    }
    return token;
  }

  private async exchangeForLongLivedToken(
    app: ResolvedMetaApp,
    token: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      client_id: app.row.appId,
      client_secret: app.appSecret,
      grant_type: 'fb_exchange_token',
      fb_exchange_token: token,
    });
    const payload = (await this.graphGet(
      `${this.graphApiBaseUrl()}/oauth/access_token?${params.toString()}`,
      'token',
    )) as { access_token?: string } | null;
    const longLived = payload?.access_token;
    if (!longLived) {
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
        message: 'Meta did not return a long-lived token for this login.',
      });
    }
    return longLived;
  }

  private async fetchAuthorizedPages(userToken: string): Promise<
    Array<{
      id: string;
      name?: string;
      access_token?: string;
      category?: string;
    }>
  > {
    const params = new URLSearchParams({
      access_token: userToken,
      fields: 'id,name,access_token,category,tasks',
    });
    const payload = (await this.graphGet(
      `${this.graphApiBaseUrl()}/me/accounts?${params.toString()}`,
      'accounts',
    )) as { data?: MetaOAuthSelection['pages'] } | null;
    const pages = (payload?.data || []).filter(
      (
        page,
      ): page is { id: string } & Omit<
        MetaOAuthSelection['pages'][number],
        'id'
      > => Boolean(page?.id && page?.access_token),
    );
    if (pages.length === 0) {
      throw new BadRequestException({
        code: META_OAUTH_ERROR_CODES.NO_ELIGIBLE_PAGES,
        message:
          'Meta returned no Facebook Page with messaging access for this login. Connect with an account that has Page messaging permission.',
      });
    }
    return pages;
  }

  private async completeChannelSetup(
    tenantId: string,
    userId: string | undefined | null,
    app: ResolvedMetaApp,
    selectedPage: {
      id: string;
      name?: string;
      access_token?: string;
      category?: string;
      tasks?: string[];
    },
    authorizedPageCount: number,
  ) {
    const longLivedPageToken = await this.exchangeForLongLivedToken(
      app,
      selectedPage.access_token as string,
    );
    const pageId = String(selectedPage.id);
    const pageName = selectedPage.name?.trim() || `Facebook Page ${pageId}`;
    const channel = await this.tenantService.createChannel(
      tenantId,
      {
        channelType: 'messenger',
        channelName: pageName,
        displayName: pageName,
        credentials: {
          pageId,
          pageAccessToken: longLivedPageToken,
          appSecret: app.appSecret,
          verifyToken: app.verifyToken,
        },
        configuration: {
          provider: 'facebook',
          pageId,
          pageName,
          pageCategory: selectedPage.category || null,
          pageTasks: selectedPage.tasks || [],
          metaAppId: app.row.appId,
          providerAppRoutingId: app.row.webhookPathSegment,
          oauthMode: app.row.kind === 'byo' ? 'byo_app' : 'platform_one_click',
          authorizedPageCount,
          oauthConnectedAt: new Date().toISOString(),
        },
        assignmentRule: 'round_robin',
        autoReplyEnabled: false,
      },
      userId ?? undefined,
    );

    try {
      await this.channelRepository.update(channel.id, {
        metaAppId: app.row.id,
      });
    } catch {
      // Fail closed: without the stamp the channel would resolve through the
      // platform branch and fail webhook HMAC. Remove the half-created channel
      // when we can so a retry starts clean; otherwise surface the channel id.
      if (userId) {
        try {
          await this.tenantService.deleteChannel(tenantId, channel.id, userId);
        } catch {
          // Preserve the original stamping error below.
        }
      }
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_UPSTREAM_ERROR,
        message:
          `Facebook channel was created (${channel.id}) but could not be linked to its Meta app. ` +
          `${userId ? 'It was removed; please reconnect.' : 'Please delete it and reconnect.'}`,
      });
    }

    await this.subscribePageToWebhook(pageId, longLivedPageToken);

    const tested = await this.tenantService.testChannelConnection(
      tenantId,
      channel.id,
      userId ?? undefined,
    );
    return {
      ok: tested.ok,
      channel: tested.channel || channel,
      page: { id: pageId, name: pageName },
      authorizedPageCount,
      errors: tested.errors || [],
    };
  }

  private async subscribePageToWebhook(
    pageId: string,
    pageAccessToken: string,
  ): Promise<void> {
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      subscribed_fields:
        'messages,messaging_postbacks,message_deliveries,message_reads',
    });
    const payload = (await this.graphPost(
      `${this.graphApiBaseUrl()}/${pageId}/subscribed_apps?${params.toString()}`,
      'subscribe',
    )) as { success?: boolean } | null;
    if (!payload?.success) {
      throw new BadGatewayException({
        code: META_OAUTH_ERROR_CODES.META_SUBSCRIBE_FAILED,
        message:
          'Meta refused the Page webhook subscription. Check the Page webhook setup in the Meta app dashboard, then reconnect.',
      });
    }
  }
}
