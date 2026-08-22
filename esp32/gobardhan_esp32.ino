/*
 * ============================================================
 * GOBARDHAN — Smart Biogas Monitoring & Slurry Management
 * ESP32 Master Firmware — Lightweight HTTP API Server
 * ============================================================
 *
 * Architecture:
 *   - Master ESP32: Manages Wi-Fi, HTTP API, Sensors, Grinder Relay,
 *                   Outlet Valve Relay, and Stepper Trigger Signal.
 *   - Secondary ESP32: Drives L298N Stepper Motor independently
 *                   when Trigger Signal is HIGH (3.3V).
 *
 * GPIO Pin Map (Master ESP32):
 *   - HC-SR04 Ultrasonic: Trig=5, Echo=18
 *   - MQ-4 Gas Sensor:    Analog Pin 34 (ADC1)
 *   - BMP180:             I2C SDA=21, SCL=22
 *   - DHT11:              Pin 19
 *   - DS18B20:            Pin 4
 *   - Outlet Valve Relay: Pin 23
 *   - Grinder Relay:      Pin 15 (or 26/27 if wired to another pin)
 *   - Stepper Trigger:    Pin 25 (Mirrored on Pin 26 for flexibility)
 *   - Status Onboard LED: Pin 2
 *
 * API Endpoints:
 *   GET /api/data          → JSON: sensor readings + actuator states
 *   GET /api/stirrer/on    → PIN 25 & 26 HIGH (3.3V) -> Triggers Stepper ESP32
 *   GET /api/stirrer/off   → PIN 25 & 26 LOW (0.0V)  -> Stops Stepper ESP32
 *   GET /api/grinder/on    → Enable grinder relay (PIN 15 ONLY — stepper NOT affected)
 *   GET /api/grinder/off   → Disable grinder relay (PIN 15 ONLY — stepper NOT affected)
 *   GET /api/outlet/open   → Open gate valve (relay ON)
 *   GET /api/outlet/close  → Close gate valve (relay OFF)
 *
 * ============================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_BMP085.h>    // BMP180 (uses BMP085 library)
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ============================================================
// Wi-Fi Credentials — UPDATE FOR YOUR NETWORK
// ============================================================
const char* WIFI_SSID     = "Oppo A77s";
const char* WIFI_PASSWORD = "9080061674";

// Use a fixed local IP inside your router's LAN so the browser does not
// lose the ESP32 after a DHCP lease refresh or after a code upload/reset.
// Update these values to match your router's gateway and subnet.
IPAddress staticIP(10, 129, 159, 200);
IPAddress gateway(10, 129, 159, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress dns(1, 1, 1, 1);

// ============================================================
// Relay Polarity Configuration
// Most standard 5V blue relay modules are Active-LOW (LOW = ON, HIGH = OFF).
// If your relay module is Active-HIGH, change:
//   RELAY_ON  to HIGH
//   RELAY_OFF to LOW
// ============================================================
#define RELAY_ON                LOW    // Signal to turn Relay ON
#define RELAY_OFF               HIGH   // Signal to turn Relay OFF

// ============================================================
// GPIO Pin Definitions (Master ESP32)
// ============================================================
// Onboard Blue Status LED
#define PIN_LED_BUILTIN         2

// HC-SR04 Ultrasonic Sensor
#define PIN_TRIG                5
#define PIN_ECHO                18

// MQ-4 Methane Sensor (Analog ADC1)
#define PIN_MQ4                 34

// BMP180 (I2C — uses default SDA=21, SCL=22)

// DHT11 Ambient Temperature & Humidity
#define PIN_DHT                 19
#define DHT_TYPE                DHT11

// DS18B20 Slurry Temperature (1-Wire)
#define PIN_DS18B20             4

// Relays
#define PIN_RELAY_OUTLET        23   // Outlet Gate Valve Relay
#define PIN_GRINDER             15   // Grinder Relay (change if wired to another pin like 27 or 14)

// Stepper Inter-Board Trigger (Sends 3.3V HIGH to Nano D2)
#define PIN_STEPPER_TRIGGER     25   // Primary Trigger Out
#define PIN_STEPPER_TRIGGER_ALT 26   // Mirrored Backup Trigger Out

// ============================================================
// Actuator State
// ============================================================
bool stirrerOn   = false;
bool grinderOn   = false;
bool outletOpen  = false;

// ============================================================
// Sensor Objects & Server
// ============================================================
Adafruit_BMP085   bmp;
DHT               dht(PIN_DHT, DHT_TYPE);
OneWire           oneWire(PIN_DS18B20);
DallasTemperature ds18b20(&oneWire);
WebServer         server(80);

// ============================================================
// Sensor Cache (updated in loop, served via HTTP)
// ============================================================
struct SensorCache {
  float distance    = 0.0;
  int   methane     = 0;
  float pressure    = 1013.25;
  float outsideTemp = 0.0;
  float humidity    = 0.0;
  float slurryTemp  = 0.0;
} cache;

// Timing for non-blocking sensor reads
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL_MS = 2000;

// ============================================================
// HTTP CORS Helper
// ============================================================
void addCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.sendHeader("Cache-Control",                "no-cache");
}

void handleOPTIONS() {
  addCORSHeaders();
  server.send(204);
}

// ============================================================
// API: GET /api/data
// ============================================================
void handleApiData() {
  // NOTE: CORS is handled globally by server.enableCORS(true) in setup().
  // Do NOT call addCORSHeaders() here — duplicate headers break browser fetch.

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
  server.send(200, "application/json", out);
}

// ============================================================
// Actuator Logic (Used by both HTTP and Serial)
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
// API: Stirrer (Sets PIN 25 & PIN 26 HIGH / LOW)
// ============================================================
void handleStirrerOn() {
  executeStirrer(true);
  Serial.println("[COMMAND] STIRRER ON REQUESTED (HTTP)");
  server.send(200, "application/json", "{\"ok\":true,\"stirrer\":true,\"pin_25\":\"HIGH\",\"voltage\":\"3.3V\"}");
}

void handleStirrerOff() {
  executeStirrer(false);
  Serial.println("[COMMAND] STIRRER OFF REQUESTED (HTTP)");
  server.send(200, "application/json", "{\"ok\":true,\"stirrer\":false,\"pin_25\":\"LOW\",\"voltage\":\"0V\"}");
}

// ============================================================
// API: Grinder
// NOTE: The Grinder relay (PIN 15) is INDEPENDENT of the Stirrer/
//       Stepper trigger (PIN 25/26). They must NEVER cross-control
//       each other. The stepper is exclusively driven by handleStirrerOn/Off.
// ============================================================
void handleGrinderOn() {
  executeGrinder(true);
  Serial.println("[COMMAND] GRINDER ON REQUESTED (HTTP)");
  server.send(200, "application/json", "{\"ok\":true,\"grinder\":true}");
}

void handleGrinderOff() {
  executeGrinder(false);
  Serial.println("[COMMAND] GRINDER OFF REQUESTED (HTTP)");
  server.send(200, "application/json", "{\"ok\":true,\"grinder\":false}");
}

// ============================================================
// API: Outlet Valve
// ============================================================
void handleOutletOpen() {
  executeOutlet(true);
  Serial.println("[COMMAND] OUTLET OPEN REQUESTED (HTTP)");
  server.send(200, "application/json", "{\"ok\":true,\"outlet\":true}");
}

void handleOutletClose() {
  executeOutlet(false);
  Serial.println("[COMMAND] OUTLET CLOSED REQUESTED (HTTP)");
  server.send(200, "application/json", "{\"ok\":true,\"outlet\":false}");
}

// ============================================================
// 404 Handler
// ============================================================
void handleNotFound() {
  server.send(404, "application/json", "{\"error\":\"Not found\"}");
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
  return duration * 0.034 / 2.0;                   // Distance in cm
}

// ============================================================
// Sensor Reading — All Sensors (Non-blocking)
// ============================================================
void updateSensors() {
  unsigned long now = millis();
  if (now - lastSensorRead < SENSOR_INTERVAL_MS) return;
  lastSensorRead = now;

  // HC-SR04
  float dist = readUltrasonic();
  if (dist > 0) cache.distance = dist;

  // MQ-4 (Analog ADC)
  cache.methane = analogRead(PIN_MQ4);

  // BMP180 (I2C)
  cache.pressure = bmp.readPressure() / 100.0;   // Pa → hPa

  // DHT11
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) cache.outsideTemp = t;
  if (!isnan(h)) cache.humidity    = h;

  // DS18B20
  float slurryT = ds18b20.getTempCByIndex(0);
  if (slurryT != DEVICE_DISCONNECTED_C) cache.slurryTemp = slurryT;
  ds18b20.requestTemperatures();

  // Send update over Serial
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
  Serial.println(out);
}

// ============================================================
// Setup
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("==========================================");
  Serial.println("  GOBARDHAN MASTER ESP32 FIRMWARE");
  Serial.println("  Smart Biogas System Control Center");
  Serial.println("==========================================");

  // ---- GPIO Setup ----
  pinMode(PIN_LED_BUILTIN,         OUTPUT);
  pinMode(PIN_TRIG,                OUTPUT);
  pinMode(PIN_ECHO,                INPUT);
  pinMode(PIN_RELAY_OUTLET,        OUTPUT);
  pinMode(PIN_GRINDER,             OUTPUT);
  pinMode(PIN_STEPPER_TRIGGER,     OUTPUT);
  pinMode(PIN_STEPPER_TRIGGER_ALT, OUTPUT);

  // Safe initial state:
  digitalWrite(PIN_LED_BUILTIN,         LOW);
  digitalWrite(PIN_RELAY_OUTLET,        RELAY_OFF);
  digitalWrite(PIN_GRINDER,             RELAY_OFF);
  digitalWrite(PIN_STEPPER_TRIGGER,     LOW);
  digitalWrite(PIN_STEPPER_TRIGGER_ALT, LOW);

  // ---- Sensor Initialization ----
  Wire.begin(21, 22);

  if (!bmp.begin()) {
    Serial.println("[ERROR] BMP180 not detected on I2C (21/22). Check wiring.");
  }

  dht.begin();
  ds18b20.begin();
  ds18b20.setWaitForConversion(false);
  ds18b20.requestTemperatures();

  // ---- Wi-Fi Connection ----
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.config(staticIP, gateway, subnet, dns, dns);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 60) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ERROR] Wi-Fi connection failed. Check SSID/password or router settings.");
    Serial.println("        If this is a 2.4GHz-only network, connect the ESP32 to that band.");
    delay(3000);
    ESP.restart();
  }

  Serial.println("Wi-Fi Connected successfully!");
  Serial.print("  -> Actual IP   : "); Serial.println(WiFi.localIP());
  Serial.print("  -> Static IP   : "); Serial.println(staticIP);
  Serial.print("  -> Gateway     : "); Serial.println(WiFi.gatewayIP());
  Serial.print("  -> Subnet Mask : "); Serial.println(WiFi.subnetMask());

  if (WiFi.localIP() != staticIP) {
    Serial.println();
    Serial.println("[WARN] *** Static IP was NOT accepted by the router! ***");
    Serial.println("[WARN] The ESP32 is using DHCP-assigned IP above instead.");
    Serial.println("[WARN] Update staticIP/gateway/subnet in the firmware to match.");
    Serial.println("[WARN] Use the 'Actual IP' above in the dashboard connection field.");
  } else {
    Serial.println("  -> Static IP accepted. Enter this IP in the dashboard.");
  }

  // ---- HTTP API Routes (Handles any HTTP method including GET & OPTIONS) ----
  server.on("/api/data",         handleApiData);
  server.on("/api/stirrer/on",   handleStirrerOn);
  server.on("/api/stirrer/off",  handleStirrerOff);
  server.on("/api/grinder/on",   handleGrinderOn);
  server.on("/api/grinder/off",  handleGrinderOff);
  server.on("/api/outlet/open",  handleOutletOpen);
  server.on("/api/outlet/close", handleOutletClose);

  server.onNotFound(handleNotFound);

  // Enable automatic CORS headers
  server.enableCORS(true);

  server.begin();
  Serial.println("HTTP API Server Started.");
  Serial.println("System Ready.");
  Serial.println("==========================================");

  // Initial sensor read
  lastSensorRead = 0;
  updateSensors();
}

// ============================================================
// Main Loop
// ============================================================
void loop() {
  server.handleClient();   // Handle incoming web dashboard requests
  
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.startsWith("{")) {
      StaticJsonDocument<128> doc;
      DeserializationError err = deserializeJson(doc, line);
      if (!err) {
        String cmd = doc["cmd"].as<String>();
        if (cmd == "stirrerOn") executeStirrer(true);
        else if (cmd == "stirrerOff") executeStirrer(false);
        else if (cmd == "grinderOn") executeGrinder(true);
        else if (cmd == "grinderOff") executeGrinder(false);
        else if (cmd == "outletOpen") executeOutlet(true);
        else if (cmd == "outletClose") executeOutlet(false);
        
        Serial.println("{\"ok\":true}"); // Ack
      }
    }
  }

  updateSensors();         // Periodic sensor reads every 2 seconds
}
