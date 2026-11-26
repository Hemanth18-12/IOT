import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Fan,
  KeyRound,
  Lightbulb,
  Loader2,
  Lock,
  LockOpen,
  Radar,
  ShieldAlert,
  Thermometer,
  Volume2,
  Wifi,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { useDemoMode } from '../context/DemoModeContext';
import { useRealtime } from '../context/RealtimeContext';
import { useSmartRoomState } from '../hooks/useSmartRoomState';
import { dashboardApi } from '../services/api';
import type { DashboardOverview, SecurityEvent, TelemetryPoint } from '../types';
import {
  formatAuthMethod,
  formatDateTime,
  formatEventLabel,
  formatRelativeTime,
  formatShortTime,
} from '../utils/format';

export const DashboardPage: React.FC = () => {
  const demo = useDemoMode();
  const realtime = useRealtime();
  const {
    device,
    command,
    commandError,
    issuingCommand,
    issueUnlock,
    issueLock,
    clearCommandError,
  } = useSmartRoomState();

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [telemetrySeries, setTelemetrySeries] = useState<TelemetryPoint[]>([]);
  const [recentActivity, setRecentActivity] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setError(null);
      const data = await dashboardApi.getOverview();
      setOverview(data);
      setTelemetrySeries(data.recentTelemetry);
      setRecentActivity(data.recentActivity);
    } catch {
      setError('Failed to load dashboard overview from backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!demo.demoEnabled) {
      void loadOverview();
    } else {
      setLoading(false);
    }
  }, [demo.demoEnabled, loadOverview]);

  // Append real-time telemetry points onto charts
  useEffect(() => {
    if (demo.demoEnabled || !realtime.liveTelemetryPoint) return;
    setTelemetrySeries((prev) => [...prev.slice(-39), realtime.liveTelemetryPoint!]);
  }, [demo.demoEnabled, realtime.liveTelemetryPoint]);

  // Refresh activity when security alerts or commands complete
  useEffect(() => {
    if (demo.demoEnabled) return;
    const unsubAlert = realtime.subscribeEvent('security:alert', () => {
      void loadOverview();
    });
    const unsubCmd = realtime.subscribeEvent('command:status', (payload) => {
      const p = payload as { command?: { status?: string } };
      if (p?.command?.status === 'ACKNOWLEDGED') {
        void loadOverview();
      }
    });
    return () => {
      unsubAlert();
      unsubCmd();
    };
  }, [demo.demoEnabled, realtime, loadOverview]);

  const activeTelemetry = demo.demoEnabled ? demo.demoTelemetry : telemetrySeries;
  const activeActivity = demo.demoEnabled ? demo.demoEvents.slice(0, 10) : recentActivity;
  const state = device?.state;

  const alertsToday = demo.demoEnabled
    ? demo.demoEvents.filter((e) =>
        ['WRONG_PASSWORD', 'UNKNOWN_FACE', 'DEVICE_OFFLINE', 'HIGH_TEMPERATURE'].includes(
          e.eventType,
        ),
      ).length
    : (overview?.alertsToday ?? 0);

  const lastSuccess = demo.demoEnabled
    ? demo.demoEvents.find((e) =>
        ['UNLOCK_PASSWORD', 'UNLOCK_FACE', 'UNLOCK_REMOTE'].includes(e.eventType),
      ) || null
    : overview?.lastSuccess || null;

  const lastUnauthorized = demo.demoEnabled
    ? demo.demoEvents.find((e) => ['WRONG_PASSWORD', 'UNKNOWN_FACE'].includes(e.eventType)) ||
      null
    : overview?.lastUnauthorized || null;

  const latestAlert = demo.demoEnabled
    ? demo.demoEvents.find((e) => e.severity !== 'LOW') || null
    : realtime.latestAlert || overview?.latestAlert || null;

  const chartData = activeTelemetry.map((p) => ({
    time: formatShortTime(p.timestamp),
    temperature: p.temperature,
    distance: p.distance,
  }));

  const controlsDisabled = !device?.online || issuingCommand || command?.status === 'PENDING';

  const handleConfirmUnlock = async () => {
    setUnlockModalOpen(false);
    await issueUnlock();
  };

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="sr-card h-28 animate-pulse bg-[#1C1C1C]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && !demo.demoEnabled && (
        <div className="flex items-center justify-between rounded-[12px] border border-[#EF4444]/40 bg-[#EF4444]/10 p-4 text-sm text-[#FCA5A5]">
          <span>{error}</span>
          <button type="button" onClick={() => void loadOverview()} className="sr-btn-secondary py-1.5 text-xs">
            Retry
          </button>
        </div>
      )}

      {/* 8 Real-Time Status Cards */}
      <section aria-label="Real-time Telemetry Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Room Temperature"
          value={
            state?.temperature !== null && state?.temperature !== undefined
              ? `${state.temperature.toFixed(1)} °C`
              : '-- °C'
          }
          subtitle={device?.stale ? 'Last recorded (stale)' : 'LM35 analog sensor (A0)'}
          icon={Thermometer}
          tone="yellow"
        />

        <StatCard
          title="Ultrasonic Distance"
          value={
            state?.distance !== null && state?.distance !== undefined
              ? state.distance === 0
                ? 'No echo'
                : `${state.distance.toFixed(1)} cm`
              : '-- cm'
          }
          subtitle="Trigger window: 2–10 cm (D10/D11)"
          icon={Radar}
          tone="default"
        />

        <StatCard
          title="DC Fan Status"
          value={state?.fanState ? 'ON' : 'OFF'}
          subtitle="Ultrasonic gesture toggle (D13)"
          icon={Fan}
          tone={state?.fanState ? 'success' : 'default'}
          badge={
            <StatusBadge
              label={state?.fanState ? 'Running' : 'Idle'}
              variant={state?.fanState ? 'success' : 'neutral'}
            />
          }
        />

        <StatCard
          title="Room LED Status"
          value={state?.ledState ? 'ON' : 'OFF'}
          subtitle="Ultrasonic gesture toggle (A1)"
          icon={Lightbulb}
          tone={state?.ledState ? 'yellow' : 'default'}
          badge={
            <StatusBadge
              label={state?.ledState ? 'Lit' : 'Off'}
              variant={state?.ledState ? 'yellow' : 'neutral'}
            />
          }
        />

        <StatCard
          title="Smart Door Lock"
          value={state?.doorUnlocked ? 'UNLOCKED' : 'LOCKED'}
          subtitle="Commanded servo state (auto-locks 10s)"
          icon={state?.doorUnlocked ? LockOpen : Lock}
          tone={state?.doorUnlocked ? 'warning' : 'success'}
          badge={
            <StatusBadge
              label={state?.doorUnlocked ? 'Open' : 'Secured'}
              variant={state?.doorUnlocked ? 'warning' : 'success'}
            />
          }
        />

        <StatCard
          title="Buzzer Alarm"
          value={state?.buzzerState ? 'ACTIVE' : 'INACTIVE'}
          subtitle="5s non-blocking alarm (NodeMCU D5)"
          icon={Volume2}
          tone={state?.buzzerState ? 'error' : 'default'}
          badge={
            <StatusBadge
              label={state?.buzzerState ? 'Sounding' : 'Silent'}
              variant={state?.buzzerState ? 'error' : 'neutral'}
            />
          }
        />

        <StatCard
          title="Device Connectivity"
          value={device?.online ? 'ONLINE' : 'OFFLINE'}
          subtitle={
            device?.lastSeen
              ? `Last seen ${formatRelativeTime(device.lastSeen)}`
              : 'Awaiting MQTT connection'
          }
          icon={Wifi}
          tone={device?.online ? 'success' : 'error'}
          badge={
            <StatusBadge
              label={device?.online ? 'MQTT Live' : 'Disconnected'}
              variant={device?.online ? 'success' : 'error'}
              dot
            />
          }
        />

        <StatCard
          title="Security Alerts Today"
          value={String(alertsToday)}
          subtitle="Wrong password, unknown face, offline"
          icon={ShieldAlert}
          tone={alertsToday > 0 ? 'error' : 'default'}
          badge={
            <StatusBadge
              label={alertsToday > 0 ? 'Attention' : 'All Clear'}
              variant={alertsToday > 0 ? 'error' : 'success'}
            />
          }
        />
      </section>

      {/* Remote Door Control + Security Context */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Door Control Card */}
        <div className="sr-card flex flex-col justify-between p-5 lg:col-span-1">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#F5F5F5]">Remote Door Control</h2>
              <StatusBadge
                label={state?.doorUnlocked ? 'Unlocked' : 'Locked'}
                variant={state?.doorUnlocked ? 'warning' : 'success'}
                dot
              />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#A3A3A3]">
              Commands wait for hardware acknowledgment from the Arduino before updating lock status. Servo auto-locks after 10 seconds.
            </p>

            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row lg:flex-col">
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={() => setUnlockModalOpen(true)}
                className="sr-btn-primary w-full py-3"
              >
                {command?.status === 'PENDING' && command.commandType === 'UNLOCK' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Awaiting Hardware ACK...
                  </>
                ) : (
                  <>
                    <LockOpen className="h-4 w-4" />
                    Unlock Door
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={controlsDisabled}
                onClick={() => void issueLock()}
                className="sr-btn-secondary w-full py-3"
              >
                {command?.status === 'PENDING' && command.commandType === 'LOCK' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Locking...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Lock Door
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {!device?.online && (
              <div className="rounded-[8px] border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-2.5 text-xs text-[#FCD34D]">
                Remote lock/unlock disabled while device is offline. Commands are never queued offline.
              </div>
            )}

            {commandError && (
              <div className="flex items-start justify-between gap-2 rounded-[8px] border border-[#EF4444]/40 bg-[#EF4444]/10 p-2.5 text-xs text-[#FCA5A5]">
                <span>{commandError}</span>
                <button type="button" onClick={clearCommandError} className="underline">
                  Dismiss
                </button>
              </div>
            )}

            {command && (
              <div className="sr-elevated flex items-center justify-between gap-2 p-3 text-xs">
                <div className="flex items-center gap-2">
                  {command.status === 'PENDING' && (
                    <Loader2 className="h-4 w-4 animate-spin text-[#FACC15]" />
                  )}
                  {command.status === 'ACKNOWLEDGED' && (
                    <CheckCircle2 className="h-4 w-4 text-[#22C55E]" />
                  )}
                  {(command.status === 'TIMEOUT' ||
                    command.status === 'FAILED' ||
                    command.status === 'REJECTED_OFFLINE') && (
                    <XCircle className="h-4 w-4 text-[#EF4444]" />
                  )}
                  <div>
                    <div className="font-semibold text-[#F5F5F5]">
                      {command.commandType} — {command.status}
                    </div>
                    <div className="text-[11px] text-[#A3A3A3]">
                      {command.failureReason ||
                        (command.acknowledgedAt
                          ? `Confirmed at ${formatShortTime(command.acknowledgedAt)}`
                          : 'Waiting for Arduino confirmation')}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Auth & Latest Security Alert Summary */}
        <div className="sr-card grid gap-4 p-5 sm:grid-cols-2 lg:col-span-2">
          <div className="sr-elevated flex flex-col justify-between p-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#22C55E]">
                <KeyRound className="h-4 w-4" />
                Last Successful Authentication
              </div>
              {lastSuccess ? (
                <div className="mt-3 space-y-1">
                  <div className="text-base font-semibold text-[#F5F5F5]">
                    {formatAuthMethod(lastSuccess.authenticationMethod)}
                  </div>
                  <p className="text-xs text-[#A3A3A3]">{lastSuccess.description}</p>
                  <div className="pt-1 text-xs text-[#A3A3A3]">
                    {formatDateTime(lastSuccess.timestamp)}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-[#A3A3A3]">No successful unlock recorded yet.</p>
              )}
            </div>
            <Link to="/security" className="mt-4 text-xs font-semibold text-[#FACC15] hover:underline">
              View Security Timeline →
            </Link>
          </div>

          <div className="sr-elevated flex flex-col justify-between p-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EF4444]">
                <AlertTriangle className="h-4 w-4" />
                Last Unauthorized Attempt
              </div>
              {lastUnauthorized ? (
                <div className="mt-3 space-y-1">
                  <div className="text-base font-semibold text-[#FCA5A5]">
                    {formatEventLabel(lastUnauthorized.eventType)}
                  </div>
                  <p className="text-xs text-[#A3A3A3]">{lastUnauthorized.description}</p>
                  <div className="pt-1 text-xs text-[#A3A3A3]">
                    {formatDateTime(lastUnauthorized.timestamp)}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-[#A3A3A3]">
                  No unauthorized access attempts recorded.
                </p>
              )}
            </div>
            <Link to="/security" className="mt-4 text-xs font-semibold text-[#FACC15] hover:underline">
              Inspect Security Logs →
            </Link>
          </div>

          <div className="sr-elevated flex flex-wrap items-center justify-between gap-3 p-4 sm:col-span-2">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#A3A3A3]">
                  Latest Security Alert
                </div>
                {latestAlert ? (
                  <>
                    <div className="mt-0.5 text-sm font-semibold text-[#F5F5F5]">
                      {formatEventLabel(latestAlert.eventType)} — {latestAlert.description}
                    </div>
                    <div className="text-xs text-[#A3A3A3]">
                      {formatDateTime(latestAlert.timestamp)}
                    </div>
                  </>
                ) : (
                  <div className="mt-0.5 text-sm text-[#A3A3A3]">
                    No medium/high security alerts recorded.
                  </div>
                )}
              </div>
            </div>
            {latestAlert && (
              <StatusBadge
                label={latestAlert.severity}
                variant={
                  latestAlert.severity === 'HIGH' || latestAlert.severity === 'CRITICAL'
                    ? 'error'
                    : 'warning'
                }
              />
            )}
          </div>
        </div>
      </section>

      {/* Real-Time Sensor Charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="sr-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F5F5]">Temperature Trend (°C)</h2>
              <p className="text-xs text-[#A3A3A3]">LM35 live readings (sampled every 10s)</p>
            </div>
            <Link to="/analytics" className="text-xs font-medium text-[#FACC15] hover:underline">
              Full Analytics →
            </Link>
          </div>

          {chartData.length === 0 ? (
            <EmptyState
              icon={Thermometer}
              title="No temperature telemetry yet"
              description="Connect your NodeMCU + Arduino hardware to stream live LM35 readings, or enable Demo Mode in the sidebar."
            />
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid stroke="#303030" strokeDasharray="3 3" />
                  <XAxis dataKey="time" stroke="#A3A3A3" fontSize={11} />
                  <YAxis stroke="#A3A3A3" fontSize={11} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1C1C1C',
                      borderColor: '#303030',
                      color: '#F5F5F5',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="temperature"
                    name="Temperature (°C)"
                    stroke="#FACC15"
                    fill="#FACC15"
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="sr-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F5F5]">Ultrasonic Distance (cm)</h2>
              <p className="text-xs text-[#A3A3A3]">HC-SR04 hand gesture threshold: 2–10 cm</p>
            </div>
            <Link to="/analytics" className="text-xs font-medium text-[#FACC15] hover:underline">
              Full Analytics →
            </Link>
          </div>

          {chartData.length === 0 ? (
            <EmptyState
              icon={Radar}
              title="No distance readings yet"
              description="Waiting for HC-SR04 telemetry frames from NodeMCU."
            />
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#303030" strokeDasharray="3 3" />
                  <XAxis dataKey="time" stroke="#A3A3A3" fontSize={11} />
                  <YAxis stroke="#A3A3A3" fontSize={11} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1C1C1C',
                      borderColor: '#303030',
                      color: '#F5F5F5',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="distance"
                    name="Distance (cm)"
                    stroke="#22C55E"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Recent Activity */}
      <section className="sr-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F5]">Recent Activity</h2>
            <p className="text-xs text-[#A3A3A3]">Latest hardware events and authentication records</p>
          </div>
          <Link to="/activity" className="text-xs font-medium text-[#FACC15] hover:underline">
            View Full History →
          </Link>
        </div>

        {activeActivity.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity events recorded"
            description="Security events, keypad attempts, face recognition unlocks, and ultrasonic fan/LED toggles will appear here."
          />
        ) : (
          <div className="divide-y divide-[#303030]">
            {activeActivity.map((ev) => {
              const isDanger = ev.severity === 'HIGH' || ev.severity === 'CRITICAL';
              const isSuccess = ev.eventType.startsWith('UNLOCK_');
              return (
                <div
                  key={ev.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        isDanger
                          ? 'bg-[#EF4444]'
                          : isSuccess
                            ? 'bg-[#22C55E]'
                            : 'bg-[#FACC15]'
                      }`}
                    />
                    <div>
                      <div className="font-medium text-[#F5F5F5]">{ev.description}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#A3A3A3]">
                        <span>{formatEventLabel(ev.eventType)}</span>
                        <span>•</span>
                        <span>{formatAuthMethod(ev.authenticationMethod)}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(ev.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge
                    label={ev.severity}
                    variant={
                      isDanger ? 'error' : ev.severity === 'MEDIUM' ? 'warning' : 'neutral'
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmModal
        open={unlockModalOpen}
        title="Confirm Remote Door Unlock"
        description="You are about to send an authenticated MQTT UNLOCK command to the physical SmartRoom door servo. The servo will move to 90 degrees and automatically re-lock after 10 seconds. Proceed?"
        confirmLabel="Unlock Door Now"
        loading={issuingCommand}
        onConfirm={() => void handleConfirmUnlock()}
        onCancel={() => setUnlockModalOpen(false)}
      />
    </div>
  );
};
