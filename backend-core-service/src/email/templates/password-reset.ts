export function passwordResetTemplate(options: {
  resetUrl: string;
  userType: string;
  expiresAt: Date;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto;">
  <h2>Reset your password</h2>
  <p>We received a request to reset the password for your account.</p>
  <p>Click the button below to set a new password:</p>
  <a href="${options.resetUrl}"
     style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
    Reset Password
  </a>
  <p style="color: #666; font-size: 14px;">This link expires on ${options.expiresAt.toLocaleDateString()}.</p>
  <p style="color: #666; font-size: 14px;">If you did not request a password reset, you can ignore this email.</p>
</body>
</html>`;
}
