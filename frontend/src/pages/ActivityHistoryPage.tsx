import React, { useCallback, useEffect, useState } from 'react';
import { Download, History, Search } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { useDemoMode } from '../context/DemoModeContext';
import { useRealtime } from '../context/RealtimeContext';
import { eventsApi } from '../services/api';
import type { SecurityEvent } from '../types';
import { formatAuthMethod, formatDateTime, formatEventLabel } from '../utils/format';

export const ActivityHistoryPage: React.FC = () => {
  const demo = useDemoMode();
  const realtime = useRealtime();

  const [items, setItems] = useState<SecurityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [severity, setSeverity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await eventsApi.list({
        search: search || undefined,
        eventType: eventType || undefined,
        severity: severity || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        page,
        limit: 15,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } finally {
      setLoading(false);
    }
  }, [search, eventType, severity, from, to, page]);

  useEffect(() => {
    if (!demo.demoEnabled) {
      void loadEvents();
    } else {
      setLoading(false);
    }
  }, [demo.demoEnabled, loadEvents]);

  useEffect(() => {
    if (demo.demoEnabled) return;
    return realtime.subscribeEvent('security:alert', () => {
      void loadEvents();
    });
  }, [demo.demoEnabled, realtime, loadEvents]);

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      if (demo.demoEnabled) {
        const lines = [
          'Event ID,Date and Time,Event Type,Description,Device,Authentication Method,Severity,Email Status',
          ...demo.demoEvents.map(
            (e) =>
              `"${e.id}","${e.timestamp}","${e.eventType}","${e.description.replace(/"/g, '""')}","${e.deviceId}","${e.authenticationMethod || ''}","${e.severity}","${e.emailStatus || 'SKIPPED_DISABLED'}"`,
          ),
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        triggerBlobDownload(blob, 'smartroom-demo-activity.csv');
        return;
      }

      const blob = await eventsApi.exportCsv({
        search: search || undefined,
        eventType: eventType || undefined,
        severity: severity || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      });
      triggerBlobDownload(blob, 'smartroom-activity-events.csv');
    } finally {
      setExporting(false);
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const demoRows = demo.demoEvents.filter((ev) => {
    if (eventType && ev.eventType !== eventType) return false;
    if (severity && ev.severity !== severity) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !ev.description.toLowerCase().includes(q) &&
        !ev.eventType.toLowerCase().includes(q) &&
        !ev.id.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const rows = demo.demoEnabled ? demoRows : items;
  const displayedTotal = demo.demoEnabled ? demoRows.length : total;

  const emailBadgeVariant = (status?: string) => {
    switch (status) {
      case 'SENT':
        return 'success';
      case 'FAILED':
        return 'error';
      case 'PENDING':
        return 'yellow';
      case 'SKIPPED_COOLDOWN':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter & Search Bar */}
      <div className="sr-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#F5F5F5]">Activity Log Ledger</h2>
            <p className="text-xs text-[#A3A3A3]">
              {displayedTotal} total event{displayedTotal === 1 ? '' : 's'} stored in SQLite
            </p>
          </div>
          <button
            type="button"
            disabled={exporting || rows.length === 0}
            onClick={() => void handleExportCsv()}
            className="sr-btn-primary"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#A3A3A3]" />
            <input
              type="text"
              placeholder="Search description, event type, or event ID..."
              className="sr-input pl-9"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>

          <select
            className="sr-input"
            value={eventType}
            onChange={(e) => {
              setPage(1);
              setEventType(e.target.value);
            }}
          >
            <option value="">All Event Types</option>
            <option value="WRONG_PASSWORD">Wrong Password</option>
            <option value="UNKNOWN_FACE">Unauthorized Face</option>
            <option value="UNLOCK_PASSWORD">Keypad Unlock</option>
            <option value="UNLOCK_FACE">Face Unlock</option>
            <option value="UNLOCK_REMOTE">Remote Unlock</option>
            <option value="DOOR_LOCKED">Door Locked</option>
            <option value="FAN_ON">Fan ON</option>
            <option value="FAN_OFF">Fan OFF</option>
            <option value="LED_ON">LED ON</option>
            <option value="LED_OFF">LED OFF</option>
            <option value="DEVICE_ONLINE">Device Online</option>
            <option value="DEVICE_OFFLINE">Device Offline</option>
            <option value="HIGH_TEMPERATURE">High Temperature</option>
          </select>

          <select
            className="sr-input"
            value={severity}
            onChange={(e) => {
              setPage(1);
              setSeverity(e.target.value);
            }}
          >
            <option value="">All Severities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              aria-label="From date"
              className="sr-input px-2.5 text-xs"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
            />
            <input
              type="date"
              aria-label="To date"
              className="sr-input px-2.5 text-xs"
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="sr-card overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-[#242424]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={History}
              title="No activity history found"
              description="No events match your current search or filter criteria."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#303030] bg-[#141414] text-[#A3A3A3]">
                  <th className="px-4 py-3 font-semibold">Event ID</th>
                  <th className="px-4 py-3 font-semibold">Date &amp; Time</th>
                  <th className="px-4 py-3 font-semibold">Event Type</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold">Device</th>
                  <th className="px-4 py-3 font-semibold">Auth Method</th>
                  <th className="px-4 py-3 font-semibold">Severity</th>
                  <th className="px-4 py-3 font-semibold">Email Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#303030]">
                {rows.map((ev) => (
                  <tr key={ev.id} className="hover:bg-[#242424]/60">
                    <td className="px-4 py-3 font-mono text-[11px] text-[#A3A3A3]">
                      {ev.id.slice(0, 8)}…
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#F5F5F5]">
                      {formatDateTime(ev.timestamp)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#F5F5F5]">
                      {formatEventLabel(ev.eventType)}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-[#D4D4D4]">{ev.description}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[#A3A3A3]">
                      {ev.deviceId}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#A3A3A3]">
                      {formatAuthMethod(ev.authenticationMethod)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge
                        label={ev.severity}
                        variant={
                          ev.severity === 'HIGH' || ev.severity === 'CRITICAL'
                            ? 'error'
                            : ev.severity === 'MEDIUM'
                              ? 'warning'
                              : 'neutral'
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge
                        label={(ev.emailStatus || 'NOT_APPLICABLE').replace(/_/g, ' ')}
                        variant={emailBadgeVariant(ev.emailStatus)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!demo.demoEnabled && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#303030] bg-[#141414] px-4 py-3 text-xs text-[#A3A3A3]">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="sr-btn-secondary px-3 py-1.5 text-xs"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="sr-btn-secondary px-3 py-1.5 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
