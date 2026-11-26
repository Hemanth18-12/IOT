/*
 * Diagnostic 1: Arduino Uno Serial Transmitter Test
 * Sends the exact SmartRoom telemetry & event lines over SoftwareSerial A3 (9600 baud).
 *
 * Wiring:
 *   Arduino A3 (5V TX) -> 1k-ohm resistor -> junction -> NodeMCU D2 (GPIO4 RX)
 *                                              |
 *                                        2k-ohm resistor -> GND
 *   Arduino GND <-> NodeMCU GND (common ground mandatory!)
 */

#include <SoftwareSerial.h>

const uint8_t ESP_RX_PIN = A2;
const uint8_t ESP_TX_PIN = A3;

SoftwareSerial espSerial(ESP_RX_PIN, ESP_TX_PIN);

const char* TEST_LINES[] = {
  "S,28.40,24.50,1,0",
  "LED_ON",
  "LED_OFF",
  "WRONG_PASSWORD",
  "UNKNOWN_FACE"
};
const uint8_t NUM_LINES = sizeof(TEST_LINES) / sizeof(TEST_LINES[0]);
uint8_t idx = 0;
unsigned long lastSendMs = 0;

void setup() {
  Serial.begin(9600);
  espSerial.begin(9600);
  Serial.println(F("[Arduino TX Test] Ready. Sending test lines on A3 at 9600 baud every 2s."));
}

void loop() {
  if (millis() - lastSendMs >= 2000UL) {
    lastSendMs = millis();
    const char* line = TEST_LINES[idx];
    espSerial.println(line);
    Serial.print(F("[Arduino TX -> A3] "));
    Serial.println(line);
    idx = (idx + 1) % NUM_LINES;
  }
}
