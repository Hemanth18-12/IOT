import axios from 'axios';
import type {
  CommandRecord,
  DashboardOverview,
  DeviceWithState,
  NotificationItem,
  SecurityEvent,
  SettingsView,
  TelemetryPoint,
  User,
} from '../types';

export const TOKEN_KEY = 'smartroom_jwt_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string, rememberMe: boolean): void {
  clearStoredToken();
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

const envApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export const API_BASE_URL = envApiUrl ? `${envApiUrl.replace(/\/$/, '')}/api` : '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
      clearStoredToken();
      window.dispatchEvent(new Event('smartroom:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login: async (payload: { email: string; password: string; rememberMe?: boolean }) => {
    const { data } = await api.post<{ accessToken: string; expiresIn: string; user: User }>(
      '/auth/login',
      payload,
    );
    return data;
  },
  logout: async () => {
    const { data } = await api.post('/auth/logout');
    return data;
  },
  me: async () => {
    const { data } = await api.get<{ user: User }>('/auth/me');
    return data;
  },
  changePassword: async (payload: { currentPassword: string; newPassword: string }) => {
    const { data } = await api.post<{ message: string }>('/auth/change-password', payload);
    return data;
  },
};

export const dashboardApi = {
  getOverview: async (deviceId?: string) => {
    const { data } = await api.get<DashboardOverview>('/dashboard/overview', {
      params: deviceId ? { deviceId } : undefined,
    });
    return data;
  },
};

export const devicesApi = {
  list: async () => {
    const { data } = await api.get<DeviceWithState[]>('/devices');
    return data;
  },
  getStatus: async (deviceId: string) => {
    const { data } = await api.get<DeviceWithState>(`/devices/${encodeURIComponent(deviceId)}/status`);
    return data;
  },
  unlock: async (deviceId: string) => {
    const { data } = await api.post<CommandRecord>(
      `/devices/${encodeURIComponent(deviceId)}/unlock`,
      { confirmed: true },
    );
    return data;
  },
  lock: async (deviceId: string) => {
    const { data } = await api.post<CommandRecord>(
      `/devices/${encodeURIComponent(deviceId)}/lock`,
      { confirmed: true },
    );
    return data;
  },
  getCommand: async (commandId: string) => {
    const { data } = await api.get<CommandRecord>(`/commands/${encodeURIComponent(commandId)}`);
    return data;
  },
};

export const telemetryApi = {
  getHistory: async (params: { deviceId?: string; range?: string; limit?: number }) => {
    const { data } = await api.get<{
      deviceId: string;
      from: string;
      to: string;
      count: number;
      items: TelemetryPoint[];
    }>('/telemetry/history', { params });
    return data;
  },
};

export const eventsApi = {
  list: async (params: Record<string, string | number | undefined>) => {
    const { data } = await api.get<{
      items: SecurityEvent[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>('/events', { params });
    return data;
  },
  exportCsv: async (params: Record<string, string | number | undefined>) => {
    const response = await api.get<Blob>('/events/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};

export const notificationsApi = {
  list: async (params: Record<string, string | number | boolean | undefined>) => {
    const { data } = await api.get<{
      items: NotificationItem[];
      total: number;
      unreadCount: number;
      page: number;
      limit: number;
      totalPages: number;
    }>('/notifications', { params });
    return data;
  },
  markRead: async (id: string) => {
    const { data } = await api.patch<{ notification: NotificationItem; unreadCount: number }>(
      `/notifications/${encodeURIComponent(id)}/read`,
    );
    return data;
  },
  markAllRead: async () => {
    const { data } = await api.patch<{ updatedCount: number; unreadCount: number }>(
      '/notifications/read-all',
    );
    return data;
  },
};

export const settingsApi = {
  get: async () => {
    const { data } = await api.get<SettingsView>('/settings');
    return data;
  },
  update: async (payload: Record<string, unknown>) => {
    const { data } = await api.patch<SettingsView>('/settings', payload);
    return data;
  },
  testEmail: async (recipientEmail?: string) => {
    const { data } = await api.post<{
      accepted: boolean;
      status: string;
      message: string;
    }>('/settings/test-email', recipientEmail ? { recipientEmail } : {});
    return data;
  },
  verifySmtp: async () => {
    const { data } = await api.post<{ ok: boolean; message: string }>('/settings/verify-smtp');
    return data;
  },
};

export const analyticsApi = {
  getTemperature: async (range: string, deviceId?: string) => {
    const { data } = await api.get('/analytics/temperature', {
      params: { range, ...(deviceId ? { deviceId } : {}) },
    });
    return data;
  },
  getSecurity: async (range: string, deviceId?: string) => {
    const { data } = await api.get('/analytics/security', {
      params: { range, ...(deviceId ? { deviceId } : {}) },
    });
    return data;
  },
  getDeviceUsage: async (range: string, deviceId?: string) => {
    const { data } = await api.get('/analytics/device-usage', {
      params: { range, ...(deviceId ? { deviceId } : {}) },
    });
    return data;
  },
};

export const healthApi = {
  check: async () => {
    const { data } = await api.get<{
      status: string;
      database: string;
      mqttConnected: boolean;
      lanIp: string | null;
      mobileUrl: string | null;
      uptimeSeconds: number;
      timestamp: string;
    }>('/health');
    return data;
  },
};
