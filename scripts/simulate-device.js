#!/usr/bin/env node
/**
 * SmartRoom MQTT Hardware Simulator (Isolated from physical device smartroom-01)
 *
 * Connects to the real authenticated local Mosquitto broker using deviceId
 * "smartroom-sim-01" by default so simulated records are clearly marked
 * [SIMULATOR] and real SMTP alerts are suppressed on the backend.
 *
 * Usage:
 *   node scripts/simulate-device.js                  # Interactive simulator
 *   node scripts/simulate-device.js --auto-test      # Automated end-to-end MQTT scenario test
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mqtt = require(path.join(__dirname, '../backend/node_modules/mqtt'));

function readEnvVal(key) {
  const envPath = path.join(__dirname, '../backend/.env');
  if (!fs.existsSync(envPath)) return '';
  const match = fs.readFileSync(envPath, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883';
const deviceId = process.env.DEVICE_ID || 'smartroom-sim-01';
const username = process.env.MQTT_USERNAME || 'smartroom_simulator';
const password = process.env.MQTT_PASSWORD || readEnvVal('MQTT_SIM_PASSWORD');
const autoTest = process.argv.includes('--auto-test');

const state = {
  temperature: 27.4,
  distance: 28.5,
  fan: false,
  led: false,
  doorUnlocked: false,
  buzzer: false,
};

const client = mqtt.connect(brokerUrl, {
  clientId: `sim-${deviceId}-${process.pid}`,
  username: username || undefined,
  password: password || undefined,
  will: {
    topic: `smartroom/${deviceId}/availability`,
    payload: JSON.stringify({ deviceId, online: false, simulated: true }),
    qos: 1,
    retain: true,
  },
});

let seq = 0;
let autoLockTimer = null;
let buzzerTimer = null;

function publishTelemetry() {
  if (!client.connected) return;
  client.publish(
    `smartroom/${deviceId}/telemetry`,
    JSON.stringify({
      deviceId,
      simulated: true,
      firmwareVersion: '1.0.0-sim',
      ...state,
    }),
  );
}

function publishEvent(event, severity, message) {
  if (!client.connected) return;
  seq += 1;
  const eventId = `${deviceId}-${Date.now()}-${seq}`;
  client.publish(
    `smartroom/${deviceId}/events`,
    JSON.stringify({
      eventId,
      deviceId,
      simulated: true,
      event,
      severity,
      message: `[SIMULATOR] ${message}`,
    }),
  );
}

function triggerBuzzer5s() {
  state.buzzer = true;
  publishTelemetry();
  if (buzzerTimer) clearTimeout(buzzerTimer);
  buzzerTimer = setTimeout(() => {
    state.buzzer = false;
    publishEvent('BUZZER_OFF', 'LOW', '5-second buzzer alarm completed');
    publishTelemetry();
  }, 5000);
}

function scheduleAutoLock10s() {
  if (autoLockTimer) clearTimeout(autoLockTimer);
  autoLockTimer = setTimeout(() => {
    if (state.doorUnlocked) {
      state.doorUnlocked = false;
      publishEvent('DOOR_LOCKED', 'LOW', 'Door auto-locked after 10 seconds');
      publishTelemetry();
    }
  }, 10000);
}

client.on('connect', () => {
  console.log(`[SimDevice] Connected to ${brokerUrl} as ${deviceId} (user=${username})`);
  client.subscribe(`smartroom/${deviceId}/commands`, { qos: 1 });
  client.subscribe(`smartroom/${deviceId}/events/ack`);

  client.publish(
    `smartroom/${deviceId}/availability`,
    JSON.stringify({ deviceId, online: true, simulated: true, firmwareVersion: '1.0.0-sim' }),
    { qos: 1, retain: true },
  );
  publishTelemetry();

  if (autoTest) {
    void runAutomatedScenario();
  }
});

client.on('error', (err) => {
  console.error('[SimDevice] MQTT error:', err.message);
});

client.on('message', (topic, buf) => {
  const msg = JSON.parse(buf.toString('utf8'));
  if (topic.endsWith('/commands')) {
    console.log('[SimDevice] Received command:', msg);
    setTimeout(() => {
      state.doorUnlocked = msg.action === 'UNLOCK';
      if (state.doorUnlocked) {
        state.buzzer = false;
        scheduleAutoLock10s();
      }
      client.publish(
        `smartroom/${deviceId}/ack`,
        JSON.stringify({
          commandId: msg.commandId,
          action: msg.action,
          success: true,
          doorUnlocked: state.doorUnlocked,
        }),
      );
      publishTelemetry();
    }, 350);
  } else if (topic.endsWith('/events/ack')) {
    console.log('[SimDevice] Event ACK received:', msg.eventId);
  }
});

async function runAutomatedScenario() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(600);
  state.temperature = 28.4;
  state.distance = 24.5;
  publishTelemetry();
  await sleep(600);

  // Ultrasonic hand gesture ON
  state.distance = 6.2;
  state.fan = true;
  state.led = true;
  publishEvent('LED_ON', 'LOW', 'Ultrasonic hand gesture toggled fan & LED ON');
  publishTelemetry();
  await sleep(700);

  // Hand removed (fan & LED stay ON)
  state.distance = 25.0;
  publishTelemetry();
  await sleep(700);

  // Wrong password -> 5s buzzer
  publishEvent('WRONG_PASSWORD', 'HIGH', 'Incorrect keypad password entered');
  triggerBuzzer5s();
  await sleep(700);

  // Unauthorized face -> restarts buzzer
  publishEvent('UNKNOWN_FACE', 'HIGH', 'Unauthorized face detected by camera');
  triggerBuzzer5s();
  await sleep(700);

  // Valid password unlock -> stops buzzer early
  state.buzzer = false;
  if (buzzerTimer) clearTimeout(buzzerTimer);
  state.doorUnlocked = true;
  publishEvent('UNLOCK_PASSWORD', 'LOW', 'Door unlocked via keypad PIN');
  publishTelemetry();
  await sleep(700);

  // Ultrasonic toggle OFF
  state.distance = 5.4;
  state.fan = false;
  state.led = false;
  publishEvent('LED_OFF', 'LOW', 'Ultrasonic hand gesture toggled fan & LED OFF');
  publishTelemetry();
  await sleep(700);

  // Cleanly lock door
  state.doorUnlocked = false;
  publishEvent('DOOR_LOCKED', 'LOW', 'Door locked');
  publishTelemetry();

  console.log('[SimDevice] Automated scenario published. Waiting 1.5s for ACKs...');
  await sleep(1500);
  client.publish(
    `smartroom/${deviceId}/availability`,
    JSON.stringify({ deviceId, online: false, simulated: true }),
    { qos: 1, retain: true },
    () => {
      client.end(true);
      process.exit(0);
    },
  );
}

if (!autoTest) {
  setInterval(() => {
    state.temperature = Number((26.5 + Math.random() * 2.5).toFixed(2));
    state.distance = Number((18 + Math.random() * 18).toFixed(2));
    publishTelemetry();
  }, 4000);

  console.log('Interactive keys: [g] gesture toggle | [w] wrong password | [f] unknown face | [u] keypad unlock | [l] lock | [q] quit');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (line) => {
    const cmd = line.trim().toLowerCase();
    if (cmd === 'g') {
      state.fan = !state.fan;
      state.led = state.fan;
      publishEvent(state.led ? 'LED_ON' : 'LED_OFF', 'LOW', `Gesture toggled Fan/LED ${state.fan ? 'ON' : 'OFF'}`);
      publishTelemetry();
    } else if (cmd === 'w') {
      publishEvent('WRONG_PASSWORD', 'HIGH', 'Incorrect keypad password entered');
      triggerBuzzer5s();
    } else if (cmd === 'f') {
      publishEvent('UNKNOWN_FACE', 'HIGH', 'Unauthorized face detected by camera');
      triggerBuzzer5s();
    } else if (cmd === 'u') {
      state.buzzer = false;
      if (buzzerTimer) clearTimeout(buzzerTimer);
      state.doorUnlocked = true;
      publishEvent('UNLOCK_PASSWORD', 'LOW', 'Door unlocked via keypad');
      scheduleAutoLock10s();
      publishTelemetry();
    } else if (cmd === 'l') {
      state.doorUnlocked = false;
      publishEvent('DOOR_LOCKED', 'LOW', 'Door locked');
      publishTelemetry();
    } else if (cmd === 'q') {
      process.emit('SIGINT');
    }
  });
}

process.on('SIGINT', () => {
  client.publish(
    `smartroom/${deviceId}/availability`,
    JSON.stringify({ deviceId, online: false, simulated: true }),
    { qos: 1, retain: true },
    () => process.exit(0),
  );
});
