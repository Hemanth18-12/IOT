/*
 * Diagnostic 4A: Two-Way Serial Test — Arduino Uno Side
 * Receives UNLOCK:<id> / LOCK:<id> / PING on A2 and replies ACK + telemetry on A3.
 */

#include <SoftwareSerial.h>

SoftwareSerial espSerial(A2, A3); // RX=A2, TX=A3
char rxBuf[72];
uint8_t rxLen = 0;
unsigned long lastHeartbeatMs = 0;

void setup() {
  Serial.begin(9600);
  espSerial.begin(9600);
  espSerial.listen();
  Serial.println(F("[2-Way Arduino] Ready on A2/A3 @ 9600 baud."));
}

void loop() {
  while (espSerial.available() > 0) {
    char c = (char)espSerial.read();
    if (c == '\n') {
      rxBuf[rxLen] = '\0';
      if (rxLen > 0) {
        Serial.print(F("[RX from NodeMCU] "));
        Serial.println(rxBuf);
        if (strncmp(rxBuf, "UNLOCK:", 7) == 0) {
          char ack[84];
          snprintf(ack, sizeof(ack), "ACK:%s:UNLOCK:1:1", rxBuf + 7);
          espSerial.println(ack);
          Serial.print(F("[TX to NodeMCU] "));
          Serial.println(ack);
        } else if (strncmp(rxBuf, "LOCK:", 5) == 0) {
          char ack[84];
          snprintf(ack, sizeof(ack), "ACK:%s:LOCK:1:0", rxBuf + 5);
          espSerial.println(ack);
        } else if (strcmp(rxBuf, "PING") == 0) {
          espSerial.println("PONG");
        }
      }
      rxLen = 0;
    } else if (c != '\r' && rxLen < sizeof(rxBuf) - 1) {
      rxBuf[rxLen++] = c;
    }
  }

  if (millis() - lastHeartbeatMs >= 3000UL) {
    lastHeartbeatMs = millis();
    espSerial.println("S,28.40,24.50,1,0");
  }
}
