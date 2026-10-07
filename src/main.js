import './style.css'

const form = document.querySelector('#search-form')
const input = document.querySelector('#city-input')
const statusEl = document.querySelector('#status')
const currentEl = document.querySelector('#current')
const forecastEl = document.querySelector('#forecast')
const unitToggle = document.querySelector('#unit-toggle')

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
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
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
  currentEl.hidden = false
  currentEl.innerHTML = `
    <h2></h2>
    <p class="temp">${formatTemp(c.temperature_2m)}°${unit}</p>
    <p>${describe(c.weather_code)}</p>
    <p>Humidity: ${c.relative_humidity_2m}% · Wind: ${c.wind_speed_10m} km/h</p>`
  currentEl.querySelector('h2').textContent =
    place.name + (place.country ? `, ${place.country}` : '')

  const d = weather.daily
  forecastEl.innerHTML = d.time
    .map((day, i) => {
      const label = new Date(day).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
      })
      return `
        <div class="day">
          <strong>${label}</strong>
          <span>${describe(d.weather_code[i])}</span>
          <span>${formatTemp(d.temperature_2m_max[i])}° / ${formatTemp(d.temperature_2m_min[i])}°</span>
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