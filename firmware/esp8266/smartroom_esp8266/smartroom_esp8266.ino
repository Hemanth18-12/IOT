/*
 * SmartRoom Intelligent IoT Control and Security System
 * NodeMCU ESP8266 Firmware (smartroom_esp8266.ino)
 *
 * Preserved Hardware Pin Configuration:
 *   D1 (GPIO5) : SoftwareSerial TX -> Arduino A2
 *   D2 (GPIO4) : SoftwareSerial RX <- Arduino A3 (via 1k-ohm + 2k-ohm voltage divider!)
 *   D4 (GPIO2) : Built-in connection indicator LED (active LOW on NodeMCU)
 *   D5 (GPIO14): Active buzzer signal (active HIGH, 3.3V-compatible module/driver)
 *
 * IMPORTANT NETWORK NOTE:
 *   NEVER set MQTT_BROKER_IP to "localhost" or "127.0.0.1"!
 *   Inside NodeMCU, localhost refers to the ESP8266 chip itself.
 *   Set MQTT_BROKER_IP to your computer's LAN IPv4 address (e.g., 192.168.1.25).
 *
 * Required Arduino IDE Libraries:
 *   - ESP8266WiFi (ESP8266 Board Package)
 *   - PubSubClient (by Nick O'Leary)
 *   - SoftwareSerial (ESP8266 Board Package)
 *   - ArduinoJson (v6 or v7 by Benoit Blanchon)
 */

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <SoftwareSerial.h>
#include <ArduinoJson.h>
#include <time.h>

// -------------------- USER CONFIGURATION --------------------
#if __has_include("secrets.h")
#include "secrets.h"
#endif

#ifndef WIFI_SSID
#define WIFI_SSID         "YOUR_WIFI_SSID"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD     "YOUR_WIFI_PASSWORD"
#endif
// Computer LAN IP running Mosquitto broker (NOT localhost!)
#ifndef MQTT_BROKER_IP
#define MQTT_BROKER_IP    "10.247.220.74"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT         1883
#endif
#ifndef MQTT_USERNAME
#define MQTT_USERNAME     "smartroom_device"
#endif
#ifndef MQTT_PASSWORD
#define MQTT_PASSWORD     "YOUR_MQTT_DEVICE_PASSWORD"
#endif
#ifndef DEVICE_ID
#define DEVICE_ID         "smartroom-01"
#endif
const char* FIRMWARE_VERSION  = "1.0.0";

// Configurable buzzer mode (pin D5 / GPIO14):
//   1 = Active-HIGH module (GPIO HIGH sounds buzzer; default)
//   2 = Active-LOW module  (GPIO LOW sounds buzzer)
//   3 = Passive buzzer     (2400 Hz tone() square-wave signal)
#define BUZZER_MODE_ACTIVE_HIGH 1
#define BUZZER_MODE_ACTIVE_LOW  2
#define BUZZER_MODE_PASSIVE_PWM 3

#ifndef BUZZER_MODE
#define BUZZER_MODE BUZZER_MODE_ACTIVE_HIGH
#endif
#define PASSIVE_BUZZER_FREQ_HZ 2400

// -------------------- Pin Mapping (DO NOT MODIFY) --------------------
const uint8_t ARD_TX_PIN = D1; // GPIO5 -> Arduino A2
const uint8_t ARD_RX_PIN = D2; // GPIO4 <- Arduino A3 (through voltage divider)
const uint8_t STATUS_LED = D4; // GPIO2 (active LOW on ESP8266)
const uint8_t BUZZER_PIN = D5; // GPIO14 (active HIGH)

// -------------------- Timing Constants --------------------
const unsigned long BUZZER_ALARM_MS       = 5000UL;
const unsigned long WIFI_RETRY_MS         = 5000UL;
const unsigned long MQTT_RETRY_MS         = 5000UL;
const unsigned long HEARTBEAT_INTERVAL_MS = 10000UL;
const unsigned long CMD_ACK_TIMEOUT_MS    = 5000UL;
const unsigned long EVENT_RETRY_MS        = 3000UL;
const uint8_t MAX_EVENT_RETRIES           = 5;

// -------------------- Topics --------------------
String topicTelemetry;
String topicState;
String topicEvents;
String topicEventsAck;
String topicCommands;
String topicAck;
String topicAvailability;

