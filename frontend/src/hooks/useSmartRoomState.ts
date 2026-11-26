import { useCallback, useState } from 'react';
import { useDemoMode } from '../context/DemoModeContext';
import { useRealtime } from '../context/RealtimeContext';
import { devicesApi } from '../services/api';
import type { CommandRecord } from '../types';

export function useSmartRoomState() {
  const realtime = useRealtime();
  const demo = useDemoMode();
  const [commandError, setCommandError] = useState<string | null>(null);
  const [localCommand, setLocalCommand] = useState<CommandRecord | null>(null);
  const [issuingCommand, setIssuingCommand] = useState(false);

  const activeDevice = demo.demoEnabled ? demo.demoDevice : realtime.device;
  const activeCommand = demo.demoEnabled
    ? demo.demoCommand
    : realtime.latestCommand &&
        localCommand &&
        realtime.latestCommand.id === localCommand.id
      ? realtime.latestCommand
      : localCommand || realtime.latestCommand;

  const issueUnlock = useCallback(async () => {
    setCommandError(null);
    if (demo.demoEnabled) {
      demo.simulateDoorUnlock();
      return;
    }
    if (!activeDevice?.online) {
      setCommandError('Hardware node is offline. Remote unlock is disabled.');
      return;
    }
    setIssuingCommand(true);
    try {
      const cmd = await devicesApi.unlock(activeDevice.deviceId);
      setLocalCommand(cmd);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to dispatch unlock command';
      setCommandError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIssuingCommand(false);
    }
  }, [activeDevice, demo]);

  const issueLock = useCallback(async () => {
    setCommandError(null);
    if (demo.demoEnabled) {
      demo.simulateDoorLock();
      return;
    }
    if (!activeDevice?.online) {
      setCommandError('Hardware node is offline. Remote lock is disabled.');
      return;
    }
    setIssuingCommand(true);
    try {
      const cmd = await devicesApi.lock(activeDevice.deviceId);
      setLocalCommand(cmd);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to dispatch lock command';
      setCommandError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIssuingCommand(false);
    }
  }, [activeDevice, demo]);

  return {
    demoEnabled: demo.demoEnabled,
    device: activeDevice,
    command: activeCommand,
    commandError,
    issuingCommand,
    socketConnected: realtime.socketConnected,
    mqttConnected: realtime.mqttConnected,
    unreadCount: demo.demoEnabled
      ? demo.demoNotifications.filter((n) => !n.isRead).length
      : realtime.unreadCount,
    issueUnlock,
    issueLock,
    clearCommandError: () => setCommandError(null),
  };
}
