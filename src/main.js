import './style.css'
import { weatherIcon, dropIcon, windIcon, sunriseIcon, sunsetIcon } from './icons.js'
import { supabase } from './supabase.js'

const form = document.querySelector('#search-form')
const input = document.querySelector('#city-input')
const statusEl = document.querySelector('#status')
const currentEl = document.querySelector('#current')
const forecastEl = document.querySelector('#forecast')
const unitToggle = document.querySelector('#unit-toggle')
const emptyEl = document.querySelector('#empty')
const accountButton = document.querySelector('#account-button')
const signinForm = document.querySelector('#signin-form')
const signinEmail = document.querySelector('#signin-email')
const signinStatus = document.querySelector('#signin-status')
const favoritesEl = document.querySelector('#favorites')
const favoritesList = favoritesEl.querySelector('.favorites-list')
const favoritesNote = favoritesEl.querySelector('.favorites-note')

emptyEl.querySelector('.empty-icon').innerHTML = weatherIcon('partly')

let unit = 'C'
try {
  if (localStorage.getItem('unit') === 'F') unit = 'F'
} catch {}
let lastResult = null
let user = null
// Saved cities in the order they were added: { row, weather, failed }
let favorites = []

const formatTemp = (celsius) =>
  Math.round(unit === 'F' ? (celsius * 9) / 5 + 32 : celsius)

const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
}
const describe = (code) => WEATHER_CODES[code] ?? 'Unknown'

// Groups WMO weather codes into the icon/theme families in icons.js and style.css
function kindOf(code) {
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

// Blue for cold through green and yellow to red for hot, based on °C
const tempColor = (celsius) =>
  `hsl(${Math.round(Math.min(210, Math.max(0, 200 - (celsius + 5) * 4.5)))} 85% 55%)`

async function getCoordinates(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Location lookup failed')
  const data = await res.json()
  if (!data.results?.length) throw new Error(`City "${city}" not found`)
  return data.results[0]
}

async function getForecast(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
    timezone: 'auto',
    forecast_days: 16, // the most the forecast API offers
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error('Forecast request failed')
  return res.json()
}

// Long-range outlook for the days past the 16-day forecast. The seasonal model
// returns 51 ensemble runs per variable (temperature_2m_max, _member01..._member50);
// we show their average.
async function getOutlook(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: 30,
  })
  const res = await fetch(`https://seasonal-api.open-meteo.com/v1/seasonal?${params}`)
  if (!res.ok) throw new Error('Outlook request failed')
  const { daily } = await res.json()
  const mean = (variable, i) => {
    const pattern = new RegExp(`^${variable}(_member\\d+)?$`)
    const values = Object.keys(daily)
      .filter((key) => pattern.test(key))
      .map((key) => daily[key][i])
      .filter((v) => v != null)
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  }
  return daily.time.map((date, i) => ({
    date,
    code: daily.weather_code[i],
    min: mean('temperature_2m_min', i),
    max: mean('temperature_2m_max', i),
    outlook: true,
  }))
}

function render(place, weather) {
  const c = weather.current
  const kind = kindOf(c.weather_code)
  const isDay = c.is_day === 1
  document.body.dataset.theme = isDay ? kind : 'night'

  emptyEl.hidden = true
  currentEl.hidden = false
  currentEl.innerHTML = `
    <div class="current-main">
      ${weatherIcon(kind, isDay)}
      <div>
        <h2></h2>
        <p class="temp">${formatTemp(c.temperature_2m)}°${unit}</p>
        <p class="condition">${describe(c.weather_code)}</p>
      </div>
    </div>
    <div class="stats">
      <span class="stat">${dropIcon} Humidity ${c.relative_humidity_2m}%</span>
      <span class="stat">${windIcon} Wind ${c.wind_speed_10m} km/h</span>
      <span class="stat">${sunriseIcon} Sunrise ${clockTime(weather.daily.sunrise[0])}</span>
      <span class="stat">${sunsetIcon} Sunset ${clockTime(weather.daily.sunset[0])}</span>
      <button class="save-button" type="button"></button>
    </div>`
  updateSaveButton()
  currentEl.querySelector('h2').textContent =
    place.name + (place.country ? `, ${place.country}` : '')

  renderForecast()
}

// Open-Meteo gives local times like "2026-11-06T05:50"; keep the HH:MM part
const clockTime = (iso) => (iso ? iso.slice(11, 16) : '—')

const RANGES = [5, 10, 30]
let range = 5
try {
  const saved = Number(localStorage.getItem('range'))
  if (RANGES.includes(saved)) range = saved
} catch {}

