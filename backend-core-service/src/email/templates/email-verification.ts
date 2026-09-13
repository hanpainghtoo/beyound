export function emailVerificationTemplate(options: {
  verificationUrl: string;
  expiresAt: Date;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto;">
  <h2>Verify your email address</h2>
  <p>Please confirm this email address to activate your account.</p>
  <a href="${options.verificationUrl}"
     style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
    Verify Email
  </a>
  <p style="color: #666; font-size: 14px;">This link expires on ${options.expiresAt.toLocaleDateString()}.</p>
  <p style="color: #666; font-size: 14px;">If you did not create an account, you can ignore this email.</p>
</body>
</html>`;
}
