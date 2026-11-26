import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Mail } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { useDemoMode } from '../context/DemoModeContext';
import { useRealtime } from '../context/RealtimeContext';
import { notificationsApi, settingsApi } from '../services/api';
import type { EmailLog, NotificationItem } from '../types';
import { formatDateTime, formatEventLabel } from '../utils/format';

export const NotificationsPage: React.FC = () => {
  const demo = useDemoMode();
  const realtime = useRealtime();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const [notifRes, settingsRes] = await Promise.all([
        notificationsApi.list({
          severity: severityFilter || undefined,
          eventType: eventTypeFilter || undefined,
          limit: 50,
        }),
        settingsApi.get(),
      ]);
      setItems(notifRes.items);
      realtime.setUnreadCount(notifRes.unreadCount);
      setEmailLogs(settingsRes.recentEmailLogs || []);
    } finally {
      setLoading(false);
    }
  }, [severityFilter, eventTypeFilter, realtime]);

  useEffect(() => {
    if (!demo.demoEnabled) {
      void loadNotifications();
    } else {
      setLoading(false);
    }
  }, [demo.demoEnabled, loadNotifications]);

  useEffect(() => {
    if (demo.demoEnabled) return;
    const unsubNotif = realtime.subscribeEvent('notification:new', () => {
      void loadNotifications();
    });
    const unsubEmail = realtime.subscribeEvent('email:status', () => {
      void loadNotifications();
    });
    return () => {
      unsubNotif();
      unsubEmail();
    };
  }, [demo.demoEnabled, realtime, loadNotifications]);

  const handleMarkRead = async (id: string) => {
    if (demo.demoEnabled) {
      demo.markDemoNotificationRead(id);
      return;
    }
    const res = await notificationsApi.markRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    realtime.setUnreadCount(res.unreadCount);
  };

  const handleMarkAllRead = async () => {
    if (demo.demoEnabled) {
      demo.markAllDemoNotificationsRead();
      return;
    }
    await notificationsApi.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    realtime.setUnreadCount(0);
  };

  const displayed = demo.demoEnabled
    ? demo.demoNotifications.filter((n) => {
        if (severityFilter && n.severity !== severityFilter) return false;
        if (eventTypeFilter && n.eventType !== eventTypeFilter) return false;
        return true;
      })
    : items;

  const unreadCount = displayed.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="sr-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#FACC15]/40 bg-[#FACC15]/10 text-[#FACC15]">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#F5F5F5]">
              Notification Center ({unreadCount} unread)
            </h2>
            <p className="text-xs text-[#A3A3A3]">
              Real-time alerts streamed over Socket.IO with persistent SQLite history.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={() => void handleMarkAllRead()}
          className="sr-btn-secondary"
        >
          <CheckCheck className="h-4 w-4" />
          Mark All as Read
        </button>
      </div>

      {/* Filters */}
      <div className="sr-card grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-[#A3A3A3]">Filter by Severity</label>
          <select
            className="sr-input"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="">All Severities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[#A3A3A3]">Filter by Event Type</label>
          <select
            className="sr-input"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
          >
            <option value="">All Event Types</option>
            <option value="WRONG_PASSWORD">Wrong Password</option>
            <option value="UNKNOWN_FACE">Unauthorized Face</option>
            <option value="UNLOCK_PASSWORD">Keypad Unlock</option>
            <option value="UNLOCK_FACE">Face Unlock</option>
            <option value="UNLOCK_REMOTE">Remote Unlock</option>
            <option value="DEVICE_OFFLINE">Device Offline</option>
            <option value="HIGH_TEMPERATURE">High Temperature</option>
          </select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Notifications List */}
        <div className="sr-card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-[#F5F5F5]">Alert Feed</h3>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded bg-[#242424]" />
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications yet"
              description="Security alerts, remote door unlocks, temperature warnings, and device disconnects will appear here in real time."
            />
          ) : (
            <div className="space-y-3">
              {displayed.map((notif) => (
                <div
                  key={notif.id}
                  className={`sr-elevated flex flex-wrap items-start justify-between gap-3 p-4 ${
                    !notif.isRead ? 'border-l-4 border-l-[#FACC15]' : 'opacity-80'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#F5F5F5]">{notif.title}</span>
                      <StatusBadge
                        label={notif.severity}
                        variant={
                          notif.severity === 'HIGH' || notif.severity === 'CRITICAL'
                            ? 'error'
                            : notif.severity === 'MEDIUM'
                              ? 'warning'
                              : 'neutral'
                        }
                      />
                      {!notif.isRead && <StatusBadge label="Unread" variant="yellow" />}
                    </div>
                    <p className="mt-1 text-xs text-[#D4D4D4]">{notif.message}</p>
                    <div className="mt-1.5 text-[11px] text-[#A3A3A3]">
                      {formatEventLabel(notif.eventType)} • {formatDateTime(notif.createdAt)}
                    </div>
                  </div>
                  {!notif.isRead && (
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(notif.id)}
                      className="sr-btn-secondary px-3 py-1.5 text-xs"
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Delivery Results */}
        <div className="sr-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Mail className="h-4 w-4 text-[#FACC15]" />
            <h3 className="text-sm font-semibold text-[#F5F5F5]">Recent SMTP Delivery Results</h3>
          </div>
          {demo.demoEnabled ? (
            <p className="text-xs text-[#A3A3A3]">
              Real email delivery is disabled while Demo Mode is active.
            </p>
          ) : emailLogs.length === 0 ? (
            <p className="text-xs text-[#A3A3A3]">No email delivery logs recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {emailLogs.map((log) => (
                <div key={log.id} className="sr-elevated p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#F5F5F5] truncate">{log.subject}</span>
                    <StatusBadge
                      label={log.status}
                      variant={
                        log.status === 'SENT'
                          ? 'success'
                          : log.status === 'FAILED'
                            ? 'error'
                            : 'warning'
                      }
                    />
                  </div>
                  <div className="mt-1 text-[#A3A3A3]">To: {log.recipient}</div>
                  {log.errorMessage && (
                    <div className="mt-1 text-[#FCA5A5]">{log.errorMessage}</div>
                  )}
                  <div className="mt-1 text-[11px] text-[#737373]">
                    {formatDateTime(log.sentAt || log.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
