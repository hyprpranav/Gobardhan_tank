/**
 * utils.js — GOBARDHAN Utility Functions
 */

// ---- Thresholds (configurable) ----
export const THRESHOLDS = {
  methane: {
    normal:  800,   // ADC below this = LOW
    warning: 1500,  // ADC below this = NORMAL
    danger:  2500,  // ADC above warning = HIGH
  },
  pressure: {
    low:     950,   // hPa
    normal:  1030,  // hPa
    high:    1060,  // hPa
  },
  slurry: {
    low:     30,    // % fill
    normal:  70,    // % fill
    high:    90,    // % fill
    nearFull: 95,   // % fill
  },
  temp: {
    low:     10,    // °C
    high:    45,    // °C
  },
};

/**
 * Calculate slurry fill percentage from ultrasonic distance
 * @param {number} distance - measured distance in cm
 * @param {number} drumHeight - total drum height in cm
 * @returns {number} fill percentage 0-100
 */
export function calcFillPercent(distance, drumHeight) {
  if (!drumHeight || drumHeight <= 0) return 0;
  const fill = ((drumHeight - distance) / drumHeight) * 100;
  return Math.min(100, Math.max(0, +fill.toFixed(1)));
}

/**
 * Classify methane ADC value into status
 */
export function methanStatus(adc) {
  if (adc < THRESHOLDS.methane.normal)  return { label: 'LOW',    cls: 'normal'  };
  if (adc < THRESHOLDS.methane.warning) return { label: 'NORMAL', cls: 'normal'  };
  if (adc < THRESHOLDS.methane.danger)  return { label: 'HIGH',   cls: 'warning' };
  return                                        { label: 'DANGER', cls: 'danger'  };
}

/**
 * Classify pressure into status
 */
export function pressureStatus(hpa) {
  if (hpa < THRESHOLDS.pressure.low)   return { label: 'LOW',    cls: 'warning' };
  if (hpa <= THRESHOLDS.pressure.high) return { label: 'NORMAL', cls: 'normal'  };
  return                                       { label: 'HIGH',   cls: 'danger'  };
}

/**
 * Classify slurry fill into status
 */
export function slurryStatus(pct) {
  if (pct < THRESHOLDS.slurry.low)      return { label: 'LOW',       cls: 'normal'  };
  if (pct < THRESHOLDS.slurry.normal)   return { label: 'NORMAL',    cls: 'normal'  };
  if (pct < THRESHOLDS.slurry.high)     return { label: 'HIGH',      cls: 'warning' };
  if (pct < THRESHOLDS.slurry.nearFull) return { label: 'NEAR FULL', cls: 'danger'  };
  return                                        { label: 'FULL',      cls: 'danger'  };
}

/**
 * Classify temperature
 */
export function tempStatus(c) {
  if (c < THRESHOLDS.temp.low)  return { label: 'COLD',   cls: 'warning' };
  if (c > THRESHOLDS.temp.high) return { label: 'HOT',    cls: 'danger'  };
  return                                { label: 'NORMAL', cls: 'normal'  };
}

/**
 * Estimate how many hours the biogas system can continue producing usable gas,
 * based on methane concentration, pressure, and operating temperature.
 *
 * Returns an object with:
 * - hours: integer estimate in hours
 * - label: one of STABLE / GOOD / WATCH / LOW / CRITICAL
 * - score: 0-100 quality score
 * - detail: short explanation for the dashboard
 */
export function estimateGasProductionHours({ methane = 0, pressure = 1013.25, slurryTemp = 30, outsideTemp = 30 } = {}) {
  const methaneLevel = Number.isFinite(methane) ? methane : 0;
  const pressureLevel = Number.isFinite(pressure) ? pressure : 1013.25;
  const tempLevel = Number.isFinite(slurryTemp) ? slurryTemp : Number.isFinite(outsideTemp) ? outsideTemp : 30;

  const methaneQuality = clamp((methaneLevel / 1800), 0.12, 1.1) * 0.9;
  const pressureQuality = clamp(1 - Math.abs(pressureLevel - 1015) / 260, 0.15, 1.1);
  const tempQuality = clamp(1 - Math.abs(tempLevel - 35) / 50, 0.12, 1.1);
  const efficiency = clamp((methaneQuality * pressureQuality * tempQuality), 0.05, 1.1);
  const score = Math.round(efficiency * 100);
  const hours = clamp(Math.round(84 * efficiency), 4, 120);

  let label = 'CRITICAL';
  if (score >= 72) label = 'STABLE';
  else if (score >= 56) label = 'GOOD';
  else if (score >= 36) label = 'WATCH';
  else if (score >= 20) label = 'LOW';

  let status = 'danger';
  if (score >= 72 || score >= 56) status = 'normal';
  else if (score >= 36) status = 'warning';

  const detail = `${fmt(tempLevel)}°C • ${fmt(pressureLevel)} hPa • ${fmt(methaneLevel, 0)} ADC`;

  return {
    hours,
    label,
    score,
    status,
    detail,
  };
}

/**
 * Format number to fixed decimal places, with fallback for NaN
 */
export function fmt(value, decimals = 1, fallback = '--') {
  const n = parseFloat(value);
  return isNaN(n) ? fallback : n.toFixed(decimals);
}

/**
 * Format a Date as HH:MM:SS
 */
export function formatTime(date = new Date()) {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format a Date as full date+time
 */
export function formatDateTime(date = new Date()) {
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

/**
 * Get human-readable time since a timestamp
 * e.g. "5 seconds ago", "2 minutes ago"
 */
export function timeSince(ts) {
  if (!ts) return 'Never';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5)  return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/**
 * Debounce a function
 */
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Clamp a number between min and max
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