// -------------------- Clients & Buffers --------------------
SoftwareSerial arduinoSerial(ARD_RX_PIN, ARD_TX_PIN); // RX=D2, TX=D1
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char serialBuf[96];
uint8_t serialIdx = 0;

// -------------------- Hardware State --------------------
float lastTemp = 25.0f;
float lastDist = 0.0f;
bool lastFanState = false;
bool lastLedState = false;
bool lastDoorUnlocked = false;
bool buzzerActive = false;
unsigned long buzzerStartedMs = 0;

// -------------------- Network Timers --------------------
unsigned long lastWifiAttemptMs = 0;
unsigned long lastMqttAttemptMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long bootCounter = 0;
uint32_t eventSeq = 0;

// -------------------- Command Correlation & Deduplication --------------------
const uint8_t DEDUP_RING_SIZE = 10;
char recentCmdIds[DEDUP_RING_SIZE][48];
uint8_t recentCmdCursor = 0;

bool pendingCmdActive = false;
char pendingCmdId[48] = "";
char pendingCmdAction[12] = "";
unsigned long pendingCmdStartMs = 0;

// -------------------- App-Level Event Retry Queue (QoS-0 Reliability) --------------------
struct PendingEvent {
  bool inUse;
  char eventId[48];
  char eventType[28];
  char severity[12];
  char message[96];
  unsigned long lastSentMs;
  uint8_t attempts;
};
const uint8_t MAX_PENDING_EVENTS = 6;
PendingEvent eventQueue[MAX_PENDING_EVENTS];

// -------------------- Helpers --------------------
void buildTopics() {
  String prefix = String("smartroom/") + DEVICE_ID;
  topicTelemetry    = prefix + "/telemetry";
  topicState        = prefix + "/state";
  topicEvents       = prefix + "/events";
  topicEventsAck    = prefix + "/events/ack";
  topicCommands     = prefix + "/commands";
  topicAck          = prefix + "/ack";
  topicAvailability = prefix + "/availability";
}

void setStatusLed(bool connected) {
  // NodeMCU D4 built-in LED is active LOW
  digitalWrite(STATUS_LED, connected ? LOW : HIGH);
}

bool wasCommandProcessed(const char* cmdId) {
  for (uint8_t i = 0; i < DEDUP_RING_SIZE; i++) {
    if (recentCmdIds[i][0] != '\0' && strcmp(recentCmdIds[i], cmdId) == 0) {
      return true;
    }
  }
  return false;
}

void rememberCommandId(const char* cmdId) {
  strncpy(recentCmdIds[recentCmdCursor], cmdId, sizeof(recentCmdIds[0]) - 1);
  recentCmdIds[recentCmdCursor][sizeof(recentCmdIds[0]) - 1] = '\0';
  recentCmdCursor = (recentCmdCursor + 1) % DEDUP_RING_SIZE;
}

void publishTelemetryJson(bool retainState = false) {
  if (!mqttClient.connected()) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<320> doc;
#endif
  doc["deviceId"] = DEVICE_ID;
  doc["temperature"] = roundf(lastTemp * 100.0f) / 100.0f;
  doc["distance"] = roundf(lastDist * 100.0f) / 100.0f;
  doc["fan"] = lastFanState;
  doc["led"] = lastLedState;
  doc["doorUnlocked"] = lastDoorUnlocked;
  doc["buzzer"] = buzzerActive;
  doc["firmwareVersion"] = FIRMWARE_VERSION;

  char out[320];
  size_t len = serializeJson(doc, out, sizeof(out));
  if (len > 0) {
    mqttClient.publish(topicTelemetry.c_str(), out, false);
    if (retainState) {
      mqttClient.publish(topicState.c_str(), out, true);
    }
  }
}

void publishAvailability(bool online) {
  if (!mqttClient.connected()) return;
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<160> doc;
#endif
  doc["deviceId"] = DEVICE_ID;
  doc["online"] = online;
  doc["firmwareVersion"] = FIRMWARE_VERSION;

  char out[160];
  serializeJson(doc, out, sizeof(out));
  mqttClient.publish(topicAvailability.c_str(), out, true);
}

