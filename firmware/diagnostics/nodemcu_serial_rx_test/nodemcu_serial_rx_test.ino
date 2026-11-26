/*
 * Diagnostic 2: NodeMCU ESP8266 Serial Receiver Test
 * Receives newline-delimited frames on D2 (GPIO4) at 9600 baud and prints every line
 * (plus hex dump if non-ASCII corruption occurs) to USB Serial at 115200 baud.
 */

#include <SoftwareSerial.h>

const uint8_t ARD_TX_PIN = D1; // GPIO5
const uint8_t ARD_RX_PIN = D2; // GPIO4 (via 1k/2k divider from Arduino A3)

SoftwareSerial arduinoSerial(ARD_RX_PIN, ARD_TX_PIN);

char rxBuf[96];
uint8_t rxLen = 0;

void setup() {
  Serial.begin(115200);
  arduinoSerial.begin(9600);
  arduinoSerial.listen();
  Serial.println(F("\n[NodeMCU RX Test] Listening on D2 (GPIO4) at 9600 baud..."));
}

void loop() {
  while (arduinoSerial.available() > 0) {
    char c = (char)arduinoSerial.read();
    if (c == '\n') {
      rxBuf[rxLen] = '\0';
      if (rxLen > 0) {
        Serial.print(F("[NodeMCU RX <- D2] (len="));
        Serial.print(rxLen);
        Serial.print(F("): "));
        Serial.println(rxBuf);
      }
      rxLen = 0;
    } else if (c != '\r') {
      if (c < 32 || c > 126) {
        Serial.print(F("[WARN] Non-printable byte received: 0x"));
        Serial.println((uint8_t)c, HEX);
      }
      if (rxLen < sizeof(rxBuf) - 1) {
        rxBuf[rxLen++] = c;
      } else {
        Serial.println(F("[WARN] Line exceeded 95 bytes; buffer reset."));
        rxLen = 0;
      }
    }
  }
}
