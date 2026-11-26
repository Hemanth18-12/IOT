import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { dashboardApi } from '../services/api';
import type {
  CommandRecord,
  DeviceState,
  DeviceWithState,
  NotificationItem,
  SecurityEvent,
  TelemetryPoint,
  ToastMessage,
} from '../types';
import { useAuth } from './AuthContext';

interface RealtimeContextValue {
  socketConnected: boolean;
  mqttConnected: boolean;
  device: DeviceWithState | null;
  unreadCount: number;
  latestCommand: CommandRecord | null;
  latestAlert: SecurityEvent | null;
  liveTelemetryPoint: TelemetryPoint | null;
  toasts: ToastMessage[];
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  dismissToast: (id: string) => void;
  addToast: (toast: Omit<ToastMessage, 'id' | 'createdAt'>) => void;
  refreshDeviceState: () => Promise<void>;
  subscribeEvent: (event: string, handler: (payload: unknown) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [socketConnected, setSocketConnected] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [device, setDevice] = useState<DeviceWithState | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestCommand, setLatestCommand] = useState<CommandRecord | null>(null);
  const [latestAlert, setLatestAlert] = useState<SecurityEvent | null>(null);
  const [liveTelemetryPoint, setLiveTelemetryPoint] = useState<TelemetryPoint | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id' | 'createdAt'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const item: ToastMessage = {
      ...toast,
      id,
      createdAt: new Date().toISOString(),
    };
    setToasts((prev) => [item, ...prev].slice(0, 5));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const refreshDeviceState = useCallback(async () => {
    if (!token) return;
    try {
      const overview = await dashboardApi.getOverview();
      setDevice(overview.device);
      setMqttConnected(overview.mqttConnected);
      setUnreadCount(overview.unreadNotifications);
      setLatestAlert(overview.latestAlert);
    } catch {
      // Handled by pages/interceptors
    }
  }, [token]);

  const subscribeEvent = useCallback((event: string, handler: (payload: unknown) => void) => {
    let set = listenersRef.current.get(event);
    if (!set) {
      set = new Set();
      listenersRef.current.set(event, set);
    }
    set.add(handler);
    return () => {
      listenersRef.current.get(event)?.delete(handler);
    };
  }, []);

  const dispatchLocal = (event: string, payload: unknown) => {
    listenersRef.current.get(event)?.forEach((fn) => fn(payload));
  };

  useEffect(() => {
    if (!token || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocketConnected(false);
      setDevice(null);
      setUnreadCount(0);
      return;
    }

    void refreshDeviceState();

    const socketUrlEnv = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim();
    const socket = io(socketUrlEnv || window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      void refreshDeviceState();
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('telemetry:update', (payload: { deviceId?: string; device: Record<string, unknown>; state: DeviceState }) => {
      if (payload?.state) {
        setDevice((prev) => {
          if (!prev || prev.deviceId !== payload.state.deviceId) return prev;
          return {
            ...prev,
            online: true,
            stale: false,
            lastSeen: payload.state.updatedAt,
            state: payload.state,
          };
        });
        if (payload.state.temperature !== null && payload.state.distance !== null) {
          setLiveTelemetryPoint((prevPoint) => {
            const targetDeviceId =
              (import.meta.env.VITE_DEFAULT_DEVICE_ID as string | undefined) || 'smartroom-01';
            if (payload.state.deviceId !== targetDeviceId) return prevPoint;
            return {
              id: `live-${Date.now()}`,
              deviceId: payload.state.deviceId,
              temperature: payload.state.temperature!,
              distance: payload.state.distance!,
              fanState: payload.state.fanState,
              ledState: payload.state.ledState,
              doorUnlocked: payload.state.doorUnlocked,
              buzzerState: payload.state.buzzerState,
              timestamp: payload.state.updatedAt,
            };
          });
        }
      }
      dispatchLocal('telemetry:update', payload);
    });

    socket.on('device:state', (payload: { device?: Partial<DeviceWithState>; state?: DeviceState }) => {
      if (payload?.state) {
        setDevice((prev) => {
          if (!prev || prev.deviceId !== payload.state!.deviceId) return prev;
          return {
            ...prev,
            online: payload.device?.online ?? prev.online,
            lastSeen: payload.device?.lastSeen ?? payload.state?.updatedAt ?? prev.lastSeen,
            stale: false,
            state: payload.state ?? prev.state,
          };
        });
      }
      dispatchLocal('device:state', payload);
    });

    socket.on('device:online', (payload: { device?: DeviceWithState }) => {
      const targetId = payload.device?.deviceId;
      setDevice((prev) => {
        if (!prev || (targetId && prev.deviceId !== targetId)) return prev;
        return {
          ...prev,
          online: true,
          stale: false,
          lastSeen: payload.device?.lastSeen || new Date().toISOString(),
        };
      });
      addToast({
        title: 'Hardware Online',
        message: `${targetId || 'SmartRoom NodeMCU'} reconnected to MQTT broker.`,
        variant: 'success',
      });
      dispatchLocal('device:online', payload);
    });

    socket.on('device:offline', (payload: { device?: DeviceWithState; reason?: string }) => {
      const targetId = payload.device?.deviceId;
      setDevice((prev) => {
        if (!prev || (targetId && prev.deviceId !== targetId)) return prev;
        return { ...prev, online: false, stale: true };
      });
      addToast({
        title: 'Hardware Offline',
        message: payload?.reason || 'NodeMCU disconnected. Remote lock controls disabled.',
        variant: 'warning',
      });
      dispatchLocal('device:offline', payload);
    });

    socket.on('buzzer:state', (payload: { deviceId?: string; buzzerState: boolean; updatedAt: string }) => {
      setDevice((prev) => {
        if (!prev || !prev.state || (payload.deviceId && prev.deviceId !== payload.deviceId)) {
          return prev;
        }
        return {
          ...prev,
          state: { ...prev.state, buzzerState: payload.buzzerState, updatedAt: payload.updatedAt },
        };
      });
      dispatchLocal('buzzer:state', payload);
    });

    socket.on('security:alert', (payload: { event: SecurityEvent }) => {
      if (payload?.event) {
        setLatestAlert(payload.event);
        const isHigh = payload.event.severity === 'HIGH' || payload.event.severity === 'CRITICAL';
        addToast({
          title: payload.event.eventType.replace(/_/g, ' '),
          message: payload.event.description,
          variant: isHigh ? 'error' : 'info',
        });
      }
      dispatchLocal('security:alert', payload);
    });

    socket.on(
      'notification:new',
      (payload: { notification: NotificationItem; unreadCount: number }) => {
        if (typeof payload?.unreadCount === 'number') {
          setUnreadCount(payload.unreadCount);
        }
        dispatchLocal('notification:new', payload);
      },
    );

    socket.on('command:status', (payload: { command: CommandRecord; state?: DeviceState }) => {
      if (payload?.command) {
        setLatestCommand(payload.command);
        if (payload.command.status === 'ACKNOWLEDGED') {
          addToast({
            title: `Door ${payload.command.commandType === 'UNLOCK' ? 'Unlocked' : 'Locked'}`,
            message: 'Confirmed by Arduino hardware.',
            variant: 'success',
          });
        } else if (payload.command.status === 'TIMEOUT' || payload.command.status === 'FAILED') {
          addToast({
            title: `Command ${payload.command.status}`,
            message: payload.command.failureReason || 'Hardware did not confirm command.',
            variant: 'error',
          });
        }
      }
      if (payload?.state) {
        setDevice((prev) =>
          prev && prev.deviceId === payload.state!.deviceId
            ? { ...prev, state: payload.state ?? prev.state }
            : prev,
        );
      }
      dispatchLocal('command:status', payload);
    });

    socket.on(
      'email:status',
      (payload: { status: string; subject: string; recipient: string; errorMessage?: string }) => {
        if (payload?.status === 'SENT') {
          addToast({
            title: 'Email Accepted by SMTP',
            message: `Sent "${payload.subject}" to ${payload.recipient}`,
            variant: 'info',
          });
        } else if (payload?.status === 'FAILED') {
          addToast({
            title: 'Email Delivery Failed',
            message: payload.errorMessage || `Could not send email to ${payload.recipient}`,
            variant: 'error',
          });
        }
        dispatchLocal('email:status', payload);
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user, addToast, refreshDeviceState]);

  // Periodically check staleness and health
  useEffect(() => {
    if (!token || !user) return;
    const interval = window.setInterval(() => {
      setDevice((prev) => {
        if (!prev || !prev.online) return prev;
        const ref = prev.state?.updatedAt || prev.lastSeen;
        if (!ref) return prev;
        const stale = Date.now() - new Date(ref).getTime() > 20000;
        return stale === prev.stale ? prev : { ...prev, stale };
      });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [token, user]);

  return (
    <RealtimeContext.Provider
      value={{
        socketConnected,
        mqttConnected,
        device,
        unreadCount,
        latestCommand,
        latestAlert,
        liveTelemetryPoint,
        toasts,
        setUnreadCount,
        dismissToast,
        addToast,
        refreshDeviceState,
        subscribeEvent,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
};

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used inside RealtimeProvider');
  }
  return ctx;
}
