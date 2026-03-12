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

// =============================================
// SEARCH LOGIC
// =============================================

/**
 * Triggered when user clicks "Search Weather" button.
 * Validates input, then fetches weather data for the typed city.
 */
function searchCity() {
  const input = document.getElementById('city-input');
  const city = input.value.trim();

  // Validation: empty input
  if (!city) {
    showPopup('⚠️', 'Empty Search', 'Please enter a city name before searching.');
    return;
  }

  // Validation: suspicious/numeric-only
  if (/^\d+$/.test(city)) {
    showPopup('⚠️', 'Invalid Input', 'City name cannot be only numbers. Please enter a valid city name.');
    return;
  }

  // Validation: too short
  if (city.length < 2) {
    showPopup('⚠️', 'Too Short', 'Please enter at least 2 characters for the city name.');
    return;
  }

  hideDropdown();
  fetchWeatherByCity(city);
}

/**
 * Handles Enter key press on the search input.
 */
function handleKeyDown(event) {
  if (event.key === 'Enter') {
    searchCity();
  }
}

/**
 * Fetches current weather and 5-day forecast by city name.
 * @param {string} city - City name string
 */
async function fetchWeatherByCity(city) {
  showLoading(true);
  try {
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`),
      fetch(`${BASE_URL}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`)
    ]);

    await handleAPIResponse(currentRes, forecastRes);
  } catch (err) {
    showLoading(false);
    showPopup('🌐', 'Network Error', 'Could not connect to the weather service. Please check your internet connection and try again.');
  }
}

/**
 * Uses the browser's Geolocation API to get user's current location,
 * then fetches weather for those coordinates.
 */
function useCurrentLocation() {
  if (!navigator.geolocation) {
    showPopup('📍', 'Not Supported', 'Geolocation is not supported by your browser. Please search by city name instead.');
    return;
  }

  showLoading(true);

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        const [currentRes, forecastRes] = await Promise.all([
          fetch(`${BASE_URL}/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric`),
          fetch(`${BASE_URL}/forecast?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric`)
        ]);
        await handleAPIResponse(currentRes, forecastRes);
      } catch (err) {
        showLoading(false);
        showPopup('🌐', 'Network Error', 'Could not connect to the weather service. Please check your internet connection and try again.');
      }
    },
    (error) => {
      showLoading(false);
      const msgs = {
        1: 'Location access was denied. Please allow location access in your browser settings.',
        2: 'Your location could not be determined. Please try searching by city name.',
        3: 'Location request timed out. Please try again or search by city name.'
      };
      showPopup('📍', 'Location Error', msgs[error.code] || 'An unknown location error occurred.');
    }
  );
}

/**
 * Handles API responses for both current weather and forecast.
 * Shows appropriate error messages for non-200 responses.
 */
async function handleAPIResponse(currentRes, forecastRes) {
  showLoading(false);

  if (currentRes.status === 401) {
    showPopup('🔑', 'API Key Error', 'Invalid API key. Please check your OpenWeatherMap API key in app.js.');
    return;
  }

  if (currentRes.status === 404) {
    showPopup('🔍', 'City Not Found', 'We couldn\'t find that city. Please check the spelling and try again. Example: "London", "New York", "Tokyo".');
    return;
  }

  if (!currentRes.ok || !forecastRes.ok) {
    showPopup('🌩', 'API Error', `Something went wrong (Error ${currentRes.status}). Please try again shortly.`);
    return;
  }

  const currentData = await currentRes.json();
  const forecastData = await forecastRes.json();

  currentWeatherData = currentData;
  displayCurrentWeather(currentData);
  displayForecast(forecastData);

  // Save to recent searches
  addRecentCity(currentData.name + ', ' + currentData.sys.country);
}
