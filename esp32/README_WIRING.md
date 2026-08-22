# GOBARDHAN Dual-ESP32 Hardware & Wiring Guide

This document describes the dual-ESP32 architecture for GobarDhan v3.0, separating high-frequency stepper motor driving from the WebServer / Sensor tasks for maximum reliability and smooth motor rotation.

---

## Architecture Overview

```
 [ Web Browser / Dashboard ]
             │ (Wi-Fi HTTP API)
             ▼
 ┌────────────────────────────────────────────────────────┐
 │                   MASTER ESP32                         │
 │  (Firmware: esp32/gobardhan_esp32.ino)                 │
 │                                                        │
 │  • Wi-Fi WebServer & REST API (/api/data, etc.)        │
 │  • Ultrasonic HC-SR04 (Trig: 5, Echo: 18)             │
 │  • MQ-4 Methane Sensor (Pin 34 - ADC1)                 │
 │  • BMP180 Pressure Sensor (I2C: SDA 21, SCL 22)        │
 │  • DHT11 Ambient Temp/Hum (Pin 19)                     │
 │  • DS18B20 Slurry Temp (Pin 4)                         │
 │  • Outlet Valve Relay (Pin 23)                         │
 │  • Grinder Relay (Pin 15 or configurable)              │
 │  • Status Onboard Blue LED (Pin 2)                     │
 │                                                        │
 │  • Stepper Trigger Output: GPIO 25 & GPIO 26 (Mirror)──┐
 └────────────────────────────────────────────────────────┼───┘
                                                          │ Signal (HIGH = 3.3V, LOW = 0V)
                                                          │ Common GND (Mandatory)
                                                          ▼
 ┌────────────────────────────────────────────────────────┐
 │              SECONDARY STEPPER ESP32                   │
 │  (Firmware: esp32/gobardhan_stepper_esp32.ino)         │
 │                                                        │
 │  • Trigger Signal Input: GPIO 13                       │
 │  • Status Onboard Blue LED (Pin 2)                     │
 │  • L298N Motor Driver Pins:                            │
 │      - IN1: GPIO 25                                    │
 │      - IN2: GPIO 26                                    │
 │      - IN3: GPIO 27                                    │
 │      - IN4: GPIO 14                                    │
 │      - ENA: GPIO 33                                    │
 │      - ENB: GPIO 32                                    │
 └─────────────────────────┬──────────────────────────────┘
                           │ Coils A & B
                           ▼
                  [ Stepper Motor / Mixer ]
```

---

## 1. Inter-Board Connection (Master ESP32 ➔ Secondary ESP32)

| Master ESP32 Pin | Secondary Stepper ESP32 Pin | Description |
|---|---|---|
| **GPIO 25** (or **GPIO 26**) | **GPIO 13** | Trigger Signal (3.3V HIGH = Run, 0V LOW = Stop) |
| **GND** | **GND** | **COMMON GROUND** *(CRITICAL for signal reference)* |

> **IMPORTANT**: Always connect the **GND** pin of Master ESP32 to the **GND** pin of Secondary ESP32. Without common ground, digital logic levels will float.

---

## 2. Master ESP32 Pinout (`gobardhan_esp32.ino`)

| Component / Function | Master ESP32 GPIO | Description / Notes |
|---|---|---|
| **Onboard Blue LED** | `GPIO 2` | Lights UP when Stirrer is turned ON |
| **HC-SR04 Trigger** | `GPIO 5` | Ultrasonic sensor trigger output |
| **HC-SR04 Echo** | `GPIO 18` | Ultrasonic sensor echo input |
| **MQ-4 Gas Sensor (Analog)** | `GPIO 34` | ADC1 input (Methane reading) |
| **BMP180 SDA** | `GPIO 21` | I2C Data |
| **BMP180 SCL** | `GPIO 22` | I2C Clock |
| **DHT11 Data** | `GPIO 19` | Ambient Temperature & Humidity |
| **DS18B20 Data** | `GPIO 4` | Slurry Temperature (4.7kΩ pull-up to 3.3V) |
| **Outlet Valve Relay** | `GPIO 23` | Active-LOW relay module (`LOW` = OPEN, `HIGH` = CLOSED) |
| **Grinder Relay** | `GPIO 15` | Active-LOW relay module (or change `PIN_GRINDER` to 27/14) |
| **Stepper Trigger Output** | `GPIO 25` & `GPIO 26` | Both output 3.3V HIGH on ON, 0V on OFF |

---

## 3. Secondary Stepper ESP32 Pinout (`gobardhan_stepper_esp32.ino`)

| Component / Function | Secondary ESP32 GPIO | Description / Notes |
|---|---|---|
| **Onboard Blue LED** | `GPIO 2` | Lights UP when motor is running |
| **Trigger Input from Master** | `GPIO 13` | Configured as `INPUT_PULLDOWN` |
| **L298N IN1** | `GPIO 25` | Motor Coil A+ |
| **L298N IN2** | `GPIO 26` | Motor Coil A- |
| **L298N IN3** | `GPIO 27` | Motor Coil B+ |
| **L298N IN4** | `GPIO 14` | Motor Coil B- |
| **L298N ENA** | `GPIO 33` | Channel A Enable (`HIGH`) |
| **L298N ENB** | `GPIO 32` | Channel B Enable (`HIGH`) |
| **Power Supply Ground** | `GND` | Common with L298N GND and Master ESP32 GND |

---

## 4. How to Test & Verify Voltage Instantly

### Direct Browser Test (Bypasses Dashboard to verify hardware):
1. Find your Master ESP32's IP Address in the Arduino Serial Monitor (e.g. `192.168.1.105`).
2. In your browser address bar on your phone or PC (connected to the same Wi-Fi), open:
   - **Turn ON Stirrer**: `http://192.168.1.105/api/stirrer/on`
     - You will see JSON: `{"ok":true,"stirrer":true,"pin_25":"HIGH","voltage":"3.3V"}`
     - The **Onboard Blue LED on Master ESP32 will turn ON**.
     - Multimeter on **GPIO 25** or **GPIO 26** will measure **3.3V DC**.
     - Secondary ESP32 will light its **Blue LED** and start rotating the motor continuously!
   - **Turn OFF Stirrer**: `http://192.168.1.105/api/stirrer/off`
     - You will see JSON: `{"ok":true,"stirrer":false,"pin_25":"LOW","voltage":"0V"}`
     - The **Blue LEDs will turn OFF**.
     - Multimeter will measure **0.0V DC**.
     - Motor immediately stops with coils de-energized.
