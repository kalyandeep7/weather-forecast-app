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

// =============================================
// DISPLAY: CURRENT WEATHER
// =============================================

/**
 * Renders the current weather card with all data from the API response.
 * Updates dynamic background theme, temp alert, and weather icon.
 * @param {Object} data - OpenWeatherMap current weather response
 */
function displayCurrentWeather(data) {
  const { name, sys, main, weather, wind, visibility, timezone } = data;

  // Save raw Kelvin temp for unit toggling
  currentTempKelvin = main.temp + 273.15;

  // Store city timezone offset (seconds from UTC) and restart clock
  cityTimezoneOffset = timezone;
  startHeaderClock();

  // Compute the city's current local time using its UTC offset
  const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  const cityNow = new Date(utcMs + timezone * 1000);

  // Elements
  document.getElementById('city-name').textContent = name;
  document.getElementById('country-flag').textContent = getFlagEmoji(sys.country);
  // Show date in the city's local timezone
  document.getElementById('current-date').textContent = formatCityDate(cityNow);
  document.getElementById('weather-desc').textContent = weather[0].description;
  document.getElementById('feels-like').textContent = `Feels like ${formatTemp(main.feels_like + 273.15)}`;
  document.getElementById('humidity').textContent = `${main.humidity}%`;
  document.getElementById('wind-speed').textContent = `${(wind.speed * 3.6).toFixed(1)} km/h`;
  document.getElementById('visibility').textContent = visibility ? `${(visibility / 1000).toFixed(1)} km` : 'N/A';

  // Current temp (respects selected unit)
  document.getElementById('current-temp').textContent = formatTemp(currentTempKelvin);

  // Weather icon & condition label
  const condition = weather[0].main.toLowerCase();
  document.getElementById('weather-icon-main').textContent = getWeatherEmoji(condition, weather[0].id);
  document.getElementById('weather-condition-label').textContent = weather[0].main;

  // Show/hide unit toggle
  document.getElementById('unit-toggle-wrapper').classList.remove('hidden');

  // Apply dynamic background theme
  applyTheme(condition, weather[0].id);

  // Extreme temp alert
  const tempC = main.temp;
  const alertEl = document.getElementById('temp-alert');
  const alertText = document.getElementById('temp-alert-text');

  if (tempC > 40) {
    alertText.textContent = `🔥 Extreme heat in ${name}: ${tempC.toFixed(1)}°C — Stay hydrated and avoid prolonged sun exposure!`;
    alertEl.classList.remove('hidden');
  } else if (tempC < -10) {
    alertText.textContent = `🥶 Extreme cold in ${name}: ${tempC.toFixed(1)}°C — Dress warmly and limit time outdoors!`;
    alertEl.classList.remove('hidden');
    document.getElementById('temp-alert').style.background = 'linear-gradient(90deg, #3b82f6, #818cf8)';
  } else {
    alertEl.classList.add('hidden');
    document.getElementById('temp-alert').style.background = '';
  }
 // Show card with animation
  const card = document.getElementById('current-weather');
  document.getElementById('empty-state').classList.add('hidden');
  card.classList.remove('hidden');
  card.classList.remove('animate-card-in');
  void card.offsetWidth; // force reflow
  card.classList.add('animate-card-in');
}

// =============================================
// DISPLAY: FORECAST
// =============================================

/**
 * Renders the 5-day forecast section.
 * Groups 3-hour interval data by day and picks midday entries.
 * @param {Object} data - OpenWeatherMap forecast response
 */
function displayForecast(data) {
  const dailyMap = {};

  // Group by date, pick entries closest to midday (12:00)
  data.list.forEach(item => {
    const date = item.dt_txt.split(' ')[0];
    const time = item.dt_txt.split(' ')[1];
    if (!dailyMap[date] || time === '12:00:00') {
      dailyMap[date] = item;
    }
  });

  // Skip today, show next 5 days
  const today = new Date().toISOString().split('T')[0];
  const days = Object.keys(dailyMap).filter(d => d !== today).slice(0, 5);

  const container = document.getElementById('forecast-cards');
  container.innerHTML = '';

  days.forEach((date, i) => {
    const item = dailyMap[date];
    const condition = item.weather[0].main.toLowerCase();
    const emoji = getWeatherEmoji(condition, item.weather[0].id);
    const tempK = item.main.temp + 273.15;
    const day = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const card = document.createElement('div');
    card.className = 'forecast-card animate-card-in';
    card.style.animationDelay = `${i * 0.08}s`;
    card.style.animationFillMode = 'both';
    card.style.opacity = '0';

    card.innerHTML = `
      <p class="forecast-day">${day}</p>
      <p class="forecast-date">${dateLabel}</p>
      <div class="forecast-icon">${emoji}</div>
      <p class="forecast-temp">${formatTemp(tempK)}</p>
      <div class="forecast-meta">
        <div class="forecast-meta-item">💧 <span>${item.main.humidity}%</span></div>
        <div class="forecast-meta-item">💨 <span>${(item.wind.speed * 3.6).toFixed(1)} km/h</span></div>
      </div>
    `;
    container.appendChild(card);
  });

  const section = document.getElementById('forecast-section');
  section.classList.remove('hidden');
}


