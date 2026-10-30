/**
 * api.js — GOBARDHAN High-Speed USB Serial Communication Layer
 * (Dedicated Web Serial API Driver — 115200 Baud, Event-Driven, No Wi-Fi)
 */

// Internal state
let _port = null;
let _reader = null;
let _isConnected = false;
let _isConnectedRequested = false;
let _lastData = null;
let _lastDataTime = null;
let _packetCount = 0;
let _readLoopPromise = null;

// Callbacks
const _connectionListeners = new Set();
const _dataListeners = new Set();

/**
 * Register connection state change listener
 * @param {(connected: boolean, error?: string) => void} callback
 */
export function onConnectionChange(callback) {
  if (typeof callback === 'function') {
    _connectionListeners.add(callback);
  }
}

/**
 * Remove connection listener
 */
export function offConnectionChange(callback) {
  _connectionListeners.delete(callback);
}

/**
 * Register sensor data packet listener (Event-Driven)
 * @param {(data: object) => void} callback
 */
export function onData(callback) {
  if (typeof callback === 'function') {
    _dataListeners.add(callback);
    // If we already have recent data, deliver it immediately
    if (_lastData) {
      try { callback(_lastData); } catch (e) { console.error(e); }
    }
  }
}

/**
 * Remove data listener
 */
export function offData(callback) {
  _dataListeners.delete(callback);
}

function _setConnected(state, err = null) {
  if (_isConnected !== state) {
    _isConnected = state;
    _connectionListeners.forEach(fn => {
      try { fn(state, err); } catch (e) { console.error(e); }
    });
  }
}

function _emitData(data) {
  _dataListeners.forEach(fn => {
    try { fn(data); } catch (e) { console.error(e); }
  });
}

export function isConnected() {
  return _isConnected;
}

export function getLastData() {
  return _lastData;
}

export function getLastDataTime() {
  return _lastDataTime;
}

export function getPacketCount() {
  return _packetCount;
}

/**
 * Listen for physical hardware detach
 */
if (typeof navigator !== 'undefined' && 'serial' in navigator) {
  navigator.serial.addEventListener('disconnect', (event) => {
    if (event.target === _port) {
      console.warn('[GOBARDHAN] USB Serial Device was physically disconnected.');
      disconnectPort('Device unplugged');
    }
  });
}

/**
 * Connect to ESP32 via Web Serial API
 */
export async function connectPort() {
  if (!navigator.serial) {
    const msg = 'Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge.';
    _setConnected(false, msg);
    throw new Error(msg);
  }

  // Close existing port if any
  if (_port) {
    await disconnectPort();
  }

  try {
    // Prompt user to select ESP32 COM port
    _port = await navigator.serial.requestPort();
    await _port.open({
      baudRate: 115200,
      bufferSize: 8192,
    });

    _isConnectedRequested = true;
    _lastDataTime = Date.now();
    _packetCount = 0;
    _setConnected(true);

    console.log('[GOBARDHAN] Serial port opened at 115200 baud.');

    // Start background stream reader loop
    _readLoopPromise = _runReadLoop();
    return true;
  } catch (err) {
    console.error('[GOBARDHAN] Failed to open Serial Port:', err);
    _port = null;
    _isConnectedRequested = false;
    _setConnected(false, err.message);
    return false;
  }
}

/**
 * Disconnect and release locks
 */
export async function disconnectPort(reason = 'User disconnected') {
  console.log('[GOBARDHAN] Disconnecting serial port:', reason);
  _isConnectedRequested = false;

  if (_reader) {
    try {
      await _reader.cancel();
    } catch (_) { /* ignore cancel error */ }
    try {
      _reader.releaseLock();
    } catch (_) { /* ignore lock error */ }
    _reader = null;
  }

  if (_port) {
    try {
      await _port.close();
    } catch (e) {
      console.debug('[GOBARDHAN] Error while closing port:', e);
    }
    _port = null;
  }

  _setConnected(false);
  console.log('[GOBARDHAN] Serial port successfully closed.');
}

/**
 * Continuous, error-resilient Serial Read Loop
 */