void publishCommandAck(const char* cmdId, const char* action, bool success, bool unlocked, const char* reason = nullptr) {
  if (!mqttClient.connected()) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<256> doc;
#endif
  doc["commandId"] = cmdId;
  doc["action"] = action;
  doc["success"] = success;
  doc["doorUnlocked"] = unlocked;
  if (reason != nullptr && reason[0] != '\0') {
    doc["reason"] = reason;
  }

  char out[256];
  serializeJson(doc, out, sizeof(out));
  mqttClient.publish(topicAck.c_str(), out, false);
  Serial.print(F("[MQTT] Published ACK: "));
  Serial.println(out);
}

void publishEventItem(PendingEvent& ev) {
  if (!mqttClient.connected()) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<320> doc;
#endif
  doc["eventId"] = ev.eventId;
  doc["deviceId"] = DEVICE_ID;
  doc["event"] = ev.eventType;
  doc["severity"] = ev.severity;
  doc["message"] = ev.message;

  char out[320];
  serializeJson(doc, out, sizeof(out));
  mqttClient.publish(topicEvents.c_str(), out, false);
  ev.lastSentMs = millis();
  ev.attempts++;
}

void enqueueSecurityEvent(const char* eventType, const char* severity, const char* message) {
  eventSeq++;
  char idBuf[48];
  snprintf(idBuf, sizeof(idBuf), "%s-%lu-%lu", DEVICE_ID, bootCounter, (unsigned long)eventSeq);

  int slot = -1;
  for (uint8_t i = 0; i < MAX_PENDING_EVENTS; i++) {
    if (!eventQueue[i].inUse) {
      slot = i;
      break;
    }
  }
  if (slot == -1) {
    slot = 0; // Overwrite oldest slot if queue full
  }

  PendingEvent& ev = eventQueue[slot];
  ev.inUse = true;
  strncpy(ev.eventId, idBuf, sizeof(ev.eventId) - 1);
  strncpy(ev.eventType, eventType, sizeof(ev.eventType) - 1);
  strncpy(ev.severity, severity, sizeof(ev.severity) - 1);
  strncpy(ev.message, message, sizeof(ev.message) - 1);
  ev.eventId[sizeof(ev.eventId) - 1] = '\0';
  ev.eventType[sizeof(ev.eventType) - 1] = '\0';
  ev.severity[sizeof(ev.severity) - 1] = '\0';
  ev.message[sizeof(ev.message) - 1] = '\0';
  ev.attempts = 0;
  ev.lastSentMs = 0;

  if (mqttClient.connected()) {
    publishEventItem(ev);
  }
}

void processEventQueueRetries() {
  if (!mqttClient.connected()) return;
  unsigned long now = millis();
  for (uint8_t i = 0; i < MAX_PENDING_EVENTS; i++) {
    if (!eventQueue[i].inUse) continue;
    if (now - eventQueue[i].lastSentMs >= EVENT_RETRY_MS) {
      if (eventQueue[i].attempts >= MAX_EVENT_RETRIES) {
        eventQueue[i].inUse = false;
      } else {
        publishEventItem(eventQueue[i]);
      }
    }
  }
}

void ackPendingEvent(const char* eventId) {
  for (uint8_t i = 0; i < MAX_PENDING_EVENTS; i++) {
    if (eventQueue[i].inUse && strcmp(eventQueue[i].eventId, eventId) == 0) {
      eventQueue[i].inUse = false;
    }
  }
}

// -------------------- Non-Blocking Buzzer Control --------------------
void setBuzzerHardware(bool active) {
#if BUZZER_MODE == BUZZER_MODE_ACTIVE_HIGH
  digitalWrite(BUZZER_PIN, active ? HIGH : LOW);
#elif BUZZER_MODE == BUZZER_MODE_ACTIVE_LOW
  digitalWrite(BUZZER_PIN, active ? LOW : HIGH);
#elif BUZZER_MODE == BUZZER_MODE_PASSIVE_PWM
  if (active) {
    tone(BUZZER_PIN, PASSIVE_BUZZER_FREQ_HZ);
  } else {
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
  }
#endif
}

void startBuzzerAlarm() {
  buzzerActive = true;
  buzzerStartedMs = millis(); // Restarts 5s timer on repeated unauthorized attempts
  setBuzzerHardware(true);
  Serial.println(F("BUZZER ON - 5 SECONDS"));
  publishTelemetryJson(true);
}

