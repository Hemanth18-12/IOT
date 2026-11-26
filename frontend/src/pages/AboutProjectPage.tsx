import React, { useState } from 'react';
import { Cpu, Edit3, Layers, Plus, RotateCcw, Shield, Trash2, Users } from 'lucide-react';
import { MobileQrCard } from '../components/MobileQrCard';

interface TeamMember {
  id: string;
  name: string;
  rollNumber: string;
  role: string;
}

const STORAGE_KEY = 'smartroom_team_members_v1';

const DEFAULT_TEAM: TeamMember[] = [
  { id: '1', name: 'Student Member 1', rollNumber: 'Roll No. 01', role: 'Embedded Systems & Arduino' },
  { id: '2', name: 'Student Member 2', rollNumber: 'Roll No. 02', role: 'NodeMCU MQTT & Backend API' },
  { id: '3', name: 'Student Member 3', rollNumber: 'Roll No. 03', role: 'React Dashboard & UI/UX' },
  { id: '4', name: 'Student Member 4', rollNumber: 'Roll No. 04', role: 'OpenCV Face Recognition & Testing' },
];

const HARDWARE_PIN_ROWS = [
  { component: 'USB Face Serial (Laptop)', mcu: 'Arduino Uno', pins: 'D0 (RX), D1 (TX)', notes: '9600 baud (A/R/L commands)' },
  { component: '4x4 Matrix Keypad', mcu: 'Arduino Uno', pins: 'Rows D2–D5, Cols D6–D9', notes: 'PIN 1234, # submit, * clear, D lock' },
  { component: 'HC-SR04 Ultrasonic', mcu: 'Arduino Uno', pins: 'TRIG D10, ECHO D11', notes: '2–10 cm toggle, 3x >=12 cm clear' },
  { component: 'Door Lock Servo', mcu: 'Arduino Uno', pins: 'D12 (External 5V PSU)', notes: '0° locked, 90° unlocked, detach 700ms' },
  { component: 'DC Fan Motor Driver', mcu: 'Arduino Uno', pins: 'D13', notes: 'Protected driver, independent of Wi-Fi' },
  { component: 'LM35 Temperature Sensor', mcu: 'Arduino Uno', pins: 'A0', notes: 'Analog 10mV/°C to Celsius' },
  { component: 'External Room LED', mcu: 'Arduino Uno', pins: 'A1 (220Ω resistor)', notes: 'Ultrasonic gesture toggle' },
  { component: 'SoftwareSerial Link', mcu: 'Arduino ↔ NodeMCU', pins: 'A2/A3 ↔ D1(GPIO5)/D2(GPIO4)', notes: '9600 baud, 1k/2k divider on A3→D2' },
  { component: '16x2 I2C LCD', mcu: 'Arduino Uno', pins: 'A4 (SDA), A5 (SCL)', notes: 'Displays masked PIN & status' },
  { component: 'Status LED & Active Buzzer', mcu: 'NodeMCU ESP8266', pins: 'D4 (GPIO2), D5 (GPIO14)', notes: '5s non-blocking alarm on intrusions' },
];

