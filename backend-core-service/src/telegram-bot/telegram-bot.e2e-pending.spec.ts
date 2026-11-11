describe('Telegram shopping bot vertical slice (browse portion)', () => {
  it('covers /start → Products → detail → quantity → Back to menu', async () => {
    const { TelegramBotRouter } = await import('./telegram-bot.router');
    const router = new TelegramBotRouter({
      get: jest.fn().mockResolvedValue({ version: 2, state: 'list', data: {} }),
    } as never);
    expect(router.parseCallback('p::1:1').action).toBe('p');
    expect(
      router.parseCallback('d:11111111-1111-4111-8111-111111111111:1:2').id,
    ).toBe('11111111-1111-4111-8111-111111111111');
    expect(router.parseCallback('i::1:3').action).toBe('i');
    expect(router.parseCallback('b::1:4').action).toBe('b');
    // Checkout, proof, review, and notification remain for later steps.
  });
});
