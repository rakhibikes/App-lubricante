// Lectura de archivos GPX en el navegador: distancia, perfil de altura, ruta y puntos de control.
const R_TIERRA = 6371.0088

function distancia(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R_TIERRA * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function leerGpx(texto, maxPuntos = 1500) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('El archivo no es un GPX válido.')
  let nodos = [...doc.getElementsByTagName('trkpt')]
  if (!nodos.length) nodos = [...doc.getElementsByTagName('rtept')]
  if (nodos.length < 2) throw new Error('El GPX no trae una ruta (trkpt o rtept).')
  const pts = []
  let acc = 0
  for (const n of nodos) {
    const p = { lat: Number(n.getAttribute('lat')), lon: Number(n.getAttribute('lon')) }
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue
    const ele = n.getElementsByTagName('ele')[0]
    p.ele = ele ? Number(ele.textContent) : null
    if (pts.length) acc += distancia(pts[pts.length - 1], p)
    p.km = acc
    pts.push(p)
  }
  const paso = Math.max(1, Math.ceil(pts.length / maxPuntos))
  const reducidos = pts.filter((_, i) => i % paso === 0 || i === pts.length - 1)
    .map((p) => [+p.lat.toFixed(5), +p.lon.toFixed(5), p.ele === null ? null : Math.round(p.ele), +p.km.toFixed(3)])
  // Waypoints: se proyectan al punto más cercano de la ruta para saber su km.
  const controles = [...doc.getElementsByTagName('wpt')].map((w) => {
    const p = { lat: Number(w.getAttribute('lat')), lon: Number(w.getAttribute('lon')) }
    let mejor = null
    for (const q of pts) { const d = distancia(p, q); if (!mejor || d < mejor.d) mejor = { d, km: q.km } }
    const nombre = w.getElementsByTagName('name')[0]?.textContent?.trim() || 'Punto de control'
    return mejor && mejor.d < 1 ? { km: +mejor.km.toFixed(1), nombre } : null
  }).filter(Boolean).sort((a, b) => a.km - b.km)
  const nombre = doc.getElementsByTagName('name')[0]?.textContent?.trim() || ''
  let subida = 0
  for (let i = 1; i < pts.length; i++) if (pts[i].ele !== null && pts[i - 1].ele !== null && pts[i].ele > pts[i - 1].ele) subida += pts[i].ele - pts[i - 1].ele
  return { nombre, total: +acc.toFixed(2), puntos: reducidos, controles, subida: Math.round(subida) }
}
