import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';

import { ProductService } from '../product/product.service';
import { ProductResponseDto } from '../product/dto/product-response.dto';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { decryptProviderCredentialsWithFallback } from '../channel/provider-credentials.util';
import { TelegramBotApiClient } from '../channel/telegram-bot-api.client';
import { TelegramBotRouter } from './telegram-bot.router';
import {
  encodeTelegramCallback,
  type TelegramBotUpdate,
} from './telegram-bot.types';
import { TelegramSessionService } from './telegram-session.service';
import { TELEGRAM_BOT_COMMANDS } from './telegram-bot.constants';
import { Customer } from '../customer/entities/customer.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import {
  OrderCreationService,
  type BotOrderResult,
} from '../order/order-creation.service';
import { PaymentService } from '../payment/payment.service';
import { MediaLibraryService } from '../media/media-library.service';
import {
  OrderTransitionService,
  PaymentProofRetryLimitError,
  type PaymentProofInput,
} from '../order/order-transition.service';
import { BotTemplateService } from '../bot-template/bot-template.service';
import { DEFAULT_BOT_TEMPLATE_FIELDS } from '../bot-template/bot-template.constants';
import {
  renderGreeting,
  renderMenuRows,
  type RenderableField,
} from '../bot-template/bot-template-render';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { INTERNAL_SYSTEM_EVENT_TYPE } from '../conversation/internal-message.util';
import { WebSocketService } from '../websocket/websocket.service';

/**
 * Human labels for button-tap trail entries (Plan 75). Unknown actions are
 * untracked by design.
 */
const BUTTON_TAP_LABELS: Record<string, string> = {
  p: 'Products',
  n: 'next page',
  v: 'previous page',
  d: 'a product',
  b: 'back to list',
  i: 'quantity +',
  r: 'quantity −',
  f: 'Shop info',
  o: 'Orders',
  h: 'an order',
  x: 'Order now',
  q: 'order confirm',
  y: 'a payment method',
  e: 'name edit',
  u: 'saved details',
  c: 'cancel',
  k: 'keep order',
  z: 'replace order',
  a: 'agent chat',
  m: 'menu',
};
/**
 * Static default menu. Single source is DEFAULT_BOT_TEMPLATE_FIELDS; this
 * is only its sorted, fully-defaulted view for the no-DB fallback path.
 */
const STATIC_DEFAULT_FIELDS: RenderableField[] =
  DEFAULT_BOT_TEMPLATE_FIELDS.map((field, index) => ({
    key: field.key,
    sort: index,
    layout: field.layout ?? 'full',
    visible: field.visible ?? true,
    condition: field.condition ?? null,
    value: {},
  }));

export const TELEGRAM_BROWSE_PAGE_SIZE = 6;
export const TELEGRAM_PER_ORDER_CAP = 10;

const BOT_MESSAGES = {
  en: {
    fullAddress:
      'Send your full shipping address in one message (maximum 500 characters).',
    proofReceived: 'Payment proof received. An agent will review it.',
    proofRetryLimit:
      'The payment-proof retry limit has been reached. Please contact an agent.',
    proofRetry:
      'We could not accept that payment proof. Please upload the image again.',
    proofRejected: (reason: string) =>
      `Your order was rejected: ${reason}. If this is about your payment proof, please upload a correct proof here to try again.`,
  },
  my: {
    // NEEDS NATIVE REVIEW: Burmese translation of the full-address prompt.
    fullAddress:
      'Send your full shipping address in one message (maximum 500 characters).',
    // NEEDS NATIVE REVIEW: Burmese translation of the neutral rejection/retry message.
    proofRejected: (reason: string) =>
      `Your order was rejected: ${reason}. If this is about your payment proof, please upload a correct proof here to try again.`,
    proofReceived: 'Payment proof received. An agent will review it.',
    proofRetry:
      'We could not accept that payment proof. Please upload the image again.',
    proofRetryLimit:
      'The payment-proof retry limit has been reached. Please contact an agent.',
  },
} as const;

type BrowseData = {
  screen?: 'menu' | 'list' | 'detail' | 'agent' | 'checkout' | 'orders';
  page?: number;
  productId?: string;
  productName?: string;
  quantity?: number;
  menuMessageId?: number;
  listMessageId?: number;
  detailMessageId?: number;
  checkoutSessionVersion?: string;
  displayedPrice?: number;
  name?: string;
  phone?: string;
  address?: string;
  expiresAtPreview?: string;
  existingOrderId?: string;
  orderPage?: number;
  paymentOrderId?: string;
};
type ShoppingSettings = {
  shopEnabled?: boolean;
  orderingEnabled?: boolean;
  currency?: string;
  photoFileIds?: Record<string, string>;
  paymentQrFileIds?: Record<string, string>;
  paymentQrBotTokenHash?: string;
};

type CommerceEvent = {
  provider: string;
  channelId: string;
  normalized: {
    content?: string;
    senderId?: string;
    externalConversationId?: string;
    eventType?: string;
    callbackQueryId?: string;
    callbackData?: string;
    metadata?: Record<string, unknown>;
  };
};

@Injectable()
export class TelegramCommerceService {
  private readonly logger = new Logger(TelegramCommerceService.name);
  private readonly telegram = new TelegramBotApiClient();
  private readonly customerRepository: Repository<Customer>;
  private readonly orderRepository: Repository<Order>;
  private readonly orderItemRepository: Repository<OrderItem>;
  private readonly orderCreationService: OrderCreationService;
  private readonly paymentService?: PaymentService;
  private readonly mediaLibrary?: MediaLibraryService;
  private readonly botTemplates?: BotTemplateService;
  private readonly conversationRepository?: Repository<Conversation>;
  private readonly messageRepository?: Repository<Message>;
  private readonly websocketService?: WebSocketService;
  constructor(
    private readonly productService: ProductService,
    private readonly router: TelegramBotRouter,
    private readonly sessions: TelegramSessionService,
    private readonly transitionService: OrderTransitionService,
    @InjectRepository(TenantChannel)
    private readonly channelRepository: Repository<TenantChannel>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @Optional()
    @InjectRepository(Customer)
    customerRepository?: Repository<Customer>,
    @Optional()
    @InjectRepository(Order)
    orderRepository?: Repository<Order>,
    @Optional()
    @InjectRepository(OrderItem)
    orderItemRepository?: Repository<OrderItem>,
    @Optional()
    orderCreationService?: OrderCreationService,
    @Optional()
    paymentService?: PaymentService,
    @Optional()
    mediaLibrary?: MediaLibraryService,
    @Optional()
    botTemplates?: BotTemplateService,
    @Optional()
    @InjectRepository(Conversation)
    conversationRepository?: Repository<Conversation>,
    @Optional()
    @InjectRepository(Message)
    messageRepository?: Repository<Message>,
    @Optional()
    websocketService?: WebSocketService,
  ) {
    this.customerRepository =
      customerRepository || ({} as Repository<Customer>);
    this.orderRepository = orderRepository || ({} as Repository<Order>);
    this.orderItemRepository =
      orderItemRepository || ({} as Repository<OrderItem>);
    this.orderCreationService =
      orderCreationService || ({} as OrderCreationService);
    this.paymentService = paymentService;
    this.mediaLibrary = mediaLibrary;
    this.botTemplates = botTemplates;
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.websocketService = websocketService;
  }

  async handle(event: CommerceEvent) {
    if (event.provider !== 'telegram') return { handled: false };
    const channel = await this.channel(event.channelId);
    if (!channel)
      return { handled: true, ignored: true, reason: 'channel_missing' };
    const normalized = event.normalized;
    const update = this.toUpdate(event, channel.tenantId);
    if (!this.shopEnabled(channel)) {
      if (event.normalized.eventType === 'callback_query')
        await this.answer(
          update,
          event.normalized.callbackQueryId,
          'Shop unavailable.',
        );
      return { handled: false };
    }
    const chatType =
      stringValue(normalized.metadata?.telegramChatType) || 'private';
    if (chatType !== 'private') {
      return { handled: true, ignored: true, reason: 'private_chats_only' };
    }

    const content = normalized.content?.trim() || '';
    const session = await this.sessions.get(update);
    const proof = this.paymentProof(event);
    if (
      proof &&
      (await this.canAcceptTelegramProof(channel, update, session))
    ) {
      await this.submitTelegramProof(event, update, session, proof);
      return { handled: true };
    }
    if (
      normalized.eventType !== 'callback_query' &&
      session?.state?.startsWith('checkout_') &&
      content !== '/start' &&
      content !== '/menu'
    ) {
      await this.handleCheckoutInput(event, update, session, content);
      return { handled: true };
    }
    if (normalized.eventType === 'callback_query') {
      return this.handleCallback(event, update);
    }
    if (content === '/start' || content === '/menu') {
      await this.showMenu(event, update);
      return { handled: true };
    }
    return { handled: false };
  }

