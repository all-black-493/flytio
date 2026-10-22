/** The markup every transactional email shares, ported from
 * templates/emails/_shell.html and its Jinja escaping helper. */

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Blank lines separate paragraphs, same as the Jinja helper it replaces. */
export function paragraphs(text: string): string {
  return text
    .split("\n\n")
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

/**
 * flyt's branded shell, ported from templates/emails/_shell.html. Tables
 * rather than flex or grid, because that is what email clients actually
 * render. `preheader` is the hidden preview text inboxes show beside the
 * subject. `inner` is already-escaped markup.
 */
export function emailShell(preheader: string, inner: string, logoUrl: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #d8e0e8;">
        <tr>
          <td style="background:#0b1526;padding:20px 32px;">
            <img src="${escapeHtml(logoUrl)}" alt="flyt" width="32" height="32" style="vertical-align:middle;border-radius:8px;" />
            <span style="font-size:20px;font-weight:bold;color:#ffffff;vertical-align:middle;margin-left:10px;">flyt</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#0b1526;font-size:14px;line-height:1.6;">
            ${inner}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #d8e0e8;color:#55677c;font-size:12px;">
            <p style="margin:0;">Safe travels, from the flyt team.</p>
            <p style="margin:8px 0 0;">This is an automated message - please don't reply directly to this email.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
