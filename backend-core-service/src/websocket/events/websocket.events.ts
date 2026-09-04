export const WEBSOCKET_EVENTS = {
  // Message events
  NEW_MESSAGE: 'new_message',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_DELETED: 'message_deleted',

  // Conversation events
  CONVERSATION_CREATED: 'conversation_created',
  CONVERSATION_UPDATED: 'conversation_updated',
  CONVERSATION_ASSIGNED: 'conversation_assigned',
  CONVERSATION_CLOSED: 'conversation_closed',

  // CSR events
  CSR_STATUS_CHANGED: 'csr_status_changed',
  CSR_ASSIGNED: 'csr_assigned',
  CSR_TYPING: 'user_typing',

  // Customer events
  CUSTOMER_ONLINE: 'customer_online',
  CUSTOMER_OFFLINE: 'customer_offline',

  // System events
  NOTIFICATION: 'notification',
  SYSTEM_ALERT: 'system_alert',
} as const;

export type WebSocketEvent =
  (typeof WEBSOCKET_EVENTS)[keyof typeof WEBSOCKET_EVENTS];