// =============================================
// UNIT TOGGLE
// =============================================

/**
 * Sets temperature unit and refreshes displayed temperatures.
 * Only affects the current weather display (per spec).
 * @param {string} unit - 'C' or 'F'
 */
function setUnit(unit) {
  currentUnit = unit;

  document.getElementById('btn-celsius').classList.toggle('active-unit', unit === 'C');
  document.getElementById('btn-fahrenheit').classList.toggle('active-unit', unit === 'F');

  // Update current temp display
  if (currentTempKelvin !== null) {
    document.getElementById('current-temp').textContent = formatTemp(currentTempKelvin);

    // Update feels-like
    if (currentWeatherData) {
      const feelsK = currentWeatherData.main.feels_like + 273.15;
      document.getElementById('feels-like').textContent = `Feels like ${formatTemp(feelsK)}`;
    }
  }
}

/**
 * Converts a Kelvin temperature to the current display unit string.
 * @param {number} kelvin - Temperature in Kelvin
 * @returns {string}
 */
function formatTemp(kelvin) {
  if (currentUnit === 'C') {
    return `${(kelvin - 273.15).toFixed(1)}°C`;
  } else {
    return `${((kelvin - 273.15) * 9 / 5 + 32).toFixed(1)}°F`;
  }
}

// =============================================
// RECENT CITIES
// =============================================

/**
 * Adds a city to the recent searches list (stored in localStorage).
 * Keeps only the 8 most recent unique cities.
 * @param {string} city - City + country string (e.g. "London, GB")
 */
function addRecentCity(city) {
  // Remove duplicate if exists
  recentCities = recentCities.filter(c => c.toLowerCase() !== city.toLowerCase());
  // Add to front
  recentCities.unshift(city);
  // Keep max 8
  if (recentCities.length > 8) recentCities = recentCities.slice(0, 8);

  localStorage.setItem('skypulse_recent', JSON.stringify(recentCities));
  // Update input to show found city
  document.getElementById('city-input').value = city.split(',')[0];
}

/** Loads recent cities from localStorage on app start. */
function loadRecentCities() {
  try {
    recentCities = JSON.parse(localStorage.getItem('skypulse_recent')) || [];
  } catch {
    recentCities = [];
  }
}

/** Shows the dropdown if there are recent cities to display. */
function showDropdown() {
  if (recentCities.length === 0) return;
  const input = document.getElementById('city-input').value.toLowerCase();
  renderDropdown(input);
}

/** Hides the dropdown menu. */
function hideDropdown() {
  document.getElementById('recent-dropdown').classList.add('hidden');
}

/**
 * Filters and renders recent city dropdown based on current input.
 * @param {string} filter - Lowercase filter string
 */
function renderDropdown(filter = '') {
  const list = document.getElementById('recent-list');
  const dropdown = document.getElementById('recent-dropdown');

  const filtered = filter
    ? recentCities.filter(c => c.toLowerCase().includes(filter))
    : recentCities;

  if (filtered.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }

  list.innerHTML = '';
  filtered.forEach(city => {
    const li = document.createElement('li');
    li.className = 'recent-item';
    li.innerHTML = `
      <span>🕐 ${city}</span>
      <span class="recent-item-remove" onclick="removeRecentCity(event, '${city.replace(/'/g, "\\'")}')">✕</span>
    `;
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('recent-item-remove')) return;
      document.getElementById('city-input').value = city.split(',')[0];
      hideDropdown();
      fetchWeatherByCity(city.split(',')[0]);
    });
    list.appendChild(li);
  });

  dropdown.classList.remove('hidden');
}

/**
 * Removes a city from the recent searches list.
 * @param {Event} e - Click event (to stop propagation)
 * @param {string} city - City string to remove
 */
function removeRecentCity(e, city) {
  e.stopPropagation();
  recentCities = recentCities.filter(c => c !== city);
  localStorage.setItem('skypulse_recent', JSON.stringify(recentCities));
  renderDropdown(document.getElementById('city-input').value.toLowerCase());
  if (recentCities.length === 0) hideDropdown();
}

