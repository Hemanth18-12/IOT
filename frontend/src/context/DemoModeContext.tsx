import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type {
  CommandRecord,
  DeviceWithState,
  NotificationItem,
  SecurityEvent,
  TelemetryPoint,
} from '../types';

interface DemoModeContextValue {
  demoAllowed: boolean;
  demoEnabled: boolean;
  setDemoEnabled: (enabled: boolean) => void;
  demoDevice: DeviceWithState;
  demoTelemetry: TelemetryPoint[];
  demoEvents: SecurityEvent[];
  demoNotifications: NotificationItem[];
  demoCommand: CommandRecord | null;
  simulateDoorUnlock: () => void;
  simulateDoorLock: () => void;
  simulateHandGesture: () => void;
  simulateWrongPassword: () => void;
  simulateUnknownFace: () => void;
  toggleSimulatedOffline: () => void;
  markDemoNotificationRead: (id: string) => void;
  markAllDemoNotificationsRead: () => void;
  resetDemo: () => void;
}

const DemoModeContext = createContext<DemoModeContextValue | undefined>(undefined);

function makeInitialDemoDevice(): DeviceWithState {
  const now = new Date().toISOString();
  return {
    id: 'demo-device-uuid',
    deviceId: 'smartroom-01-demo',
    name: 'SmartRoom Demo Hardware (Simulated)',
    online: true,
    lastSeen: now,
    firmwareVersion: '1.0.0-demo',
    createdAt: now,
    updatedAt: now,
    stale: false,
    state: {
      id: 'demo-state-uuid',
      deviceId: 'smartroom-01-demo',
      temperature: 27.8,
      distance: 32.4,
      fanState: false,
      ledState: false,
      doorUnlocked: false,
      buzzerState: false,
      updatedAt: now,
    },
  };
}

function makeInitialTelemetry(): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const baseMs = Date.now() - 12 * 60000;
  for (let i = 0; i < 12; i++) {
    points.push({
      id: `demo-tel-${i}`,
      deviceId: 'smartroom-01-demo',
      temperature: Number((27.2 + Math.sin(i * 0.5) * 0.9).toFixed(2)),
      distance: Number((28 + Math.cos(i * 0.6) * 8).toFixed(2)),
      fanState: false,
      ledState: false,
      doorUnlocked: false,
      buzzerState: false,
      timestamp: new Date(baseMs + i * 60000).toISOString(),
    });
  }
  return points;
}