void stopBuzzerAlarm() {
  if (!buzzerActive) return;
  buzzerActive = false;
  setBuzzerHardware(false);
  Serial.println(F("BUZZER OFF"));
  publishTelemetryJson(true);
}

void updateBuzzerTimer() {
  if (buzzerActive && (millis() - buzzerStartedMs >= BUZZER_ALARM_MS)) {
    stopBuzzerAlarm();
    enqueueSecurityEvent("BUZZER_OFF", "LOW", "5-second buzzer alarm completed");
  }
}

// -------------------- Arduino Serial Protocol Parser --------------------
void handleArduinoLine(char* line) {
  int len = strlen(line);
  while (len > 0 && (line[len - 1] == '\r' || line[len - 1] == '\n' || line[len - 1] == ' ')) {
    line[--len] = '\0';
  }
  if (len == 0) return;

  Serial.print(F("[Arduino -> NodeMCU] "));
  Serial.println(line);

  // Telemetry format: S,temperature,distance,fan,door
  if (strncmp(line, "S,", 2) == 0) {
    char* p1 = line + 2;
    char* c1 = strchr(p1, ',');
    if (!c1) return;
    *c1 = '\0';
    char* p2 = c1 + 1;
    char* c2 = strchr(p2, ',');
    if (!c2) return;
    *c2 = '\0';
    char* p3 = c2 + 1;
    char* c3 = strchr(p3, ',');
    if (!c3) return;
    *c3 = '\0';
    char* p4 = c3 + 1;

    lastTemp = atof(p1);
    lastDist = atof(p2);
    lastFanState = (atoi(p3) == 1);
    lastDoorUnlocked = (atoi(p4) == 1);

    publishTelemetryJson(true);
    return;
  }

  // Extended ACK format: ACK:<commandId>:<action>:<success>:<doorState>
  if (strncmp(line, "ACK:", 4) == 0) {
    char* pCmd = line + 4;
    char* c1 = strchr(pCmd, ':');
    if (!c1) return;
    *c1 = '\0';
    char* pAct = c1 + 1;
    char* c2 = strchr(pAct, ':');
    if (!c2) return;
    *c2 = '\0';
    char* pOk = c2 + 1;
    char* c3 = strchr(pOk, ':');
    if (!c3) return;
    *c3 = '\0';
    char* pDoor = c3 + 1;

    bool ok = (atoi(pOk) == 1);
    bool unlocked = (atoi(pDoor) == 1);
    lastDoorUnlocked = unlocked;
    if (unlocked) {
      stopBuzzerAlarm();
    }

    if (pendingCmdActive && strcmp(pendingCmdId, pCmd) == 0) {
      pendingCmdActive = false;
    }
    publishCommandAck(pCmd, pAct, ok, unlocked);
    publishTelemetryJson(true);
    return;
  }

  if (strcmp(line, "LED_ON") == 0) {
    lastLedState = true;
    publishTelemetryJson(true);
  } else if (strcmp(line, "LED_OFF") == 0) {
    lastLedState = false;
    publishTelemetryJson(true);
  } else if (strcmp(line, "UNLOCK_PASSWORD") == 0) {
    lastDoorUnlocked = true;
    stopBuzzerAlarm();
    enqueueSecurityEvent("UNLOCK_PASSWORD", "LOW", "Door unlocked via 4x4 keypad password");
    publishTelemetryJson(true);
  } else if (strcmp(line, "UNLOCK_FACE") == 0) {
    lastDoorUnlocked = true;
    stopBuzzerAlarm();
    enqueueSecurityEvent("UNLOCK_FACE", "LOW", "Door unlocked via Python OpenCV face recognition");
    publishTelemetryJson(true);
  } else if (strcmp(line, "UNLOCK_REMOTE") == 0) {
    lastDoorUnlocked = true;
    stopBuzzerAlarm();
    publishTelemetryJson(true);
  } else if (strcmp(line, "UNLOCK_BLYNK") == 0) {
    // Legacy compatibility mapping to remote website unlock
    lastDoorUnlocked = true;
    stopBuzzerAlarm();
    if (pendingCmdActive && strcmp(pendingCmdAction, "UNLOCK") == 0) {
      pendingCmdActive = false;
      publishCommandAck(pendingCmdId, "UNLOCK", true, true);
    } else {
      enqueueSecurityEvent("UNLOCK_REMOTE", "LOW", "Door unlocked via remote command");
    }
    publishTelemetryJson(true);
  } else if (strcmp(line, "DOOR_LOCKED") == 0) {
    lastDoorUnlocked = false;
    if (pendingCmdActive && strcmp(pendingCmdAction, "LOCK") == 0) {
      pendingCmdActive = false;
      publishCommandAck(pendingCmdId, "LOCK", true, false);
    }
    enqueueSecurityEvent("DOOR_LOCKED", "LOW", "Door locked");
    publishTelemetryJson(true);
  } else if (strcmp(line, "WRONG_PASSWORD") == 0) {
    Serial.println(F("WRONG PASSWORD DETECTED"));
    startBuzzerAlarm();
    enqueueSecurityEvent("WRONG_PASSWORD", "HIGH", "Incorrect keypad password entered");
  } else if (strcmp(line, "UNKNOWN_FACE") == 0) {
    Serial.println(F("UNAUTHORIZED FACE DETECTED"));
    startBuzzerAlarm();
    enqueueSecurityEvent("UNKNOWN_FACE", "HIGH", "Unauthorized face detected by camera");
  }
}

