/**
 * dashboard.js — GOBARDHAN Dashboard Logic
 * Renders and manages the entire dashboard UI.
 */

import * as api from './api.js';
import { initChart, pushDataPoint, destroyChart } from './charts.js';
import {
  calcFillPercent, methanStatus, pressureStatus, slurryStatus,
  tempStatus, estimateGasProductionHours, fmt, formatTime, formatDateTime, timeSince,
} from './utils.js';
import { showToast } from './main.js';

// ---- State ----
let drumHeight = 80;   // cm — configurable
let pollTimer = null;
let sensorData = null;

const POLL_INTERVAL_MS = 3000; // 3 seconds

// ---- Icons (inline SVG strings from Lucide) ----
const icons = {
  flame: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z"/></svg>`,
  gauge: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1.5m0 15V21m8.485-8.485h-1.5M4.515 12.515H3m14.39-5.39-1.06 1.06M6.671 17.329l-1.06 1.06M17.33 17.33l-1.061-1.06M7.732 6.671 6.671 7.732M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z"/></svg>`,
  thermometer: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 3.75V13.5a3 3 0 1 1-6 0V3.75m0 0a3 3 0 1 1 6 0M9 3.75h6"/></svg>`,
  droplets: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253"/></svg>`,
  waves: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"/></svg>`,
  wrench: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l5.654-4.654m5.17-2.498 4.223-4.224a.75.75 0 0 0-1.06-1.06l-4.223 4.223m0 0-3.164.668-.668 3.164 3.832-3.832Z"/></svg>`,
  cpu: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21M3 3l3.75 3.75M21 3l-3.75 3.75M3 21l3.75-3.75M21 21l-3.75-3.75"/></svg>`,
  activity: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12h3l3-9 4 18 3-9h5"/></svg>`,
  power: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9"/></svg>`,
  alert: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>`,
  wifi: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z"/></svg>`,
  wifioff: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0 .008v.015m0 0v.008M12.53 18.22l-.53.53-.53-.53M3 3l18 18M10.584 10.587a5.25 5.25 0 0 1 5.832 1.453m-9.83-3.412C2.374 11.763 1.718 14.97 3.106 17.856M1.924 8.674a14.25 14.25 0 0 1 4.432-3.23"/></svg>`,
  menu: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>`,
  logout: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"/></svg>`,
  valve: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>`,
  xmark: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>`,
  connect: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/></svg>`,
  chart: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/></svg>`,
};