/** Called on input change to filter dropdown in real-time. */
function handleInputChange() {
  const val = document.getElementById('city-input').value.toLowerCase().trim();
  if (val && recentCities.length > 0) {
    renderDropdown(val);
  } else if (!val && recentCities.length > 0) {
    showDropdown();
  } else {
    hideDropdown();
  }
}

// =============================================
// DYNAMIC THEME
// =============================================

/**
 * Applies a visual theme class to the body based on weather condition.
 * Dynamic background changes per weather type (rainy, sunny, etc.)
 * @param {string} condition - Lowercase weather condition string
 * @param {number} id - OpenWeatherMap weather condition ID
 */
function applyTheme(condition, id) {
  document.body.classList.remove('theme-rain', 'theme-sunny', 'theme-cloudy', 'theme-snow');

  if (id >= 200 && id < 600 && id !== 800) {
    // Thunderstorm (2xx), Drizzle (3xx), Rain (5xx)
    if (id < 600) document.body.classList.add('theme-rain');
  } else if (id >= 600 && id < 700) {
    // Snow
    document.body.classList.add('theme-snow');
  } else if (id === 800) {
    // Clear sky
    document.body.classList.add('theme-sunny');
  } else if (id >= 801 && id <= 804) {
    // Cloudy
    document.body.classList.add('theme-cloudy');
  }
}

// =============================================
// WEATHER ICONS (EMOJI)
// =============================================

/**
 * Returns an emoji representing the weather condition.
 * @param {string} condition - Lowercase condition string
 * @param {number} id - OWM condition ID for fine-grained mapping
 * @returns {string} emoji
 */
function getWeatherEmoji(condition, id) {
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 510) return '🌧️';
  if (id >= 510 && id < 600) return '🌨️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return '☀️';
  if (id === 801) return '🌤️';
  if (id === 802) return '⛅';
  if (id >= 803) return '☁️';
  // Fallback by string
  if (condition.includes('thunder')) return '⛈️';
  if (condition.includes('rain') || condition.includes('drizzle')) return '🌧️';
  if (condition.includes('snow')) return '❄️';
  if (condition.includes('cloud')) return '☁️';
  if (condition.includes('clear')) return '☀️';
  if (condition.includes('mist') || condition.includes('fog')) return '🌫️';
  return '🌡️';
}

// =============================================
// POPUP (Error / Info messages)
// =============================================

/**
 * Displays a custom popup with an icon, title, and message.
 * @param {string} icon - Emoji icon
 * @param {string} title - Short title
 * @param {string} message - Descriptive message
 */
function showPopup(icon, title, message) {
  document.getElementById('popup-icon').textContent = icon;
  document.getElementById('popup-title').textContent = title;
  document.getElementById('popup-message').textContent = message;

  const overlay = document.getElementById('popup-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');

  // Reset animation
  const box = document.getElementById('popup-box');
  box.classList.remove('animate-popup');
  void box.offsetWidth;
  box.classList.add('animate-popup');
}

/** Closes the custom popup overlay. */
function closePopup() {
  const overlay = document.getElementById('popup-overlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('flex');
}

// Close popup on backdrop click
document.getElementById('popup-overlay').addEventListener('click', function(e) {
  if (e.target === this) closePopup();
});

// =============================================
// LOADING STATE
// =============================================

/**
 * Shows or hides the loading spinner in the sidebar.
 * @param {boolean} show
 */
function showLoading(show) {
  const spinner = document.getElementById('loading-spinner');
  if (show) {
    spinner.classList.remove('hidden');
    spinner.classList.add('flex');
  } else {
    spinner.classList.add('hidden');
    spinner.classList.remove('flex');
  }
}

// =============================================
// UTILITY HELPERS
// =============================================

/**
 * Formats a Date object into a friendly display string for the weather card.
 * Shows full weekday, date, month, year and local 12-hour time.
 * @param {Date} date - City-local Date object
 * @returns {string}
 */
function formatCityDate(date) {
  const datePart = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  return `${datePart} · ${timePart}`;
}

/**
 * Formats a Date object into a friendly display string (legacy, uses device local time).
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Converts a 2-letter ISO country code into a flag emoji.
 * @param {string} countryCode - e.g. "GB", "IN", "US"
 * @returns {string} flag emoji
 */
function getFlagEmoji(countryCode) {
  if (!countryCode) return '';
  return countryCode
    .toUpperCase()
    .split('')
    .map(char => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
}
// your code goes here
