export function teamInviteTemplate(options: {
  inviteUrl: string;
  logoUrl?: string;
  role: string;
  companyName: string;
  inviterName: string;
  expiresAt: Date;
}): string {
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;',
        })[character] || character,
    );
  const companyName = escapeHtml(options.companyName);
  const role = escapeHtml(options.role);
  const inviterName = escapeHtml(options.inviterName);
  const inviteUrl = escapeHtml(options.inviteUrl);
  const logoUrl = options.logoUrl ? escapeHtml(options.logoUrl) : '';

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="padding:4px 4px 24px;color:#14213d;font-size:25px;font-weight:800;letter-spacing:-0.04em;">${logoUrl ? `<img src="${logoUrl}" alt="ZayOS" width="112" style="display:block;max-height:32px;width:auto;" />` : 'Zay<span style="color:#1677ff;">OS</span>'}</div>
    <div style="background:#ffffff;border:1px solid #dce5f0;border-radius:18px;padding:32px;">
      <p style="margin:0 0 10px;color:#1677ff;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Workspace invitation</p>
      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#14213d;">You’re invited to join ${companyName}</h1>
      <p style="margin:18px 0 0;font-size:16px;line-height:1.6;">${inviterName} invited you to join <strong>${companyName}</strong> on ZayOS as <strong>${role}</strong>.</p>
      <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#56647a;">Set your password to activate your team-member account and start working in the workspace.</p>
      <a href="${inviteUrl}" style="display:inline-block;margin:26px 0 22px;padding:13px 21px;background:#1677ff;color:#ffffff;text-decoration:none;border-radius:9px;font-size:15px;font-weight:700;">Accept Invitation</a>
      <p style="margin:0;color:#66758c;font-size:13px;line-height:1.5;">This invitation expires on ${options.expiresAt.toLocaleDateString()}.</p>
      <p style="margin:8px 0 0;color:#66758c;font-size:13px;line-height:1.5;">If you did not expect this invitation, you can ignore this email.</p>
    </div>
    <p style="margin:20px 4px 0;color:#8190a5;font-size:12px;line-height:1.5;">ZayOS · Commerce workspace for conversations, orders, and daily operations.</p>
  </div>
</body>
</html>`;
}
