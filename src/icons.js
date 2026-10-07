// Inline SVG weather icons, drawn on a 64x64 grid. Colors live in style.css.

const round = (n) => Math.round(n * 10) / 10

function sun(cx, cy, r) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    return `<line x1="${round(cx + cos * (r + 4))}" y1="${round(cy + sin * (r + 4))}" x2="${round(cx + cos * (r + 9))}" y2="${round(cy + sin * (r + 9))}"/>`
  }).join('')
  return `<g class="i-sun"><g class="i-rays">${rays}</g><circle cx="${cx}" cy="${cy}" r="${r}"/></g>`
}

const moon = (transform = '') =>
  `<path class="i-moon" transform="${transform}" d="M38 12A20 20 0 1 0 52 40 16 16 0 0 1 38 12Z"/>`

const CLOUD = 'M20 50h26a10 10 0 0 0 0-20A14 14 0 0 0 20 28a11 11 0 0 0 0 22z'
const cloud = (cls = 'i-cloud', transform = '') =>
  `<path class="${cls}" transform="${transform}" d="${CLOUD}"/>`

const raisedCloud = (cls) => cloud(cls, 'translate(0 -8)')

const SHAPES = {
  clear: (isDay) => (isDay ? sun(32, 32, 12) : moon()),
  partly: (isDay) =>
    (isDay ? sun(24, 24, 9) : moon('translate(-6 -6) scale(0.8)')) +
    cloud('i-cloud', 'translate(8 6) scale(0.85)'),
  cloudy: () => cloud('i-cloud-back', 'translate(10 -6) scale(0.8)') + cloud(),
  fog: () =>
    raisedCloud('i-cloud') +
    '<g class="i-fog"><line x1="14" y1="49" x2="46" y2="49"/><line x1="20" y1="57" x2="52" y2="57"/></g>',
  drizzle: () =>
    raisedCloud('i-cloud') +
    '<g class="i-rain"><line x1="24" y1="49" x2="23" y2="52"/><line x1="33" y1="53" x2="32" y2="56"/><line x1="42" y1="49" x2="41" y2="52"/></g>',
  rain: () =>
    raisedCloud('i-cloud') +
    '<g class="i-rain"><line x1="24" y1="48" x2="21" y2="57"/><line x1="33" y1="48" x2="30" y2="57"/><line x1="42" y1="48" x2="39" y2="57"/></g>',
  snow: () =>
    raisedCloud('i-cloud') +
    '<g class="i-snow"><circle cx="23" cy="51" r="2.6"/><circle cx="33" cy="56" r="2.6"/><circle cx="43" cy="51" r="2.6"/></g>',
  storm: () =>
    raisedCloud('i-cloud-dark') +
    '<path class="i-bolt" d="M34 38l-8 13h7l-3 11 11-15h-7l3-9z"/>',
}

export function weatherIcon(kind, isDay = true) {
  const draw = SHAPES[kind] ?? SHAPES.cloudy
  return `<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true">${draw(isDay)}</svg>`
}

export const dropIcon =
  '<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/></svg>'

export const windIcon =
  '<svg class="stat-icon stat-icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/></svg>'
