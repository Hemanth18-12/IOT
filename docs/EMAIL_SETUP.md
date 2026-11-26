# Real Email Notification Setup Guide (Gmail SMTP + Nodemailer)

SmartRoom sends real HTML + plain-text alert emails using **Nodemailer** over **STARTTLS (port 587)**. Never use your regular Gmail login password and never commit `.env` files to Git.

---

## 1. Create a Google App Password (Recommended for College Demo)

1. Sign in to the Google Account you want to send alerts from.
2. Open **Google Account Settings** → **Security** → enable **2-Step Verification** if not already active.
3. Search for **App passwords** (under Security → 2-Step Verification).
4. Create a new App Password named `SmartRoom IoT`.
5. Copy the generated **16-character password** (remove spaces when pasting into `.env`).

---

## 2. Configure `backend/.env`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your16charapppassword
EMAIL_FROM=SmartRoom Security <your-email@gmail.com>
DEFAULT_ALERT_EMAIL=recipient@example.com
DASHBOARD_PUBLIC_URL=http://localhost:5173
EMAIL_RETRY_LIMIT=2
```

Restart the backend after editing `backend/.env`.

---

## 3. Configure Preferences & Test Email in Dashboard

1. Open **Settings** in the SmartRoom web app.
2. Enter your **Alert Recipient Email** and toggle which events trigger emails:
   - Wrong Keypad Password
   - Unauthorized Face Detection
   - Successful Door Unlock (off by default to reduce noise)
   - Device Offline
   - High Temperature (configurable threshold in °C + 1.5 °C hysteresis)
3. Set **Email Cooldown** (e.g., `60` seconds) to avoid inbox flooding during repeated attempts.
4. Click **Send Test Email**.
5. Check the response banner (and the **Notifications** page -> *Recent SMTP Delivery Results*) to verify whether SMTP accepted the message or returned an authentication/network error.

> **Delivery Note:** Backend logging tracks whether the SMTP server accepted the message (`SENT`) or rejected it (`FAILED`). SMTP acceptance confirms submission to Gmail's mail relay, not guaranteed inbox placement (always check Spam/Promotions on first test).
