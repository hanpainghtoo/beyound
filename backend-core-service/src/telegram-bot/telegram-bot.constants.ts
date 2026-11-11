/**
 * Slash commands advertised in the Telegram command list for commerce bots.
 *
 * Registered when a merchant confirms a bot template (Plan 76) and lazily
 * re-registered from `showMenu` as a self-heal for channels that were
 * connected before that flow existed. Commands are intentionally static:
 * templates describe inline-keyboard buttons, not slash commands.
 */
export const TELEGRAM_BOT_COMMANDS = [
  { command: 'start', description: 'Start shopping' },
  { command: 'menu', description: 'Open menu' },
] as const;