export const AboutProjectPage: React.FC = () => {
  const [team, setTeam] = useState<TeamMember[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as TeamMember[]) : DEFAULT_TEAM;
    } catch {
      return DEFAULT_TEAM;
    }
  });
  const [editing, setEditing] = useState(false);

  const persistTeam = (next: TeamMember[]) => {
    setTeam(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const updateMember = (id: string, field: keyof TeamMember, value: string) => {
    persistTeam(team.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const addMember = () => {
    persistTeam([
      ...team,
      { id: String(Date.now()), name: 'New Team Member', rollNumber: 'Roll No.', role: 'Contributor' },
    ]);
  };

  const removeMember = (id: string) => {
    persistTeam(team.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="sr-card p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#FACC15]">
          <Shield className="h-4 w-4" />
          B.Tech IoT Project Documentation
        </div>
        <h2 className="mt-2 text-xl font-bold text-[#F5F5F5]">
          SmartRoom — Intelligent IoT Control and Security System
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#A3A3A3]">
          SmartRoom is a self-hosted, full-stack IoT security and room automation platform built to replace generic cloud apps like Blynk with a custom dark-themed control center, authenticated NestJS REST &amp; Socket.IO backend, Eclipse Mosquitto MQTT broker, SQLite historical database, and real SMTP email alerts while preserving autonomous local hardware operation.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="sr-elevated p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FACC15]">
              Core Objectives
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs text-[#D4D4D4]">
              <li>• Real-time temperature &amp; ultrasonic distance telemetry</li>
              <li>• Multi-factor room entry: Keypad, Face Recognition, Remote Web</li>
              <li>• Non-blocking 5s intruder alarm &amp; instant SMTP email alerts</li>
              <li>• Persistent activity history, CSV export &amp; usage analytics</li>
            </ul>
          </div>

          <div className="sr-elevated p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FACC15]">
              Software Stack
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs text-[#D4D4D4]">
              <li>• Frontend: React, Vite, TypeScript, Tailwind CSS, Recharts</li>
              <li>• Backend: NestJS, TypeORM, SQLite, JWT + bcrypt, Nodemailer</li>
              <li>• Messaging: Eclipse Mosquitto MQTT + Socket.IO WebSockets</li>
              <li>• Firmware: Arduino Uno C++ &amp; ESP8266 PubSubClient</li>
            </ul>
          </div>

          <div className="sr-elevated p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FACC15]">
              Offline Resilience
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs text-[#D4D4D4]">
              <li>• Keypad entry &amp; 10s servo auto-lock operate without Wi-Fi</li>
              <li>• Ultrasonic fan &amp; LED toggle works independently on Arduino</li>
              <li>• Local 5s buzzer activates over Arduino-NodeMCU Serial</li>
              <li>• Remote unlock disabled offline (never queued dangerously)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* System Architecture Flow */}
      <div className="sr-card p-6">
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#FACC15]" />
          <h3 className="text-base font-semibold text-[#F5F5F5]">System Architecture &amp; Workflow</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {[
            {
              step: '1. Hardware Layer',
              desc: 'Arduino Uno reads LM35, HC-SR04, 4x4 Keypad, drives Servo/Fan/LED/LCD, and receives A/R/L from laptop OpenCV via USB.',
            },
            {
              step: '2. Gateway Layer',
              desc: 'NodeMCU ESP8266 bridges Arduino SoftwareSerial (9600 baud) to authenticated Mosquitto MQTT topics and triggers the D5 buzzer.',
            },
            {
              step: '3. Backend & Storage',
              desc: 'NestJS validates JSON telemetry, deduplicates events, updates SQLite via TypeORM, tracks command ACKs, and sends SMTP alerts.',
            },
            {
              step: '4. Dashboard UI',
              desc: 'React client authenticates with JWT, streams live updates via Socket.IO, requires confirmation for door unlocks, and renders charts.',
            },
          ].map((item) => (
            <div key={item.step} className="sr-elevated p-4">
              <div className="text-xs font-bold text-[#FACC15]">{item.step}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-[#A3A3A3]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Hardware Pin Mapping */}
      <div className="sr-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#303030] p-5">
          <Cpu className="h-4 w-4 text-[#FACC15]" />
          <h3 className="text-base font-semibold text-[#F5F5F5]">Hardware Pin Configuration</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#303030] bg-[#141414] text-[#A3A3A3]">
                <th className="px-4 py-3 font-semibold">Component</th>
                <th className="px-4 py-3 font-semibold">Controller</th>
                <th className="px-4 py-3 font-semibold">Pin Mapping</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#303030]">
              {HARDWARE_PIN_ROWS.map((row) => (
                <tr key={row.component}>
                  <td className="px-4 py-3 font-semibold text-[#F5F5F5]">{row.component}</td>
                  <td className="px-4 py-3 text-[#FACC15]">{row.mcu}</td>
                  <td className="px-4 py-3 font-mono text-[#D4D4D4]">{row.pins}</td>
                  <td className="px-4 py-3 text-[#A3A3A3]">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advantages, Limitations, Future Improvements */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="sr-card p-5">
          <h3 className="text-sm font-semibold text-[#22C55E]">Advantages</h3>
          <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-[#A3A3A3]">
            <li>• Zero vendor lock-in or Blynk virtual-pin limits</li>
            <li>• Local SQLite persistence &amp; CSV audit exports</li>
            <li>• Command correlation + expiration prevents stale unlocks</li>
            <li>• Works on desktop and mobile phones across local Wi-Fi</li>
          </ul>
        </div>
        <div className="sr-card p-5">
          <h3 className="text-sm font-semibold text-[#F59E0B]">Known Limitations</h3>
          <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-[#A3A3A3]">
            <li>• College prototype — not a certified commercial security product</li>
            <li>• Python OpenCV face recognition is a demonstration module (not liveness-hardened biometrics)</li>
            <li>• No physical reed switch; door state reflects commanded servo angle</li>
            <li>• Physical latch must hold without continuous servo torque after 700ms detach</li>
          </ul>
        </div>
        <div className="sr-card p-5">
          <h3 className="text-sm font-semibold text-[#FACC15]">Future Improvements</h3>
          <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-[#A3A3A3]">
            <li>• Add magnetic reed switch for verified closed/ajar door sensing</li>
            <li>• Enable TLS MQTT (8883) &amp; HTTPS reverse proxy for remote access</li>
            <li>• Migrate SQLite seamlessly to PostgreSQL via TypeORM config</li>
            <li>• Add optional relay override mode in Arduino firmware if needed</li>
          </ul>
        </div>
      </div>

      {/* Editable Team Members */}
      <div className="sr-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#FACC15]" />
            <div>
              <h3 className="text-sm font-semibold text-[#F5F5F5]">Project Team Members</h3>
              <p className="text-xs text-[#A3A3A3]">
                Customize names, roll numbers, and roles for your evaluation demo (saved locally).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editing && (
              <>
                <button type="button" onClick={addMember} className="sr-btn-secondary py-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => persistTeam(DEFAULT_TEAM)}
                  className="sr-btn-secondary py-1.5 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="sr-btn-primary py-1.5 text-xs"
            >
              <Edit3 className="h-3.5 w-3.5" />
              {editing ? 'Done Editing' : 'Edit Team'}
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((member) => (
            <div key={member.id} className="sr-elevated space-y-2 p-4">
              {editing ? (
                <>
                  <input
                    className="sr-input py-1.5 text-xs"
                    value={member.name}
                    onChange={(e) => updateMember(member.id, 'name', e.target.value)}
                    placeholder="Full Name"
                  />
                  <input
                    className="sr-input py-1.5 text-xs"
                    value={member.rollNumber}
                    onChange={(e) => updateMember(member.id, 'rollNumber', e.target.value)}
                    placeholder="Roll Number"
                  />
                  <input
                    className="sr-input py-1.5 text-xs"
                    value={member.role}
                    onChange={(e) => updateMember(member.id, 'role', e.target.value)}
                    placeholder="Role"
                  />
                  {team.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      className="inline-flex items-center gap-1 text-xs text-[#FCA5A5] hover:underline"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-[#F5F5F5]">{member.name}</div>
                  <div className="font-mono text-xs text-[#FACC15]">{member.rollNumber}</div>
                  <div className="text-xs text-[#A3A3A3]">{member.role}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <MobileQrCard />
    </div>
  );
};
