/**
 * main.js — GOBARDHAN Application Entry Point
 * Manages page routing: Landing → Login → Dashboard → Logout
 */

import './styles.css';
import { login, logout, isAuthenticated } from './auth.js';
import { renderDashboard, cleanupDashboard } from './dashboard.js';

// ---- Icons (reused in landing + login) ----
const FLAME_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:24px;height:24px;color:white"><path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z"/></svg>`;

const LOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>`;

const APP_ROOT = document.getElementById('app');

// ---- Router ----
function route() {
  if (isAuthenticated()) {
    showDashboard();
  } else {
    showLanding();
  }
}

// ---- LANDING PAGE ----
function showLanding() {
  APP_ROOT.innerHTML = `
    <div id="landing-page">
      <!-- Navigation -->
      <nav class="landing-nav">
        <div class="landing-nav__inner">
          <div class="logo">
            <div class="logo__icon">${FLAME_ICON}</div>
            <div class="logo__text">
              <span class="logo__name">GOBARDHAN</span>
              <span class="logo__tagline">Smart Biogas System</span>
            </div>
          </div>
          <div class="nav-links">
            <a href="#features" class="nav-link">Features</a>
            <a href="#about" class="nav-link">About</a>
            <button class="btn-nav-login" id="nav-login-btn">Login</button>
          </div>
        </div>
      </nav>

      <!-- Hero -->
      <section class="hero" id="home">
        <div class="hero__inner">
          <div class="hero__badge">
            <span class="hero__badge-dot"></span>
            IoT-Based Smart Monitoring System
          </div>
          <h1 class="hero__title">GOBARDHAN</h1>
          <p class="hero__subtitle">Smart Biogas Monitoring &amp; Slurry Management System</p>
          <p class="hero__desc">
            A smart IoT-based system for real-time monitoring of slurry level, methane concentration,
            pressure and temperature — with intelligent control of mixing and gate-valve operations.
          </p>
          <div class="hero__cta-group">
            <button class="btn-primary" id="hero-login-btn">
              ${LOCK_ICON}
              LOGIN TO DASHBOARD
            </button>
            <a href="#features" class="btn-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>
              See Features
            </a>
          </div>
        </div>
      </section>

      <!-- Features -->
      <section class="features-strip" id="features">
        <div class="features-strip__inner">
          <h2 class="features-strip__title">System Capabilities</h2>
          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-card__icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z"/></svg>
              </div>
              <div class="feature-card__title">Methane Monitoring</div>
              <div class="feature-card__desc">Real-time MQ-4 sensor data with safety thresholds and alert generation.</div>
            </div>
            <div class="feature-card">
              <div class="feature-card__icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"/></svg>
              </div>
              <div class="feature-card__title">Slurry Level Control</div>
              <div class="feature-card__desc">Ultrasonic measurement with visual tank display and configurable drum height.</div>
            </div>
            <div class="feature-card">
              <div class="feature-card__icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2ZM9 9h6v6H9V9Z"/></svg>
              </div>
              <div class="feature-card__title">Temperature &amp; Pressure</div>
              <div class="feature-card__desc">BMP180 pressure, DHT11 ambient and DS18B20 slurry temperature monitoring.</div>
            </div>
            <div class="feature-card">
              <div class="feature-card__icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l5.654-4.654m5.17-2.498 4.223-4.224a.75.75 0 0 0-1.06-1.06l-4.223 4.223m0 0-3.164.668-.668 3.164 3.832-3.832Z"/></svg>
              </div>
              <div class="feature-card__title">Actuator Control</div>
              <div class="feature-card__desc">Remote control of stirrer (stepper motor), grinder and outlet gate valve.</div>
            </div>
            <div class="feature-card">
              <div class="feature-card__icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z"/></svg>
              </div>
              <div class="feature-card__title">Direct Wi-Fi Control</div>
              <div class="feature-card__desc">Browser communicates directly with ESP32 — no cloud server required.</div>
            </div>
            <div class="feature-card">
              <div class="feature-card__icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/></svg>
              </div>
              <div class="feature-card__title">Live History Charts</div>
              <div class="feature-card__desc">Real-time trend charts with last 30 readings kept in browser memory.</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="landing-footer" id="about">
        <p>
          <span>GOBARDHAN</span> — Smart IoT-Based Biogas Monitoring &amp; Slurry Management System<br/>
          ESP32 · HC-SR04 · MQ-4 · BMP180 · DHT11 · DS18B20 · L298N Stepper Driver
        </p>
      </footer>
    </div>
  `;

  // Bind login triggers
  document.getElementById('nav-login-btn')?.addEventListener('click', showLoginModal);
  document.getElementById('hero-login-btn')?.addEventListener('click', showLoginModal);
}

