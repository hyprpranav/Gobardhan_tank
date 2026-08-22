/**
 * api.js — GOBARDHAN ESP32 Communication Layer
 * Supports Web Serial API (Primary) and HTTP IP API (Secondary)
 */

const ESP32_CONFIG_KEY = 'gobardhan_esp32_ip';
const REQUEST_TIMEOUT_MS = 5000;

// ---- Internal state ----
let _esp32Ip = localStorage.getItem(ESP32_CONFIG_KEY) || '';
let _isConnected = false;
let _lastDataTime = null;
let _onConnectionChange = null;
let _lastData = null;

// Serial State
let _commMode = 'NONE'; // 'PORT' or 'IP'
let _port = null;
let _reader = null;
let _writer = null;

// ---- Public API ----

export function setEsp32Ip(ip) {
  _esp32Ip = ip.trim();
  localStorage.setItem(ESP32_CONFIG_KEY, _esp32Ip);
}

export function getEsp32Ip() {
  return _esp32Ip;
}

export function getLastDataTime() {
  return _lastDataTime;
}

export function isConnected() {
  return _isConnected;
}

export function getCommMode() {
  return _commMode;
}

export function onConnectionChange(cb) {
  _onConnectionChange = cb;
}

function _setConnected(connected) {
  if (_isConnected !== connected) {
    _isConnected = connected;
    if (_onConnectionChange) _onConnectionChange(connected);
  }
}

// ==== Serial Implementation ====

export async function connectPort() {
  try {
    if (!navigator.serial) {
      throw new Error("Web Serial API not supported in this browser.");
    }
    _port = await navigator.serial.requestPort();
    await _port.open({ baudRate: 115200 }); // ESP32 is set to 115200
    _commMode = 'PORT';
    _setConnected(true);
    _lastDataTime = Date.now();
    _startSerialReadLoop();
    return true;
  } catch (err) {
    console.error('Serial connection failed:', err);
    return false;
  }
}

export async function disconnectPort() {
  if (_reader) {
    await _reader.cancel().catch(() => { });
    _reader = null;
  }
  if (_writer) {
    _writer.releaseLock();
    _writer = null;
  }
  if (_port) {
    await _port.close().catch(() => { });
    _port = null;
  }
  _commMode = 'NONE';
  _setConnected(false);
}

async function _startSerialReadLoop() {
  if (!_port) return;
  const textDecoder = new TextDecoderStream();
  const readableStreamClosed = _port.readable.pipeTo(textDecoder.writable);
  _reader = textDecoder.readable.getReader();

  let buffer = '';
  try {
    while (true) {
      const { value, done } = await _reader.read();
      if (done) break;
      buffer += value;

      let lines = buffer.split('\n');
      buffer = lines.pop(); // Re-assign buffer to incomplete last line

      for (let line of lines) {
        line = line.trim();
        if (line.startsWith('{') && line.endsWith('}')) {
          try {
            const data = JSON.parse(line);
            if (data.methane !== undefined || data.distance !== undefined) {
              _lastData = parseSensorData(data);
              _lastDataTime = Date.now();
              _setConnected(true);
            }
          } catch (e) {
            // Ignore parse errors on partial JSON
          }
        }
      }
    }
  } catch (error) {
    console.warn("Serial read broken:", error);
  } finally {
    _reader.releaseLock();
    disconnectPort();
  }
}

async function _sendSerialCommand(cmdStr) {
  if (!_port || !_port.writable) throw new Error("Serial port not writable");
  if (!_writer) {
    const textEncoder = new TextEncoderStream();
    const writableStreamClosed = textEncoder.readable.pipeTo(_port.writable);
    _writer = textEncoder.writable.getWriter();
  }
  await _writer.write(cmdStr + '\n');
  _lastDataTime = Date.now();
  _setConnected(true);
  return { ok: true };
}

// ==== HTTP Fetch Implementation ====

function _buildUrl(path) {
  if (!_esp32Ip) throw new Error('ESP32 IP address not configured.');
  return `http://${_esp32Ip}${path}`;
}

async function _fetch(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(_buildUrl(path), {
      method: 'GET',
      signal: controller.signal,
      mode: 'cors',
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ---- Public Data Functions ----

/**
 * Fetch sensor data from ESP32
 * Depending on the active mode (PORT vs IP), returns cached serial data or fetches via HTTP
 */
export async function fetchSensorData() {
  if (_commMode === 'PORT') {
    if (_lastData) {
      if (Date.now() - _lastDataTime > 8000) {
        throw new Error("Serial data timeout");
      }
      return _lastData;
    }
    throw new Error("No data received yet via serial");
  } else {
    // Mode is IP or fallback
    const raw = await _fetch('/api/data');
    _commMode = 'IP';
    _setConnected(true);
    _lastDataTime = Date.now();
    return parseSensorData(raw);
  }
}

function parseSensorData(raw) {
  return {
    distance: _toFloat(raw.distance, 0),
    methane: _toFloat(raw.methane, 0),
    pressure: _toFloat(raw.pressure, 1013.25),
    outsideTemp: _toFloat(raw.outsideTemp, 0),
    humidity: _toFloat(raw.humidity, 0),
    slurryTemp: _toFloat(raw.slurryTemp, 0),
    stirrer: !!raw.stirrer,
    grinder: !!raw.grinder,
    outlet: !!raw.outlet,
  };
}

function _toFloat(val, fallback) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

export function markDisconnected() {
  _setConnected(false);
}

// ---- Control Commands ----

async function _sendCommand(path, serialCmd) {
  if (_commMode === 'PORT') {
    return _sendSerialCommand(JSON.stringify({ cmd: serialCmd }));
  } else {
    const result = await _fetch(path);
    _setConnected(true);
    _lastDataTime = Date.now();
    return result;
  }
}

export async function stirrerOn() { return _sendCommand('/api/stirrer/on', 'stirrerOn'); }
export async function stirrerOff() { return _sendCommand('/api/stirrer/off', 'stirrerOff'); }
export async function grinderOn() { return _sendCommand('/api/grinder/on', 'grinderOn'); }
export async function grinderOff() { return _sendCommand('/api/grinder/off', 'grinderOff'); }
export async function outletOpen() { return _sendCommand('/api/outlet/open', 'outletOpen'); }
export async function outletClose() { return _sendCommand('/api/outlet/close', 'outletClose'); }

/**
 * Validates HTTP IP Connection
 */
export async function testConnection(ip) {
  const preferred = (ip || _esp32Ip || '').trim();
  const candidates = [preferred, '10.129.159.200'].filter(Boolean); // simplified probe for time

  const originalIp = _esp32Ip;
  for (const candidate of candidates) {
    try {
      _esp32Ip = candidate;
      await _fetch('/api/data');
      localStorage.setItem(ESP32_CONFIG_KEY, candidate);
      _commMode = 'IP';
      return true;
    } catch { }
  }
  _esp32Ip = originalIp;
  _setConnected(false);
  return false;
}

