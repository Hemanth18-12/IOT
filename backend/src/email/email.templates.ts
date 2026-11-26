export interface EmailTemplatePayload {
  title: string;
  badgeText: string;
  badgeVariant: 'danger' | 'warning' | 'success' | 'info';
  deviceName: string;
  deviceId: string;
  eventType: string;
  timestampFormatted: string;
  doorStateText: string;
  description: string;
  warningText?: string;
  extraRows?: Array<{ label: string; value: string }>;
  dashboardUrl: string;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSmartRoomEmail(payload: EmailTemplatePayload): {
  html: string;
  text: string;
} {
  const badgeColors = {
    danger: { bg: '#EF4444', fg: '#FFFFFF' },
    warning: { bg: '#F59E0B', fg: '#101010' },
    success: { bg: '#22C55E', fg: '#101010' },
    info: { bg: '#FACC15', fg: '#101010' },
  }[payload.badgeVariant];

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Device', value: `${payload.deviceName} (${payload.deviceId})` },
    { label: 'Date & Time', value: payload.timestampFormatted },
    { label: 'Event Type', value: payload.eventType },
    { label: 'Reported Door State', value: payload.doorStateText },
    ...(payload.extraRows || []),
  ];

  const rowsHtml = rows
    .map(
      (r) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #303030;color:#A3A3A3;font-size:13px;width:38%;vertical-align:top;">${escapeHtml(r.label)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #303030;color:#F5F5F5;font-size:13px;font-weight:600;vertical-align:top;">${escapeHtml(r.value)}</td>
        </tr>`,
    )
    .join('');

  const warningHtml = payload.warningText
    ? `<div style="margin-top:16px;padding:12px 14px;background-color:#241515;border:1px solid #EF4444;border-radius:8px;color:#FCA5A5;font-size:13px;line-height:1.5;">
         <strong style="color:#EF4444;">Security Notice:</strong> ${escapeHtml(payload.warningText)}
       </div>`
    : '';

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>${escapeHtml(payload.title)}</title>
  </head>
  <body style="margin:0;padding:24px 12px;background-color:#101010;font-family:Inter,Arial,Helvetica,sans-serif;color:#F5F5F5;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background-color:#1C1C1C;border:1px solid #303030;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background-color:#101010;padding:20px 24px;border-bottom:2px solid #FACC15;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="font-size:18px;font-weight:700;color:#F5F5F5;letter-spacing:0.3px;">
                  <span style="color:#FACC15;">Smart</span>Room IoT
                </div>
                <div style="font-size:12px;color:#A3A3A3;margin-top:2px;">Intelligent Control &amp; Security System</div>
              </td>
              <td align="right">
                <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background-color:${badgeColors.bg};color:${badgeColors.fg};">
                  ${escapeHtml(payload.badgeText)}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <h1 style="margin:0 0 10px 0;font-size:20px;font-weight:700;color:#F5F5F5;">${escapeHtml(payload.title)}</h1>
          <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#D4D4D4;">${escapeHtml(payload.description)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#141414;border:1px solid #303030;border-radius:8px;border-collapse:collapse;">
            ${rowsHtml}
          </table>
          ${warningHtml}
          <div style="margin-top:22px;">
            <a href="${escapeHtml(payload.dashboardUrl)}" style="display:inline-block;padding:11px 20px;background-color:#FACC15;color:#101010;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">
              Open SmartRoom Dashboard
            </a>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;background-color:#141414;border-top:1px solid #303030;font-size:11px;color:#A3A3A3;line-height:1.5;">
          Automated alert from SmartRoom IoT Backend. Note: Reported door state reflects the commanded lock state, not a physical door-contact sensor.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    `SMARTROOM IOT — ${payload.title}`,
    `Status: ${payload.badgeText}`,
    '',
    payload.description,
    '',
    ...rows.map((r) => `${r.label}: ${r.value}`),
    ...(payload.warningText ? ['', `SECURITY NOTICE: ${payload.warningText}`] : []),
    '',
    `Dashboard: ${payload.dashboardUrl}`,
  ];

  return { html, text: textLines.join('\n') };
}