void readArduinoSerial() {
  while (arduinoSerial.available() > 0) {
    char c = (char)arduinoSerial.read();
    if (c == '\n') {
      serialBuf[serialIdx] = '\0';
      handleArduinoLine(serialBuf);
      serialIdx = 0;
    } else if (c != '\r') {
      if (serialIdx < sizeof(serialBuf) - 1) {
        serialBuf[serialIdx++] = c;
      } else {
        serialIdx = 0;
      }
    }
  }
}

// -------------------- MQTT Incoming Handler --------------------
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (length >= 384) {
    Serial.println(F("[MQTT] Rejected oversized payload"));
    return;
  }

  char buf[384];
  memcpy(buf, payload, length);
  buf[length] = '\0';

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<384> doc;
#endif
  DeserializationError err = deserializeJson(doc, buf);
  if (err) {
    Serial.print(F("[MQTT] JSON parse failed: "));
    Serial.println(err.c_str());
    return;
  }

  if (strcmp(topic, topicEventsAck.c_str()) == 0) {
    const char* eventId = doc["eventId"] | "";
    if (eventId[0] != '\0') {
      ackPendingEvent(eventId);
    }
    return;
  }

  if (strcmp(topic, topicCommands.c_str()) == 0) {
    const char* cmdId = doc["commandId"] | "";
    const char* action = doc["action"] | "";
    uint64_t expiresAtMs = doc["expiresAt"] | (uint64_t)0;
    unsigned long ttlMs = doc["ttlMs"] | (unsigned long)0;
    if (cmdId[0] == '\0' || action[0] == '\0') {
      Serial.println(F("[MQTT] Invalid command payload"));
      return;
    }

    // Check command expiration when SNTP time is available
    time_t nowSec = time(nullptr);
    if (expiresAtMs > 0 && nowSec > 1700000000) {
      uint64_t nowMs = (uint64_t)nowSec * 1000ULL;
      if (nowMs > expiresAtMs) {
        Serial.print(F("[MQTT] Rejected expired commandId: "));
        Serial.println(cmdId);
        publishCommandAck(cmdId, action, false, lastDoorUnlocked, "COMMAND_EXPIRED");
        return;
      }
    }
    if (ttlMs > 0 && ttlMs < 500) {
      Serial.print(F("[MQTT] Rejected near-expired commandId: "));
      Serial.println(cmdId);
      publishCommandAck(cmdId, action, false, lastDoorUnlocked, "COMMAND_EXPIRED");
      return;
    }

    if (wasCommandProcessed(cmdId)) {
      Serial.print(F("[MQTT] Ignored duplicate commandId: "));
      Serial.println(cmdId);
      return;
    }
    rememberCommandId(cmdId);

    if (strcmp(action, "UNLOCK") != 0 && strcmp(action, "LOCK") != 0) {
      publishCommandAck(cmdId, action, false, lastDoorUnlocked, "UNSUPPORTED_ACTION");
      return;
    }

    if (pendingCmdActive) {
      publishCommandAck(cmdId, action, false, lastDoorUnlocked, "COMMAND_IN_PROGRESS");
      return;
    }

    pendingCmdActive = true;
    strncpy(pendingCmdId, cmdId, sizeof(pendingCmdId) - 1);
    pendingCmdId[sizeof(pendingCmdId) - 1] = '\0';
    strncpy(pendingCmdAction, action, sizeof(pendingCmdAction) - 1);
    pendingCmdAction[sizeof(pendingCmdAction) - 1] = '\0';
    pendingCmdStartMs = millis();

    char forwardLine[64];
    snprintf(forwardLine, sizeof(forwardLine), "%s:%s", action, cmdId);
    arduinoSerial.println(forwardLine);
    Serial.print(F("[NodeMCU -> Arduino] "));
    Serial.println(forwardLine);
  }
}

