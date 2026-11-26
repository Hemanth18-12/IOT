# SmartRoom Manual Hardware & System Test Cases

Perform these manual verification checks after wiring the Arduino Uno, NodeMCU ESP8266, and sensors as described in [HARDWARE_SETUP.md](HARDWARE_SETUP.md).

| ID | Test Case | Procedure | Expected Result |
| --- | --- | --- | --- |
| HW-01 | Startup Lock & LCD | Power on Arduino Uno + external 5V servo PSU | Servo moves to `0°`, detaches after ~700 ms (`D12` LOW), LCD shows temperature and `PIN: LOCKED`. |
| HW-02 | Live Telemetry Streaming | Connect NodeMCU to Wi-Fi + Mosquitto | NodeMCU `D4` LED stays ON; dashboard displays `Node Online`, live `°C` and `cm` updates without page refresh. |
| HW-03 | Ultrasonic Toggle ON | Wave hand `2–10 cm` in front of HC-SR04, then remove hand (`>=12 cm`) | Fan (`D13`) and LED (`A1`) turn **ON** and **remain ON** after hand is removed; dashboard reflects `ON`. |
| HW-04 | Ultrasonic Toggle OFF | Wave hand `2–10 cm` a second time after `3` clear readings | Fan and LED turn **OFF** and remain OFF; analytics records state-change duration. |
| HW-05 | Correct Keypad Entry | Enter `1234#` on 4x4 keypad | LCD masks keys as `****`, unlocks servo to `90°`, auto-locks after `10s`, logs `UNLOCK_PASSWORD`. |
| HW-06 | Manual Keypad Lock & Clear | Enter `12*` then `D` | `*` clears digits; `D` immediately locks servo (`0°`) and emits `DOOR_LOCKED`. |
| HW-07 | Wrong Password Alarm & Email | Enter `9999#` on keypad | Servo does NOT move; buzzer on `D5` sounds for `5s` (`millis`); dashboard alerts `WRONG_PASSWORD`; SMTP sends alert email. |
| HW-08 | Authorized Face Unlock | Send `'A'` over Python USB serial (`9600` baud) | Servo unlocks (`90°`), silences any active buzzer early, logs `UNLOCK_FACE` on dashboard. |
| HW-09 | Unauthorized Face Alarm & Email | Send `'R'` over Python USB serial | Servo stays locked; `5s` buzzer sounds; `UNKNOWN_FACE` alert appears in dashboard and triggers alert email. |
| HW-10 | Remote Dashboard Unlock | Click yellow **Unlock Door**, confirm modal | Status shows `PENDING`, waits for Arduino `ACK`, updates to `UNLOCKED` only after confirmation, auto-locks in `10s`. |
| HW-11 | Offline Resilience | Unplug Wi-Fi / stop Mosquitto | Dashboard shows `Device Offline` + stale warning and disables remote controls. Keypad `1234#`, wrong password `5s` buzzer, face `'A'`/`'R'`, and ultrasonic fan/LED continue working locally. |
| HW-12 | Reconnection Recovery | Reconnect NodeMCU Wi-Fi | LWT offline clears, `Device Online` appears, state restores; no expired remote unlock command replays. |
| HW-13 | Mobile Browser Access | Open `http://<LAN_IP>:5173` on phone on same Wi-Fi | Responsive layout, drawer sidebar, real-time Socket.IO updates, functional door controls. |