// ---- Build the dashboard HTML ----
export function renderDashboard(container, onLogout) {
  container.innerHTML = `
    <!-- Sidebar -->
    <aside class="sidebar" id="gb-sidebar">
      <div class="sidebar__header">
        <div class="sidebar__logo-icon">${icons.flame}</div>
        <div class="sidebar__logo-text">
          <span class="logo__name">GOBARDHAN</span>
          <span class="logo__tagline">Biogas Monitoring</span>
        </div>
      </div>

      <nav class="sidebar__nav">
        <div class="sidebar__section-label">Overview</div>
        <button class="sidebar__nav-item active" data-section="overview">
          ${icons.activity} Overview
        </button>
        <button class="sidebar__nav-item" data-section="sensors">
          ${icons.gauge} Sensors
        </button>
        <button class="sidebar__nav-item" data-section="controls">
          ${icons.wrench} Controls
        </button>
        <button class="sidebar__nav-item" data-section="history">
          ${icons.chart} Live History
        </button>

        <div class="sidebar__section-label">System</div>
        <button class="sidebar__nav-item" data-section="connection">
          ${icons.wifi} ESP32 Connection
        </button>
      </nav>

      <div class="sidebar__footer">
        <div class="sidebar__connection">
          <div class="sidebar__connection-label">Device Status</div>
          <div class="connection-status" id="sidebar-status">
            <span class="status-dot disconnected"></span>
            <span>DISCONNECTED</span>
          </div>
          <div class="sidebar__ip" id="sidebar-ip">—</div>
        </div>
        <button class="btn-logout" id="btn-logout">
          ${icons.logout} LOGOUT
        </button>
      </div>
    </aside>

    <!-- Mobile overlay -->
    <div class="sidebar-overlay" id="sidebar-overlay"></div>

    <!-- Dashboard Content -->
    <div class="dashboard-content">
      <!-- Top Bar -->
      <header class="dashboard-topbar">
        <button class="topbar-hamburger" id="topbar-hamburger">${icons.menu}</button>
        <div class="topbar-title">
          <h1>GOBARDHAN CONTROL CENTER</h1>
          <p id="topbar-subtitle">Smart Biogas Monitoring &amp; Slurry Management</p>
        </div>
        <span class="topbar-time" id="topbar-clock">--:--:--</span>
      </header>

      <!-- Main Content -->
      <main class="dashboard-main" id="dashboard-main">

        <!-- ESP32 Connection Panel -->
        <section id="section-connection">
          <div class="connection-panel">
            <div class="connection-panel__header">
              <div>
                <div class="connection-panel__title">ESP32 Device Connection</div>
                <div class="connection-panel__desc">Enter your ESP32 IP address to connect</div>
              </div>
              <span class="connection-status-badge disconnected" id="conn-badge">
                <span class="loading-spinner hidden" id="conn-spinner"></span>
                DISCONNECTED
              </span>
            </div>

            <div class="connection-form" style="display:flex; flex-direction:column; gap:10px;">
              <button class="btn-connect" id="btn-connect-port">
                ${icons.connect} CONNECT VIA PORT (PRIMARY)
              </button>
              <div style="display:flex; gap:10px;">
                <input
                  type="text"
                  class="form-input"
                  id="esp32-ip-input"
                  placeholder="192.168.1.100"
                  value=""
                  autocomplete="off"
                  spellcheck="false"
                  style="flex:1;"
                />
                <button class="btn-connect btn-secondary" id="btn-connect-ip">
                  CONNECT VIA IP
                </button>
              </div>
              <button class="btn-danger hidden" id="btn-disconnect" style="margin-top:10px;">
                DISCONNECT ESP32
              </button>
            </div>

            <div class="connection-info-grid" id="conn-info-grid">
              <div class="connection-info-item">
                <label>IP Address</label>
                <span id="ci-ip">—</span>
              </div>
              <div class="connection-info-item">
                <label>Data Status</label>
                <span id="ci-status">Idle</span>
              </div>
              <div class="connection-info-item">
                <label>Last Update</label>
                <span id="ci-last-update">—</span>
              </div>
              <div class="connection-info-item">
                <label>Poll Interval</label>
                <span id="ci-interval">3s</span>
              </div>
            </div>

            <div class="connection-error hidden" id="conn-error">
              <div class="connection-error__title">⚠ ESP32 Connection Failed</div>
              <ul>
                <li>Ensure ESP32 is powered on</li>
                <li>Confirm both devices are on the same Wi-Fi network</li>
                <li>Verify the IP address is correct</li>
                <li>Check the browser console for CORS errors</li>
              </ul>
              <button class="btn-retry" id="btn-retry">
                ${icons.refresh} RETRY CONNECTION
              </button>
            </div>
          </div>
        </section>

        <!-- Summary Bar -->
        <section class="summary-bar" id="section-summary">
          <div class="summary-card">
            <div class="summary-card__label">ESP32 Status</div>
            <div class="summary-card__value red" id="sum-status">OFFLINE</div>
            <div class="summary-card__sub" id="sum-status-sub">Not connected</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__label">Slurry Level</div>
            <div class="summary-card__value" id="sum-level">—</div>
            <div class="summary-card__sub" id="sum-level-sub">—</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__label">Methane</div>
            <div class="summary-card__value" id="sum-methane">—</div>
            <div class="summary-card__sub">MQ-4 Raw ADC</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__label">Pressure</div>
            <div class="summary-card__value" id="sum-pressure">—</div>
            <div class="summary-card__sub">hPa</div>
          </div>
        </section>

        <!-- Alert Section -->
        <section class="alert-section" id="alert-section">
          <!-- Dynamic alerts rendered here -->
        </section>

        <!-- Sensor Grid -->
        <div class="section-title">
          ${icons.activity}
          Live Sensor Readings
          <span class="data-age" id="data-age-label" style="margin-left:auto;"></span>
        </div>
        <section class="sensor-grid" id="section-sensors">

          <!-- Slurry Level (wide) -->
          <div class="sensor-card sensor-card--slurry status-normal" id="card-slurry">
            <div class="sensor-card__header">
              <div class="sensor-card__icon">${icons.waves}</div>
              <span class="sensor-card__status-badge normal" id="slurry-badge">NORMAL</span>
            </div>
            <div class="sensor-card__title">Slurry Tank Level</div>
            <div class="slurry-visual">
              <div class="tank-container">
                <div class="tank-body">
                  <div class="tank-fill" id="tank-fill"></div>
                </div>
              </div>
              <div class="slurry-stats">
                <div class="slurry-stat">
                  <div class="slurry-stat__label">Fill Level</div>
                  <div>
                    <span class="slurry-stat__value" id="slurry-pct">--</span>
                    <span class="slurry-stat__unit">%</span>
                  </div>
                </div>
                <div class="slurry-stat">
                  <div class="slurry-stat__label">Distance</div>
                  <div>
                    <span class="slurry-stat__value" id="slurry-dist">--</span>
                    <span class="slurry-stat__unit">cm</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="fill-progress">
              <div class="fill-progress__label">
                <span>0%</span>
                <span id="fill-pct-label">--</span>
                <span>100%</span>
              </div>
              <div class="fill-progress__bar">
                <div class="fill-progress__fill" id="fill-bar"></div>
              </div>
            </div>
            <div class="drum-config">
              <label for="drum-height-input">Drum Height:</label>
              <input type="number" id="drum-height-input" value="80" min="10" max="500" />
              <span>cm</span>
            </div>
            <div class="sensor-card__source">HC-SR04 Ultrasonic</div>
          </div>

          <!-- Methane Card -->
          <div class="sensor-card status-normal" id="card-methane">
            <div class="sensor-card__header">
              <div class="sensor-card__icon">${icons.flame}</div>
              <span class="sensor-card__status-badge normal" id="methane-badge">LOW</span>
            </div>
            <div class="sensor-card__title">Methane Level</div>
            <div>
              <span class="sensor-card__value" id="methane-val">--</span>
              <span class="sensor-card__unit">ADC</span>
            </div>
            <div class="sensor-card__source">MQ-4 Raw Value</div>
          </div>

          <!-- Pressure Card -->
          <div class="sensor-card status-normal" id="card-pressure">
            <div class="sensor-card__header">
              <div class="sensor-card__icon">${icons.gauge}</div>
              <span class="sensor-card__status-badge normal" id="pressure-badge">NORMAL</span>
            </div>
            <div class="sensor-card__title">Drum Pressure</div>
            <div>
              <span class="sensor-card__value" id="pressure-val">--</span>
              <span class="sensor-card__unit">hPa</span>
            </div>
            <div class="sensor-card__source">BMP180</div>
          </div>

          <!-- Gas Production Estimate Card -->
          <div class="sensor-card status-normal" id="card-gas-estimate">
            <div class="sensor-card__header">
              <div class="sensor-card__icon">${icons.cpu}</div>
              <span class="sensor-card__status-badge normal" id="gas-estimate-badge">STABLE</span>
            </div>
            <div class="sensor-card__title">Gas Production Estimate</div>
            <div class="production-estimate">
              <span class="sensor-card__value" id="gas-estimate-val">--</span>
              <span class="sensor-card__unit">hrs</span>
            </div>
            <div class="production-detail" id="gas-estimate-detail">Waiting for sensor data…</div>
            <div class="sensor-card__source">Algorithm: temp + pressure + methane</div>
          </div>

          <!-- Slurry Temp Card -->
          <div class="sensor-card status-normal" id="card-slurry-temp">
            <div class="sensor-card__header">
              <div class="sensor-card__icon">${icons.thermometer}</div>
              <span class="sensor-card__status-badge normal" id="slurry-temp-badge">NORMAL</span>
            </div>
            <div class="sensor-card__title">Slurry Temperature</div>
            <div>
              <span class="sensor-card__value" id="slurry-temp-val">--</span>
              <span class="sensor-card__unit">°C</span>
            </div>
            <div class="sensor-card__source">DS18B20</div>
          </div>

          <!-- Atmosphere Card (combined) -->
          <div class="sensor-card sensor-card--climate" id="card-climate">
            <div class="sensor-card__header">
              <div class="sensor-card__icon">${icons.droplets}</div>
              <span class="sensor-card__status-badge normal" id="climate-badge">NORMAL</span>
            </div>
            <div class="sensor-card__title">Atmospheric Conditions</div>
            <div class="climate-row">
              <div class="climate-item">
                <div class="climate-item__label">Temperature</div>
                <div>
                  <span class="climate-item__value" id="outside-temp-val">--</span>
                  <span class="climate-item__unit">°C</span>
                </div>
              </div>
              <div class="climate-item">
                <div class="climate-item__label">Humidity</div>
                <div>
                  <span class="climate-item__value" id="humidity-val">--</span>
                  <span class="climate-item__unit">%</span>
                </div>
              </div>
            </div>
            <div class="sensor-card__source">DHT11</div>
          </div>

        </section>

        <!-- Controls -->
        <div class="section-title" style="margin-top:var(--space-2)">
          ${icons.wrench} Actuator Controls
        </div>
        <section class="controls-grid" id="section-controls">

          <!-- Stirrer -->
          <div class="control-card">
            <div class="control-card__header">
              <div class="control-card__icon" id="stirrer-icon">${icons.wrench}</div>
              <div>
                <div class="control-card__name">Stirrer / Mixer</div>
                <div class="control-card__desc">Mixes the slurry in the digestion tank using a stepper-driven paddle.</div>
              </div>
            </div>
            <div class="control-card__state">
              <span class="status-dot disconnected" id="stirrer-dot"></span>
              <span id="stirrer-state">STOPPED</span>
            </div>
            <button class="btn-control btn-control--on" id="btn-stirrer">
              ${icons.power} TURN ON STIRRER
            </button>
          </div>

          <!-- Grinder -->
          <div class="control-card">
            <div class="control-card__header">
              <div class="control-card__icon" id="grinder-icon">${icons.wrench}</div>
              <div>
                <div class="control-card__name">Input Grinder</div>
                <div class="control-card__desc">Grinds incoming vegetable waste before feeding into the digestion system.</div>
              </div>
            </div>
            <div class="control-card__state">
              <span class="status-dot disconnected" id="grinder-dot"></span>
              <span id="grinder-state">STOPPED</span>
            </div>
            <button class="btn-control btn-control--on" id="btn-grinder">
              ${icons.power} TURN ON GRINDER
            </button>
          </div>

          <!-- Outlet Gate Valve -->
          <div class="control-card">
            <div class="control-card__header">
              <div class="control-card__icon" id="valve-icon">${icons.valve}</div>
              <div>
                <div class="control-card__name">Outlet Gate Valve</div>
                <div class="control-card__desc">Controls the outlet relay (GPIO 23). Confirmation required before operation.</div>
              </div>
            </div>
            <div class="valve-indicator">
              <div class="valve-pipe"><div class="valve-flow" id="valve-flow"></div></div>
              <span class="valve-label closed" id="valve-state-label">CLOSED</span>
            </div>
            <button class="btn-control btn-control--open" id="btn-outlet">
              ${icons.valve} OPEN OUTLET
            </button>
          </div>

        </section>

        <!-- Live History Chart -->
        <div class="section-title">
          ${icons.chart} Live Monitoring History
        </div>
        <section class="charts-section" id="section-history">
          <div class="charts-header">
            <div>
              <div style="font-size:0.875rem;font-weight:700;color:var(--clr-gray-700)">Sensor Trends</div>
              <div style="font-size:0.75rem;color:var(--clr-gray-400)">Last 30 readings (scaled for display)</div>
            </div>
            <div class="charts-legend">
              <div class="legend-item"><span class="legend-dot" style="background:#166534"></span>Slurry Temp</div>
              <div class="legend-item"><span class="legend-dot" style="background:#16a34a"></span>Outside Temp</div>
              <div class="legend-item"><span class="legend-dot" style="background:#0369a1"></span>Pressure÷10</div>
              <div class="legend-item"><span class="legend-dot" style="background:#d97706"></span>Methane÷100</div>
              <div class="legend-item"><span class="legend-dot" style="background:#4ade80"></span>Level %</div>
            </div>
          </div>
          <div class="chart-wrapper">
            <canvas id="live-chart"></canvas>
          </div>
        </section>

      </main>
    </div>

    <!-- Toast container -->
    <div class="toast-container" id="toast-container"></div>

    <!-- Confirmation Modal (for valve) -->
    <div class="modal-overlay hidden" id="confirm-modal">
      <div class="modal-card confirm-modal-card">
        <div class="confirm-modal-body">
          <div class="confirm-modal-icon">${icons.alert}</div>
          <div class="confirm-modal-title" id="confirm-title">Are you sure?</div>
          <div class="confirm-modal-desc" id="confirm-desc">This will operate the outlet gate valve.</div>
          <div class="confirm-modal-actions">
            <button class="btn-cancel" id="confirm-cancel">CANCEL</button>
            <button class="btn-confirm" id="confirm-ok">CONFIRM</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // ---- Wire up events ----
  _wireEvents(onLogout);
  _startClock();
  _initChart();

  // Restore saved IP
  const savedIp = api.getEsp32Ip();
  if (savedIp) {
    document.getElementById('esp32-ip-input').value = savedIp;
  }

  // Listen for connection state changes
  api.onConnectionChange(_onApiConnectionChange);
}

// ---- Clock ----
function _startClock() {
  const el = document.getElementById('topbar-clock');
  if (!el) return;
  const tick = () => { el.textContent = formatTime(); };
  tick();
  setInterval(tick, 1000);
}

// ---- Chart init ----
function _initChart() {
  const canvas = document.getElementById('live-chart');
  if (!canvas) return;
  // Chart.js is loaded via CDN from main.js
  initChart(canvas);
}

// ---- Event wiring ----
function _wireEvents(onLogout) {
  // Sidebar hamburger
  document.getElementById('topbar-hamburger')?.addEventListener('click', _toggleSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', _closeSidebar);

  // Nav items (smooth scroll to section)
  document.querySelectorAll('[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _closeSidebar();
      const sectionId = `section-${btn.dataset.section}`;
      const target = document.getElementById(sectionId);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    _stopPolling();
    destroyChart();
    onLogout();
  });

  // Connect Port button
  document.getElementById('btn-connect-port')?.addEventListener('click', _doConnectPort);

  // Connect IP button
  document.getElementById('btn-connect-ip')?.addEventListener('click', () => {
    const ip = document.getElementById('esp32-ip-input')?.value.trim();
    _doConnectIp(ip);
  });

  // Disconnect button
  document.getElementById('btn-disconnect')?.addEventListener('click', _doDisconnect);

  // Retry button
  document.getElementById('btn-retry')?.addEventListener('click', () => {
    const mode = api.getCommMode();
    if (mode === 'PORT') _doConnectPort();
    else {
      const ip = document.getElementById('esp32-ip-input')?.value.trim();
      _doConnectIp(ip);
    }
  });

  // Enter key in IP input
  document.getElementById('esp32-ip-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-connect-ip')?.click();
  });

  // Drum height config
  document.getElementById('drum-height-input')?.addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) {
      drumHeight = v;
      if (sensorData) _updateUI(sensorData);
    }
  });

  // Stirrer button
  document.getElementById('btn-stirrer')?.addEventListener('click', _handleStirrer);

  // Grinder button
  document.getElementById('btn-grinder')?.addEventListener('click', _handleGrinder);

  // Outlet button (requires confirmation)
  document.getElementById('btn-outlet')?.addEventListener('click', _handleOutletRequest);

  // Confirm modal
  document.getElementById('confirm-cancel')?.addEventListener('click', _closeConfirm);
  document.getElementById('confirm-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirm-modal')) _closeConfirm();
  });
}

// ---- Sidebar ----
function _toggleSidebar() {
  document.getElementById('gb-sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-overlay')?.classList.toggle('active');
}
function _closeSidebar() {
  document.getElementById('gb-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('active');
}

// ---- Connect ----
async function _doConnectPort() {
  _setConnectingState(true, 'PORT');
  document.getElementById('conn-error')?.classList.add('hidden');

  document.getElementById('ci-ip').textContent = 'Web Serial';
  document.getElementById('sidebar-ip').textContent = 'SERIAL';
  document.getElementById('ci-status').textContent = 'Requesting Port Access…';

  const success = await api.connectPort();

  _setConnectingState(false);
  if (success) {
    showToast('ESP32 connected successfully via PORT!', 'success');
    document.getElementById('ci-status').textContent = 'Port Connected';
    _startPolling();
  } else {
    document.getElementById('conn-error')?.classList.remove('hidden');
    showToast('Could not open Serial Port.', 'error');
  }
}

async function _doConnectIp(ip) {
  if (!ip) {
    showToast('Please enter an IP address.', 'error');
    return;
  }
  _setConnectingState(true, 'IP');
  document.getElementById('conn-error')?.classList.add('hidden');

  document.getElementById('ci-status').textContent = 'Waiting for Connection…';

  const success = await api.testConnection(ip);

  _setConnectingState(false);
  if (success) {
    document.getElementById('ci-ip').textContent = ip;
    document.getElementById('sidebar-ip').textContent = ip;
    showToast('ESP32 connected successfully via IP!', 'success');
    _startPolling();
  } else {
    document.getElementById('conn-error')?.classList.remove('hidden');
    showToast('Could not reach ESP32. Check IP and network.', 'error');
  }
}

async function _doDisconnect() {
  await api.disconnectPort();
  _stopPolling();
  _setConnectingState(false);

  document.getElementById('ci-ip').textContent = '—';
  document.getElementById('sidebar-ip').textContent = '—';
  document.getElementById('ci-status').textContent = 'Idle';
  document.getElementById('conn-badge').className = 'connection-status-badge disconnected';
  document.getElementById('conn-badge').innerHTML = 'DISCONNECTED';
}

function _setConnectingState(connecting, mode = null) {
  const badge = document.getElementById('conn-badge');
  const btnPort = document.getElementById('btn-connect-port');
  const btnIp = document.getElementById('btn-connect-ip');
  const ipInput = document.getElementById('esp32-ip-input');

  if (connecting) {
    badge?.classList.remove('connected', 'disconnected');
    badge?.classList.add('connecting');
    if (badge) badge.innerHTML = `<span class="loading-spinner"></span> CONNECTING…`;
    if (btnPort) btnPort.disabled = true;
    if (btnIp) btnIp.disabled = true;
    if (ipInput) ipInput.disabled = true;
  } else {
    if (btnPort) btnPort.disabled = false;
    if (btnIp) btnIp.disabled = false;
    if (ipInput) ipInput.disabled = false;
  }

  if (api.isConnected()) {
    document.getElementById('btn-disconnect')?.classList.remove('hidden');
    if (btnPort) btnPort.classList.add('hidden');
    if (btnIp) btnIp.parentElement.classList.add('hidden');
  } else {
    document.getElementById('btn-disconnect')?.classList.add('hidden');
    if (btnPort) btnPort.classList.remove('hidden');
    if (btnIp) btnIp.parentElement.classList.remove('hidden');
  }
}

// ---- Polling ----
function _startPolling() {
  _stopPolling();
  _poll();
  pollTimer = setInterval(_poll, POLL_INTERVAL_MS);
}

function _stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function _poll() {
  try {
    const raw = await api.fetchSensorData();
    sensorData = raw;
    _updateUI(raw);
  } catch {
    api.markDisconnected();
    _onLostConnection();
  }
}

// ---- Connection state changes ----
function _onApiConnectionChange(connected) {
  _updateConnectionBadge(connected);
  _updateSidebarStatus(connected);
}

function _updateConnectionBadge(connected) {
  const badge = document.getElementById('conn-badge');
  if (!badge) return;
  badge.className = `connection-status-badge ${connected ? 'connected' : 'disconnected'}`;
  badge.innerHTML = connected ? `${icons.wifi} CONNECTED` : `${icons.wifioff} DISCONNECTED`;
  document.getElementById('ci-status').textContent = connected ? 'Receiving' : 'Lost';
}

function _updateSidebarStatus(connected) {
  const el = document.getElementById('sidebar-status');
  if (!el) return;
  el.innerHTML = connected
    ? `<span class="status-dot connected"></span><span>CONNECTED</span>`
    : `<span class="status-dot disconnected"></span><span>DISCONNECTED</span>`;
}

function _onLostConnection() {
  document.getElementById('ci-status').textContent = 'Lost';
  document.getElementById('conn-error')?.classList.remove('hidden');

  // Summary
  const sumStatus = document.getElementById('sum-status');
  if (sumStatus) { sumStatus.textContent = 'OFFLINE'; sumStatus.className = 'summary-card__value red'; }
  document.getElementById('sum-status-sub').textContent = timeSince(api.getLastDataTime());
}

// ---- Update UI with sensor data ----
function _updateUI(data) {
  const fill = calcFillPercent(data.distance, drumHeight);

  // — Summary bar —
  const sumStatus = document.getElementById('sum-status');
  if (sumStatus) { sumStatus.textContent = 'ONLINE'; sumStatus.className = 'summary-card__value green'; }
  document.getElementById('sum-status-sub').textContent = timeSince(api.getLastDataTime());
  document.getElementById('sum-level').textContent = `${fmt(fill)}%`;
  document.getElementById('sum-level-sub').textContent = slurryStatus(fill).label;
  document.getElementById('sum-methane').textContent = fmt(data.methane, 0);
  document.getElementById('sum-pressure').textContent = fmt(data.pressure);

  // — Last update label —
  const lastUpdate = api.getLastDataTime();
  document.getElementById('ci-last-update').textContent = lastUpdate ? formatTime(new Date(lastUpdate)) : '—';
  const ageLabel = document.getElementById('data-age-label');
  if (ageLabel) ageLabel.textContent = `Updated ${timeSince(lastUpdate)}`;

  // — Slurry card —
  const slurrySt = slurryStatus(fill);
  _setCardStatus('card-slurry', slurrySt.cls);
  _setBadge('slurry-badge', slurrySt.label, slurrySt.cls);
  document.getElementById('slurry-pct').textContent = fmt(fill);
  document.getElementById('slurry-dist').textContent = fmt(data.distance);
  document.getElementById('fill-pct-label').textContent = `${fmt(fill)}%`;
  const fillBar = document.getElementById('fill-bar');
  const tankFill = document.getElementById('tank-fill');
  if (fillBar) { fillBar.style.width = `${fill}%`; fillBar.className = `fill-progress__fill ${_fillClass(fill)}`; }
  if (tankFill) { tankFill.style.height = `${fill}%`; tankFill.className = `tank-fill ${_fillClass(fill)}`; }

  // — Methane card —
  const methSt = methanStatus(data.methane);
  _setCardStatus('card-methane', methSt.cls);
  _setBadge('methane-badge', methSt.label, methSt.cls);
  document.getElementById('methane-val').textContent = fmt(data.methane, 0);

  // — Pressure card —
  const preSt = pressureStatus(data.pressure);
  _setCardStatus('card-pressure', preSt.cls);
  _setBadge('pressure-badge', preSt.label, preSt.cls);
  document.getElementById('pressure-val').textContent = fmt(data.pressure);

  // — Gas production estimate —
  const gasEstimate = estimateGasProductionHours({
    methane: data.methane,
    pressure: data.pressure,
    slurryTemp: data.slurryTemp,
    outsideTemp: data.outsideTemp,
  });
  _setCardStatus('card-gas-estimate', gasEstimate.status);
  _setBadge('gas-estimate-badge', gasEstimate.label, gasEstimate.status);
  document.getElementById('gas-estimate-val').textContent = `${gasEstimate.hours}`;
  document.getElementById('gas-estimate-detail').textContent = `${gasEstimate.score}% efficiency • ${gasEstimate.detail}`;

  // — Slurry temperature —
  const slTempSt = tempStatus(data.slurryTemp);
  _setCardStatus('card-slurry-temp', slTempSt.cls);
  _setBadge('slurry-temp-badge', slTempSt.label, slTempSt.cls);
  document.getElementById('slurry-temp-val').textContent = fmt(data.slurryTemp);

  // — Atmosphere —
  const tempSt = tempStatus(data.outsideTemp);
  _setCardStatus('card-climate', tempSt.cls);
  _setBadge('climate-badge', tempSt.label, tempSt.cls);
  document.getElementById('outside-temp-val').textContent = fmt(data.outsideTemp);
  document.getElementById('humidity-val').textContent = fmt(data.humidity, 0);

  // — Controls sync from ESP state —
  _syncControlState('stirrer', data.stirrer);
  _syncControlState('grinder', data.grinder);
  _syncValveState(data.outlet);

  // — Alerts —
  _updateAlerts(data, fill);

  // — Chart —
  pushDataPoint(data, fill);
}

function _fillClass(pct) {
  if (pct >= 90) return 'danger';
  if (pct >= 70) return 'warning';
  return '';
}

function _setCardStatus(cardId, statusClass) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.className = card.className
    .replace(/status-(normal|warning|danger)/g, '')
    .trim() + ` status-${statusClass}`;
}

function _setBadge(badgeId, label, cls) {
  const badge = document.getElementById(badgeId);
  if (!badge) return;
  badge.textContent = label;
  badge.className = `sensor-card__status-badge ${cls}`;
}

// ---- Control sync ----
function _syncControlState(type, running) {
  const dot = document.getElementById(`${type}-dot`);
  const state = document.getElementById(`${type}-state`);
  const btn = document.getElementById(`btn-${type}`);
  const icon = document.getElementById(`${type}-icon`);

  if (dot) { dot.className = `status-dot ${running ? 'connected' : 'disconnected'}`; }
  if (state) { state.textContent = running ? 'RUNNING' : 'STOPPED'; }
  if (icon) { icon.className = `control-card__icon ${running ? 'running' : ''}`; }

  if (btn) {
    if (running) {
      btn.className = 'btn-control btn-control--off';
      btn.innerHTML = `${icons.power} TURN OFF ${type.toUpperCase()}`;
      btn.dataset.running = '1';
    } else {
      btn.className = 'btn-control btn-control--on';
      btn.innerHTML = `${icons.power} TURN ON ${type.toUpperCase()}`;
      btn.dataset.running = '0';
    }
  }
}

function _syncValveState(open) {
  const flow = document.getElementById('valve-flow');
  const label = document.getElementById('valve-state-label');
  const btn = document.getElementById('btn-outlet');
  const icon = document.getElementById('valve-icon');

  if (flow) { flow.className = `valve-flow ${open ? 'active' : ''}`; }
  if (label) { label.textContent = open ? 'OPEN' : 'CLOSED'; label.className = `valve-label ${open ? 'open' : 'closed'}`; }
  if (icon) { icon.className = `control-card__icon ${open ? 'valve-open' : ''}`; }

  if (btn) {
    if (open) {
      btn.className = 'btn-control btn-control--close';
      btn.innerHTML = `${icons.valve} CLOSE OUTLET`;
      btn.dataset.open = '1';
    } else {
      btn.className = 'btn-control btn-control--open';
      btn.innerHTML = `${icons.valve} OPEN OUTLET`;
      btn.dataset.open = '0';
    }
  }
}

// ---- Control handlers ----
async function _handleStirrer() {
  if (!api.isConnected()) { showToast('ESP32 not connected.', 'error'); return; }
  const btn = document.getElementById('btn-stirrer');
  const running = btn?.dataset.running === '1';
  btn.disabled = true;
  try {
    if (running) {
      await api.stirrerOff();
      showToast('Stirrer stopped.', 'warning');
    } else {
      await api.stirrerOn();
      showToast('Stirrer started.', 'success');
    }
    _syncControlState('stirrer', !running);
  } catch (e) {
    showToast('Stirrer command failed. Check connection.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function _handleGrinder() {
  if (!api.isConnected()) { showToast('ESP32 not connected.', 'error'); return; }
  const btn = document.getElementById('btn-grinder');
  const running = btn?.dataset.running === '1';
  btn.disabled = true;
  try {
    if (running) {
      await api.grinderOff();
      showToast('Grinder stopped.', 'warning');
    } else {
      await api.grinderOn();
      showToast('Grinder started.', 'success');
    }
    _syncControlState('grinder', !running);
  } catch (e) {
    showToast('Grinder command failed. Check connection.', 'error');
  } finally {
    btn.disabled = false;
  }
}

let _pendingValveAction = null;

function _handleOutletRequest() {
  if (!api.isConnected()) { showToast('ESP32 not connected.', 'error'); return; }
  const btn = document.getElementById('btn-outlet');
  const open = btn?.dataset.open === '1';

  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-title').textContent = open ? 'Close Outlet Valve?' : 'Open Outlet Valve?';
  document.getElementById('confirm-desc').textContent = open
    ? 'This will close the outlet gate valve (relay OFF). Slurry flow will stop.'
    : 'This will open the outlet gate valve (relay ON). Slurry will flow out. Confirm only if safe to do so.';

  const confirmBtn = document.getElementById('confirm-ok');
  confirmBtn.textContent = open ? 'CONFIRM CLOSE' : 'CONFIRM OPEN';

  _pendingValveAction = open ? 'close' : 'open';
  modal?.classList.remove('hidden');

  // Wire confirm
  confirmBtn.onclick = _doValveAction;
}

async function _doValveAction() {
  _closeConfirm();
  const btn = document.getElementById('btn-outlet');
  btn.disabled = true;
  try {
    if (_pendingValveAction === 'open') {
      await api.outletOpen();
      _syncValveState(true);
      showToast('Outlet valve OPENED.', 'warning');
    } else {
      await api.outletClose();
      _syncValveState(false);
      showToast('Outlet valve CLOSED.', 'success');
    }
  } catch {
    showToast('Valve command failed. Check connection.', 'error');
  } finally {
    btn.disabled = false;
    _pendingValveAction = null;
  }
}

function _closeConfirm() {
  document.getElementById('confirm-modal')?.classList.add('hidden');
}

// ---- Alerts ----
function _updateAlerts(data, fill) {
  const section = document.getElementById('alert-section');
  if (!section) return;
  const alerts = [];

  if (!api.isConnected()) {
    alerts.push({ type: 'danger', title: 'ESP32 CONNECTION LOST', desc: 'Live sensor data unavailable. Retrying…' });
  }
  const methSt = methanStatus(data.methane);
  if (methSt.cls === 'warning') alerts.push({ type: 'warning', title: '⚠ HIGH METHANE LEVEL', desc: 'Methane is elevated. Check the biogas system for leaks.' });
  if (methSt.cls === 'danger') alerts.push({ type: 'danger', title: '⚠ CRITICAL METHANE', desc: 'Methane level is dangerously high! Evacuate and ventilate immediately.' });

  const preSt = pressureStatus(data.pressure);
  if (preSt.cls === 'danger') alerts.push({ type: 'danger', title: '⚠ HIGH DRUM PRESSURE', desc: 'Drum pressure is above safe threshold. Check pressure relief immediately.' });
  if (preSt.cls === 'warning' && data.pressure < 950) alerts.push({ type: 'warning', title: '⚠ LOW PRESSURE', desc: 'Pressure reading is unusually low.' });

  const slurrySt = slurryStatus(fill);
  if (slurrySt.cls === 'warning') alerts.push({ type: 'warning', title: '⚠ SLURRY LEVEL HIGH', desc: `Tank is at ${fmt(fill)}%. Approaching maximum capacity. Consider draining.` });
  if (slurrySt.cls === 'danger') alerts.push({ type: 'danger', title: '⚠ TANK NEAR FULL / FULL', desc: `Slurry is at ${fmt(fill)}%. Drain immediately to prevent overflow.` });

  section.innerHTML = alerts.map(a => `
    <div class="alert-banner ${a.type}">
      <div class="alert-banner__icon">${icons.alert}</div>
      <div>
        <div class="alert-banner__title">${a.title}</div>
        <div class="alert-banner__desc">${a.desc}</div>
      </div>
    </div>
  `).join('');
}

// ---- Cleanup on logout ----
export function cleanupDashboard() {
  _stopPolling();
  api.onConnectionChange(null);
}
