/*
 * ============================================================
 * GOBARDHAN — Smart Biogas Monitoring & Slurry Management
 * ESP32 Master Firmware — High-Speed USB Serial Direct Mode
 * (No Wi-Fi — Ultra Low Power, Zero Latency, Continuous Run)
 * ============================================================
 *
 * Architecture:
 *   - Master ESP32: Reads all sensors, streams newline-delimited JSON
 *                   over USB Serial at 115200 baud, controls Grinder
 *                   and Outlet relays, and triggers Secondary Stepper ESP32.
 *   - Secondary ESP32: Drives L298N Stepper Motor independently
 *                   when Trigger Signal (GPIO 25/26) is HIGH.
 *
 * GPIO Pin Map (Master ESP32):
 *   - HC-SR04 Ultrasonic: Trig=5, Echo=18
 *   - MQ-4 Gas Sensor:    Analog Pin 34 (ADC1)
 *   - BMP180:             I2C SDA=21, SCL=22
 *   - DHT11:              Pin 19
 *   - DS18B20:            Pin 4
 *   - Outlet Valve Relay: Pin 23
 *   - Grinder Relay:      Pin 15
 *   - Stepper Trigger:    Pin 25 (Mirrored on Pin 26)
 *   - Status Onboard LED: Pin 2
 *
 * Serial Protocol (115200 baud):
 *   - ESP32 outputs every 1.5s:
 *     {"distance":58.2,"methane":186,"pressure":1003.4,"outsideTemp":32.5,"humidity":46,"slurryTemp":30.3,"stirrer":false,"grinder":false,"outlet":false}
 *   - Browser sends commands:
 *     {"cmd":"stirrerOn"}   -> Turns ON Stepper Trigger (PIN 25 & 26 HIGH)
 *     {"cmd":"stirrerOff"}  -> Turns OFF Stepper Trigger (PIN 25 & 26 LOW)
 *     {"cmd":"grinderOn"}   -> Turns ON Grinder Relay (PIN 15)
 *     {"cmd":"grinderOff"}  -> Turns OFF Grinder Relay (PIN 15)
 *     {"cmd":"outletOpen"}  -> Opens Outlet Gate Valve (PIN 23)
 *     {"cmd":"outletClose"} -> Closes Outlet Gate Valve (PIN 23)
 *     {"cmd":"getData"}     -> Immediately sends current sensor cache
 * ============================================================
 */

#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_BMP085.h>    // BMP180 (uses BMP085 library)
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ============================================================
// Relay Polarity Configuration
// Active-LOW relay modules: LOW = Relay ON (Engaged), HIGH = Relay OFF
// ============================================================
#define RELAY_ON                LOW    // Signal to turn Relay ON
#define RELAY_OFF               HIGH   // Signal to turn Relay OFF

// ============================================================
// GPIO Pin Definitions
// ============================================================
#define PIN_LED_BUILTIN         2

// HC-SR04 Ultrasonic Sensor
#define PIN_TRIG                5
#define PIN_ECHO                18

// MQ-4 Methane Sensor (Analog ADC1)
#define PIN_MQ4                 34

// BMP180 (I2C uses default SDA=21, SCL=22)

// DHT11 Ambient Temperature & Humidity
#define PIN_DHT                 19
#define DHT_TYPE                DHT11

// DS18B20 Slurry Temperature (1-Wire)
#define PIN_DS18B20             4

// Relays
#define PIN_RELAY_OUTLET        23   // Outlet Gate Valve Relay
#define PIN_GRINDER             15   // Grinder Relay

// Stepper Inter-Board Trigger (Sends 3.3V HIGH to Secondary ESP32)
#define PIN_STEPPER_TRIGGER     25   // Primary Trigger Out
#define PIN_STEPPER_TRIGGER_ALT 26   // Mirrored Backup Trigger Out

// ============================================================
// Actuator State
// ============================================================
bool stirrerOn   = false;
bool grinderOn   = false;
bool outletOpen  = false;

