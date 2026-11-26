/*
 * Diagnostic 4B: Two-Way Serial Test — NodeMCU ESP8266 Side
 * Sends UNLOCK:diag-1 every 6s on D1 (GPIO5) and prints Arduino responses on D2 (GPIO4).
 */

#include <SoftwareSerial.h>

SoftwareSerial arduinoSerial(D2, D1); // RX=D2 (GPIO4), TX=D1 (GPIO5)
char rxBuf[96];
uint8_t rxLen = 0;
unsigned long lastTxMs = 0;
int seq = 0;

void setup() {
  Serial.begin(115200);
  arduinoSerial.begin(9600);
  arduinoSerial.listen();
  Serial.println(F("\n[2-Way NodeMCU] Ready on D1(TX)/D2(RX) @ 9600 baud."));
}

void loop() {
  while (arduinoSerial.available() > 0) {
    char c = (char)arduinoSerial.read();
    if (c == '\n') {
      rxBuf[rxLen] = '\0';
      if (rxLen > 0) {
        Serial.print(F("[RX <- Arduino] "));
        Serial.println(rxBuf);
      }
      rxLen = 0;
    } else if (c != '\r' && rxLen < sizeof(rxBuf) - 1) {
      rxBuf[rxLen++] = c;
    }
  }

  if (millis() - lastTxMs >= 6000UL) {
    lastTxMs = millis();
    seq++;
    char cmd[32];
    snprintf(cmd, sizeof(cmd), (seq % 2 == 1) ? "UNLOCK:diag-%d" : "LOCK:diag-%d", seq);
    arduinoSerial.println(cmd);
    Serial.print(F("[TX -> Arduino] "));
    Serial.println(cmd);
  }
}
