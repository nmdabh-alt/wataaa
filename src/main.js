import './style.css'
import { weatherIcon, dropIcon, windIcon } from './icons.js'

const form = document.querySelector('#search-form')
const input = document.querySelector('#city-input')
const statusEl = document.querySelector('#status')
const currentEl = document.querySelector('#current')
const forecastEl = document.querySelector('#forecast')
const unitToggle = document.querySelector('#unit-toggle')
const emptyEl = document.querySelector('#empty')

emptyEl.querySelector('.empty-icon').innerHTML = weatherIcon('partly')

let unit = 'C'
try {
  if (localStorage.getItem('unit') === 'F') unit = 'F'
} catch {}
let lastResult = null

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
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: 5,
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error('Forecast request failed')
  return res.json()
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
    </div>`
  currentEl.querySelector('h2').textContent =
    place.name + (place.country ? `, ${place.country}` : '')

  const d = weather.daily
  const lo = Math.min(...d.temperature_2m_min)
  const hi = Math.max(...d.temperature_2m_max)
  const span = hi - lo || 1
  forecastEl.innerHTML = d.time
    .map((day, i) => {
      const label = i === 0 ? 'Today' : new Date(day).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
      })
      const min = d.temperature_2m_min[i]
      const max = d.temperature_2m_max[i]
      const left = ((min - lo) / span) * 100
      const width = ((max - min) / span) * 100
      return `
        <div class="day">
          ${weatherIcon(kindOf(d.weather_code[i]))}
          <div class="day-label">
            <strong>${label}</strong>
            <span>${describe(d.weather_code[i])}</span>
          </div>
          <span class="lo">${formatTemp(min)}°</span>
          <div class="bar"><div class="bar-fill" style="left:${left}%;width:${width}%;background:linear-gradient(90deg, ${tempColor(min)}, ${tempColor(max)})"></div></div>
          <span class="hi">${formatTemp(max)}°</span>
        </div>`
    })
    .join('')
}

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
})
updateToggleLabel()

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