// ============================================================
// Sensor Objects
// ============================================================
Adafruit_BMP085   bmp;
DHT               dht(PIN_DHT, DHT_TYPE);
OneWire           oneWire(PIN_DS18B20);
DallasTemperature ds18b20(&oneWire);

// ============================================================
// Sensor Cache
// ============================================================
struct SensorCache {
  float distance    = 0.0;
  int   methane     = 0;
  float pressure    = 1013.25;
  float outsideTemp = 0.0;
  float humidity    = 0.0;
  float slurryTemp  = 0.0;
} cache;

// Timing for non-blocking sensor reads and output stream
unsigned long lastSensorRead   = 0;
const unsigned long SENSOR_INTERVAL_MS = 1500;   // Stream data every 1.5 seconds

// Serial input buffer for incoming commands
String inputBuffer = "";

// ============================================================
// Actuator Logic
// ============================================================
void executeStirrer(bool state) {
  stirrerOn = state;
  pinMode(PIN_STEPPER_TRIGGER,     OUTPUT);
  pinMode(PIN_STEPPER_TRIGGER_ALT, OUTPUT);
  digitalWrite(PIN_STEPPER_TRIGGER,     state ? HIGH : LOW);
  digitalWrite(PIN_STEPPER_TRIGGER_ALT, state ? HIGH : LOW);
  digitalWrite(PIN_LED_BUILTIN, state ? HIGH : LOW);
}

void executeGrinder(bool state) {
  grinderOn = state;
  pinMode(PIN_GRINDER, OUTPUT);
  digitalWrite(PIN_GRINDER, state ? RELAY_ON : RELAY_OFF);
}

void executeOutlet(bool state) {
  outletOpen = state;
  pinMode(PIN_RELAY_OUTLET, OUTPUT);
  digitalWrite(PIN_RELAY_OUTLET, state ? RELAY_ON : RELAY_OFF);
}

// ============================================================
// Sensor Reading — Ultrasonic (HC-SR04)
// ============================================================
float readUltrasonic() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  long duration = pulseIn(PIN_ECHO, HIGH, 30000);  // 30ms timeout
  if (duration == 0) return -1.0;
  return (float)(duration * 0.034 / 2.0);          // Distance in cm
}

// ============================================================
// Sensor Reading — All Sensors & Serial Transmission
// ============================================================
void sendSensorData() {
  StaticJsonDocument<256> doc;
  doc["distance"]    = cache.distance;
  doc["methane"]     = cache.methane;
  doc["pressure"]    = cache.pressure;
  doc["outsideTemp"] = cache.outsideTemp;
  doc["humidity"]    = cache.humidity;
  doc["slurryTemp"]  = cache.slurryTemp;
  doc["stirrer"]     = stirrerOn;
  doc["grinder"]     = grinderOn;
  doc["outlet"]      = outletOpen;

  String out;
  serializeJson(doc, out);
  Serial.println(out);   // Pure JSON line followed by newline
  Serial.flush();
}

void updateSensors() {
  unsigned long now = millis();
  if (now - lastSensorRead < SENSOR_INTERVAL_MS) return;
  lastSensorRead = now;

  // HC-SR04 Ultrasonic
  float dist = readUltrasonic();
  if (dist > 0) cache.distance = dist;

  // MQ-4 Methane (Analog ADC)
  cache.methane = analogRead(PIN_MQ4);

  // BMP180 Pressure (I2C)
  float p = bmp.readPressure();
  if (p > 30000 && p < 120000) {
    cache.pressure = p / 100.0;   // Pa -> hPa
  }

  // DHT11 Ambient Temperature & Humidity
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && t > -20 && t < 80) cache.outsideTemp = t;
  if (!isnan(h) && h >= 0 && h <= 100) cache.humidity   = h;

  // DS18B20 Slurry Temperature
  float slurryT = ds18b20.getTempCByIndex(0);
  if (slurryT > -40.0 && slurryT < 100.0 && slurryT != DEVICE_DISCONNECTED_C) {
    cache.slurryTemp = slurryT;
  }
  ds18b20.requestTemperatures();

  // Stream data to USB Serial
  sendSensorData();
}

