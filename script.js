/**
 * KDInfo Weather Forecast Application
 * Uses OpenWeatherMap API for real-time weather data
 * Features: City search, geolocation, 5-day forecast, unit toggle,
 *           recent searches, dynamic themes, error handling, input validation
 */

// =============================================
// CONFIG
// =============================================

// Replace with your own OpenWeatherMap API key from https://openweathermap.org/api
const API_KEY = "9e9effd5d00947a501b6bd5f2cf28818";
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

// =============================================
// STATE
// =============================================

let currentUnit = 'C';           // 'C' or 'F'
let currentTempKelvin = null;    // Raw temp in Kelvin for unit toggling
let recentCities = [];           // Recently searched cities (from localStorage)
let currentWeatherData = null;   // Latest weather response
let cityTimezoneOffset = null;   // Timezone offset in seconds from UTC (from OWM)
let clockInterval = null;        // Interval ID for the header clock

// =============================================
// INIT
// =============================================

/**
 * Initialise the app on page load.
 * Loads saved recent cities, starts header clock, and attaches outside-click listener.
 */
function init() {
  loadRecentCities();
  startHeaderClock(); // Start clock with local time by default
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#city-input') && !e.target.closest('#recent-dropdown')) {
      hideDropdown();
    }
  });
}

/**
 * Starts (or restarts) the header clock.
 * When cityTimezoneOffset is set, shows the selected city's local time in 12hr format.
 * Otherwise shows the user's local device time.
 */
function startHeaderClock() {
  if (clockInterval) clearInterval(clockInterval);

  function tick() {
    let now;
    if (cityTimezoneOffset !== null) {
      // Compute city's local time: UTC + city offset
      const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
      now = new Date(utcMs + cityTimezoneOffset * 1000);
    } else {
      now = new Date();
    }

    // 12-hour format
    document.getElementById('live-time').textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    // Date display
    document.getElementById('live-date-header').textContent = now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  tick();
  clockInterval = setInterval(tick, 1000);
}

window.addEventListener('DOMContentLoaded', init);