import React, { useState } from 'react';
import {
  Cpu,
  Fan,
  Info,
  Lightbulb,
  Loader2,
  Lock,
  LockOpen,
  Radar,
  Router,
  Thermometer,
  Volume2,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { StatusBadge } from '../components/StatusBadge';
import { useSmartRoomState } from '../hooks/useSmartRoomState';
import { formatDateTime, formatRelativeTime } from '../utils/format';

export const DeviceControlsPage: React.FC = () => {
  const {
    device,
    command,
    commandError,
    issuingCommand,
    issueUnlock,
    issueLock,
    clearCommandError,
  } = useSmartRoomState();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const state = device?.state;
  const isOnline = Boolean(device?.online);
  const lastUpdated = state?.updatedAt || device?.lastSeen;
  const controlsDisabled = !isOnline || issuingCommand || command?.status === 'PENDING';

  return (
    <div className="space-y-6">
      <div className="sr-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h2 className="text-base font-semibold text-[#F5F5F5]">
            Hardware Component Inventory &amp; Controls
          </h2>
          <p className="mt-1 text-xs text-[#A3A3A3]">
            Node ID: <span className="font-mono text-[#FACC15]">{device?.deviceId || 'smartroom-01'}</span> • Last update:{' '}
            {formatDateTime(lastUpdated)}
          </p>
        </div>
        <StatusBadge
          label={isOnline ? 'Hardware Connected' : 'Hardware Offline'}
          variant={isOnline ? 'success' : 'error'}
          dot
        />
      </div>

      {/* Hardware Architecture Note */}
      <div className="flex items-start gap-3 rounded-[12px] border border-[#FACC15]/35 bg-[#FACC15]/10 p-4 text-xs leading-relaxed text-[#F5F5F5]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#FACC15]" />
        <div>
          <strong className="text-[#FACC15]">Hardware-Accurate Control Policy:</strong> The DC Fan (Arduino D13) and Room LED (Arduino A1) are controlled locally by your tested HC-SR04 ultrasonic hand-gesture logic so they work reliably even without Wi-Fi. Therefore, they are shown as read-only live status indicators without fake toggle buttons. Optional remote fan/LED override requires adding dedicated serial/MQTT command handlers in firmware and remains disabled by default.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 1. Smart Door Lock (Functional Control) */}
        <div className="sr-card flex flex-col justify-between p-5 md:col-span-2">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#FACC15]/40 bg-[#FACC15]/10 text-[#FACC15]">
                  {state?.doorUnlocked ? <LockOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F5F5]">Smart Door Lock (Servo)</h3>
                  <p className="text-xs text-[#A3A3A3]">Arduino Pin D12 • 0° Locked / 90° Unlocked</p>
                </div>
              </div>
              <StatusBadge
                label={state?.doorUnlocked ? 'UNLOCKED' : 'LOCKED'}
                variant={state?.doorUnlocked ? 'warning' : 'success'}
                dot
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="sr-elevated p-2.5">
                <div className="text-[#A3A3A3]">Auto-Lock</div>
                <div className="mt-0.5 font-semibold text-[#F5F5F5]">10 seconds</div>
              </div>
              <div className="sr-elevated p-2.5">
                <div className="text-[#A3A3A3]">Last Update</div>
                <div className="mt-0.5 font-semibold text-[#F5F5F5]">
                  {formatRelativeTime(lastUpdated)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={() => setConfirmOpen(true)}
                className="sr-btn-primary flex-1"
              >
                {command?.status === 'PENDING' && command.commandType === 'UNLOCK' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Pending ACK...
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
                className="sr-btn-secondary flex-1"
              >
                {command?.status === 'PENDING' && command.commandType === 'LOCK' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Pending ACK...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Lock Door
                  </>
                )}
              </button>
            </div>
            {commandError && (
              <div className="flex items-center justify-between text-xs text-[#FCA5A5]">
                <span>{commandError}</span>
                <button type="button" onClick={clearCommandError} className="underline">
                  Dismiss
                </button>
              </div>
            )}
            <p className="text-[11px] text-[#A3A3A3]">
              Reports commanded servo position; physical door-ajar position is not monitored by a separate reed sensor.
            </p>
          </div>
        </div>

        {/* 2. DC Fan (Read-only ultrasonic state) */}
        <div className="sr-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#303030] bg-[#242424] text-[#22C55E]">
                  <Fan className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F5F5]">DC Fan</h3>
                  <p className="text-xs text-[#A3A3A3]">Arduino Pin D13 (Motor Driver)</p>
                </div>
              </div>
              <StatusBadge
                label={state?.fanState ? 'ON' : 'OFF'}
                variant={state?.fanState ? 'success' : 'neutral'}
                dot
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#A3A3A3]">
              Toggled locally by hand gesture (2–10 cm). Remains ON after hand removal until the next gesture.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#303030] pt-3 text-xs text-[#A3A3A3]">
            <span>Mode: Read-only (Ultrasonic)</span>
            <span>{formatRelativeTime(lastUpdated)}</span>
          </div>
        </div>

        {/* 3. Room LED (Read-only ultrasonic state) */}
        <div className="sr-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#303030] bg-[#242424] text-[#FACC15]">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F5F5]">External Room LED</h3>
                  <p className="text-xs text-[#A3A3A3]">Arduino Pin A1 (220Ω Resistor)</p>
                </div>
              </div>
              <StatusBadge
                label={state?.ledState ? 'ON' : 'OFF'}
                variant={state?.ledState ? 'yellow' : 'neutral'}
                dot
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#A3A3A3]">
              Paired with DC fan ultrasonic toggle. Continues operating independently without Wi-Fi or internet.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#303030] pt-3 text-xs text-[#A3A3A3]">
            <span>Mode: Read-only (Ultrasonic)</span>
            <span>{formatRelativeTime(lastUpdated)}</span>
          </div>
        </div>

        {/* 4. Ultrasonic Sensor */}
        <div className="sr-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#303030] bg-[#242424] text-[#F5F5F5]">
                  <Radar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F5F5]">HC-SR04 Ultrasonic</h3>
                  <p className="text-xs text-[#A3A3A3]">TRIG D10 • ECHO D11</p>
                </div>
              </div>
              <StatusBadge
                label={
                  state?.distance !== null &&
                  state?.distance !== undefined &&
                  state.distance >= 2 &&
                  state.distance < 10
                    ? 'Hand Detected'
                    : 'Clear'
                }
                variant={
                  state?.distance !== null &&
                  state?.distance !== undefined &&
                  state.distance >= 2 &&
                  state.distance < 10
                    ? 'yellow'
                    : 'neutral'
                }
              />
            </div>
            <div className="mt-3 text-2xl font-bold text-[#F5F5F5]">
              {state?.distance !== null && state?.distance !== undefined
                ? state.distance === 0
                  ? 'No echo'
                  : `${state.distance.toFixed(1)} cm`
                : '-- cm'}
            </div>
            <p className="mt-1 text-xs text-[#A3A3A3]">
              100 ms sampling; requires 3 clear readings (&ge;12 cm or no echo) to re-arm.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#303030] pt-3 text-xs text-[#A3A3A3]">
            <span>Connectivity: {isOnline ? 'Streaming' : 'Offline'}</span>
            <span>{formatRelativeTime(lastUpdated)}</span>
          </div>
        </div>

        {/* 5. LM35 Temperature Sensor */}
        <div className="sr-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#303030] bg-[#242424] text-[#FACC15]">
                  <Thermometer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F5F5]">LM35 Temperature</h3>
                  <p className="text-xs text-[#A3A3A3]">Arduino Analog Pin A0</p>
                </div>
              </div>
              <StatusBadge
                label={
                  state?.temperature !== null &&
                  state?.temperature !== undefined &&
                  state.temperature >= 35
                    ? 'Elevated'
                    : 'Normal'
                }
                variant={
                  state?.temperature !== null &&
                  state?.temperature !== undefined &&
                  state.temperature >= 35
                    ? 'warning'
                    : 'success'
                }
              />
            </div>
            <div className="mt-3 text-2xl font-bold text-[#F5F5F5]">
              {state?.temperature !== null && state?.temperature !== undefined
                ? `${state.temperature.toFixed(1)} °C`
                : '-- °C'}
            </div>
            <p className="mt-1 text-xs text-[#A3A3A3]">
              10 mV/°C analog sensing converted to Celsius and logged every 10 seconds.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#303030] pt-3 text-xs text-[#A3A3A3]">
            <span>Connectivity: {isOnline ? 'Streaming' : 'Offline'}</span>
            <span>{formatRelativeTime(lastUpdated)}</span>
          </div>
        </div>

        {/* 6. Active Buzzer */}
        <div className="sr-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#303030] bg-[#242424] text-[#EF4444]">
                  <Volume2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F5F5]">Active Buzzer</h3>
                  <p className="text-xs text-[#A3A3A3]">NodeMCU Pin D5 / GPIO14</p>
                </div>
              </div>
              <StatusBadge
                label={state?.buzzerState ? 'ALARM ON' : 'INACTIVE'}
                variant={state?.buzzerState ? 'error' : 'neutral'}
                dot
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#A3A3A3]">
              Activates for 5 seconds (non-blocking millis timer) on wrong keypad password or unauthorized face. Silenced early on valid unlock.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#303030] pt-3 text-xs text-[#A3A3A3]">
            <span>Works offline via Serial</span>
            <span>{formatRelativeTime(lastUpdated)}</span>
          </div>
        </div>

        {/* 7. Arduino Uno */}
        <div className="sr-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#303030] bg-[#242424] text-[#F5F5F5]">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F5F5F5]">Arduino Uno</h3>
                  <p className="text-xs text-[#A3A3A3]">Primary Sensor &amp; Lock MCU</p>
                </div>
              </div>
              <StatusBadge
                label={isOnline ? 'Reporting' : 'Unreachable via Wi-Fi'}
                variant={isOnline ? 'success' : 'warning'}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#A3A3A3]">
              Manages 4x4 keypad (D2–D9), I2C LCD (A4/A5), USB Python face serial (D0/D1 @ 9600), and SoftwareSerial link to NodeMCU (A2/A3 @ 9600).
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#303030] pt-3 text-xs text-[#A3A3A3]">
            <span>Autonomous offline operation</span>
            <span>{formatRelativeTime(lastUpdated)}</span>
          </div>
        </div>

        {/* 8. NodeMCU ESP8266 */}
        <div className="sr-card flex flex-col justify-between p-5 md:col-span-2 xl:col-span-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#FACC15]/40 bg-[#FACC15]/10 text-[#FACC15]">
                <Router className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#F5F5F5]">
                  NodeMCU ESP8266 Wi-Fi &amp; MQTT Gateway ({device?.deviceId || 'smartroom-01'})
                </h3>
                <p className="text-xs text-[#A3A3A3]">
                  SoftwareSerial D1/D2 (9600 baud, 1k/2k divider on D2) • Status LED D4 • Buzzer D5 • Firmware: {device?.firmwareVersion || 'Pending'}
                </p>
              </div>
            </div>
            <StatusBadge
              label={isOnline ? 'MQTT Connected' : 'MQTT Offline'}
              variant={isOnline ? 'success' : 'error'}
              dot
            />
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm Remote Door Unlock"
        description="This action sends a signed, non-retained MQTT UNLOCK command to the physical Arduino Uno door servo. Confirm you want to unlock the door now?"
        confirmLabel="Confirm Unlock"
        loading={issuingCommand}
        onConfirm={() => {
          setConfirmOpen(false);
          void issueUnlock();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