// ============================================================
// Process Incoming Serial Command
// ============================================================
void processCommand(const String& line) {
  int startIdx = line.indexOf('{');
  int endIdx   = line.lastIndexOf('}');
  if (startIdx == -1 || endIdx == -1 || endIdx <= startIdx) return;

  String jsonStr = line.substring(startIdx, endIdx + 1);
  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, jsonStr);
  if (err) return;

  const char* cmd = doc["cmd"] | "";
  bool handled = true;

  if      (strcmp(cmd, "stirrerOn")   == 0) executeStirrer(true);
  else if (strcmp(cmd, "stirrerOff")  == 0) executeStirrer(false);
  else if (strcmp(cmd, "grinderOn")   == 0) executeGrinder(true);
  else if (strcmp(cmd, "grinderOff")  == 0) executeGrinder(false);
  else if (strcmp(cmd, "outletOpen")  == 0) executeOutlet(true);
  else if (strcmp(cmd, "outletClose") == 0) executeOutlet(false);
  else if (strcmp(cmd, "getData")     == 0) { sendSensorData(); return; }
  else handled = false;

  StaticJsonDocument<128> ack;
  ack["ok"]      = handled;
  ack["cmd"]     = cmd;
  ack["stirrer"] = stirrerOn;
  ack["grinder"] = grinderOn;
  ack["outlet"]  = outletOpen;

  String ackStr;
  serializeJson(ack, ackStr);
  Serial.println(ackStr);
  Serial.flush();
}

// ============================================================
// Setup
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  // ---- GPIO Setup ----
  pinMode(PIN_LED_BUILTIN,         OUTPUT);
  pinMode(PIN_TRIG,                OUTPUT);
  pinMode(PIN_ECHO,                INPUT);
  pinMode(PIN_RELAY_OUTLET,        OUTPUT);
  pinMode(PIN_GRINDER,             OUTPUT);
  pinMode(PIN_STEPPER_TRIGGER,     OUTPUT);
  pinMode(PIN_STEPPER_TRIGGER_ALT, OUTPUT);

  // Safe default states: All actuators OFF, LED OFF
  digitalWrite(PIN_LED_BUILTIN,         LOW);
  digitalWrite(PIN_RELAY_OUTLET,        RELAY_OFF);
  digitalWrite(PIN_GRINDER,             RELAY_OFF);
  digitalWrite(PIN_STEPPER_TRIGGER,     LOW);
  digitalWrite(PIN_STEPPER_TRIGGER_ALT, LOW);

  // ---- Sensors Initialization ----
  Wire.begin(21, 22);
  bmp.begin();          // BMP180
  dht.begin();          // DHT11
  ds18b20.begin();      // DS18B20
  ds18b20.setWaitForConversion(false);
  ds18b20.requestTemperatures();

  // Initial sensor warm-up read
  float initDist = readUltrasonic();
  if (initDist > 0) cache.distance = initDist;
  cache.methane = analogRead(PIN_MQ4);
  float initP = bmp.readPressure();
  if (initP > 30000 && initP < 120000) cache.pressure = initP / 100.0;
  float initT = dht.readTemperature();
  float initH = dht.readHumidity();
  if (!isnan(initT)) cache.outsideTemp = initT;
  if (!isnan(initH)) cache.humidity    = initH;

  // Print startup notification (as JSON so Web Serial doesn't choke)
  Serial.println("{\"system\":\"GOBARDHAN\",\"version\":\"3.0-SERIAL\",\"ready\":true}");
  Serial.flush();
}

// ============================================================
// Main Loop — Non-blocking, Continuous
// ============================================================
void loop() {
  // Read incoming serial commands byte-by-byte
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      if (inputBuffer.length() < 256) {
        inputBuffer += c;
      } else {
        inputBuffer = ""; // Overflow protection
      }
    }
  }

  // Periodic sensor readings and streaming
  updateSensors();
}
