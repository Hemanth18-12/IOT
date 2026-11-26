/*
 * SmartRoom Intelligent IoT Control and Security System
 * Arduino Uno Firmware (smartroom_arduino.ino)
 *
 * Preserved Hardware Pin Configuration:
 *   D0       : Hardware Serial RX (USB to laptop Python OpenCV face recognition)
 *   D1       : Hardware Serial TX (USB to laptop)
 *   D2 - D5  : 4x4 Keypad Rows R1 - R4
 *   D6 - D9  : 4x4 Keypad Cols C1 - C4
 *   D10      : HC-SR04 Ultrasonic TRIG
 *   D11      : HC-SR04 Ultrasonic ECHO
 *   D12      : Servo Motor Signal (External regulated 5V PSU recommended; common GND!)
 *   D13      : DC Motor Driver Input (Fan, protected driver)
 *   A0       : LM35 Temperature Sensor Analog Output
 *   A1       : External LED (via 220-ohm resistor)
 *   A2       : SoftwareSerial RX (from NodeMCU D1 / GPIO5 TX)
 *   A3       : SoftwareSerial TX (to NodeMCU D2 / GPIO4 RX via 1k/2k voltage divider)
 *   A4       : I2C LCD SDA
 *   A5       : I2C LCD SCL
 *
 * Timing & Interrupt Interference Note:
 *   AVR SoftwareSerial disables interrupts during byte transmission/reception, which can
 *   cause jitter with Servo.h (Timer1 PWM). To prevent signal corruption and continuous
 *   servo holding torque, this sketch detaches the servo ~700 ms after every movement,
 *   pulls D12 LOW, and avoids transmitting SoftwareSerial frames while the servo is moving.
 *   Ensure the physical door latch stays mechanically secured without continuous servo torque.
 *
 * Required Arduino Libraries:
 *   - Keypad (by Mark Stanley, Alexander Brevig)
 *   - LiquidCrystal_I2C (by Frank de Brabander)
 *   - Servo (built-in)
 *   - SoftwareSerial (built-in)
 *   - Wire (built-in)
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include <Servo.h>
#include <SoftwareSerial.h>

// -------------------- Pin Definitions (DO NOT MODIFY) --------------------
const uint8_t TRIG_PIN     = 10;
const uint8_t ECHO_PIN     = 11;
const uint8_t SERVO_PIN    = 12;
const uint8_t FAN_PIN      = 13;
const uint8_t LM35_PIN     = A0;
const uint8_t LED_PIN      = A1;
const uint8_t ESP_RX_PIN   = A2;
const uint8_t ESP_TX_PIN   = A3;

// -------------------- Servo & Lock Constants --------------------
const int SERVO_LOCKED_ANGLE   = 0;
const int SERVO_UNLOCKED_ANGLE = 90;
const unsigned long SERVO_MOVE_MS = 700UL;
const unsigned long AUTO_LOCK_MS  = 10000UL;

// -------------------- Ultrasonic Constants --------------------
const unsigned long ULTRASONIC_INTERVAL_MS = 100UL;
const float HAND_MIN_CM   = 2.0f;
const float HAND_MAX_CM   = 10.0f;
const float CLEAR_MIN_CM  = 12.0f;
const uint8_t REQUIRED_CLEAR_READINGS = 3;

// -------------------- Telemetry Constants --------------------
const unsigned long TELEMETRY_INTERVAL_MS = 1000UL;
const unsigned long LCD_MESSAGE_HOLD_MS   = 2000UL;

// -------------------- Keypad Setup (4x4) --------------------
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte rowPins[ROWS] = {2, 3, 4, 5};
byte colPins[COLS] = {6, 7, 8, 9};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// Default demonstration keypad password (never transmitted over serial or MQTT)
const char CORRECT_PASSWORD[] = "1234";
char enteredPin[10] = "";
uint8_t enteredLen = 0;

// -------------------- Peripherals --------------------
// Note: Most I2C 16x2 LCDs use 0x27 (some use 0x3F). Update address if blank.
LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo doorServo;
SoftwareSerial espSerial(ESP_RX_PIN, ESP_TX_PIN); // RX=A2, TX=A3

// -------------------- Runtime State --------------------
bool fanState = false;
bool ledState = false;
bool doorUnlocked = false;
bool handReady = true;
uint8_t clearReadings = 0;

float currentTempC = 25.0f;
float currentDistCm = 0.0f;

// Non-blocking servo motion & detach state
bool servoMoving = false;
unsigned long servoMoveStartMs = 0;
unsigned long doorUnlockedAtMs = 0;

// Pending remote command ACK correlation
bool hasPendingAck = false;
char pendingAckCmdId[48] = "";
char pendingAckAction[12] = "";
bool pendingAckDoorUnlocked = false;

// Serial RX buffer for NodeMCU commands
char espRxBuf[72];
uint8_t espRxLen = 0;

// Timers
unsigned long lastUltrasonicMs = 0;
unsigned long lastTelemetryMs = 0;
unsigned long lcdStatusExpiresMs = 0;
bool lcdDirty = true;

// -------------------- Helpers --------------------
void sendEspLine(const char* line) {
  espSerial.println(line);
}

void showLcdStatus(const char* line1, const char* line2, unsigned long holdMs = LCD_MESSAGE_HOLD_MS) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
  lcdStatusExpiresMs = millis() + holdMs;
  lcdDirty = false;
}

void refreshIdleLcd() {
  if (!lcdDirty && millis() < lcdStatusExpiresMs) return;
  if (millis() < lcdStatusExpiresMs) return;

  lcd.clear();
  lcd.setCursor(0, 0);
  if (doorUnlocked) {
    lcd.print(F("DOOR: UNLOCKED"));
  } else {
    lcd.print(F("PIN: "));
    for (uint8_t i = 0; i < enteredLen && i < 10; i++) {
      lcd.print('*');
    }
    if (enteredLen == 0) {
      lcd.print(F("LOCKED"));
    }
  }

  lcd.setCursor(0, 1);
  char buf[17];
  int tInt = (int)currentTempC;
  int tDec = abs((int)((currentTempC - tInt) * 10));
  snprintf(buf, sizeof(buf), "T:%d.%dC F:%s L:%s", tInt, tDec, fanState ? "1" : "0", ledState ? "1" : "0");
  lcd.print(buf);
  lcdDirty = false;
}

void startServoMove(int targetAngle) {
  doorServo.attach(SERVO_PIN);
  doorServo.write(targetAngle);
  servoMoving = true;
  servoMoveStartMs = millis();
}

char pendingLocalEvent[24] = "";
bool pendingWrongPassword = false;
bool pendingUnknownFace = false;
bool pendingLedNotify = false;

void triggerUnlockWithEvent(const char* sourceEvent, const char* cmdId = nullptr) {
  doorUnlockedAtMs = millis();
  bool wasLocked = !doorUnlocked;
  doorUnlocked = true;

  if (cmdId != nullptr && cmdId[0] != '\0') {
    hasPendingAck = true;
    strncpy(pendingAckCmdId, cmdId, sizeof(pendingAckCmdId) - 1);
    pendingAckCmdId[sizeof(pendingAckCmdId) - 1] = '\0';
    strncpy(pendingAckAction, "UNLOCK", sizeof(pendingAckAction) - 1);
    pendingAckDoorUnlocked = true;
  }

  if (wasLocked) {
    if (sourceEvent != nullptr && sourceEvent[0] != '\0') {
      strncpy(pendingLocalEvent, sourceEvent, sizeof(pendingLocalEvent) - 1);
      pendingLocalEvent[sizeof(pendingLocalEvent) - 1] = '\0';
    } else {
      pendingLocalEvent[0] = '\0';
    }
    startServoMove(SERVO_UNLOCKED_ANGLE);
    showLcdStatus("Access Granted", "Door Unlocked");
  } else {
    // Already unlocked: reset 10s auto-lock timer and respond immediately
    pendingLocalEvent[0] = '\0';
    showLcdStatus("Door Unlocked", "Timer Extended");
    if (hasPendingAck) {
      char ackBuf[84];
      snprintf(ackBuf, sizeof(ackBuf), "ACK:%s:UNLOCK:1:1", pendingAckCmdId);
      sendEspLine(ackBuf);
      hasPendingAck = false;
    }
    if (sourceEvent != nullptr && sourceEvent[0] != '\0') {
      sendEspLine(sourceEvent);
    }
  }
}

void triggerLock(const char* cmdId = nullptr) {
  bool wasUnlocked = doorUnlocked;
  doorUnlocked = false;

  if (cmdId != nullptr && cmdId[0] != '\0') {
    hasPendingAck = true;
    strncpy(pendingAckCmdId, cmdId, sizeof(pendingAckCmdId) - 1);
    pendingAckCmdId[sizeof(pendingAckCmdId) - 1] = '\0';
    strncpy(pendingAckAction, "LOCK", sizeof(pendingAckAction) - 1);
    pendingAckDoorUnlocked = false;
  }

  if (wasUnlocked) {
    strncpy(pendingLocalEvent, "DOOR_LOCKED", sizeof(pendingLocalEvent) - 1);
    startServoMove(SERVO_LOCKED_ANGLE);
    showLcdStatus("SmartRoom", "Door Locked");
  } else {
    // Already locked
    if (hasPendingAck) {
      char ackBuf[84];
      snprintf(ackBuf, sizeof(ackBuf), "ACK:%s:LOCK:1:0", pendingAckCmdId);
      sendEspLine(ackBuf);
      hasPendingAck = false;
    }
    sendEspLine("DOOR_LOCKED");
    showLcdStatus("SmartRoom", "Already Locked", 1200UL);
  }
}

void handleServoLifecycle() {
  if (servoMoving && (millis() - servoMoveStartMs >= SERVO_MOVE_MS)) {
    doorServo.detach();
    digitalWrite(SERVO_PIN, LOW); // Keep signal pin LOW after detach
    servoMoving = false;
    lcdDirty = true;

    // Safe window to transmit SoftwareSerial messages without Servo PWM interference
    if (hasPendingAck) {
      char ackBuf[84];
      snprintf(
        ackBuf,
        sizeof(ackBuf),
        "ACK:%s:%s:1:%d",
        pendingAckCmdId,
        pendingAckAction,
        pendingAckDoorUnlocked ? 1 : 0
      );
      sendEspLine(ackBuf);
      hasPendingAck = false;
    }
    if (pendingLocalEvent[0] != '\0') {
      sendEspLine(pendingLocalEvent);
      pendingLocalEvent[0] = '\0';
    }
    if (pendingWrongPassword) {
      sendEspLine("WRONG_PASSWORD");
      pendingWrongPassword = false;
    }
    if (pendingUnknownFace) {
      sendEspLine("UNKNOWN_FACE");
      pendingUnknownFace = false;
    }
    if (pendingLedNotify) {
      sendEspLine(ledState ? "LED_ON" : "LED_OFF");
      pendingLedNotify = false;
    }
  }

  // Automatic lock after 10 seconds
  if (doorUnlocked && !servoMoving && (millis() - doorUnlockedAtMs >= AUTO_LOCK_MS)) {
    triggerLock(nullptr);
  }
}

float readLm35Celsius() {
  long sum = 0;
  for (uint8_t i = 0; i < 5; i++) {
    sum += analogRead(LM35_PIN);
  }
  float avgRaw = sum / 5.0f;
  float voltageMv = (avgRaw * 5000.0f) / 1024.0f;
  return voltageMv / 10.0f;
}

void sampleUltrasonicAndControl() {
  if (millis() - lastUltrasonicMs < ULTRASONIC_INTERVAL_MS) return;
  lastUltrasonicMs = millis();

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 25000UL);
  float dist = (duration == 0) ? 0.0f : (duration * 0.0343f) / 2.0f;
  currentDistCm = dist;

  bool handPresent = (duration > 0 && dist >= HAND_MIN_CM && dist < HAND_MAX_CM);
  bool isClear = (duration == 0 || dist >= CLEAR_MIN_CM);

  if (handReady) {
    if (handPresent) {
      fanState = !fanState;
      ledState = fanState;
      digitalWrite(FAN_PIN, fanState ? HIGH : LOW);
      digitalWrite(LED_PIN, ledState ? HIGH : LOW);
      handReady = false;
      clearReadings = 0;
      lcdDirty = true;

      if (!servoMoving) {
        sendEspLine(ledState ? "LED_ON" : "LED_OFF");
      } else {
        pendingLedNotify = true;
      }
    }
  } else {
    if (isClear) {
      if (clearReadings < REQUIRED_CLEAR_READINGS) {
        clearReadings++;
      }
      if (clearReadings >= REQUIRED_CLEAR_READINGS) {
        handReady = true;
        clearReadings = 0;
      }
    } else {
      clearReadings = 0;
    }
  }
}

void handleKeypad() {
  char key = keypad.getKey();
  if (!key) return;

  if (key == '*') {
    enteredLen = 0;
    enteredPin[0] = '\0';
    lcdStatusExpiresMs = 0;
    lcdDirty = true;
    return;
  }

  if (key == 'D') {
    enteredLen = 0;
    enteredPin[0] = '\0';
    triggerLock(nullptr);
    return;
  }

  if (key == '#') {
    enteredPin[enteredLen] = '\0';
    if (strcmp(enteredPin, CORRECT_PASSWORD) == 0) {
      enteredLen = 0;
      enteredPin[0] = '\0';
      triggerUnlockWithEvent("UNLOCK_PASSWORD");
    } else {
      enteredLen = 0;
      enteredPin[0] = '\0';
      // Do NOT move servo on wrong password
      showLcdStatus("Wrong Password!", "Access Denied");
      if (!servoMoving) {
        sendEspLine("WRONG_PASSWORD");
      } else {
        pendingWrongPassword = true;
      }
    }
    return;
  }

  // Append digit/key up to buffer limit
  if (enteredLen < sizeof(enteredPin) - 1) {
    enteredPin[enteredLen++] = key;
    enteredPin[enteredLen] = '\0';
    lcdStatusExpiresMs = 0;
    lcdDirty = true;
  }
}

void handleLaptopFaceSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == 'A') {
      triggerUnlockWithEvent("UNLOCK_FACE");
    } else if (c == 'R') {
      // Do NOT move servo on unauthorized face
      showLcdStatus("Unknown Face!", "Access Denied");
      if (!servoMoving) {
        sendEspLine("UNKNOWN_FACE");
      } else {
        pendingUnknownFace = true;
      }
    } else if (c == 'L') {
      triggerLock(nullptr);
    }
  }
}

void processEspCommand(char* cmd) {
  // Trim trailing whitespace
  int len = strlen(cmd);
  while (len > 0 && (cmd[len - 1] == '\r' || cmd[len - 1] == '\n' || cmd[len - 1] == ' ')) {
    cmd[--len] = '\0';
  }
  if (len == 0) return;

  if (strcmp(cmd, "UNLOCK") == 0) {
    triggerUnlockWithEvent("UNLOCK_BLYNK", nullptr);
  } else if (strncmp(cmd, "UNLOCK:", 7) == 0) {
    triggerUnlockWithEvent("UNLOCK_REMOTE", cmd + 7);
  } else if (strcmp(cmd, "LOCK") == 0) {
    triggerLock(nullptr);
  } else if (strncmp(cmd, "LOCK:", 5) == 0) {
    triggerLock(cmd + 5);
  }
}

void handleEspSerialRx() {
  while (espSerial.available() > 0) {
    char c = (char)espSerial.read();
    if (c == '\n') {
      espRxBuf[espRxLen] = '\0';
      processEspCommand(espRxBuf);
      espRxLen = 0;
    } else if (c != '\r') {
      if (espRxLen < sizeof(espRxBuf) - 1) {
        espRxBuf[espRxLen++] = c;
      } else {
        espRxLen = 0; // Discard overflow frame safely
      }
    }
  }
}

void sendTelemetryFrame() {
  if (servoMoving) return; // Keep SoftwareSerial silent while servo PWM is active
  if (millis() - lastTelemetryMs < TELEMETRY_INTERVAL_MS) return;
  lastTelemetryMs = millis();

  currentTempC = readLm35Celsius();
  lcdDirty = true;

  char tempStr[12];
  char distStr[12];
  dtostrf(currentTempC, 4, 2, tempStr);
  dtostrf(currentDistCm, 4, 2, distStr);

  char payload[64];
  snprintf(
    payload,
    sizeof(payload),
    "S,%s,%s,%d,%d",
    tempStr,
    distStr,
    fanState ? 1 : 0,
    doorUnlocked ? 1 : 0
  );
  sendEspLine(payload);
}

// -------------------- Setup & Main Loop --------------------
void setup() {
  Serial.begin(9600);
  espSerial.begin(9600);
  espSerial.listen();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(SERVO_PIN, OUTPUT);

  digitalWrite(TRIG_PIN, LOW);
  digitalWrite(FAN_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(SERVO_PIN, LOW);

  lcd.init();
  lcd.backlight();
  showLcdStatus("SmartRoom IoT", "Initializing...", 1500UL);

  // Preserve initial locking movement at startup, then detach after ~700 ms
  doorUnlocked = false;
  doorServo.attach(SERVO_PIN);
  doorServo.write(SERVO_LOCKED_ANGLE);
  delay(SERVO_MOVE_MS);
  doorServo.detach();
  digitalWrite(SERVO_PIN, LOW);

  currentTempC = readLm35Celsius();
  sendEspLine("DOOR_LOCKED");
  lcdDirty = true;
}

void loop() {
  handleServoLifecycle();
  handleLaptopFaceSerial();
  handleEspSerialRx();
  handleKeypad();
  sampleUltrasonicAndControl();
  sendTelemetryFrame();
  refreshIdleLcd();
}