export const DemoModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const demoAllowed = import.meta.env.VITE_ENABLE_DEMO_MODE !== 'false';
  const [demoEnabled, setDemoEnabledState] = useState(false);
  const [demoDevice, setDemoDevice] = useState<DeviceWithState>(makeInitialDemoDevice);
  const [demoTelemetry, setDemoTelemetry] = useState<TelemetryPoint[]>(makeInitialTelemetry);
  const [demoEvents, setDemoEvents] = useState<SecurityEvent[]>([]);
  const [demoNotifications, setDemoNotifications] = useState<NotificationItem[]>([]);
  const [demoCommand, setDemoCommand] = useState<CommandRecord | null>(null);

  const autoLockTimerRef = useRef<number | null>(null);
  const buzzerTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (autoLockTimerRef.current) {
      window.clearTimeout(autoLockTimerRef.current);
      autoLockTimerRef.current = null;
    }
    if (buzzerTimerRef.current) {
      window.clearTimeout(buzzerTimerRef.current);
      buzzerTimerRef.current = null;
    }
  };

  const setDemoEnabled = useCallback((enabled: boolean) => {
    if (!demoAllowed) return;
    if (!enabled) clearTimers();
    setDemoEnabledState(enabled);
  }, [demoAllowed]);

  useEffect(() => {
    if (!demoEnabled) return;

    const timer = window.setInterval(() => {
      setDemoDevice((prev) => {
        if (!prev.online || !prev.state) return prev;
        const now = new Date().toISOString();
        const nextTemp = Number(
          Math.min(39, Math.max(22, (prev.state.temperature ?? 27.5) + (Math.random() - 0.48) * 0.5)).toFixed(2),
        );
        const nextDist = Number(
          Math.min(80, Math.max(14, (prev.state.distance ?? 25) + (Math.random() - 0.5) * 4.2)).toFixed(2),
        );
        const nextState = {
          ...prev.state,
          temperature: nextTemp,
          distance: nextDist,
          updatedAt: now,
        };
        setDemoTelemetry((hist) => [
          ...hist.slice(-39),
          {
            id: `demo-tel-${Date.now()}`,
            deviceId: prev.deviceId,
            temperature: nextTemp,
            distance: nextDist,
            fanState: nextState.fanState,
            ledState: nextState.ledState,
            doorUnlocked: nextState.doorUnlocked,
            buzzerState: nextState.buzzerState,
            timestamp: now,
          },
        ]);
        return { ...prev, lastSeen: now, state: nextState };
      });
    }, 3000);

    return () => window.clearInterval(timer);
  }, [demoEnabled]);

  const pushDemoEvent = useCallback(
    (
      eventType: string,
      authenticationMethod: string,
      severity: SecurityEvent['severity'],
      description: string,
      notify = true,
    ) => {
      const now = new Date().toISOString();
      const id = `demo-evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const ev: SecurityEvent = {
        id,
        externalEventId: id,
        deviceId: 'smartroom-01-demo',
        eventType,
        authenticationMethod,
        severity,
        description: `[DEMO] ${description}`,
        timestamp: now,
        emailStatus: 'SKIPPED_DISABLED',
      };
      setDemoEvents((prev) => [ev, ...prev].slice(0, 100));

      if (notify) {
        const notif: NotificationItem = {
          id: `demo-notif-${Date.now()}`,
          userId: 'demo',
          eventId: id,
          eventType,
          title: `[DEMO] ${eventType.replace(/_/g, ' ')}`,
          message: ev.description,
          severity,
          isRead: false,
          createdAt: now,
        };
        setDemoNotifications((prev) => [notif, ...prev].slice(0, 50));
      }
    },
    [],
  );

  const simulateDoorLock = useCallback(() => {
    if (!demoDevice.online) return;
    const cmdId = `demo-cmd-${Date.now()}`;
    const now = new Date().toISOString();
    setDemoCommand({
      id: cmdId,
      deviceId: 'smartroom-01-demo',
      userId: 'demo',
      commandType: 'LOCK',
      status: 'PENDING',
      createdAt: now,
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      acknowledgedAt: null,
      failureReason: null,
    });

    window.setTimeout(() => {
      const ackNow = new Date().toISOString();
      setDemoCommand((c) =>
        c && c.id === cmdId ? { ...c, status: 'ACKNOWLEDGED', acknowledgedAt: ackNow } : c,
      );
      setDemoDevice((prev) =>
        prev.state
          ? { ...prev, state: { ...prev.state, doorUnlocked: false, updatedAt: ackNow } }
          : prev,
      );
      pushDemoEvent('DOOR_LOCKED', 'REMOTE_WEB', 'LOW', 'Simulated door locked via dashboard', false);
    }, 650);
  }, [demoDevice.online, pushDemoEvent]);

  const simulateDoorUnlock = useCallback(() => {
    if (!demoDevice.online) return;
    if (autoLockTimerRef.current) window.clearTimeout(autoLockTimerRef.current);
    const cmdId = `demo-cmd-${Date.now()}`;
    const now = new Date().toISOString();
    setDemoCommand({
      id: cmdId,
      deviceId: 'smartroom-01-demo',
      userId: 'demo',
      commandType: 'UNLOCK',
      status: 'PENDING',
      createdAt: now,
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      acknowledgedAt: null,
      failureReason: null,
    });

    window.setTimeout(() => {
      const ackNow = new Date().toISOString();
      setDemoCommand((c) =>
        c && c.id === cmdId ? { ...c, status: 'ACKNOWLEDGED', acknowledgedAt: ackNow } : c,
      );
      setDemoDevice((prev) =>
        prev.state
          ? {
              ...prev,
              state: { ...prev.state, doorUnlocked: true, buzzerState: false, updatedAt: ackNow },
            }
          : prev,
      );
      pushDemoEvent(
        'UNLOCK_REMOTE',
        'REMOTE_WEB',
        'LOW',
        'Simulated door unlocked (auto-locks in 10 seconds; no real hardware or email triggered)',
      );

      autoLockTimerRef.current = window.setTimeout(() => {
        const lockNow = new Date().toISOString();
        setDemoDevice((prev) =>
          prev.state
            ? { ...prev, state: { ...prev.state, doorUnlocked: false, updatedAt: lockNow } }
            : prev,
        );
        pushDemoEvent('DOOR_LOCKED', 'AUTO_LOCK', 'LOW', 'Simulated 10-second auto-lock completed', false);
      }, 10000);
    }, 700);
  }, [demoDevice.online, pushDemoEvent]);

  const simulateHandGesture = useCallback(() => {
    setDemoDevice((prev) => {
      if (!prev.state) return prev;
      const nextOn = !prev.state.fanState;
      const now = new Date().toISOString();
      pushDemoEvent(
        nextOn ? 'LED_ON' : 'LED_OFF',
        'ULTRASONIC',
        'LOW',
        `Simulated hand gesture (6.2 cm) toggled Fan & LED ${nextOn ? 'ON' : 'OFF'}`,
        false,
      );
      return {
        ...prev,
        state: {
          ...prev.state,
          distance: 6.2,
          fanState: nextOn,
          ledState: nextOn,
          updatedAt: now,
        },
      };
    });
  }, [pushDemoEvent]);

  const triggerSimulatedBuzzer = useCallback(() => {
    if (buzzerTimerRef.current) window.clearTimeout(buzzerTimerRef.current);
    setDemoDevice((prev) =>
      prev.state
        ? { ...prev, state: { ...prev.state, buzzerState: true, updatedAt: new Date().toISOString() } }
        : prev,
    );
    buzzerTimerRef.current = window.setTimeout(() => {
      setDemoDevice((prev) =>
        prev.state
          ? { ...prev, state: { ...prev.state, buzzerState: false, updatedAt: new Date().toISOString() } }
          : prev,
      );
    }, 5000);
  }, []);

  const simulateWrongPassword = useCallback(() => {
    triggerSimulatedBuzzer();
    pushDemoEvent(
      'WRONG_PASSWORD',
      'KEYPAD',
      'HIGH',
      'Simulated wrong keypad password entered — 5s buzzer active (real email disabled in demo)',
    );
  }, [pushDemoEvent, triggerSimulatedBuzzer]);

  const simulateUnknownFace = useCallback(() => {
    triggerSimulatedBuzzer();
    pushDemoEvent(
      'UNKNOWN_FACE',
      'FACE_RECOGNITION',
      'HIGH',
      'Simulated unauthorized face detected — 5s buzzer active (real email disabled in demo)',
    );
  }, [pushDemoEvent, triggerSimulatedBuzzer]);

  const toggleSimulatedOffline = useCallback(() => {
    setDemoDevice((prev) => {
      const nextOnline = !prev.online;
      if (!nextOnline) {
        pushDemoEvent(
          'DEVICE_OFFLINE',
          'SYSTEM',
          'HIGH',
          'Simulated hardware disconnection — remote controls disabled',
        );
      } else {
        pushDemoEvent('DEVICE_ONLINE', 'SYSTEM', 'LOW', 'Simulated hardware reconnected', false);
      }
      return { ...prev, online: nextOnline, stale: !nextOnline };
    });
  }, [pushDemoEvent]);

  const markDemoNotificationRead = useCallback((id: string) => {
    setDemoNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  }, []);

  const markAllDemoNotificationsRead = useCallback(() => {
    setDemoNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const resetDemo = useCallback(() => {
    clearTimers();
    setDemoDevice(makeInitialDemoDevice());
    setDemoTelemetry(makeInitialTelemetry());
    setDemoEvents([]);
    setDemoNotifications([]);
    setDemoCommand(null);
  }, []);

  return (
    <DemoModeContext.Provider
      value={{
        demoAllowed,
        demoEnabled,
        setDemoEnabled,
        demoDevice,
        demoTelemetry,
        demoEvents,
        demoNotifications,
        demoCommand,
        simulateDoorUnlock,
        simulateDoorLock,
        simulateHandGesture,
        simulateWrongPassword,
        simulateUnknownFace,
        toggleSimulatedOffline,
        markDemoNotificationRead,
        markAllDemoNotificationsRead,
        resetDemo,
      }}
    >
      {children}
    </DemoModeContext.Provider>
  );
};

export function useDemoMode(): DemoModeContextValue {
  const ctx = useContext(DemoModeContext);
  if (!ctx) {
    throw new Error('useDemoMode must be used inside DemoModeProvider');
  }
  return ctx;
}
