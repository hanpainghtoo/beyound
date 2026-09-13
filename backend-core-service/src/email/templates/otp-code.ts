export function otpCodeTemplate(options: {
  code: string;
  expiresAt: Date;
  purpose: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto;">
  <h2>Your verification code</h2>
  <p>Use the following 6-digit code to ${options.purpose === 'pricing_registration' ? 'complete your registration' : 'sign in'}:</p>
  <div style="text-align: center; margin: 24px 0;">
    <span style="display: inline-block; padding: 16px 32px; background: #f1f5f9; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${options.code}</span>
  </div>
  <p style="color: #666; font-size: 14px;">This code expires at ${options.expiresAt.toLocaleTimeString()}.</p>
  <p style="color: #666; font-size: 14px;">If you did not request this code, you can safely ignore this email.</p>
</body>
</html>`;
}