function forecastDays(result) {
  const d = result.weather.daily
  const days = d.time
    .map((date, i) => ({
      date,
      code: d.weather_code[i],
      min: d.temperature_2m_min[i],
      max: d.temperature_2m_max[i],
      outlook: false,
    }))
    .filter((day) => day.min != null && day.max != null)
  if (range > days.length && result.outlook) {
    const lastDate = days.at(-1).date
    days.push(...result.outlook.filter((day) => day.date > lastDate && day.min != null))
  }
  return days.slice(0, range)
}

async function loadOutlook(result) {
  if (result.outlook || result.outlookState) return
  result.outlookState = 'loading'
  try {
    result.outlook = await getOutlook(result.place.latitude, result.place.longitude)
    result.outlookState = 'done'
  } catch {
    result.outlookState = 'failed'
  }
  if (lastResult === result) renderForecast()
}

function renderForecast() {
  if (!lastResult) return
  const days = forecastDays(lastResult)
  const lo = Math.min(...days.map((day) => day.min))
  const hi = Math.max(...days.map((day) => day.max))
  const span = hi - lo || 1

  const rows = days.map((day, i) => {
    const label = i === 0 ? 'Today' : new Date(day.date).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    })
    const left = ((day.min - lo) / span) * 100
    const width = ((day.max - day.min) / span) * 100
    const note = day.outlook && !days[i - 1].outlook
      ? `<p class="outlook-note">Days ${i + 1}–${days.length} are a long-range outlook: an average of 51 model runs. Treat them as a general trend, not a precise forecast.</p>`
      : ''
    return `${note}
      <div class="day${day.outlook ? ' outlook' : ''}">
        ${weatherIcon(kindOf(day.code))}
        <div class="day-label">
          <strong>${label}</strong>
          <span>${day.outlook ? 'Outlook' : describe(day.code)}</span>
        </div>
        <span class="lo">${formatTemp(day.min)}°</span>
        <div class="bar"><div class="bar-fill" style="left:${left}%;width:${width}%;background:linear-gradient(90deg, ${tempColor(day.min)}, ${tempColor(day.max)})"></div></div>
        <span class="hi">${formatTemp(day.max)}°</span>
      </div>`
  })

  let status = ''
  if (range > days.length) {
    if (lastResult.outlookState === 'failed') {
      status = `<p class="outlook-note">Couldn't load the long-range outlook, so only ${days.length} days are shown.</p>`
    } else {
      status = '<p class="outlook-note">Loading the long-range outlook…</p>'
      loadOutlook(lastResult)
    }
  }

  const tabs = RANGES.map(
    (n) => `<button type="button" data-range="${n}" aria-pressed="${n === range}">${n} days</button>`,
  ).join('')
  forecastEl.innerHTML = `<div class="range-tabs" aria-label="Forecast length">${tabs}</div>${rows.join('')}${status}`
}

forecastEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-range]')
  if (!button) return
  range = Number(button.dataset.range)
  try {
    localStorage.setItem('range', String(range))
  } catch {}
  renderForecast()
})

function updateToggleLabel() {
  unitToggle.textContent = `°${unit}`
}

unitToggle.addEventListener('click', () => {
  unit = unit === 'C' ? 'F' : 'C'
  try {
    localStorage.setItem('unit', unit)
  } catch {}
  updateToggleLabel()
  if (lastResult) render(lastResult.place, lastResult.weather)
  renderFavorites()
})
updateToggleLabel()

// --- Favorites ---

const sameSpot = (a, b) => a.latitude === b.latitude && a.longitude === b.longitude

function updateSaveButton() {
  const button = currentEl.querySelector('.save-button')
  if (!button || !lastResult) return
  const saved = favorites.some((f) => sameSpot(f.row, lastResult.place))
  button.textContent = saved ? '★ Saved' : '☆ Save'
  button.setAttribute('aria-pressed', String(saved))
}