// ---- LOGIN MODAL ----
function showLoginModal() {
  // Remove any existing modal
  document.getElementById('login-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'login-modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Login">
      <div class="modal-header">
        <div class="modal-header__icon">${LOCK_ICON}</div>
        <div class="modal-header__title">GOBARDHAN</div>
        <div class="modal-header__sub">Sign in to access the Control Center</div>
      </div>
      <div class="modal-body">
        <div id="login-error" class="login-error hidden">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
          Invalid username or password.
        </div>
        <form id="login-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="login-username">Username</label>
            <input
              type="text"
              id="login-username"
              class="form-input"
              placeholder="Enter username"
              autocomplete="username"
              autocapitalize="none"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="login-password">Password</label>
            <input
              type="password"
              id="login-password"
              class="form-input"
              placeholder="Enter password"
              autocomplete="current-password"
              required
            />
          </div>
          <button type="submit" class="btn-login" id="btn-login-submit">
            LOGIN TO DASHBOARD
          </button>
        </form>
        <button class="modal-cancel-btn" id="btn-login-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus username
  setTimeout(() => document.getElementById('login-username')?.focus(), 100);

  // Submit
  document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username')?.value;
    const password = document.getElementById('login-password')?.value;
    _attemptLogin(username, password);
  });

  // Cancel / outside click
  document.getElementById('btn-login-cancel')?.addEventListener('click', _closeLoginModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) _closeLoginModal(); });

  // ESC key
  document.addEventListener('keydown', _escCloseLogin);
}

function _closeLoginModal() {
  document.getElementById('login-modal-overlay')?.remove();
  document.removeEventListener('keydown', _escCloseLogin);
}

function _escCloseLogin(e) {
  if (e.key === 'Escape') _closeLoginModal();
}

function _attemptLogin(username, password) {
  const btn = document.getElementById('btn-login-submit');
  const err = document.getElementById('login-error');

  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="loading-spinner"></span> Logging in…`; }

  setTimeout(() => {
    const result = login(username, password);
    if (result.success) {
      _closeLoginModal();
      showDashboard();
    } else {
      err?.classList.remove('hidden');
      if (btn) { btn.disabled = false; btn.textContent = 'LOGIN TO DASHBOARD'; }
      document.getElementById('login-password').value = '';
      document.getElementById('login-password')?.focus();
    }
  }, 400); // small artificial delay feels more natural
}

// ---- DASHBOARD PAGE ----
function showDashboard() {
  // Load Chart.js from CDN if not already loaded
  if (!window.Chart) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    script.onload = () => _renderDashboardNow();
    document.head.appendChild(script);
  } else {
    _renderDashboardNow();
  }
}

function _renderDashboardNow() {
  APP_ROOT.innerHTML = '<div id="dashboard-page"></div>';
  const dashContainer = document.getElementById('dashboard-page');
  renderDashboard(dashContainer, _handleLogout);
}

function _handleLogout() {
  cleanupDashboard();
  logout();
  showLanding();
}

// ---- Toast Notification ----
export function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconMap = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${iconMap[type] || ''} <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ---- Bootstrap ----
route();
