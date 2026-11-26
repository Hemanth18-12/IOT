import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Filter,
  KeyRound,
  LockOpen,
  ScanFace,
  ShieldAlert,
  Volume2,
} from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { useDemoMode } from '../context/DemoModeContext';
import { useRealtime } from '../context/RealtimeContext';
import { useSmartRoomState } from '../hooks/useSmartRoomState';
import { analyticsApi, eventsApi } from '../services/api';
import type { SecurityEvent } from '../types';
import { formatAuthMethod, formatDateTime, formatEventLabel } from '../utils/format';

export const SecurityPage: React.FC = () => {
  const demo = useDemoMode();
  const realtime = useRealtime();
  const { device } = useSmartRoomState();

  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [stats, setStats] = useState({
    successfulCount: 0,
    failedCount: 0,
    wrongPasswordCount: 0,
    unknownFaceCount: 0,
    remoteUnlockCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    eventType: '',
    authenticationMethod: '',
    severity: '',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [eventsRes, secAnalytics] = await Promise.all([
        eventsApi.list({
          eventType: filters.eventType || undefined,
          authenticationMethod: filters.authenticationMethod || undefined,
          severity: filters.severity || undefined,
          from: filters.from ? new Date(filters.from).toISOString() : undefined,
          to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
          page: 1,
          limit: 50,
        }),
        analyticsApi.getSecurity('30d'),
      ]);
      setEvents(eventsRes.items);
      setStats({
        successfulCount: secAnalytics.successfulCount || 0,
        failedCount: secAnalytics.failedCount || 0,
        wrongPasswordCount: secAnalytics.wrongPasswordCount || 0,
        unknownFaceCount: secAnalytics.unknownFaceCount || 0,
        remoteUnlockCount: secAnalytics.remoteUnlockCount || 0,
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!demo.demoEnabled) {
      void loadData();
    } else {
      setLoading(false);
    }
  }, [demo.demoEnabled, loadData]);

  useEffect(() => {
    if (demo.demoEnabled) return;
    return realtime.subscribeEvent('security:alert', () => {
      void loadData();
    });
  }, [demo.demoEnabled, realtime, loadData]);

  const demoFiltered = demo.demoEvents.filter((ev) => {
    if (filters.eventType && ev.eventType !== filters.eventType) return false;
    if (filters.authenticationMethod && ev.authenticationMethod !== filters.authenticationMethod)
      return false;
    if (filters.severity && ev.severity !== filters.severity) return false;
    return true;
  });

  const displayedEvents = demo.demoEnabled ? demoFiltered : events;

  const computedStats = demo.demoEnabled
    ? {
        successfulCount: demo.demoEvents.filter((e) => e.eventType.startsWith('UNLOCK_')).length,
        failedCount: demo.demoEvents.filter((e) =>
          ['WRONG_PASSWORD', 'UNKNOWN_FACE'].includes(e.eventType),
        ).length,
        wrongPasswordCount: demo.demoEvents.filter((e) => e.eventType === 'WRONG_PASSWORD').length,
        unknownFaceCount: demo.demoEvents.filter((e) => e.eventType === 'UNKNOWN_FACE').length,
        remoteUnlockCount: demo.demoEvents.filter((e) => e.eventType === 'UNLOCK_REMOTE').length,
      }
    : stats;

  const lastSecurityEvent = displayedEvents[0] || null;
  const buzzerActive = Boolean(device?.state?.buzzerState);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Successful Auths"
          value={String(computedStats.successfulCount)}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          title="Failed Auths"
          value={String(computedStats.failedCount)}
          icon={AlertOctagon}
          tone={computedStats.failedCount > 0 ? 'error' : 'default'}
        />
        <StatCard
          title="Wrong Passwords"
          value={String(computedStats.wrongPasswordCount)}
          icon={KeyRound}
          tone={computedStats.wrongPasswordCount > 0 ? 'error' : 'default'}
        />
        <StatCard
          title="Unauthorized Faces"
          value={String(computedStats.unknownFaceCount)}
          icon={ScanFace}
          tone={computedStats.unknownFaceCount > 0 ? 'error' : 'default'}
        />
        <StatCard
          title="Remote Unlocks"
          value={String(computedStats.remoteUnlockCount)}
          icon={LockOpen}
          tone="yellow"
        />
        <StatCard
          title="Alarm Buzzer"
          value={buzzerActive ? 'ACTIVE' : 'CLEAR'}
          icon={Volume2}
          tone={buzzerActive ? 'error' : 'success'}
          badge={
            <StatusBadge
              label={buzzerActive ? 'Sounding' : 'Silent'}
              variant={buzzerActive ? 'error' : 'success'}
            />
          }
        />
      </div>

      {/* Last Security Event Banner */}
      <div className="sr-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-[#FACC15]" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#A3A3A3]">
              Latest Security Event
            </div>
            {lastSecurityEvent ? (
              <div className="mt-0.5 text-sm font-semibold text-[#F5F5F5]">
                {formatEventLabel(lastSecurityEvent.eventType)} — {lastSecurityEvent.description}
              </div>
            ) : (
              <div className="mt-0.5 text-sm text-[#A3A3A3]">No security events recorded yet.</div>
            )}
          </div>
        </div>
        {lastSecurityEvent && (
          <div className="text-xs text-[#A3A3A3]">
            {formatDateTime(lastSecurityEvent.timestamp)}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="sr-card p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#A3A3A3]">
          <Filter className="h-3.5 w-3.5" />
          Filter Security Timeline
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-[#A3A3A3]">From Date</label>
            <input
              type="date"
              className="sr-input"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#A3A3A3]">To Date</label>
            <input
              type="date"
              className="sr-input"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#A3A3A3]">Event Type</label>
            <select
              className="sr-input"
              value={filters.eventType}
              onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}
            >
              <option value="">All Events</option>
              <option value="WRONG_PASSWORD">Wrong Password</option>
              <option value="UNKNOWN_FACE">Unauthorized Face</option>
              <option value="UNLOCK_PASSWORD">Keypad Unlock</option>
              <option value="UNLOCK_FACE">Face Unlock</option>
              <option value="UNLOCK_REMOTE">Remote Unlock</option>
              <option value="DOOR_LOCKED">Door Locked</option>
              <option value="DEVICE_OFFLINE">Device Offline</option>
              <option value="HIGH_TEMPERATURE">High Temperature</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#A3A3A3]">Auth Method</label>
            <select
              className="sr-input"
              value={filters.authenticationMethod}
              onChange={(e) =>
                setFilters((f) => ({ ...f, authenticationMethod: e.target.value }))
              }
            >
              <option value="">All Methods</option>
              <option value="KEYPAD">4x4 Keypad</option>
              <option value="FACE_RECOGNITION">Face Recognition</option>
              <option value="REMOTE_WEB">Remote Dashboard</option>
              <option value="AUTO_LOCK">Auto-Lock</option>
              <option value="SYSTEM">System</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#A3A3A3]">Severity</label>
            <select
              className="sr-input"
              value={filters.severity}
              onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
            >
              <option value="">All Severities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Security Timeline */}
      <div className="sr-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-[#F5F5F5]">Security Activity Timeline</h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-[10px] bg-[#242424]" />
            ))}
          </div>
        ) : displayedEvents.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="No matching security events"
            description="Adjust your filters or wait for hardware keypad, face recognition, or remote access events."
          />
        ) : (
          <div className="space-y-3">
            {displayedEvents.map((ev) => {
              const isUnauthorized =
                ev.eventType === 'WRONG_PASSWORD' || ev.eventType === 'UNKNOWN_FACE';
              const isSuccess = ev.eventType.startsWith('UNLOCK_');
              const borderStyle = isUnauthorized
                ? 'border-l-4 border-l-[#EF4444]'
                : isSuccess
                  ? 'border-l-4 border-l-[#22C55E]'
                  : 'border-l-4 border-l-[#FACC15]';

              return (
                <div
                  key={ev.id}
                  className={`sr-elevated ${borderStyle} flex flex-wrap items-center justify-between gap-3 p-4`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          isUnauthorized
                            ? 'text-[#FCA5A5]'
                            : isSuccess
                              ? 'text-[#4ADE80]'
                              : 'text-[#F5F5F5]'
                        }`}
                      >
                        {formatEventLabel(ev.eventType)}
                      </span>
                      <StatusBadge
                        label={formatAuthMethod(ev.authenticationMethod)}
                        variant={isUnauthorized ? 'error' : isSuccess ? 'success' : 'neutral'}
                      />
                    </div>
                    <p className="mt-1 text-xs text-[#A3A3A3]">{ev.description}</p>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[#A3A3A3]">
                    <span>{formatDateTime(ev.timestamp)}</span>
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