async function _runReadLoop() {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (_port && _isConnectedRequested) {
    if (!_port.readable) {
      console.warn('[GOBARDHAN] Port is not readable, waiting...');
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    try {
      _reader = _port.readable.getReader();
    } catch (lockErr) {
      console.warn('[GOBARDHAN] Could not get readable stream lock:', lockErr);
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    try {
      while (_isConnectedRequested) {
        const { value, done } = await _reader.read();
        if (done) {
          console.log('[GOBARDHAN] Readable stream done.');
          break;
        }

        if (value) {
          // Decode chunk
          buffer += decoder.decode(value, { stream: true });

          // Split by newline
          const lines = buffer.split(/[\r\n]+/);
          // Keep the last incomplete fragment in buffer
          buffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            // Extract JSON substring between outermost braces { ... }
            const startIdx = line.indexOf('{');
            const endIdx = line.lastIndexOf('}');
            if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
              continue;
            }

            const jsonStr = line.substring(startIdx, endIdx + 1);
            try {
              const parsed = JSON.parse(jsonStr);

              // Check if it's a sensor telemetry packet
              if (parsed.distance !== undefined || parsed.methane !== undefined) {
                const cleanData = _parseSensorData(parsed);
                _lastData = cleanData;
                _lastDataTime = Date.now();
                _packetCount++;
                _setConnected(true);
                _emitData(cleanData);
              } else if (parsed.ok !== undefined) {
                // Command response / ack
                console.log('[GOBARDHAN] ESP32 Ack:', parsed);
              }
            } catch (jsonErr) {
              // Ignore corrupted or partial JSON fragments during serial sync
              console.debug('[GOBARDHAN] Non-JSON line ignored:', jsonStr.substring(0, 40));
            }
          }
        }
      }
    } catch (readErr) {
      if (_isConnectedRequested) {
        console.warn('[GOBARDHAN] Transient read error (resuming):', readErr.message);
      }
    } finally {
      if (_reader) {
        try {
          _reader.releaseLock();
        } catch (_) {}
        _reader = null;
      }
    }

    // If user cancelled, don't attempt to re-read
    if (!_isConnectedRequested) break;

    // Small delay before re-attaching reader to avoid busy loop on error
    await new Promise(r => setTimeout(r, 250));
  }
}

/**
 * Normalize and sanitize incoming sensor data
 */
function _parseSensorData(raw) {
  return {
    distance: _toFloat(raw.distance, 0),
    methane: _toFloat(raw.methane, 0),
    pressure: _toFloat(raw.pressure, 1013.25),
    outsideTemp: _toFloat(raw.outsideTemp, 0),
    humidity: _toFloat(raw.humidity, 0),
    slurryTemp: _toFloat(raw.slurryTemp, 0),
    stirrer: Boolean(raw.stirrer),
    grinder: Boolean(raw.grinder),
    outlet: Boolean(raw.outlet),
  };
}

function _toFloat(val, fallback) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

/**
 * Send command JSON string to ESP32
 */
async function _sendSerialCommand(cmdName) {
  if (!_port || !_port.writable) {
    throw new Error('Serial port not connected or not writable');
  }

  const writer = _port.writable.getWriter();
  try {
    const payload = JSON.stringify({ cmd: cmdName }) + '\n';
    const encoded = new TextEncoder().encode(payload);
    await writer.write(encoded);
    console.log('[GOBARDHAN] Command sent:', cmdName);
    return { ok: true, cmd: cmdName };
  } finally {
    try {
      writer.releaseLock();
    } catch (_) {}
  }
}

// Actuator command wrappers
export async function stirrerOn()   { return _sendSerialCommand('stirrerOn'); }
export async function stirrerOff()  { return _sendSerialCommand('stirrerOff'); }
export async function grinderOn()   { return _sendSerialCommand('grinderOn'); }
export async function grinderOff()  { return _sendSerialCommand('grinderOff'); }
export async function outletOpen()  { return _sendSerialCommand('outletOpen'); }
export async function outletClose() { return _sendSerialCommand('outletClose'); }
export async function requestData() { return _sendSerialCommand('getData'); }
