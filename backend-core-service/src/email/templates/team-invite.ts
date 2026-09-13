export function teamInviteTemplate(options: {
  inviteUrl: string;
  role: string;
  invitedBy?: string;
  expiresAt: Date;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto;">
  <h2>You're invited to join the workspace</h2>
  <p>You have been invited as <strong>${options.role}</strong>.</p>
  ${options.invitedBy ? `<p>Invited by: ${options.invitedBy}</p>` : ''}
  <p>Click the button below to accept the invitation and set your password:</p>
  <a href="${options.inviteUrl}"
     style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
    Accept Invitation
  </a>
  <p style="color: #666; font-size: 14px;">This invitation expires on ${options.expiresAt.toLocaleDateString()}.</p>
  <p style="color: #666; font-size: 14px;">If you did not expect this invitation, you can ignore this email.</p>
</body>
</html>`;
}