function showPlace(place, weather) {
  lastResult = { place, weather }
  statusEl.textContent = ''
  render(place, weather)
  currentEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function favoriteCard(fav) {
  const { row, weather, failed } = fav
  const c = weather?.current
  const card = document.createElement('div')
  card.className = 'fav'

  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'fav-open'
  open.disabled = !weather
  open.innerHTML = `
    ${c ? weatherIcon(kindOf(c.weather_code), c.is_day === 1) : '<span class="wx-icon"></span>'}
    <span class="fav-name"></span>
    <span class="fav-temp">${c ? `${formatTemp(c.temperature_2m)}°` : failed ? '—' : '…'}</span>`
  open.querySelector('.fav-name').textContent = row.name
  open.addEventListener('click', () => showPlace(row, weather))

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'fav-remove'
  remove.textContent = '×'
  remove.setAttribute('aria-label', `Remove ${row.name}`)
  remove.addEventListener('click', () => removeFavorite(row.id))

  card.append(open, remove)
  return card
}

function renderFavorites() {
  favoritesEl.hidden = !user
  if (!user) return
  favoritesEl.querySelector('.favorites-user').textContent = user.email ?? ''
  if (!favoritesNote.dataset.error) {
    favoritesNote.textContent = favorites.length ? '' : 'Search for a city and tap ☆ Save to add it here.'
  }
  favoritesList.replaceChildren(...favorites.map(favoriteCard))
}

async function loadFavorites() {
  delete favoritesNote.dataset.error
  const { data, error } = await supabase.from('favorites').select('*').order('created_at')
  if (error) {
    favoritesNote.dataset.error = 'true'
    favoritesNote.textContent = `Couldn't load your cities: ${error.message}`
    return
  }
  favorites = data.map((row) => ({ row, weather: null, failed: false }))
  renderFavorites()
  updateSaveButton()

  await Promise.all(
    favorites.map(async (fav) => {
      try {
        fav.weather = await getForecast(fav.row.latitude, fav.row.longitude)
      } catch {
        fav.failed = true
      }
    }),
  )
  renderFavorites()
}

async function addFavorite(place, weather) {
  const { data, error } = await supabase
    .from('favorites')
    .insert({
      name: place.name,
      country: place.country ?? null,
      latitude: place.latitude,
      longitude: place.longitude,
    })
    .select()
    .single()
  if (error) {
    // 23505 = unique violation: it was saved already, e.g. from another tab
    statusEl.textContent = error.code === '23505' ? 'That city is already saved.' : `Couldn't save: ${error.message}`
    if (error.code === '23505') loadFavorites()
    return
  }
  favorites.push({ row: data, weather, failed: false })
  renderFavorites()
  updateSaveButton()
}

async function removeFavorite(id) {
  const { error } = await supabase.from('favorites').delete().eq('id', id)
  if (error) {
    statusEl.textContent = `Couldn't remove: ${error.message}`
    return
  }
  favorites = favorites.filter((f) => f.row.id !== id)
  renderFavorites()
  updateSaveButton()
}

currentEl.addEventListener('click', (event) => {
  const button = event.target.closest('.save-button')
  if (!button || !lastResult) return
  if (!user) {
    openSignin('Sign in to save your favorite cities.')
    return
  }
  const existing = favorites.find((f) => sameSpot(f.row, lastResult.place))
  if (existing) removeFavorite(existing.row.id)
  else addFavorite(lastResult.place, lastResult.weather)
})

// --- Sign in ---

function openSignin(message = '') {
  signinForm.hidden = false
  signinStatus.textContent = message
  signinEmail.focus()
}

function updateAccountUI() {
  accountButton.textContent = user ? 'Sign out' : 'Sign in'
  accountButton.title = user ? `Signed in as ${user.email}` : ''
  if (user) signinForm.hidden = true
}

accountButton.addEventListener('click', async () => {
  if (user) {
    await supabase.auth.signOut()
  } else if (signinForm.hidden) {
    openSignin()
  } else {
    signinForm.hidden = true
  }
})

signinForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const email = signinEmail.value.trim()
  signinStatus.textContent = 'Sending...'
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  })
  signinStatus.textContent = error ? error.message : `Check ${email} for your sign-in link.`
})

supabase.auth.onAuthStateChange((_event, session) => {
  const next = session?.user ?? null
  const changed = next?.id !== user?.id
  user = next
  updateAccountUI()
  if (!changed) return // e.g. a token refresh for the same user

  favorites = []
  renderFavorites()
  updateSaveButton()
  // Supabase advises against awaiting its own calls inside this callback
  if (user) setTimeout(loadFavorites, 0)
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const city = input.value.trim()
  if (!city) return

  statusEl.textContent = 'Loading...'
  currentEl.hidden = true
  forecastEl.innerHTML = ''

  try {
    const place = await getCoordinates(city)
    const weather = await getForecast(place.latitude, place.longitude)
    lastResult = { place, weather }
    render(place, weather)
    statusEl.textContent = ''
  } catch (err) {
    statusEl.textContent = err.message
  }
})