export function invoiceIssuedTemplate(options: {
  companyName: string;
  invoiceNo: string;
  planName: string;
  billingPeriodLabel: string;
  amountDue: string;
  invoiceUrl: string;
  lineDescription: string;
  paymentMethodLabel?: string | null;
  paymentAccount?: string | null;
  requestNote?: string | null;
}): string {
  const stubRows: string[] = [];
  if (options.paymentMethodLabel) {
    stubRows.push(
      `<tr><td style="padding: 4px 0; color: #666;">Payment method</td><td style="padding: 4px 0; text-align: right;">${options.paymentMethodLabel}</td></tr>`,
    );
  }
  if (options.paymentAccount) {
    stubRows.push(
      `<tr><td style="padding: 4px 0; color: #666;">Pay to</td><td style="padding: 4px 0; text-align: right;">${options.paymentAccount}</td></tr>`,
    );
  }
  if (options.requestNote) {
    stubRows.push(
      `<tr><td style="padding: 4px 0; color: #666;">Note</td><td style="padding: 4px 0; text-align: right;">${options.requestNote}</td></tr>`,
    );
  }
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto;">
  <h2>Invoice ${options.invoiceNo} is ready</h2>
  <p>Hello ${options.companyName},</p>
  <p>Your subscription invoice for <strong>${options.planName}</strong> (${options.billingPeriodLabel}) has been issued.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <thead>
      <tr style="border-bottom: 1px solid #ddd; text-align: left; font-size: 12px; color: #666;">
        <th style="padding: 8px 8px 8px 0;">Description</th>
        <th style="padding: 8px 8px;">Period</th>
        <th style="padding: 8px 0 8px 8px; text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 8px 8px 0;">${options.lineDescription}</td>
        <td style="padding: 8px;">${options.billingPeriodLabel}</td>
        <td style="padding: 8px 0 8px 8px; text-align: right;">${options.amountDue}</td>
      </tr>
      <tr>
        <td style="padding: 8px 8px 8px 0;"></td>
        <td style="padding: 8px; color: #666;">Subtotal</td>
        <td style="padding: 8px 0 8px 8px; text-align: right;">${options.amountDue}</td>
      </tr>
      <tr>
        <td style="padding: 8px 8px 8px 0;"></td>
        <td style="padding: 8px; font-weight: bold;">Balance due</td>
        <td style="padding: 8px 0 8px 8px; text-align: right; font-weight: bold;">${options.amountDue}</td>
      </tr>
    </tbody>
  </table>
  <table style="width: 100%; border-collapse: collapse; margin: 8px 0 16px;">
    <tbody>${stubRows.join('')}</tbody>
  </table>
  <p style="color: #666; font-size: 14px;">Sign in to your workspace to submit payment proof. If you already paid, you can ignore this email.</p>
</body>
</html>`;
}
