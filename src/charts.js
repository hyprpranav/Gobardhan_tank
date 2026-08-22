/**
 * charts.js — GOBARDHAN Live History Charts
 * Uses Chart.js to display recent sensor readings (last 30 points)
 */

import { fmt } from './utils.js';

const MAX_POINTS = 30;

let chart = null;
const labels = [];

// Datasets keyed by name
const datasets = {
  slurryTemp:  { label: 'Slurry Temp (°C)',   data: [], color: '#166534' },
  outsideTemp: { label: 'Outside Temp (°C)',  data: [], color: '#16a34a' },
  pressure:    { label: 'Pressure (hPa÷10)',  data: [], color: '#0369a1' },
  methane:     { label: 'Methane (÷100)',      data: [], color: '#d97706' },
  slurryLevel: { label: 'Slurry Level (%)',    data: [], color: '#4ade80' },
};

/**
 * Initialize the Chart.js chart on the given canvas element
 */
export function initChart(canvasEl) {
  if (!canvasEl) return;
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  chart = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels,
      datasets: Object.values(datasets).map((ds) => ({
        label:        ds.label,
        data:         ds.data,
        borderColor:  ds.color,
        backgroundColor: ds.color + '18',
        borderWidth:  2,
        pointRadius:  2,
        pointHoverRadius: 4,
        tension:      0.4,
        fill:         false,
      })),
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           { duration: 400 },
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: false, // Using custom legend in HTML
        },
        tooltip: {
          backgroundColor: '#1f2937',
          titleFont:       { size: 11, weight: '600' },
          bodyFont:        { size: 11 },
          padding:         10,
          cornerRadius:    8,
        },
      },
      scales: {
        x: {
          grid:  { color: '#f3f4f6' },
          ticks: { color: '#9ca3af', font: { size: 10 }, maxTicksLimit: 8 },
        },
        y: {
          grid:  { color: '#f3f4f6' },
          ticks: { color: '#9ca3af', font: { size: 10 } },
        },
      },
    },
  });
}

/**
 * Push a new data point into the chart history
 * @param {object} sensorData — processed sensor values
 * @param {number} slurryLevelPct — calculated fill %
 */
export function pushDataPoint(sensorData, slurryLevelPct) {
  if (!chart) return;

  const time = new Date().toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Add label
  labels.push(time);
  if (labels.length > MAX_POINTS) labels.shift();

  // Push dataset values (normalised for readability on same axis)
  _push('slurryTemp',  sensorData.slurryTemp);
  _push('outsideTemp', sensorData.outsideTemp);
  _push('pressure',    sensorData.pressure / 10);      // scale hPa to similar range
  _push('methane',     sensorData.methane / 100);       // scale ADC to similar range
  _push('slurryLevel', slurryLevelPct);

  chart.update('none'); // no animation for live updates
}

function _push(key, value) {
  const ds = datasets[key];
  if (!ds) return;
  ds.data.push(+fmt(value, 2));
  if (ds.data.length > MAX_POINTS) ds.data.shift();
}

/**
 * Destroy the chart (called on logout/unmount)
 */
export function destroyChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
  labels.length = 0;
  Object.values(datasets).forEach((ds) => (ds.data.length = 0));
}
