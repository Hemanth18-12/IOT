import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Clock, Fan, Lightbulb, Radar, ShieldAlert, Thermometer } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { useDemoMode } from '../context/DemoModeContext';
import { analyticsApi } from '../services/api';
import { formatDurationSeconds, formatShortTime } from '../utils/format';

type RangeKey = '1h' | 'today' | '7d' | '30d';

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: '1h', label: 'Last Hour' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
];

export const AnalyticsPage: React.FC = () => {
  const demo = useDemoMode();
  const [range, setRange] = useState<RangeKey>('today');
  const [loading, setLoading] = useState(true);
  const [tempData, setTempData] = useState<any>(null);
  const [secData, setSecData] = useState<any>(null);
  const [usageData, setUsageData] = useState<any>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const [t, s, u] = await Promise.all([
        analyticsApi.getTemperature(range),
        analyticsApi.getSecurity(range),
        analyticsApi.getDeviceUsage(range),
      ]);
      setTempData(t);
      setSecData(s);
      setUsageData(u);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (!demo.demoEnabled) {
      void loadAnalytics();
    } else {
      setLoading(false);
    }
  }, [demo.demoEnabled, loadAnalytics]);

  const series = demo.demoEnabled
    ? demo.demoTelemetry.map((p) => ({
        time: formatShortTime(p.timestamp),
        temperature: p.temperature,
        distance: p.distance,
      }))
    : (tempData?.series || []).map((p: any) => ({
        time: formatShortTime(p.timestamp),
        temperature: p.temperature,
        distance: p.distance,
      }));

  const authComparison = demo.demoEnabled
    ? [
        {
          name: 'Successful',
          value: demo.demoEvents.filter((e) => e.eventType.startsWith('UNLOCK_')).length,
        },
        {
          name: 'Failed',
          value: demo.demoEvents.filter((e) =>
            ['WRONG_PASSWORD', 'UNKNOWN_FACE'].includes(e.eventType),
          ).length,
        },
      ]
    : secData?.authComparison || [];

  const dailyUnauthorized = demo.demoEnabled
    ? [
        {
          date: new Date().toISOString().slice(0, 10),
          wrongPassword: demo.demoEvents.filter((e) => e.eventType === 'WRONG_PASSWORD').length,
          unknownFace: demo.demoEvents.filter((e) => e.eventType === 'UNKNOWN_FACE').length,
        },
      ]
    : secData?.dailyUnauthorizedSeries || [];

  const unlockFrequency = demo.demoEnabled
    ? [
        {
          date: new Date().toISOString().slice(0, 10),
          keypad: 0,
          face: 0,
          remote: demo.demoEvents.filter((e) => e.eventType === 'UNLOCK_REMOTE').length,
        },
      ]
    : secData?.unlockFrequencySeries || [];

  const fanSeconds = demo.demoEnabled ? 0 : usageData?.durationsSeconds?.fanOn || 0;
  const ledSeconds = demo.demoEnabled ? 0 : usageData?.durationsSeconds?.ledOn || 0;
  const doorSeconds = demo.demoEnabled ? 0 : usageData?.durationsSeconds?.doorUnlocked || 0;
  const usageChart = demo.demoEnabled
    ? [
        { component: 'DC Fan', minutes: 0 },
        { component: 'Room LED', minutes: 0 },
        { component: 'Door Unlocked', minutes: 0 },
      ]
    : usageData?.chartData || [];

  return (
    <div className="space-y-6">
      {/* Range Selector */}
      <div className="sr-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-base font-semibold text-[#F5F5F5]">Historical Analytics</h2>
          <p className="text-xs text-[#A3A3A3]">
            Computed directly from persisted SQLite telemetry and security event logs (no fabricated data).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-[8px] px-3 py-1.5 text-xs font-semibold transition-colors ${
                range === r.key
                  ? 'bg-[#FACC15] text-[#101010]'
                  : 'border border-[#303030] bg-[#242424] text-[#A3A3A3] hover:text-[#F5F5F5]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Avg / Max Temperature"
          value={
            tempData?.temperatureStats?.avg !== null && tempData?.temperatureStats?.avg !== undefined
              ? `${tempData.temperatureStats.avg} °C`
              : '-- °C'
          }
          subtitle={
            tempData?.temperatureStats?.max !== null && tempData?.temperatureStats?.max !== undefined
              ? `Min ${tempData.temperatureStats.min}°C • Max ${tempData.temperatureStats.max}°C`
              : 'No samples in range'
          }
          icon={Thermometer}
          tone="yellow"
        />
        <StatCard
          title="DC Fan Active Duration"
          value={formatDurationSeconds(fanSeconds)}
          subtitle="Calculated from recorded state transitions"
          icon={Fan}
          tone="success"
        />
        <StatCard
          title="Room LED Active Duration"
          value={formatDurationSeconds(ledSeconds)}
          subtitle="Calculated from recorded state transitions"
          icon={Lightbulb}
          tone="yellow"
        />
        <StatCard
          title="Door Unlocked Duration"
          value={formatDurationSeconds(doorSeconds)}
          subtitle={`Total samples: ${tempData?.sampleCount ?? series.length}`}
          icon={Clock}
          tone="default"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="sr-card h-72 animate-pulse bg-[#1C1C1C]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 1. Temperature Over Time */}
          <div className="sr-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">Temperature Over Time (°C)</h3>
            {series.length === 0 ? (
              <EmptyState
                icon={Thermometer}
                title="No temperature history for selected range"
                description="Live hardware telemetry is sampled every 10 seconds when connected."
              />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <CartesianGrid stroke="#303030" strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#A3A3A3" fontSize={11} />
                    <YAxis stroke="#A3A3A3" fontSize={11} />
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
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 2. Ultrasonic Distance Over Time */}
          <div className="sr-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">
              Ultrasonic Distance Over Time (cm)
            </h3>
            {series.length === 0 ? (
              <EmptyState
                icon={Radar}
                title="No distance history for selected range"
                description="Distance samples will appear here as telemetry is persisted."
              />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid stroke="#303030" strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#A3A3A3" fontSize={11} />
                    <YAxis stroke="#A3A3A3" fontSize={11} />
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

          {/* 3. Successful vs Failed Authentications */}
          <div className="sr-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">
              Successful vs Failed Authentications
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={authComparison}>
                  <CartesianGrid stroke="#303030" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="#A3A3A3" fontSize={12} />
                  <YAxis stroke="#A3A3A3" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1C1C1C',
                      borderColor: '#303030',
                      color: '#F5F5F5',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="value" name="Attempts" fill="#FACC15" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. Daily Unauthorized Attempts */}
          <div className="sr-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">
              Daily Unauthorized Access Attempts
            </h3>
            {dailyUnauthorized.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="No unauthorized attempts in this window"
                description="Wrong keypad password and unrecognized face attempts are grouped daily here."
              />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyUnauthorized}>
                    <CartesianGrid stroke="#303030" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#A3A3A3" fontSize={11} />
                    <YAxis stroke="#A3A3A3" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1C1C1C',
                        borderColor: '#303030',
                        color: '#F5F5F5',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="wrongPassword"
                      name="Wrong Password"
                      stackId="a"
                      fill="#EF4444"
                    />
                    <Bar
                      dataKey="unknownFace"
                      name="Unauthorized Face"
                      stackId="a"
                      fill="#F59E0B"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 5. Fan & LED Usage Duration */}
          <div className="sr-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">
              Device Usage Duration (Minutes)
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageChart}>
                  <CartesianGrid stroke="#303030" strokeDasharray="3 3" />
                  <XAxis dataKey="component" stroke="#A3A3A3" fontSize={11} />
                  <YAxis stroke="#A3A3A3" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1C1C1C',
                      borderColor: '#303030',
                      color: '#F5F5F5',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="minutes" name="Active Minutes" fill="#22C55E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 6. Door Unlock Frequency */}
          <div className="sr-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">
              Door Unlock Frequency by Method
            </h3>
            {unlockFrequency.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No door unlock events in selected range"
                description="Keypad, Face Recognition, and Remote Dashboard unlocks will appear here."
              />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={unlockFrequency}>
                    <CartesianGrid stroke="#303030" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#A3A3A3" fontSize={11} />
                    <YAxis stroke="#A3A3A3" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1C1C1C',
                        borderColor: '#303030',
                        color: '#F5F5F5',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="keypad" name="Keypad" stackId="u" fill="#FACC15" />
                    <Bar dataKey="face" name="Face Recog" stackId="u" fill="#22C55E" />
                    <Bar dataKey="remote" name="Remote Web" stackId="u" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
