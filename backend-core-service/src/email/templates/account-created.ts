export function accountCreatedTemplate(options: {
  signInUrl: string;
  logoUrl?: string;
  password: string;
  email: string;
  fullName: string;
  role: string;
  companyName: string;
  inviterName: string;
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
  const fullName = escapeHtml(options.fullName);
  const email = escapeHtml(options.email);
  // The password is user-supplied and may contain any character — it must be
  // escaped before landing in HTML.
  const password = escapeHtml(options.password);
  const signInUrl = escapeHtml(options.signInUrl);
  const logoUrl = options.logoUrl ? escapeHtml(options.logoUrl) : '';

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="padding:4px 4px 24px;color:#14213d;font-size:25px;font-weight:800;letter-spacing:-0.04em;">${logoUrl ? `<img src="${logoUrl}" alt="ZayOS" width="112" style="display:block;max-height:32px;width:auto;" />` : 'Zay<span style="color:#1677ff;">OS</span>'}</div>
    <div style="background:#ffffff;border:1px solid #dce5f0;border-radius:18px;padding:32px;">
      <p style="margin:0 0 10px;color:#1677ff;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Account created</p>
      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#14213d;">Welcome to ${companyName}, ${fullName}</h1>
      <p style="margin:18px 0 0;font-size:16px;line-height:1.6;">${inviterName} created your account on ZayOS as <strong>${role}</strong> and set an initial password for you. Here are your sign-in details:</p>
      <div style="margin:20px 0 0;padding:18px 20px;background:#f7faff;border:1px solid #dce5f0;border-radius:12px;">
        <p style="margin:0 0 12px;">
          <span style="display:block;color:#66758c;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Sign-in email</span>
          <span style="font-size:15px;color:#14213d;">${email}</span>
        </p>
        <p style="margin:0;">
          <span style="display:block;color:#66758c;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Password</span>
          <code style="display:inline-block;margin-top:4px;padding:8px 12px;background:#eef3fb;border:1px solid #d7e1f2;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;color:#14213d;word-break:break-all;">${password}</code>
        </p>
      </div>
      <a href="${signInUrl}" style="display:inline-block;margin:26px 0 22px;padding:13px 21px;background:#1677ff;color:#ffffff;text-decoration:none;border-radius:9px;font-size:15px;font-weight:700;">Sign in to ZayOS</a>
      <p style="margin:0;color:#66758c;font-size:13px;line-height:1.5;">For your security, please change your password after your first sign-in.</p>
      <p style="margin:8px 0 0;color:#66758c;font-size:13px;line-height:1.5;">If you did not expect this account, you can ignore this email or contact your workspace administrator.</p>
    </div>
    <p style="margin:20px 4px 0;color:#8190a5;font-size:12px;line-height:1.5;">ZayOS · Commerce workspace for conversations, orders, and daily operations.</p>
  </div>
</body>
</html>`;
}
