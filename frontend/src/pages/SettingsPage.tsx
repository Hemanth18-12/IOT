import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle2, Key, LogOut, Mail, Save, Send, Server, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useDemoMode } from '../context/DemoModeContext';
import { authApi, settingsApi } from '../services/api';
import type { SettingsView } from '../types';
import { formatDateTime } from '../utils/format';

interface SettingsFormValues {
  profileName: string;
  deviceName: string;
  recipientEmail: string;
  emailEnabled: boolean;
  wrongPasswordEnabled: boolean;
  unknownFaceEnabled: boolean;
  doorUnlockEnabled: boolean;
  highTemperatureEnabled: boolean;
  deviceOfflineEnabled: boolean;
  temperatureThreshold: number;
  emailCooldown: number;
  timezone: string;
}

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export const SettingsPage: React.FC = () => {
  const { logout, refreshUser } = useAuth();
  const demo = useDemoMode();
  const navigate = useNavigate();

  const [view, setView] = useState<SettingsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [testingEmail, setTestingEmail] = useState(false);
  const [verifyingSmtp, setVerifyingSmtp] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const settingsForm = useForm<SettingsFormValues>();
  const passwordForm = useForm<PasswordFormValues>();

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await settingsApi.get();
      setView(data);
      settingsForm.reset({
        profileName: data.profile.name,
        deviceName: data.device.name,
        recipientEmail: data.settings.recipientEmail,
        emailEnabled: data.settings.emailEnabled,
        wrongPasswordEnabled: data.settings.wrongPasswordEnabled,
        unknownFaceEnabled: data.settings.unknownFaceEnabled,
        doorUnlockEnabled: data.settings.doorUnlockEnabled,
        highTemperatureEnabled: data.settings.highTemperatureEnabled,
        deviceOfflineEnabled: data.settings.deviceOfflineEnabled,
        temperatureThreshold: data.settings.temperatureThreshold,
        emailCooldown: data.settings.emailCooldown,
        timezone: data.settings.timezone,
      });
    } finally {
      setLoading(false);
    }
  }, [settingsForm]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const onSaveSettings = async (values: SettingsFormValues) => {
    setSaveMessage(null);
    try {
      const updated = await settingsApi.update({
        ...values,
        temperatureThreshold: Number(values.temperatureThreshold),
        emailCooldown: Number(values.emailCooldown),
      });
      setView(updated);
      await refreshUser();
      setSaveMessage({ ok: true, text: 'Settings saved to database successfully.' });
    } catch {
      setSaveMessage({ ok: false, text: 'Failed to save settings.' });
    }
  };

  const onTestEmail = async () => {
    if (demo.demoEnabled) {
      setTestEmailResult({
        ok: false,
        text: 'Disable Demo Mode to send a real SMTP test email.',
      });
      return;
    }
    setTestingEmail(true);
    setTestEmailResult(null);
    try {
      const recipient = settingsForm.getValues('recipientEmail');
      const res = await settingsApi.testEmail(recipient);
      setTestEmailResult({
        ok: res.accepted,
        text: res.accepted
          ? `${res.message}. (SMTP acceptance does not guarantee inbox placement; check spam if delayed.)`
          : res.message,
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Test email request failed.';
      setTestEmailResult({ ok: false, text: String(msg) });
    } finally {
      setTestingEmail(false);
      void loadSettings();
    }
  };

  const onVerifySmtp = async () => {
    setVerifyingSmtp(true);
    setTestEmailResult(null);
    try {
      const res = await settingsApi.verifySmtp();
      setTestEmailResult({ ok: res.ok, text: res.message });
    } catch {
      setTestEmailResult({ ok: false, text: 'SMTP verification request failed.' });
    } finally {
      setVerifyingSmtp(false);
    }
  };

  const onChangePassword = async (values: PasswordFormValues) => {
    setPasswordMessage(null);
    if (values.newPassword !== values.confirmPassword) {
      setPasswordMessage({ ok: false, text: 'New password and confirmation do not match.' });
      return;
    }
    try {
      const res = await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.reset();
      setPasswordMessage({ ok: true, text: res.message });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to change password.';
      setPasswordMessage({ ok: false, text: Array.isArray(msg) ? msg.join(', ') : msg });
    }
  };

  if (loading) {
    return <div className="sr-card h-96 animate-pulse bg-[#1C1C1C]" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile, Device & Alert Preferences */}
        <form
          onSubmit={settingsForm.handleSubmit(onSaveSettings)}
          noValidate
          className="sr-card space-y-5 p-5 lg:col-span-2"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#F5F5F5]">
                Notification &amp; Device Preferences
              </h2>
              <p className="text-xs text-[#A3A3A3]">
                Stored in SQLite. Secrets such as SMTP passwords and MQTT credentials remain server-side only.
              </p>
            </div>
            <button
              type="submit"
              disabled={settingsForm.formState.isSubmitting}
              className="sr-btn-primary"
            >
              <Save className="h-4 w-4" />
              {settingsForm.formState.isSubmitting ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {saveMessage && (
            <div
              className={`flex items-center gap-2 rounded-[10px] border p-3 text-xs ${
                saveMessage.ok
                  ? 'border-[#22C55E]/40 bg-[#22C55E]/10 text-[#4ADE80]'
                  : 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#FCA5A5]'
              }`}
            >
              {saveMessage.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{saveMessage.text}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#F5F5F5]">User Name</label>
              <input className="sr-input" {...settingsForm.register('profileName', { required: true })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#F5F5F5]">Account Email</label>
              <input className="sr-input opacity-60" value={view?.profile.email || ''} disabled />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#F5F5F5]">Device Name</label>
              <input className="sr-input" {...settingsForm.register('deviceName', { required: true })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#F5F5F5]">
                Alert Recipient Email
              </label>
              <input
                type="email"
                className="sr-input"
                {...settingsForm.register('recipientEmail', {
                  required: 'Recipient email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Enter a valid email address',
                  },
                })}
              />
              {settingsForm.formState.errors.recipientEmail && (
                <p className="mt-1 text-xs text-[#EF4444]">
                  {settingsForm.formState.errors.recipientEmail.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#F5F5F5]">
                High Temperature Threshold (°C)
              </label>
              <input
                type="number"
                step="0.5"
                className="sr-input"
                {...settingsForm.register('temperatureThreshold', { min: 10, max: 80 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#F5F5F5]">
                Email Cooldown (seconds)
              </label>
              <input
                type="number"
                className="sr-input"
                {...settingsForm.register('emailCooldown', { min: 0, max: 86400 })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#F5F5F5]">Timezone</label>
              <select className="sr-input" {...settingsForm.register('timezone')}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
              </select>
            </div>
          </div>

          <div className="border-t border-[#303030] pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#A3A3A3]">
              Email Trigger Switches
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: 'emailEnabled', label: 'Master Email Notifications' },
                { key: 'wrongPasswordEnabled', label: 'Wrong Keypad Password Emails' },
                { key: 'unknownFaceEnabled', label: 'Unauthorized Face Emails' },
                { key: 'doorUnlockEnabled', label: 'Successful Door Unlock Emails' },
                { key: 'deviceOfflineEnabled', label: 'Device Offline Emails' },
                { key: 'highTemperatureEnabled', label: 'High Temperature Emails' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="sr-elevated flex cursor-pointer items-center justify-between p-3 text-xs font-medium text-[#F5F5F5]"
                >
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#FACC15]"
                    {...settingsForm.register(item.key as keyof SettingsFormValues)}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Test Email */}
          <div className="border-t border-[#303030] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#F5F5F5]">Verify SMTP Delivery</h3>
                <p className="text-xs text-[#A3A3A3]">
                  Sends a real email via backend Nodemailer using configured Gmail/SMTP credentials.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={verifyingSmtp}
                  onClick={() => void onVerifySmtp()}
                  className="sr-btn-secondary"
                >
                  {verifyingSmtp ? 'Verifying...' : 'Verify SMTP'}
                </button>
                <button
                  type="button"
                  disabled={testingEmail}
                  onClick={() => void onTestEmail()}
                  className="sr-btn-secondary"
                >
                  <Send className="h-4 w-4" />
                  {testingEmail ? 'Sending Test...' : 'Send Test Email'}
                </button>
              </div>
            </div>

            {testEmailResult && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-[10px] border p-3 text-xs ${
                  testEmailResult.ok
                    ? 'border-[#22C55E]/40 bg-[#22C55E]/10 text-[#4ADE80]'
                    : 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#FCA5A5]'
                }`}
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{testEmailResult.text}</span>
              </div>
            )}
          </div>
        </form>

        {/* Right Column: Connection Info + Change Password + Logout */}
        <div className="space-y-6">
          <div className="sr-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Server className="h-4 w-4 text-[#FACC15]" />
              <h3 className="text-sm font-semibold text-[#F5F5F5]">Connection Diagnostics</h3>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#A3A3A3]">Device ID</span>
                <span className="font-mono text-[#F5F5F5]">
                  {view?.connectionInfo.defaultDeviceId}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A3A3A3]">MQTT Broker</span>
                <span className="font-mono text-[#F5F5F5]">
                  {view?.connectionInfo.mqttBrokerHost}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A3A3A3]">SMTP Transport</span>
                <StatusBadge
                  label={view?.connectionInfo.smtpConfigured ? 'Configured' : 'Missing Credentials'}
                  variant={view?.connectionInfo.smtpConfigured ? 'success' : 'warning'}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A3A3A3]">SMTP Host</span>
                <span className="font-mono text-[#F5F5F5]">
                  {view?.connectionInfo.smtpHost || 'Not set'} (:{view?.connectionInfo.smtpPort})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A3A3A3]">Last Email Attempt</span>
                <span className="text-[#F5F5F5]">
                  {view?.connectionInfo.lastEmailAttempt
                    ? `${view.connectionInfo.lastEmailAttempt.status} • ${formatDateTime(view.connectionInfo.lastEmailAttempt.createdAt)}`
                    : 'None yet'}
                </span>
              </div>
              {view?.connectionInfo.lastSmtpError && (
                <div className="rounded-[8px] border border-[#EF4444]/40 bg-[#EF4444]/10 p-2.5 text-[11px] text-[#FCA5A5]">
                  <strong>Last SMTP Error:</strong> {view.connectionInfo.lastSmtpError}
                </div>
              )}
            </div>
          </div>

          {/* Change Password */}
          <div className="sr-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Key className="h-4 w-4 text-[#FACC15]" />
              <h3 className="text-sm font-semibold text-[#F5F5F5]">Change Password</h3>
            </div>
            {passwordMessage && (
              <div
                className={`mb-3 rounded-[8px] border p-2.5 text-xs ${
                  passwordMessage.ok
                    ? 'border-[#22C55E]/40 bg-[#22C55E]/10 text-[#4ADE80]'
                    : 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#FCA5A5]'
                }`}
              >
                {passwordMessage.text}
              </div>
            )}
            <div className="space-y-3">
              <input
                type="password"
                placeholder="Current password"
                className="sr-input"
                {...passwordForm.register('currentPassword', { required: true, minLength: 6 })}
              />
              <input
                type="password"
                placeholder="New password (min 8 chars)"
                className="sr-input"
                {...passwordForm.register('newPassword', { required: true, minLength: 8 })}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                className="sr-input"
                {...passwordForm.register('confirmPassword', { required: true, minLength: 8 })}
              />
              <button
                type="button"
                onClick={passwordForm.handleSubmit(onChangePassword)}
                disabled={passwordForm.formState.isSubmitting}
                className="sr-btn-secondary w-full"
              >
                Update Password
              </button>
            </div>
          </div>

          <div className="sr-card p-5">
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="sr-btn-danger w-full"
            >
              <LogOut className="h-4 w-4" />
              Sign Out of Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
