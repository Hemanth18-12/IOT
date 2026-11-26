import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  Cpu,
  FlaskConical,
  History,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { StatusBadge } from '../components/StatusBadge';
import { ToastContainer } from '../components/ToastContainer';
import { useAuth } from '../context/AuthContext';
import { useDemoMode } from '../context/DemoModeContext';
import { useSmartRoomState } from '../hooks/useSmartRoomState';
import { formatDateTime, formatRelativeTime } from '../utils/format';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/devices', label: 'Device Controls', icon: Cpu },
  { to: '/security', label: 'Security', icon: ShieldAlert },
  { to: '/activity', label: 'Activity History', icon: History },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/about', label: 'About Project', icon: Info },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Control Dashboard',
  '/devices': 'Device Controls',
  '/security': 'Security Center',
  '/activity': 'Activity History',
  '/analytics': 'Sensor & Security Analytics',
  '/notifications': 'Notification Center',
  '/settings': 'System Settings',
  '/about': 'About SmartRoom Project',
};

export const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const demo = useDemoMode();
  const { device, socketConnected, mqttConnected, unreadCount } = useSmartRoomState();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const pageTitle = PAGE_TITLES[location.pathname] || 'SmartRoom Console';
  const isHardwareOnline = Boolean(device?.online);
  const isStale = Boolean(device?.stale);

  const systemHealth = demo.demoEnabled
    ? { label: 'Demo Mode', variant: 'yellow' as const }
    : !socketConnected
      ? { label: 'Backend Disconnected', variant: 'error' as const }
      : !mqttConnected
        ? { label: 'MQTT Disconnected', variant: 'warning' as const }
        : !isHardwareOnline
          ? { label: 'Hardware Offline', variant: 'warning' as const }
          : { label: 'System Healthy', variant: 'success' as const };

  return (
    <div className="flex min-h-screen bg-[#101010] text-[#F5F5F5]">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#303030] bg-[#141414] transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#303030] px-4">
          <BrandLogo />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-[#A3A3A3] hover:bg-[#242424] hover:text-[#F5F5F5] lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#FACC15] text-[#101010] font-semibold'
                      : 'text-[#A3A3A3] hover:bg-[#242424] hover:text-[#F5F5F5]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </span>
                    {item.to === '/notifications' && unreadCount > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          isActive
                            ? 'bg-[#101010] text-[#FACC15]'
                            : 'bg-[#EF4444] text-white'
                        }`}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-[#303030] p-3">
          {demo.demoAllowed && (
            <button
              type="button"
              onClick={() => demo.setDemoEnabled(!demo.demoEnabled)}
              className={`flex w-full items-center justify-between rounded-[10px] border px-3 py-2 text-xs font-semibold transition-colors ${
                demo.demoEnabled
                  ? 'border-[#FACC15] bg-[#FACC15]/15 text-[#FACC15]'
                  : 'border-[#303030] bg-[#1C1C1C] text-[#A3A3A3] hover:text-[#F5F5F5]'
              }`}
            >
              <span className="flex items-center gap-2">
                <FlaskConical className="h-3.5 w-3.5" />
                Demo Mode
              </span>
              <span>{demo.demoEnabled ? 'ON' : 'OFF'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-2.5 rounded-[10px] border border-[#303030] bg-[#1C1C1C] px-3 py-2 text-sm font-medium text-[#A3A3A3] transition-colors hover:border-[#EF4444]/40 hover:text-[#FCA5A5]"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 flex-wrap items-center justify-between gap-3 border-b border-[#303030] bg-[#141414] px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-[#303030] bg-[#1C1C1C] p-2 text-[#F5F5F5] hover:bg-[#242424] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-[#F5F5F5] sm:text-base">{pageTitle}</h1>
              <div className="hidden text-xs text-[#A3A3A3] sm:block">
                {formatDateTime(clock)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 md:flex">
              <StatusBadge
                label={isHardwareOnline ? 'Node Online' : 'Node Offline'}
                variant={isHardwareOnline ? 'success' : 'error'}
                dot
              />
              <StatusBadge
                label={systemHealth.label}
                variant={systemHealth.variant}
              />
            </div>

            <div className="hidden text-right xl:block">
              <div className="text-[11px] text-[#A3A3A3]">Last Hardware Update</div>
              <div className="text-xs font-medium text-[#F5F5F5]">
                {formatRelativeTime(device?.state?.updatedAt || device?.lastSeen)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/notifications')}
              aria-label="Open notifications"
              className="relative rounded-[10px] border border-[#303030] bg-[#1C1C1C] p-2 text-[#F5F5F5] hover:bg-[#242424]"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <div className="flex items-center gap-2 rounded-[10px] border border-[#303030] bg-[#1C1C1C] px-2.5 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FACC15] text-xs font-bold text-[#101010]">
                {(user?.name || 'A').charAt(0).toUpperCase()}
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-xs font-semibold text-[#F5F5F5] leading-none">
                  {user?.name || 'Admin'}
                </div>
                <div className="mt-0.5 text-[10px] text-[#A3A3A3] leading-none">
                  {user?.role || 'ADMIN'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* System Connection / Demo Mode Banners */}
        {demo.demoEnabled && (
          <div className="border-b border-[#FACC15]/40 bg-[#FACC15]/10 px-4 py-2.5 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-[#FACC15]">
                <FlaskConical className="h-4 w-4 shrink-0" />
                <span className="font-bold tracking-wide">DEMO MODE ACTIVE:</span>
                <span className="text-[#F5F5F5]">
                  Showing simulated readings only. Live SQLite records, real SMTP emails, and physical hardware commands are disabled.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={demo.simulateHandGesture}
                  className="rounded-md border border-[#303030] bg-[#1C1C1C] px-2.5 py-1 text-xs font-medium text-[#F5F5F5] hover:bg-[#242424]"
                >
                  Simulate Hand Gesture
                </button>
                <button
                  type="button"
                  onClick={demo.simulateWrongPassword}
                  className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/15 px-2.5 py-1 text-xs font-medium text-[#FCA5A5] hover:bg-[#EF4444]/25"
                >
                  Wrong Password
                </button>
                <button
                  type="button"
                  onClick={demo.simulateUnknownFace}
                  className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/15 px-2.5 py-1 text-xs font-medium text-[#FCA5A5] hover:bg-[#EF4444]/25"
                >
                  Unknown Face
                </button>
                <button
                  type="button"
                  onClick={demo.toggleSimulatedOffline}
                  className="rounded-md border border-[#303030] bg-[#1C1C1C] px-2.5 py-1 text-xs font-medium text-[#F5F5F5] hover:bg-[#242424]"
                >
                  {demo.demoDevice.online ? 'Simulate Offline' : 'Simulate Online'}
                </button>
                <button
                  type="button"
                  onClick={() => demo.setDemoEnabled(false)}
                  className="rounded-md bg-[#FACC15] px-2.5 py-1 text-xs font-semibold text-[#101010] hover:bg-[#EAB308]"
                >
                  Exit Demo
                </button>
              </div>
            </div>
          </div>
        )}

        {!demo.demoEnabled && !socketConnected && (
          <div className="border-b border-[#EF4444]/40 bg-[#EF4444]/15 px-4 py-2 text-xs text-[#FCA5A5] lg:px-6">
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 shrink-0 text-[#EF4444]" />
              <span>
                <strong>Backend WebSocket Disconnected:</strong> Attempting automatic reconnection. Displayed sensor values may not be live.
              </span>
            </div>
          </div>
        )}

        {!demo.demoEnabled && socketConnected && !isHardwareOnline && (
          <div className="border-b border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-2 text-xs text-[#FCD34D] lg:px-6">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 shrink-0 text-[#F59E0B]" />
              <span>
                <strong>Device Offline ({device?.deviceId || 'smartroom-01'}):</strong>{' '}
                {device?.lastSeen
                  ? `Showing stale readings from ${formatDateTime(device.lastSeen)}.`
                  : 'Waiting for first hardware MQTT telemetry.'}{' '}
                Remote door controls are disabled; Arduino keypad, Python face serial, ultrasonic fan/LED, buzzer &amp; 10s auto-lock continue operating locally.
              </span>
            </div>
          </div>
        )}

        {!demo.demoEnabled && socketConnected && isHardwareOnline && isStale && (
          <div className="border-b border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-2 text-xs text-[#FCD34D] lg:px-6">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 shrink-0 text-[#F59E0B]" />
              <span>
                <strong>Stale Telemetry Warning:</strong> No fresh telemetry received in the last 20 seconds.
              </span>
            </div>
          </div>
        )}

        {/* Routed Page Content */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
};