void checkPendingCommandTimeout() {
  if (pendingCmdActive && (millis() - pendingCmdStartMs >= CMD_ACK_TIMEOUT_MS)) {
    pendingCmdActive = false;
    Serial.println(F("[Command] Arduino serial ACK timeout"));
    publishCommandAck(pendingCmdId, pendingCmdAction, false, lastDoorUnlocked, "ARDUINO_ACK_TIMEOUT");
  }
}

// -------------------- Non-Blocking Wi-Fi & MQTT Reconnect --------------------
void maintainConnections() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    setStatusLed(false);
    if (now - lastWifiAttemptMs >= WIFI_RETRY_MS) {
      lastWifiAttemptMs = now;
      Serial.print(F("[WiFi] Connecting to "));
      Serial.println(WIFI_SSID);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    return;
  }

  if (!mqttClient.connected()) {
    setStatusLed(false);
    if (now - lastMqttAttemptMs >= MQTT_RETRY_MS) {
      lastMqttAttemptMs = now;
      Serial.print(F("[MQTT] Connecting to "));
      Serial.print(MQTT_BROKER_IP);
      Serial.print(':');
      Serial.println(MQTT_PORT);

      String clientId = String("smartroom-") + DEVICE_ID + "-" + String(ESP.getChipId(), HEX);
      String lwtPayload = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"online\":false}";

      bool ok = mqttClient.connect(
        clientId.c_str(),
        MQTT_USERNAME,
        MQTT_PASSWORD,
        topicAvailability.c_str(),
        1,
        true,
        lwtPayload.c_str()
      );

      if (ok) {
        Serial.println(F("[MQTT] Connected successfully"));
        setStatusLed(true);
        mqttClient.subscribe(topicCommands.c_str(), 1);
        mqttClient.subscribe(topicEventsAck.c_str(), 0);
        publishAvailability(true);
        publishTelemetryJson(true);
        lastHeartbeatMs = now;
      } else {
        Serial.print(F("[MQTT] Connect failed, rc="));
        Serial.println(mqttClient.state());
      }
    }
    return;
  }

  setStatusLed(true);
  mqttClient.loop();

  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    publishAvailability(true);
    publishTelemetryJson(true);
  }
}

// -------------------- Setup & Loop --------------------
void setup() {
  Serial.begin(115200);
  arduinoSerial.begin(9600);
  arduinoSerial.listen();

  pinMode(STATUS_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  setBuzzerHardware(false);
  setStatusLed(false);

  randomSeed(ESP.getChipId() ^ micros());
  bootCounter = random(1000, 999999);

  for (uint8_t i = 0; i < DEDUP_RING_SIZE; i++) recentCmdIds[i][0] = '\0';
  for (uint8_t i = 0; i < MAX_PENDING_EVENTS; i++) eventQueue[i].inUse = false;

  buildTopics();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  mqttClient.setServer(MQTT_BROKER_IP, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setBufferSize(512);
  mqttClient.setKeepAlive(15);
  mqttClient.setSocketTimeout(2); // Prevent long socket stalls starving 9600-baud SoftwareSerial

  Serial.println(F("\n[SmartRoom ESP8266] Booted. Local buzzer & serial active even offline."));
}

void loop() {
  // Always run local serial and buzzer timing first (works without Wi-Fi/internet)
  readArduinoSerial();
  updateBuzzerTimer();

  // Maintain network & MQTT non-blockingly, draining SoftwareSerial immediately after
  maintainConnections();
  readArduinoSerial();
  updateBuzzerTimer();

  checkPendingCommandTimeout();
  processEventQueueRetries();
}
