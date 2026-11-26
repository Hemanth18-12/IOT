import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DemoModeProvider } from './context/DemoModeContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AboutProjectPage } from './pages/AboutProjectPage';
import { ActivityHistoryPage } from './pages/ActivityHistoryPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceControlsPage } from './pages/DeviceControlsPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SecurityPage } from './pages/SecurityPage';
import { SettingsPage } from './pages/SettingsPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#101010] text-sm text-[#A3A3A3]">
        Loading SmartRoom session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DemoModeProvider>
          <RealtimeProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="devices" element={<DeviceControlsPage />} />
                <Route path="security" element={<SecurityPage />} />
                <Route path="activity" element={<ActivityHistoryPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="about" element={<AboutProjectPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </RealtimeProvider>
        </DemoModeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
