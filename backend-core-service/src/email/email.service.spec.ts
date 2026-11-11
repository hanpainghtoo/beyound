import { EmailService } from './email.service';

describe('EmailService payment-method notification', () => {
  it('sends the owner a publication email through the existing mail transport', async () => {
    const service = new EmailService({
      get: jest.fn().mockReturnValue(undefined),
    } as any);
    const sendMail = jest.fn().mockResolvedValue(undefined);
    (service as any).transporter = { sendMail };
    await service.sendPaymentMethodsPublished('owner@example.test', {
      actorName: 'Admin',
      version: 2,
      methodKinds: ['kbzpay'],
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.test',
        subject: 'Payment methods updated — version 2',
      }),
    );
  });
});