  private async startCheckout(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    productId: string | undefined,
    currentData: BrowseData,
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel || this.settings(channel).orderingEnabled !== true) {
      if (channel)
        await this.sendNewAndCleanup(
          channel,
          update,
          'Ordering is currently unavailable.',
          'menu',
        );
      return;
    }
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider: 'telegram',
        externalId: update.userId,
      },
    });
    if (!customer || customer.botBlockedAt) {
      await this.sendNewAndCleanup(
        channel,
        update,
        'This bot cannot receive orders right now. Please contact an agent.',
        'menu',
      );
      return;
    }
    if (!productId) return;
    const product = await this.productService.getProductById(
      channel.tenantId,
      productId,
    );
    const tenant = await this.tenantRepository.findOneBy({
      id: channel.tenantId,
    });
    const current = await this.sessions.get(update);
    const version = (current?.version || 0) + 1;
    const data: BrowseData = {
      screen: 'checkout',
      productId,
      productName: product.name,
      quantity: Math.max(1, currentData.quantity || 1),
      displayedPrice: Number(product.price),
      checkoutSessionVersion: String(version),
      name: customer.fullName || undefined,
      address: this.savedAddress(customer),
      expiresAtPreview: new Date(
        Date.now() +
          Number(tenant?.orderExpirySettings?.pendingPayment || 2) * 3600000,
      ).toISOString(),
    };
    await this.saveSession(update, 'checkout_name', data, version);
    await this.sendCheckoutPrompt(channel, update, data, 'name');
  }

  private async handleCheckoutInput(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    session: { version: number; state: string; data: Record<string, unknown> },
    content: string,
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel) return;
    if (this.settings(channel).orderingEnabled !== true) {
      await this.sendNewAndCleanup(
        channel,
        update,
        'Ordering is currently unavailable.',
        'menu',
      );
      return;
    }
    const data = { ...(session.data as BrowseData) };
    if (['cancel', '/cancel', 'ပယ်ဖျက်ရန်'].includes(content.toLowerCase())) {
      await this.showMenu(event, update);
      return;
    }
    if (
      content.toLowerCase() === 'chat with agent' ||
      content.includes('အေးဂျင့်')
    ) {
      await this.sendAgentConfirmation(event, update);
      return;
    }
    if (session.state === 'checkout_name') {
      if (content.length < 2 || content.length > 100) {
        await this.sendCheckoutPrompt(
          channel,
          update,
          data,
          'name',
          'Please enter a name between 2 and 100 characters.',
        );
        return;
      }
      data.name = content;
      await this.saveSession(
        update,
        'checkout_phone',
        data,
        session.version + 1,
      );
      await this.sendCheckoutPrompt(channel, update, data, 'phone');
    } else if (session.state === 'checkout_phone') {
      const rawPhone = this.contactPhone(event, update) || content;
      const phone = this.normalizePhone(rawPhone);
      if (!phone) {
        await this.sendCheckoutPrompt(
          channel,
          update,
          data,
          'phone',
          'Please share your contact or type a Myanmar mobile number, for example 09123456789.',
        );
        return;
      }
      data.phone = phone;
      await this.saveSession(
        update,
        'checkout_address',
        data,
        session.version + 1,
      );
      await this.telegram.sendMessage(this.botToken(channel), {
        chatId: update.chatId,
        text: 'Phone saved.',
        replyMarkup: { remove_keyboard: true },
      });
      await this.sendCheckoutPrompt(channel, update, data, 'address');
    } else if (session.state === 'checkout_address') {
      const address = this.parseAddress(content);
      if (!address) {
        await this.sendCheckoutPrompt(
          channel,
          update,
          data,
          'address',
          BOT_MESSAGES.en.fullAddress,
        );
        return;
      }
      data.address = address;
      await this.saveCustomerProfile(channel, update.userId, data);
      await this.saveSession(
        update,
        'checkout_summary',
        data,
        session.version + 1,
      );
      await this.sendCheckoutPrompt(channel, update, data, 'summary');
    }
  }

  private async useSavedCheckoutValue(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    data: BrowseData,
  ) {
    const channel = await this.channel(event.channelId);
    const session = await this.sessions.get(update);
    if (!channel || !session) return;
    if (session.state === 'checkout_name' && data.name) {
      await this.saveSession(
        update,
        'checkout_phone',
        data,
        session.version + 1,
      );
      await this.sendCheckoutPrompt(channel, update, data, 'phone');
    } else if (session.state === 'checkout_address' && data.address) {
      await this.saveSession(
        update,
        'checkout_summary',
        data,
        session.version + 1,
      );
      await this.sendCheckoutPrompt(channel, update, data, 'summary');
    }
  }

  private async beginCheckoutName(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    data: BrowseData,
  ) {
    const channel = await this.channel(event.channelId);
    const session = await this.sessions.get(update);
    if (channel && session)
      await this.sendCheckoutPrompt(channel, update, data, 'name');
  }

  private async confirmCheckout(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    data: BrowseData,
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel || !data.productId || !data.checkoutSessionVersion) return;
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider: 'telegram',
        externalId: update.userId,
      },
    });
    if (!customer || customer.botBlockedAt) {
      await this.sendNewAndCleanup(
        channel,
        update,
        'This bot cannot receive orders right now. Please contact an agent.',
        'menu',
      );
      return;
    }
    await this.saveCustomerProfile(channel, update.userId, data);
    try {
      const result = await this.orderCreationService.createBotOrder({
        tenantId: channel.tenantId,
        channelId: channel.id,
        customerId: customer.id,
        telegramIdentity: { userId: update.userId, chatId: update.chatId },
        idempotencyKey: `telegram-order:${channel.tenantId}:${customer.id}:${data.checkoutSessionVersion}`,
        checkoutSessionVersion: data.checkoutSessionVersion,
        productId: data.productId,
        quantity: data.quantity || 1,
        deliveryData: data.address || '',
        paymentMethod: 'online',
        displayedPrice: data.displayedPrice || 0,
      });
      await this.renderOrderResult(channel, update, result, data);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'telegram_checkout_failed',
          tenantId: channel.tenantId,
          reason: error instanceof Error ? error.message : 'unknown',
        }),
      );
      await this.sendNewAndCleanup(
        channel,
        update,
        'We could not place that order. Please try again or chat with an agent.',
        'menu',
      );
    }
  }

  private async renderOrderResult(
    channel: TenantChannel,
    update: TelegramBotUpdate,
    result: BotOrderResult,
    data: BrowseData,
  ) {
    if (result.kind === 'price_changed') {
      data.displayedPrice = result.currentPrice;
      await this.saveSession(
        update,
        'checkout_summary',
        data,
        (await this.sessions.get(update))?.version || 1,
      );
      await this.sendCheckoutPrompt(
        channel,
        update,
        data,
        'summary',
        `The price is now ${formatPrice(result.currentPrice, this.settings(channel).currency || 'MMK')}. Please review and confirm again.`,
      );
    } else if (result.kind === 'out_of_stock') {
      if (result.available > 0) {
        data.quantity = result.available;
        await this.saveSession(
          update,
          'checkout_summary',
          data,
          (await this.sessions.get(update))?.version || 1,
        );
        await this.sendCheckoutPrompt(
          channel,
          update,
          data,
          'summary',
          `Only ${result.available} is available. We updated the quantity; please confirm again.`,
        );
      } else {
        await this.sendNewAndCleanup(
          channel,
          update,
          'This item is currently unavailable (out of stock). Please return to the menu.',
          'menu',
        );
      }
    } else if (result.kind === 'existing_order') {
      data.existingOrderId = result.order.id;
      const version = (await this.sessions.get(update))?.version || 1;
      await this.saveSession(update, 'existing_order', data, version);
      await this.telegram.sendMessage(this.botToken(channel), {
        chatId: update.chatId,
        text: `You already have unpaid order <b>${escapeHtml(result.order.orderNumber)}</b>.`,
        parseMode: 'HTML',
        replyMarkup: this.keyboard([
          [
            button(
              'Keep it',
              encodeTelegramCallback('k', undefined, undefined, version),
            ),
          ],
          [
            button(
              'Cancel and start new',
              encodeTelegramCallback('z', undefined, undefined, version),
            ),
          ],
          [
            button(
              'Chat with agent',
              encodeTelegramCallback('a', undefined, undefined, version),
            ),
          ],
        ]),
      });
    } else if (result.kind === 'created') {
      await this.showPaymentScreen(channel, update, result.order.id);
    }
  }

  private async showPaymentScreen(
    channel: TenantChannel,
    update: TelegramBotUpdate,
    orderId: string,
    notice?: string,
  ) {
    if (!this.paymentService) return;
    const order = await this.orderRepository.findOne({
      where: { id: orderId, tenantId: channel.tenantId },
    });
    if (!order) return;
    const methods = await this.paymentService.getEnabledMethods(
      channel.tenantId,
    );
    if (!methods.length) {
      await this.sendNewAndCleanup(
        channel,
        update,
        'Payment is currently unavailable. Please chat with an agent.',
        'menu',
      );
      return;
    }
    const current = await this.sessions.get(update);
    const currentData = (current?.data || {}) as BrowseData;
    const version = (current?.version || 0) + 1;
    const snapshot = order.paymentTotalSnapshot || {
      amount: String(order.totalAmount),
      currency: order.currency,
    };
    const selected = order.paymentMethodId
      ? methods.find((method) => method.id === order.paymentMethodId)
      : undefined;
    const deadline = order.expiresAt
      ? new Date(order.expiresAt).toLocaleString()
      : 'shown in order details';
    await this.ensurePaymentQrCache(channel);
    const rows = methods.map((method) => [
      button(
        `${method.name} · ${method.accountName}`,
        encodeTelegramCallback('y', method.id, undefined, version),
      ),
    ]);
    rows.push([
      button(
        'Chat with agent',
        encodeTelegramCallback('a', undefined, undefined, version),
      ),
      button(
        'Back to menu',
        encodeTelegramCallback('m', undefined, undefined, version),
      ),
    ]);
    const text = `${notice ? `${escapeHtml(notice)}\n\n` : ''}<b>Payment for ${escapeHtml(order.orderNumber)}</b>\nExact total: <b>${formatPrice(Number(snapshot.amount), snapshot.currency)}</b>\nPayment deadline: ${escapeHtml(deadline)}\n\n${selected ? `Selected: <b>${escapeHtml(selected.name)}</b>\nAccount name: ${escapeHtml(selected.accountName)}\nAccount number: ${escapeHtml(selected.accountNumber)}\n\n` : ''}Choose a payment method:`;
    const caption = this.paymentCaption(
      order.orderNumber,
      formatPrice(Number(snapshot.amount), snapshot.currency),
      deadline,
      selected,
      text,
    );
    const sendTextFallback = async () => {
      const sent = await this.telegram.sendMessage(this.botToken(channel), {
        chatId: update.chatId,
        text,
        parseMode: 'HTML',
        replyMarkup: this.keyboard(rows),
      });
      await this.saveSession(
        update,
        'payment',
        {
          ...currentData,
          paymentOrderId: order.id,
          menuMessageId: sent.messageId,
        },
        version,
      );
    };
    let qrFileId: string | undefined;
    if (selected?.qrMediaId) {
      if (!this.mediaLibrary) {
        this.logger.warn(
          `Payment QR ${selected.qrMediaId} cannot be validated for tenant ${channel.tenantId}`,
        );
        await sendTextFallback();
        return;
      }
      try {
        await this.mediaLibrary.getPaymentMethodImage(
          channel.tenantId,
          selected.qrMediaId,
        );
      } catch (error) {
        this.logger.warn(
          `Payment QR ${selected.qrMediaId} is invalid for tenant ${channel.tenantId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        await sendTextFallback();
        return;
      }
      qrFileId = this.paymentQrCache(channel, selected.qrMediaId);
      if (!qrFileId) {
        try {
          const response = (await this.mediaLibrary.getDownloadUrl(
            channel.tenantId,
            selected.qrMediaId,
            900,
          )) as { download?: { url?: string }; url?: string };
          const signedUrl = response.download?.url || response.url;
          if (signedUrl) {
            const sent = await this.telegram.sendPhoto(this.botToken(channel), {
              chatId: update.chatId,
              photo: signedUrl,
              caption,
              parseMode: 'HTML',
              replyMarkup: this.keyboard(rows),
            });
            if (sent.fileId)
              await this.cachePaymentQr(
                channel,
                selected.qrMediaId,
                sent.fileId,
              );
            await this.saveSession(
              update,
              'payment',
              {
                ...currentData,
                paymentOrderId: order.id,
                menuMessageId: sent.messageId,
              },
              version,
            );
            return;
          }
        } catch (error) {
          this.logger.warn(
            `Payment QR photo failed for tenant ${channel.tenantId}: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
          await sendTextFallback();
          return;
        }
      }
    }
    if (qrFileId) {
      try {
        const sent = await this.telegram.sendPhoto(this.botToken(channel), {
          chatId: update.chatId,
          photo: qrFileId,
          caption,
          parseMode: 'HTML',
          replyMarkup: this.keyboard(rows),
        });
        await this.saveSession(
          update,
          'payment',
          {
            ...currentData,
            paymentOrderId: order.id,
            menuMessageId: sent.messageId,
          },
          version,
        );
      } catch (error) {
        this.logger.warn(
          `Cached payment QR photo failed for tenant ${channel.tenantId}; invalidating cache: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        if (selected?.qrMediaId) {
          try {
            await this.clearPaymentQr(channel, selected.qrMediaId);
          } catch (cacheError) {
            this.logger.warn(
              `Could not clear cached payment QR for tenant ${channel.tenantId}: ${cacheError instanceof Error ? cacheError.message : 'unknown error'}`,
            );
          }
        }
        await sendTextFallback();
      }
      return;
    }
    await sendTextFallback();
  }

  private paymentCaption(
    orderNumber: string,
    total: string,
    deadline: string,
    selected:
      | { name: string; accountName: string; accountNumber: string }
      | undefined,
    fullText: string,
  ) {
    if (fullText.length <= 1024) return fullText;
    const required = `<b>Payment for ${escapeHtml(orderNumber)}</b>\nExact total: <b>${total}</b>\nPayment deadline: ${escapeHtml(deadline)}`;
    const details = selected
      ? `\n\nSelected: ${escapeHtml(selected.name)}\nAccount name: ${escapeHtml(selected.accountName)}\nAccount number: ${escapeHtml(selected.accountNumber)}`
      : '';
    const footer = '\n\nChoose a payment method:';
    const available = 1024 - required.length - footer.length - 3;
    return `${required}${details.slice(0, Math.max(0, available))}...${footer}`;
  }

  private async selectPaymentMethod(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    orderId: string,
    methodId: string,
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel || !this.paymentService) return;
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider: 'telegram',
        externalId: update.userId,
      },
    });
    if (!customer) return;
    try {
      await this.paymentService.selectMethod(
        channel.tenantId,
        orderId,
        methodId,
        customer.id,
        customer.id,
      );
      await this.showPaymentScreen(channel, update, orderId);
    } catch {
      await this.sendPlaceholder(
        event,
        update,
        'That payment method is no longer available. Please choose another.',
      );
    }
  }

  private async replaceExistingOrder(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    data: BrowseData,
  ) {
    const channel = await this.channel(event.channelId);
    if (
      !channel ||
      !data.existingOrderId ||
      !data.productId ||
      !data.checkoutSessionVersion
    )
      return;
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider: 'telegram',
        externalId: update.userId,
      },
    });
    if (!customer) return;
    try {
      const result = await this.orderCreationService.replaceBotOrder({
        tenantId: channel.tenantId,
        channelId: channel.id,
        customerId: customer.id,
        telegramIdentity: { userId: update.userId, chatId: update.chatId },
        idempotencyKey: `telegram-replace-order:${channel.tenantId}:${customer.id}:${data.checkoutSessionVersion}:${data.existingOrderId}`,
        checkoutSessionVersion: data.checkoutSessionVersion,
        productId: data.productId,
        quantity: data.quantity || 1,
        deliveryData: data.address || '',
        paymentMethod: 'online',
        displayedPrice: data.displayedPrice || 0,
        existingOrderId: data.existingOrderId,
      });
      await this.renderOrderResult(channel, update, result, data);
    } catch {
      await this.sendNewAndCleanup(
        channel,
        update,
        'We could not replace that order. Your existing order is unchanged.',
        'menu',
      );
    }
  }

  private async sendCheckoutPrompt(
    channel: TenantChannel,
    update: TelegramBotUpdate,
    data: BrowseData,
    step: 'name' | 'phone' | 'address' | 'summary',
    notice?: string,
  ) {
    const version = (await this.sessions.get(update))?.version || 1;
    const my =
      (await this.tenantRepository.findOneBy({ id: channel.tenantId }))
        ?.language === 'my';
    const labels = my
      ? {
          cancel: 'ပယ်ဖျက်ရန်',
          agent: 'အေးဂျင့်နှင့် ဆက်သွယ်ရန်',
          savedName: 'သိမ်းထားသောအမည်ကို သုံးမည်',
          savedAddress: 'သိမ်းထားသောလိပ်စာကို သုံးမည်',
          confirm: 'အတည်ပြုမည်',
          edit: 'ပြင်ဆင်မည်',
          name: 'ပို့ဆောင်ရန် အမည်ကို ရိုက်ထည့်ပါ။',
          phone:
            'ဖုန်းနံပါတ်မျှဝေပါ သို့မဟုတ် 09123456789 ကဲ့သို့ ရိုက်ထည့်ပါ။',
          address: BOT_MESSAGES.my.fullAddress,
        }
      : {
          cancel: 'Cancel',
          agent: 'Chat with agent',
          savedName: 'Use saved name',
          savedAddress: 'Use saved address',
          confirm: 'Confirm',
          edit: 'Edit',
          name: 'What name should we deliver to?',
          phone: 'Share your phone number or type it, for example 09123456789.',
          address: BOT_MESSAGES.en.fullAddress,
        };
    const buttons = [
      [
        button(
          labels.cancel,
          encodeTelegramCallback('c', undefined, undefined, version),
        ),
        button(
          labels.agent,
          encodeTelegramCallback('a', undefined, undefined, version),
        ),
      ],
    ];
    let text = notice ? `${escapeHtml(notice)}\n\n` : '';
    let replyMarkup: Record<string, unknown>;
    if (step === 'name') {
      text += labels.name;
      if (data.name)
        buttons.unshift([
          button(
            labels.savedName,
            encodeTelegramCallback('u', undefined, undefined, version),
          ),
        ]);
      replyMarkup = this.keyboard(buttons);
    } else if (step === 'phone') {
      text += labels.phone;
      replyMarkup = {
        keyboard: [
          [
            {
              text: my ? 'ဖုန်းမျှဝေရန်' : 'Share phone number',
              request_contact: true,
            },
          ],
          [
            { text: my ? 'ပယ်ဖျက်ရန်' : 'Cancel' },
            { text: my ? 'အေးဂျင့်နှင့် ဆက်သွယ်ရန်' : 'Chat with agent' },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    } else if (step === 'address') {
      text += labels.address;
      if (data.address)
        buttons.unshift([
          button(
            labels.savedAddress,
            encodeTelegramCallback('u', undefined, undefined, version),
          ),
        ]);
      replyMarkup = this.keyboard(buttons);
    } else {
      text += this.summaryText(data, my);
      buttons.unshift([
        button(
          labels.confirm,
          encodeTelegramCallback('q', undefined, undefined, version),
        ),
        button(
          labels.edit,
          encodeTelegramCallback('e', undefined, undefined, version),
        ),
      ]);
      replyMarkup = this.keyboard(buttons);
    }
    await this.telegram.sendMessage(this.botToken(channel), {
      chatId: update.chatId,
      text,
      parseMode: 'HTML',
      replyMarkup,
    });
  }

  private summaryText(data: BrowseData, my = false) {
    return `<b>${my ? 'အော်ဒါအကျဉ်းချုပ်' : 'Order summary'}</b>\n${my ? 'ကုန်ပစ္စည်း' : 'Product'}: ${escapeHtml(data.productName || data.productId || '')}\n${my ? 'အရေအတွက်' : 'Quantity'}: ${data.quantity || 1}\n${my ? 'တစ်ခုဈေးနှုန်း' : 'Unit price'}: ${formatPrice(data.displayedPrice || 0, 'MMK')}\n${my ? 'စုစုပေါင်း' : 'Total'}: ${formatPrice((data.displayedPrice || 0) * (data.quantity || 1), 'MMK')}\n${my ? 'အမည်' : 'Name'}: ${escapeHtml(data.name || '')}\n${my ? 'ဖုန်း' : 'Phone'}: ${escapeHtml(data.phone || '')}\n${my ? 'လိပ်စာ' : 'Address'}: ${escapeHtml(data.address || '')}\n${my ? 'ငွေပေးချေရမည့်အချိန်' : 'Payment deadline'}: ${escapeHtml(data.expiresAtPreview || 'after confirmation')}`;
  }

  private parseAddress(value: string) {
    const address = value.trim();
    return address.length > 0 && address.length <= 500 ? address : null;
  }

  private normalizePhone(value: string) {
    const digits = value.replace(/[^0-9+]/g, '');
    if (/^\+?959[0-9]{7,9}$/.test(digits))
      return digits.startsWith('+') ? digits : `+${digits}`;
    if (/^09[0-9]{7,9}$/.test(digits)) return `+95${digits.slice(1)}`;
    return null;
  }

  private contactPhone(event: CommerceEvent, update: TelegramBotUpdate) {
    const raw = event.normalized.metadata?.raw as
      | Record<string, any>
      | undefined;
    const message = raw?.message as Record<string, any> | undefined;
    const contact = message?.contact as Record<string, any> | undefined;
    return contact && String(contact.user_id || '') === update.userId
      ? String(contact.phone_number || '')
      : null;
  }

  private savedAddress(customer: Customer) {
    const profile = customer.profileData as
      | Record<string, unknown>
      | null
      | undefined;
    return typeof profile?.address === 'string' ? profile.address : undefined;
  }

  private async saveCustomerProfile(
    channel: TenantChannel,
    externalId: string,
    data: BrowseData,
  ) {
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider: 'telegram',
        externalId,
      },
    });
    if (!customer) return;
    if (data.name?.trim()) customer.fullName = data.name.trim();
    customer.profileData = {
      ...(customer.profileData || {}),
      ...(data.address?.trim() ? { address: data.address.trim() } : {}),
    };
    if (data.phone?.trim()) customer.phone = data.phone;
    await this.customerRepository.save(customer);
  }

  /**
   * Button-action trail (Plan 75): every accepted tap lands as an internal
   * system entry on the customer conversation — agents see it in the inbox
   * thread, customers never do. Skips silently when there is no tap id,
   * customer, or conversation yet.
   */
  private async recordButtonTap(
    update: TelegramBotUpdate,
    action: string,
    callbackQueryId: string | undefined,
  ) {
    const label = BUTTON_TAP_LABELS[action];
    if (!label || !callbackQueryId) return;
    if (!this.customerRepository || !this.conversationRepository) return;
    const messageRepository = this.messageRepository;
    if (!messageRepository) return;
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: update.tenantId,
        channelId: update.channelId,
        provider: 'telegram',
        externalId: update.userId,
      },
    });
    if (!customer) return;
    const conversation = await this.conversationRepository.findOne({
      where: {
        tenantId: update.tenantId,
        customerId: customer.id,
        channelId: update.channelId,
      },
    });
    if (!conversation) return;
    const idempotencyKey = `telegram-tap:${callbackQueryId}`;
    const existing = await messageRepository
      .createQueryBuilder('message')
      .where('message.tenant_id = :tenantId', { tenantId: update.tenantId })
      .andWhere('message.conversation_id = :conversationId', {
        conversationId: conversation.id,
      })
      .andWhere("message.metadata ->> 'idempotencyKey' = :idempotencyKey", {
        idempotencyKey,
      })
      .getOne();
    if (existing) return;
    const message = await messageRepository.save(
      messageRepository.create({
        conversationId: conversation.id,
        tenantId: update.tenantId,
        channelId: update.channelId,
        senderType: 'system',
        senderId: undefined,
        messageType: INTERNAL_SYSTEM_EVENT_TYPE,
        content: `Customer tapped ${label}`,
        attachments: [],
        metadata: {
          systemEvent: true,
          eventName: 'telegram.button_tap',
          eventVersion: 1,
          idempotencyKey,
          action,
        },
        provider: null,
        externalMessageId: undefined,
        status: 'sent',
        isInternal: true,
      }),
    );
    this.websocketService?.emitNewMessage(
      update.tenantId,
      conversation.id,
      message,
    );
  }

  private async handleCallback(
    event: CommerceEvent,
    update: TelegramBotUpdate,
  ) {
    const callbackQueryId = event.normalized.callbackQueryId;
    let callbackToast: string | undefined;
    try {
      if (!(await this.sessions.allowCallback(update))) {
        this.logCallbackRejection(
          'callback_rate_limited',
          undefined,
          undefined,
        );
        return {
          handled: true,
          ignored: true,
          reason: 'callback_rate_limited',
        };
      }
      const session = await this.sessions.get(update);
      const routed = await this.router.routeCallback(
        update,
        session?.state || '',
        session?.version || 0,
      );
      if (!routed.accepted) {
        this.logCallbackRejection(
          routed.reason,
          session?.version,
          routed.callback?.version,
        );
        callbackToast = 'This menu expired.';
        await this.showMenu(event, update);
        return { handled: true, stale: true };
      }

      const action = routed.callback.action;
      // Fire-and-forget: the trail must never slow down button answers.
      void this.recordButtonTap(update, action, callbackQueryId).catch(
        (error: unknown) =>
          this.logger.warn({
            event: 'telegram_button_tap_skipped',
            channelId: update.channelId,
            action,
            error: error instanceof Error ? error.message : String(error),
          }),
      );
      const sessionData = (routed.session?.data || {}) as BrowseData;
      if (action === 'p')
        await this.showProducts(event, update, routed.callback.page || 1, true);
      else if (
        (action === 'n' || action === 'v') &&
        routed.session?.state === 'orders'
      ) {
        const page = Math.max(1, sessionData.orderPage || 1);
        await this.showOrders(
          event,
          update,
          action === 'n' ? page + 1 : Math.max(1, page - 1),
          false,
        );
      } else if (action === 'n' || action === 'v') {
        const page = Math.max(1, routed.callback.page || 1);
        await this.showProducts(
          event,
          update,
          action === 'n' ? page + 1 : Math.max(1, page - 1),
          false,
        );
      } else if (action === 'd') {
        await this.showDetail(event, update, routed.callback.id, true);
      } else if (action === 'b') {
        await this.showProducts(event, update, sessionData.page || 1, true);
      } else if (action === 'i' || action === 'r') {
        callbackToast = await this.changeQuantity(
          event,
          update,
          sessionData.productId,
          action === 'i' ? 1 : -1,
        );
      } else if (action === 'f') await this.showProfile(event, update);
      else if (action === 'o')
        await this.handleOrdersCallback(event, update, routed, sessionData);
      else if (action === 'h')
        await this.showOrderDetail(event, update, routed.callback.id);
      else if (action === 'x')
        await this.startCheckout(
          event,
          update,
          routed.callback.id,
          sessionData,
        );
      else if (action === 'q')
        await this.confirmCheckout(event, update, sessionData);
      else if (action === 'y')
        await this.selectPaymentMethod(
          event,
          update,
          sessionData.paymentOrderId || routed.callback.id || '',
          routed.callback.id || '',
        );
      else if (action === 'e')
        await this.beginCheckoutName(event, update, sessionData);
      else if (action === 'u')
        await this.useSavedCheckoutValue(event, update, sessionData);
      else if (action === 'c') await this.showMenu(event, update);
      else if (action === 'k')
        await this.showOrderDetail(event, update, sessionData.existingOrderId);
      else if (action === 'z')
        await this.replaceExistingOrder(event, update, sessionData);
      else if (action === 'a') await this.sendAgentConfirmation(event, update);
      else if (action === 'm') await this.showMenu(event, update);
      return { handled: true };
    } finally {
      await this.answer(update, callbackQueryId, callbackToast);
    }
  }

  /**
   * Template-rendered menu (Plan 73; legacy hardcoded menu retired in
   * Phase 5). Chain: integrated template → tenant default (self-healing) →
   * static default constant. Always returns a menu; callback actions are
   * stable across all three, so in-flight sessions keep working.
   */
  private async templateMenu(
    channel: TenantChannel,
    settings: ShoppingSettings,
    labels: Record<string, string>,
    version: number,
  ): Promise<{
    greeting: string | null;
    rows: ReturnType<typeof button>[][];
  }> {
    let fields: RenderableField[] | null = null;
    if (this.botTemplates) {
      try {
        const resolved = await this.botTemplates.resolveChannelTemplate(
          channel.tenantId,
          channel.id,
        );
        if (resolved && resolved.fields.length > 0) fields = resolved.fields;
      } catch {
        fields = null;
      }
    }
    const effective: RenderableField[] = fields ?? STATIC_DEFAULT_FIELDS;
    let views = renderMenuRows(effective, {
      orderingEnabled: settings.orderingEnabled === true,
    });
    let greeting = renderGreeting(effective);
    if (views.length === 0) {
      views = renderMenuRows(STATIC_DEFAULT_FIELDS, {
        orderingEnabled: settings.orderingEnabled === true,
      });
      greeting = null;
    }
    return {
      greeting,
      rows: this.toButtonRows(views, labels, version),
    };
  }

  private toButtonRows(
    views: { key: string; label: string | null }[][],
    labels: Record<string, string>,
    version: number,
  ): ReturnType<typeof button>[][] {
    const callbacks: Record<
      string,
      [string, string | undefined, number | undefined]
    > = {
      products: ['p', undefined, 1],
      shop_info: ['f', undefined, undefined],
      orders: ['o', undefined, undefined],
      agent: ['a', undefined, undefined],
    };
    const labelKeys: Record<string, string> = {
      products: 'products',
      shop_info: 'profile',
      orders: 'orders',
      agent: 'agent',
    };
    return views
      .map((row) =>
        row.flatMap((view) => {
          const callback = callbacks[view.key];
          if (!callback) return [];
          return [
            button(
              view.label ?? labels[labelKeys[view.key]] ?? view.key,
              encodeTelegramCallback(
                callback[0],
                callback[1],
                callback[2],
                version,
              ),
            ),
          ];
        }),
      )
      .filter((row) => row.length > 0);
  }

  private async showMenu(event: CommerceEvent, update: TelegramBotUpdate) {
    const channel = await this.channel(event.channelId);
    if (!channel) return;
    const tenant = await this.tenantRepository.findOneBy({
      id: channel.tenantId,
    });
    if (!tenant) return;
    const settings = this.settings(channel);
    const language = tenant.language === 'my' ? 'my' : 'en';
    const labels =
      language === 'my'
        ? {
            greeting: 'မင်္ဂလာပါ',
            products: 'ကုန်ပစ္စည်းများ',
            profile: 'ဆိုင်အကြောင်း',
            orders: 'အော်ဒါများ',
            agent: 'အေးဂျင့်နှင့် ဆက်သွယ်ရန်',
          }
        : {
            greeting: 'Welcome',
            products: 'Products',
            profile: 'Shop info',
            orders: 'Orders',
            agent: 'Chat with agent',
          };
    const current = await this.sessions.get(update);
    const version = (current?.version || 0) + 1;
    const templateMenu = await this.templateMenu(
      channel,
      settings,
      labels,
      version,
    );
    const text = escapeHtml(
      templateMenu.greeting ||
        `${labels.greeting}, ${tenant.companyName || 'welcome'}!`,
    );
    const menuRows = templateMenu.rows;
    const result = await this.telegram.sendMessage(this.botToken(channel), {
      chatId: update.chatId,
      text,
      parseMode: 'HTML',
      replyMarkup: this.keyboard(menuRows),
    });
    const currentData = (current?.data || {}) as BrowseData;
    if (currentData.menuMessageId)
      await this.deleteQuietly(
        channel,
        update.chatId,
        currentData.menuMessageId,
      );
    if (currentData.listMessageId)
      await this.deleteQuietly(
        channel,
        update.chatId,
        currentData.listMessageId,
      );
    if (currentData.detailMessageId)
      await this.deleteQuietly(
        channel,
        update.chatId,
        currentData.detailMessageId,
      );
    await this.saveSession(
      update,
      'menu',
      { menuMessageId: result.messageId },
      version,
    );
    await this.setCommands(channel);
  }

  private async showProducts(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    page: number,
    replaceOld: boolean,
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel) return;
    const tenant = await this.tenantRepository.findOneBy({
      id: channel.tenantId,
    });
    const language = tenant?.language === 'my' ? 'my' : 'en';
    const products = await this.productService.getAllProducts(
      channel.tenantId,
      {
        page,
        limit: TELEGRAM_BROWSE_PAGE_SIZE,
        status: 'active',
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );
    const actualPage = Math.min(
      Math.max(1, page),
      Math.max(1, products.totalPages),
    );
    if (actualPage !== page) {
      await this.showProducts(event, update, actualPage, replaceOld);
      return;
    }
    const current = await this.sessions.get(update);
    const currentData = (current?.data || {}) as BrowseData;
    const version = (current?.version || 0) + 1;
    const rows = products.data.map((product) => [
      button(
        `${product.name}${this.outOfStock(product) ? ' — Out of stock' : ''}`,
        encodeTelegramCallback('d', product.id, page, version),
      ),
    ]);
    rows.push([
      button('‹ Prev', encodeTelegramCallback('v', undefined, page, version)),
      button(
        `${page}/${Math.max(1, products.totalPages)}`,
        encodeTelegramCallback('p', undefined, page, version),
      ),
      button('Next ›', encodeTelegramCallback('n', undefined, page, version)),
    ]);
    rows.push([
      button(
        'Chat with agent',
        encodeTelegramCallback('a', undefined, undefined, version),
      ),
      button(
        'Back to menu',
        encodeTelegramCallback('m', undefined, undefined, version),
      ),
    ]);
    const text = products.data.length
      ? `<b>${language === 'my' ? 'ကုန်ပစ္စည်းများ' : 'Products'}</b>\n${language === 'my' ? 'ကုန်ပစ္စည်းတစ်ခု ရွေးပါ။' : 'Select a product:'}`
      : 'No products are available right now.';
    const result =
      currentData.listMessageId && !replaceOld
        ? await this.telegram.editMessageText(this.botToken(channel), {
            chatId: update.chatId,
            messageId: currentData.listMessageId,
            text,
            parseMode: 'HTML',
            replyMarkup: this.keyboard(rows),
          })
        : await this.telegram.sendMessage(this.botToken(channel), {
            chatId: update.chatId,
            text,
            parseMode: 'HTML',
            replyMarkup: this.keyboard(rows),
          });
    const messageId =
      'messageId' in result ? result.messageId : currentData.listMessageId;
    await this.saveSession(
      update,
      'list',
      { page, listMessageId: messageId },
      version,
    );
    if (replaceOld && currentData.menuMessageId)
      await this.deleteQuietly(
        channel,
        update.chatId,
        currentData.menuMessageId,
      );
    if (replaceOld && currentData.detailMessageId)
      await this.deleteQuietly(
        channel,
        update.chatId,
        currentData.detailMessageId,
      );
  }

  private async showOrders(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    page: number,
    replaceOld: boolean,
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel) return;
    if (this.settings(channel).orderingEnabled !== true) {
      await this.sendNewAndCleanup(
        channel,
        update,
        'Ordering is currently unavailable.',
        'menu',
      );
      return;
    }
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider: 'telegram',
        externalId: update.userId,
      },
    });
    if (!customer) {
      await this.sendNewAndCleanup(
        channel,
        update,
        'You have no orders yet.',
        'orders',
      );
      return;
    }
    const orders = await this.orderRepository.find({
      where: { tenantId: channel.tenantId, customerId: customer.id },
      order: { createdAt: 'DESC' },
      skip: (Math.max(1, page) - 1) * 5,
      take: 5,
    });
    const total = await this.orderRepository.count({
      where: { tenantId: channel.tenantId, customerId: customer.id },
    });
    const actualPage = Math.max(1, page);
    const version = ((await this.sessions.get(update))?.version || 0) + 1;
    const language =
      (await this.tenantRepository.findOneBy({ id: channel.tenantId }))
        ?.language === 'my'
        ? 'my'
        : 'en';
    const text = orders.length
      ? `<b>${language === 'my' ? 'အော်ဒါများ' : 'Orders'}</b>\n${orders.map((order) => `${escapeHtml(order.orderNumber)} — ${escapeHtml(this.statusLabel(order, language))} — ${formatPrice(Number(order.totalAmount), order.currency)}`).join('\n')}`
      : language === 'my'
        ? 'အော်ဒါမရှိသေးပါ။'
        : 'You have no orders yet.';
    const rows = orders.map((order) => [
      button(
        order.orderNumber,
        encodeTelegramCallback('h', order.id, undefined, version),
      ),
    ]);
    if (total > 5)
      rows.push([
        button(
          '‹ Prev',
          encodeTelegramCallback('v', undefined, actualPage, version),
        ),
        button(
          `${actualPage}/${Math.ceil(total / 5)}`,
          encodeTelegramCallback('o', undefined, actualPage, version),
        ),
        button(
          'Next ›',
          encodeTelegramCallback('n', undefined, actualPage, version),
        ),
      ]);
    rows.push([
      button(
        'Back to menu',
        encodeTelegramCallback('m', undefined, undefined, version),
      ),
    ]);
    const result = replaceOld
      ? await this.telegram.sendMessage(this.botToken(channel), {
          chatId: update.chatId,
          text,
          parseMode: 'HTML',
          replyMarkup: this.keyboard(rows),
        })
      : await this.telegram.editMessageText(this.botToken(channel), {
          chatId: update.chatId,
          messageId:
            ((await this.sessions.get(update))?.data as BrowseData | undefined)
              ?.listMessageId || 0,
          text,
          parseMode: 'HTML',
          replyMarkup: this.keyboard(rows),
        });
    const messageId =
      'messageId' in result
        ? result.messageId
        : ((await this.sessions.get(update))?.data as BrowseData | undefined)
            ?.listMessageId;
    await this.saveSession(
      update,
      'orders',
      { screen: 'orders', orderPage: actualPage, listMessageId: messageId },
      version,
    );
  }

  private async handleOrdersCallback(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    routed: { session?: { state: string } | null; callback: { page?: number } },
    data: BrowseData,
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel) return;
    if (this.settings(channel).orderingEnabled !== true) {
      await this.sendPlaceholder(
        event,
        update,
        'Ordering is currently unavailable.',
      );
      return;
    }
    await this.showOrders(
      event,
      update,
      routed.session?.state === 'orders'
        ? routed.callback.page || data.orderPage || 1
        : 1,
      true,
    );
  }

  private async showOrderDetail(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    orderId?: string,
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel || !orderId) return;
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider: 'telegram',
        externalId: update.userId,
      },
    });
    const order = customer
      ? await this.orderRepository.findOne({
          where: {
            id: orderId,
            tenantId: channel.tenantId,
            customerId: customer.id,
          },
        })
      : null;
    if (!order) return;
    const language =
      (await this.tenantRepository.findOneBy({ id: channel.tenantId }))
        ?.language === 'my'
        ? 'my'
        : 'en';
    const items = (
      await this.orderItemRepository.find({
        where: { orderId: order.id },
        order: { createdAt: 'ASC' },
      })
    )
      .map(
        (item: OrderItem) =>
          `${escapeHtml(item.productName)} × ${item.quantity} — ${formatPrice(Number(item.totalPrice), order.currency)}`,
      )
      .join('\n');
    const deadline =
      order.status === 'pending' && order.expiresAt
        ? `\nPayment deadline: ${escapeHtml(new Date(order.expiresAt).toLocaleString())}`
        : '';
    const rejection = [...(order.statusHistory || [])]
      .reverse()
      .find((entry) => entry.field === 'order' && entry.status === 'rejected');
    const rejectionText =
      order.status === 'rejected'
        ? `\n${this.rejectionMessage(language, String(rejection?.reason || ''))}`
        : '';
    await this.sendNewAndCleanup(
      channel,
      update,
      `<b>${escapeHtml(order.orderNumber)}</b>\n${escapeHtml(this.statusLabel(order, language))}\n${items}\nTotal: ${formatPrice(Number(order.totalAmount), order.currency)}${deadline}${rejectionText}`,
      'orders',
    );
  }

  private statusLabel(
    order: Pick<Order, 'status' | 'deliveryStatus' | 'paymentSubmittedAt'>,
    language: 'en' | 'my',
  ) {
    if (order.status === 'confirmed') {
      const deliveryLabels = {
        packed: 'Packed',
        out_for_delivery: 'Out for delivery',
        delivered: 'Delivered',
        failed_delivery: 'Failed delivery',
        returned: 'Returned',
      } as const;
      return (
        deliveryLabels[order.deliveryStatus as keyof typeof deliveryLabels] ||
        'Packed'
      );
    }
    if (order.status === 'pending' && order.paymentSubmittedAt)
      return 'Payment under review';
    const labels = {
      pending: 'Awaiting payment',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
    } as const;
    return labels[order.status as keyof typeof labels] || order.status;
  }

  private rejectionMessage(language: 'en' | 'my', reason: string) {
    const safeReason = escapeHtml(reason);
    return BOT_MESSAGES[language].proofRejected(safeReason);
  }

  private paymentProof(event: CommerceEvent) {
    const raw = event.normalized.metadata?.raw as
      | Record<string, any>
      | undefined;
    const message = raw?.message as Record<string, any> | undefined;
    const photo = Array.isArray(message?.photo)
      ? message.photo.at(-1)
      : undefined;
    const document = message?.document as Record<string, any> | undefined;
    const fileId = String(photo?.file_id || document?.file_id || '').trim();
    if (!fileId) return null;
    return {
      fileId,
      sourceMessageId: String(message?.message_id || '').trim() || undefined,
      contentType: document?.mime_type || 'image/*',
      sizeBytes:
        Number(document?.file_size || photo?.file_size || 0) || undefined,
    };
  }

  private async canAcceptTelegramProof(
    channel: TenantChannel,
    update: TelegramBotUpdate,
    session: { state: string; data: Record<string, unknown> } | null,
  ) {
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider: 'telegram',
        externalId: update.userId,
      },
    });
    if (!customer) return false;
    const paymentOrderId = String(session?.data?.paymentOrderId || '').trim();
    if (session?.state === 'payment' && paymentOrderId) {
      const order = await this.orderRepository.findOne({
        where: {
          id: paymentOrderId,
          tenantId: channel.tenantId,
          customerId: customer.id,
          createdBy: IsNull(),
          status: 'pending',
        },
      });
      return Boolean(order && order.paymentStatus !== 'paid');
    }
    const rejected = await this.orderRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        customerId: customer.id,
        createdBy: IsNull(),
        status: 'rejected',
        paymentStatus: 'unpaid',
      },
      order: { createdAt: 'DESC' },
    });
    return Boolean(rejected?.expiresAt && rejected.expiresAt > new Date());
  }

  private async submitTelegramProof(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    session: { data: Record<string, unknown> } | null,
    proof: {
      fileId: string;
      sourceMessageId?: string;
      contentType?: string;
      sizeBytes?: number;
    },
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel) return;
    const customer = await this.customerRepository.findOne({
      where: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        provider: 'telegram',
        externalId: update.userId,
      },
    });
    if (!customer) return;
    const sessionOrderId = String(session?.data?.paymentOrderId || '').trim();
    const order = sessionOrderId
      ? await this.orderRepository.findOne({
          where: {
            id: sessionOrderId,
            tenantId: channel.tenantId,
            customerId: customer.id,
            createdBy: IsNull(),
            status: 'pending',
            paymentStatus: 'unpaid',
          },
        })
      : await this.orderRepository.findOne({
          where: [
            {
              tenantId: channel.tenantId,
              customerId: customer.id,
              createdBy: IsNull(),
              status: 'pending',
            },
            {
              tenantId: channel.tenantId,
              customerId: customer.id,
              createdBy: IsNull(),
              status: 'rejected',
            },
          ],
          order: { createdAt: 'DESC' },
        });
    if (!order) return;
    try {
      const storedProof = await this.mirrorTelegramProof(
        channel,
        customer.id,
        proof,
      );
      await this.transitionService.submitPaymentProof(
        channel.tenantId,
        order.id,
        customer.id,
        storedProof,
      );
      const tenant = await this.tenantRepository.findOneBy({
        id: channel.tenantId,
      });
      const language = tenant?.language === 'my' ? 'my' : 'en';
      await this.sendNewAndCleanup(
        channel,
        update,
        BOT_MESSAGES[language].proofReceived,
        'orders',
      );
    } catch (error) {
      const tenant = await this.tenantRepository.findOneBy({
        id: channel.tenantId,
      });
      const language = tenant?.language === 'my' ? 'my' : 'en';
      const text =
        error instanceof PaymentProofRetryLimitError
          ? BOT_MESSAGES[language].proofRetryLimit
          : BOT_MESSAGES[language].proofRetry;
      await this.sendNewAndCleanup(channel, update, text, 'orders');
    }
  }

  private async mirrorTelegramProof(
    channel: TenantChannel,
    customerId: string,
    proof: PaymentProofInput,
  ): Promise<PaymentProofInput> {
    if (!this.mediaLibrary)
      throw new Error('Payment proof storage is unavailable');
    const downloaded = await this.telegram.downloadFile(
      this.botToken(channel),
      proof.fileId,
    );
    const contentType = this.allowedProofContentType(
      downloaded.contentType,
      proof.contentType,
    );
    const extension =
      contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1];
    const fileName = `telegram-payment-proof-${proof.sourceMessageId || Date.now()}.${extension}`;
    const created = (await this.mediaLibrary.createUpload(
      channel.tenantId,
      customerId,
      {
        fileName,
        contentType,
        sizeBytes: downloaded.bytes.length,
        purpose: 'message-media',
        metadata: {
          telegramFileId: proof.fileId,
          sourceMessageId: proof.sourceMessageId,
        },
      },
    )) as {
      file: { id: string };
      upload: { url: string; headers?: Record<string, string> };
    };
    const response = await fetch(created.upload.url, {
      method: 'PUT',
      headers: created.upload.headers,
      body: new Blob([new Uint8Array(downloaded.bytes)], { type: contentType }),
    });
    if (!response.ok)
      throw new Error(`payment proof upload failed: ${response.status}`);
    return {
      ...proof,
      fileId: created.file.id,
      telegramFileId: proof.fileId,
      contentType,
      sizeBytes: downloaded.bytes.length,
    };
  }

  private allowedProofContentType(downloaded: string, declared?: string) {
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
    ]);
    if (allowed.has(downloaded)) return downloaded;
    if (declared && allowed.has(declared)) return declared;
    return 'image/jpeg';
  }

  private async showDetail(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    productId?: string,
    replaceOld = true,
  ) {
    if (!productId) return;
    const channel = await this.channel(event.channelId);
    if (!channel) return;
    const product = await this.productService.getProductById(
      channel.tenantId,
      productId,
    );
    const session = await this.sessions.get(update);
    const version = (session?.version || 0) + 1;
    const tenant = await this.tenantRepository.findOneBy({
      id: channel.tenantId,
    });
    const language = tenant?.language === 'my' ? 'my' : 'en';
    const markup = this.detailKeyboard(
      product,
      version,
      language,
      this.settings(channel).orderingEnabled === true,
    );
    const caption = this.productCaption(product, channel);
    let messageId: number | undefined;
    try {
      const imageKey = product.images?.[0];
      const cached = imageKey ? this.photoCache(channel, imageKey) : undefined;
      const photo = cached || product.primaryImageUrl;
      if (photo && (cached || isPublicPhotoUrl(photo))) {
        const sent = await this.telegram.sendPhoto(this.botToken(channel), {
          chatId: update.chatId,
          photo,
          caption,
          parseMode: 'HTML',
          replyMarkup: this.keyboard(markup),
        });
        messageId = sent.messageId;
        if (!cached && imageKey && sent.fileId)
          await this.cachePhoto(channel, imageKey, sent.fileId);
      }
    } catch {
      this.logger.warn(
        `Telegram product image send failed for ${product.id}; using text fallback`,
      );
    }
    if (!messageId) {
      const sent = await this.telegram.sendMessage(this.botToken(channel), {
        chatId: update.chatId,
        text: caption,
        parseMode: 'HTML',
        replyMarkup: this.keyboard(markup),
      });
      messageId = sent.messageId;
    }
    await this.saveSession(
      update,
      'detail',
      {
        productId,
        quantity: 1,
        detailMessageId: messageId,
      },
      version,
    );
    const sessionData = (session?.data || {}) as BrowseData;
    if (replaceOld && sessionData.listMessageId)
      await this.deleteQuietly(
        channel,
        update.chatId,
        sessionData.listMessageId,
      );
  }

  private async changeQuantity(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    productId: string | undefined,
    delta: number,
  ): Promise<string | undefined> {
    if (!productId) return undefined;
    const channel = await this.channel(event.channelId);
    if (!channel) return undefined;
    const product = await this.productService.getProductById(
      channel.tenantId,
      productId,
    );
    const session = await this.sessions.get(update);
    const sessionData = (session?.data || {}) as BrowseData;
    const current = sessionData.quantity || 1;
    const max = product.trackInventory
      ? Math.min(product.stockQuantity, TELEGRAM_PER_ORDER_CAP)
      : TELEGRAM_PER_ORDER_CAP;
    const quantity = Math.min(Math.max(1, current + delta), Math.max(1, max));
    let toast: string | undefined;
    if (sessionData.detailMessageId) {
      const tenant = await this.tenantRepository.findOneBy({
        id: channel.tenantId,
      });
      const language = tenant?.language === 'my' ? 'my' : 'en';
      const result = await this.telegram.editMessageCaption(
        this.botToken(channel),
        {
          chatId: update.chatId,
          messageId: sessionData.detailMessageId,
          caption: this.productCaption(product, channel, quantity),
          parseMode: 'HTML',
          replyMarkup: this.keyboard(
            this.detailKeyboard(
              product,
              (session?.version || 0) + 1,
              language,
              this.settings(channel).orderingEnabled === true,
            ),
          ),
        },
      );
      if (result.notModified || quantity === current)
        toast =
          quantity === 1
            ? 'Minimum quantity is 1.'
            : 'Maximum quantity reached.';
    }
    await this.saveSession(
      update,
      'detail',
      {
        ...sessionData,
        productId,
        quantity,
        detailMessageId: sessionData.detailMessageId,
      },
      (session?.version || 0) + 1,
    );
    return toast;
  }

  private async showProfile(event: CommerceEvent, update: TelegramBotUpdate) {
    const channel = await this.channel(event.channelId);
    if (!channel) return;
    const tenant = await this.tenantRepository.findOneBy({
      id: channel.tenantId,
    });
    if (!tenant) return;
    await this.sendNewAndCleanup(
      channel,
      update,
      `<b>${escapeHtml(tenant.companyName || 'Shop')}</b>\n${escapeHtml(tenant.description || '')}\n${escapeHtml(tenant.contactPhone || tenant.contactEmail || '')}`,
      'menu',
    );
  }

  private async sendAgentConfirmation(
    event: CommerceEvent,
    update: TelegramBotUpdate,
  ) {
    const channel = await this.channel(event.channelId);
    if (!channel) return;
    await this.sendNewAndCleanup(
      channel,
      update,
      'An agent will reply shortly. You can send your message now.',
      'agent',
    );
  }

  private async sendPlaceholder(
    event: CommerceEvent,
    update: TelegramBotUpdate,
    text: string,
  ) {
    const channel = await this.channel(event.channelId);
    if (channel) await this.sendNewAndCleanup(channel, update, text, 'menu');
  }

  private async sendNewAndCleanup(
    channel: TenantChannel,
    update: TelegramBotUpdate,
    text: string,
    state: BrowseData['screen'],
  ) {
    const current = await this.sessions.get(update);
    const version = (current?.version || 0) + 1;
    const sent = await this.telegram.sendMessage(this.botToken(channel), {
      chatId: update.chatId,
      text,
      parseMode: 'HTML',
      replyMarkup: this.keyboard([
        [
          button(
            'Back to menu',
            encodeTelegramCallback('m', undefined, undefined, version),
          ),
        ],
      ]),
    });
    const currentData = (current?.data || {}) as BrowseData;
    if (currentData.detailMessageId)
      await this.deleteQuietly(
        channel,
        update.chatId,
        currentData.detailMessageId,
      );
    if (currentData.listMessageId)
      await this.deleteQuietly(
        channel,
        update.chatId,
        currentData.listMessageId,
      );
    await this.saveSession(
      update,
      state || 'menu',
      { menuMessageId: sent.messageId },
      version,
    );
  }

  private detailKeyboard(
    product: ProductResponseDto,
    version: number,
    language: 'en' | 'my' = 'en',
    orderingEnabled = false,
  ) {
    const rows = [] as Record<string, string>[][];
    const labels =
      language === 'my'
        ? {
            minus: '−',
            order: 'အော်ဒါတင်ရန်',
            plus: '+',
            back: 'မီနူးသို့ ပြန်ရန်',
            agent: 'အေးဂျင့်နှင့် ဆက်သွယ်ရန်',
          }
        : {
            minus: '−',
            order: 'Order now',
            plus: '+',
            back: 'Back to menu',
            agent: 'Chat with agent',
          };
    if (!this.outOfStock(product) && orderingEnabled)
      rows.push([
        button(
          labels.minus,
          encodeTelegramCallback('r', product.id, undefined, version),
        ),
        button(
          labels.order,
          encodeTelegramCallback('x', product.id, undefined, version),
        ),
        button(
          labels.plus,
          encodeTelegramCallback('i', product.id, undefined, version),
        ),
      ]);
    rows.push([
      button(
        labels.back,
        encodeTelegramCallback('b', undefined, undefined, version),
      ),
      button(
        labels.agent,
        encodeTelegramCallback('a', undefined, undefined, version),
      ),
    ]);
    return rows;
  }

  private productCaption(
    product: ProductResponseDto,
    channel: TenantChannel,
    quantity = 1,
  ) {
    const trackedStock = product.trackInventory
      ? `\nStock: ${product.stockQuantity}`
      : '';
    const title = `<b>${escapeHtml(product.name)}</b>`;
    const description = escapeHtml(
      product.description || product.shortDescription || '',
    );
    const suffix = `\nPrice: ${formatPrice(product.price, this.settings(channel).currency || 'MMK')}\nQuantity: ${quantity}${trackedStock}`;
    const body = `${title}\n${description}${suffix}`;
    if (body.length <= 1024) return body;
    const available = Math.max(0, 1024 - title.length - suffix.length - 4);
    return `${title}\n${description.slice(0, available)}...${suffix}`.slice(
      0,
      1024,
    );
  }

  private outOfStock(product: ProductResponseDto) {
    return (
      product.status === 'out_of_stock' ||
      (product.trackInventory && product.stockQuantity <= 0)
    );
  }

  private async saveSession(
    update: TelegramBotUpdate,
    state: string,
    data: BrowseData,
    version?: number,
  ) {
    return this.sessions.set(update, {
      version: version ?? ((await this.sessions.get(update))?.version || 0) + 1,
      state,
      data: data,
    });
  }

  private logCallbackRejection(
    reason: string,
    expectedVersion: number | undefined,
    actualVersion: number | undefined,
  ) {
    this.logger.warn(
      JSON.stringify({
        event: 'telegram_callback_rejected',
        reason,
        expectedVersion: expectedVersion ?? null,
        actualVersion: actualVersion ?? null,
      }),
    );
  }

  private async channel(id: string) {
    return this.channelRepository.findOneBy({ id });
  }

  private botToken(channel: TenantChannel) {
    const primary =
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
      process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY;
    const result = decryptProviderCredentialsWithFallback(channel.credentials, [
      primary,
      process.env.JWT_SECRET,
    ]);
    return String(result.credentials.botToken || '');
  }

  private settings(channel: TenantChannel) {
    return (channel.configuration?.telegramShopping || {}) as ShoppingSettings;
  }

  private shopEnabled(channel: TenantChannel) {
    return this.settings(channel).shopEnabled === true;
  }

  private photoCache(channel: TenantChannel, key: string) {
    return this.settings(channel).photoFileIds?.[key];
  }

  private paymentQrCache(channel: TenantChannel, key: string) {
    return this.settings(channel).paymentQrFileIds?.[key];
  }

  private async ensurePaymentQrCache(channel: TenantChannel) {
    const tokenHash = createHash('sha256')
      .update(this.botToken(channel))
      .digest('hex');
    if (this.settings(channel).paymentQrBotTokenHash === tokenHash) return;
    channel.configuration = {
      ...(channel.configuration || {}),
      telegramShopping: {
        ...this.settings(channel),
        paymentQrBotTokenHash: tokenHash,
        paymentQrFileIds: {},
      },
    };
    await this.channelRepository.save(channel);
  }

  private async clearPaymentQr(channel: TenantChannel, key: string) {
    const cached = { ...(this.settings(channel).paymentQrFileIds || {}) };
    delete cached[key];
    channel.configuration = {
      ...(channel.configuration || {}),
      telegramShopping: { ...this.settings(channel), paymentQrFileIds: cached },
    };
    await this.channelRepository.save(channel);
  }

  private async cachePaymentQr(
    channel: TenantChannel,
    key: string,
    fileId: string,
  ) {
    channel.configuration = {
      ...(channel.configuration || {}),
      telegramShopping: {
        ...this.settings(channel),
        paymentQrFileIds: {
          ...(this.settings(channel).paymentQrFileIds || {}),
          [key]: fileId,
        },
      },
    };
    await this.channelRepository.save(channel);
  }

  private async cachePhoto(
    channel: TenantChannel,
    key: string,
    fileId: string,
  ) {
    channel.configuration = {
      ...(channel.configuration || {}),
      telegramShopping: {
        ...this.settings(channel),
        photoFileIds: {
          ...(this.settings(channel).photoFileIds || {}),
          [key]: fileId,
        },
      },
    };
    await this.channelRepository.save(channel);
  }

  private async deleteQuietly(
    channel: TenantChannel,
    chatId: string,
    messageId?: number,
  ) {
    if (!messageId) return;
    try {
      await this.telegram.deleteMessage(
        this.botToken(channel),
        chatId,
        messageId,
      );
    } catch {
      /* Telegram only permits deletion for a limited window. */
    }
  }

  private async answer(
    update: TelegramBotUpdate,
    callbackQueryId?: string,
    text?: string,
  ) {
    if (!callbackQueryId) return;
    const channel = await this.channel(update.channelId);
    if (channel)
      await this.telegram.answerCallbackQuery(
        this.botToken(channel),
        callbackQueryId,
        text,
      );
  }

  private async setCommands(channel: TenantChannel) {
    try {
      await this.telegram.setMyCommands(
        this.botToken(channel),
        TELEGRAM_BOT_COMMANDS.map((command) => ({ ...command })),
      );
    } catch {
      /* command registration is best effort */
    }
  }

  private toUpdate(event: CommerceEvent, tenantId: string): TelegramBotUpdate {
    return {
      tenantId,
      channelId: event.channelId,
      userId: String(event.normalized.senderId || ''),
      chatId: String(event.normalized.externalConversationId || ''),
      chatType:
        stringValue(event.normalized.metadata?.telegramChatType) || 'private',
      callbackData: event.normalized.callbackData,
      callbackQueryId: event.normalized.callbackQueryId,
    };
  }

  private keyboard(rows: Record<string, string>[][]) {
    return { inline_keyboard: rows };
  }
}

function button(text: string, callbackData: string) {
  return { text, callback_data: callbackData };
}
function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function formatPrice(value: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat('en-US').format(Number(value || 0))}`;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isPublicPhotoUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return (
      host !== 'localhost' &&
      host !== '127.0.0.1' &&
      host !== '::1' &&
      !host.endsWith('.internal') &&
      !host.endsWith('.local')
    );
  } catch {
    return false;
  }
}
