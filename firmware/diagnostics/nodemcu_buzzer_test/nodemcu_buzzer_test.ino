/*
 * Diagnostic 3: NodeMCU ESP8266 Buzzer Hardware Test (All 3 Modes)
 *
 * Tests NodeMCU pin D5 (GPIO14) across:
 *   1) Active-HIGH (GPIO HIGH = ON)
 *   2) Active-LOW  (GPIO LOW  = ON)
 *   3) Passive PWM (tone() at 2400 Hz)
 *
 * Open Serial Monitor at 115200 baud and listen to determine which buzzer module
 * you have connected, OR set TEST_BUZZER_MODE to lock a single mode.
 *
 * Safe Wiring Notes:
 *   - 3-pin active 3.3V module: VCC -> 3V3, GND -> GND, I/O -> D5 (GPIO14)
 *   - Bare 2-pin 5V active buzzer: Use NPN transistor (2N2222) + 1k base resistor to D5
 *   - Never apply 5V directly to NodeMCU GPIO pins.
 */

#define MODE_AUTO_CYCLE  0
#define MODE_ACTIVE_HIGH 1
#define MODE_ACTIVE_LOW  2
#define MODE_PASSIVE_PWM 3

// Set to 0 to test all three modes sequentially, or 1/2/3 to test one mode only
#define TEST_BUZZER_MODE MODE_AUTO_CYCLE

const uint8_t BUZZER_PIN = D5; // GPIO14
const uint16_t PASSIVE_FREQ_HZ = 2400;

int currentStep = 0;
bool buzzerOn = false;
unsigned long stepStartedMs = 0;

void applyBuzzer(int mode, bool on) {
  if (mode == MODE_ACTIVE_HIGH) {
    digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
  } else if (mode == MODE_ACTIVE_LOW) {
    digitalWrite(BUZZER_PIN, on ? LOW : HIGH);
  } else if (mode == MODE_PASSIVE_PWM) {
    if (on) {
      tone(BUZZER_PIN, PASSIVE_FREQ_HZ);
    } else {
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
    }
  }
}

int activeModeForStep(int step) {
  if (TEST_BUZZER_MODE != MODE_AUTO_CYCLE) return TEST_BUZZER_MODE;
  return (step % 3) + 1;
}

void printModeName(int mode) {
  if (mode == MODE_ACTIVE_HIGH) Serial.print(F("Active-HIGH"));
  else if (mode == MODE_ACTIVE_LOW) Serial.print(F("Active-LOW"));
  else Serial.print(F("Passive PWM (2400 Hz)"));
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println(F("\n[NodeMCU Buzzer Diagnostic] Ready on D5 (GPIO14)."));
  stepStartedMs = millis();
  buzzerOn = true;
  int m = activeModeForStep(currentStep);
  applyBuzzer(m, true);
  Serial.print(F("Testing mode: "));
  printModeName(m);
  Serial.println(F(" -> BUZZER ON - 5 SECONDS"));
}

void loop() {
  unsigned long now = millis();
  int m = activeModeForStep(currentStep);

  if (buzzerOn && (now - stepStartedMs >= 5000UL)) {
    applyBuzzer(m, false);
    buzzerOn = false;
    stepStartedMs = now;
    Serial.println(F("BUZZER OFF (waiting 3s before next test)"));
  } else if (!buzzerOn && (now - stepStartedMs >= 3000UL)) {
    currentStep++;
    m = activeModeForStep(currentStep);
    buzzerOn = true;
    stepStartedMs = now;
    applyBuzzer(m, true);
    Serial.print(F("Testing mode: "));
    printModeName(m);
    Serial.println(F(" -> BUZZER ON - 5 SECONDS"));
  }
}
