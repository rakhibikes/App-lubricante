// Terreno sugerido con OpenStreetMap: busca los caminos a lo largo de la ruta (API Overpass)
// y traduce su superficie a las tres condiciones del planificador. Todo queda editable.

const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

const PAVIMENTO = new Set(['paved', 'asphalt', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'sett', 'chipseal', 'metal', 'wood', 'bricks', 'cobblestone', 'unhewn_cobblestone'])
const TIERRA = new Set(['unpaved', 'gravel', 'fine_gravel', 'compacted', 'dirt', 'earth', 'ground', 'pebblestone', 'grass', 'grass_paver', 'rock', 'woodchips', 'clay'])
const BLANDO = new Set(['sand', 'mud', 'soil'])

const NOMBRE_SUPERFICIE = {
  paved: 'pavimento', asphalt: 'asfalto', concrete: 'hormigón', 'concrete:plates': 'hormigón', 'concrete:lanes': 'hormigón', paving_stones: 'adoquín', sett: 'adoquín',
  chipseal: 'tratamiento superficial', cobblestone: 'adoquín', unhewn_cobblestone: 'piedra', bricks: 'ladrillo', metal: 'metal', wood: 'madera',
  unpaved: 'sin pavimentar', gravel: 'ripio', fine_gravel: 'maicillo', compacted: 'tierra compactada', dirt: 'tierra', earth: 'tierra', ground: 'tierra',
  pebblestone: 'ripio', grass: 'pasto', grass_paver: 'pasto', rock: 'roca', woodchips: 'chips', clay: 'arcilla', sand: 'arena', mud: 'barro', soil: 'tierra suelta',
}

// Clasifica un camino de OSM. fuente: 'osm' si trae superficie, 'inferido' si se deduce del tipo de camino.
export function clasificar(tags = {}) {
  const s = (tags.surface || '').split(';')[0].trim()
  if (PAVIMENTO.has(s)) return { cond: 'seca', fuente: 'osm', detalle: NOMBRE_SUPERFICIE[s] }
  if (BLANDO.has(s)) return { cond: 'barro', fuente: 'osm', detalle: NOMBRE_SUPERFICIE[s] }
  if (TIERRA.has(s)) return { cond: 'gravel', fuente: 'osm', detalle: NOMBRE_SUPERFICIE[s] }
  const h = tags.highway
  if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'living_street', 'cycleway'].includes(h)) {
    return { cond: 'seca', fuente: 'inferido', detalle: h === 'cycleway' ? 'ciclovía' : 'camino principal' }
  }
  if (h === 'residential' || h === 'service') return { cond: 'seca', fuente: 'inferido', detalle: 'calle' }
  if (h === 'track') {
    if (tags.tracktype === 'grade1') return { cond: 'seca', fuente: 'inferido', detalle: 'huella pavimentada' }
    return { cond: 'gravel', fuente: 'inferido', detalle: 'huella' }
  }
  if (['path', 'bridleway', 'footway'].includes(h)) return { cond: 'gravel', fuente: 'inferido', detalle: 'sendero' }
  if (h === 'unclassified') return { cond: 'gravel', fuente: 'inferido', detalle: 'camino rural' }
  return null
}

// Distancia aproximada en metros de un punto a un segmento (proyección local equirectangular).
function distSegmento(p, a, b) {
  const kx = 111320 * Math.cos((p[0] * Math.PI) / 180)
  const ky = 110540
  const ax = (a[1] - p[1]) * kx; const ay = (a[0] - p[0]) * ky
  const bx = (b[1] - p[1]) * kx; const by = (b[0] - p[0]) * ky
  const dx = bx - ax; const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

// Reparte la ruta en puntos cada ~paso km. puntos: [lat, lon, ele, km].
export function muestrear(puntos, paso = 0.2) {
  const out = []
  let siguiente = 0
  for (const p of puntos) if (p[3] >= siguiente) { out.push(p); siguiente = p[3] + paso }
  if (out[out.length - 1] !== puntos[puntos.length - 1]) out.push(puntos[puntos.length - 1])
  return out
}

// Overpass responde 200 aunque la consulta se corte por tiempo o memoria: en ese caso trae un
// "remark" y la lista de caminos vacía. Eso se trata como error para reintentar con menos puntos.
async function consultar(pts, radio, intento = 0) {
  // Unión de búsquedas alrededor de cada punto: funciona en cualquier versión de Overpass y
  // trae justo los caminos que después se asignan a cada punto.
  const partes = pts.map((p) => `way[highway](around:${radio},${p[0].toFixed(5)},${p[1].toFixed(5)});`).join('')
  const q = `[out:json][timeout:60];(${partes});out tags geom;`
  try {
    const r = await fetch(SERVIDORES[intento % SERVIDORES.length], { method: 'POST', body: new URLSearchParams({ data: q }) })
    if (!r.ok) throw new Error(`OpenStreetMap respondió ${r.status}`)
    const j = await r.json()
    if (j.remark && /error|timed out|memory/i.test(j.remark)) {
      const e = new Error(`OpenStreetMap: ${j.remark.replace(/^runtime error:\s*/i, '').slice(0, 120)}`)
      e.pesada = true // no se reintenta igual: se parte el trozo
      throw e
    }
    return j.elements || []
  } catch (e) {
    if (!e.pesada && intento < 2) {
      await new Promise((res) => setTimeout(res, 2000 * (intento + 1)))
      return consultar(pts, radio, intento + 1)
    }
    throw e
  }
}

// Consulta un trozo de ruta; si falla, lo parte en dos hasta un mínimo de puntos.
async function procesar(trozo, radio, salida, errores) {
  try {
    const caminos = await consultar(trozo, radio)
    salida.push(...asignar(trozo.slice(0, -1), caminos, radio))
  } catch (e) {
    if (trozo.length > 16) {
      const m = Math.floor(trozo.length / 2)
      await procesar(trozo.slice(0, m + 1), radio, salida, errores)
      await procesar(trozo.slice(m), radio, salida, errores)
    } else {
      errores.push(e.message)
      salida.push(...trozo.slice(0, -1).map((p) => ({ km: p[3], cond: null, fuente: 'sin_respuesta', detalle: 'sin dato' })))
    }
  }
}

// Para cada punto, el camino más cercano dentro del radio.
export function asignar(pts, caminos, radio) {
  return pts.map((p) => {
    let mejor = null
    for (const w of caminos) {
      const g = w.geometry
      if (!g || g.length < 2) continue
      for (let i = 0; i < g.length - 1; i++) {
        const d = distSegmento(p, [g[i].lat, g[i].lon], [g[i + 1].lat, g[i + 1].lon])
        if (d <= radio && (!mejor || d < mejor.d)) mejor = { d, w }
      }
    }
    const c = mejor ? clasificar(mejor.w.tags) : null
    return { km: p[3], ...(c || { cond: null, fuente: 'sin_dato', detalle: 'sin dato' }) }
  })
}

// Un tramo se corta cuando cambia la condición o cuando empieza o termina un tramo sin dato,
// para que la persona vea qué partes revisar.
const clave = (x) => `${x.cond}|${x.sinDato ?? x.fuente === 'sin_dato'}`

// Junta puntos consecutivos en tramos y absorbe los muy cortos en el vecino más largo.
export function armarTramos(asignados, total, minimo = 1) {
  if (!asignados.length) return []
  // Los puntos sin dato quedan como gravel o tierra, la opción intermedia, y se marcan para revisar.
  const puntos = asignados.map((a) => ({ ...a, cond: a.cond || 'gravel' }))
  let tramos = []
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i]
    const desde = i === 0 ? 0 : (puntos[i - 1].km + a.km) / 2
    const hasta = i === puntos.length - 1 ? total : (a.km + puntos[i + 1].km) / 2
    const ult = tramos[tramos.length - 1]
    if (ult && clave(ult) === clave(a)) {
      ult.hasta = hasta
      ult.fuentes[a.fuente] = (ult.fuentes[a.fuente] || 0) + (hasta - desde)
      ult.detalles[a.detalle] = (ult.detalles[a.detalle] || 0) + (hasta - desde)
    } else {
      tramos.push({ desde, hasta, cond: a.cond, sinDato: a.fuente === 'sin_dato', fuentes: { [a.fuente]: hasta - desde }, detalles: { [a.detalle]: hasta - desde } })
    }
  }
  // Absorber tramos cortos, de menor a mayor, en el vecino más largo.
  let cambio = true
  while (cambio && tramos.length > 1) {
    cambio = false
    let iMin = -1
    tramos.forEach((t, i) => { if (t.hasta - t.desde < minimo && (iMin < 0 || t.hasta - t.desde < tramos[iMin].hasta - tramos[iMin].desde)) iMin = i })
    if (iMin >= 0) {
      const t = tramos[iMin]
      const izq = tramos[iMin - 1]
      const der = tramos[iMin + 1]
      const destino = !izq ? der : !der ? izq : (izq.hasta - izq.desde >= der.hasta - der.desde ? izq : der)
      destino.desde = Math.min(destino.desde, t.desde)
      destino.hasta = Math.max(destino.hasta, t.hasta)
      for (const [k, v] of Object.entries(t.fuentes)) destino.fuentes[k] = (destino.fuentes[k] || 0) + v
      tramos.splice(iMin, 1)
      // unir vecinos que quedaron con la misma condición
      tramos = tramos.reduce((acc, x) => {
        const u = acc[acc.length - 1]
        if (u && clave(u) === clave(x)) {
          u.hasta = x.hasta
          for (const [k, v] of Object.entries(x.fuentes)) u.fuentes[k] = (u.fuentes[k] || 0) + v
          for (const [k, v] of Object.entries(x.detalles)) u.detalles[k] = (u.detalles[k] || 0) + v
        } else acc.push(x)
        return acc
      }, [])
      cambio = true
    }
  }
  // El último tramo absorbe el redondeo para que la suma calce con el total.
  const salida = tramos.map((t) => {
    const largo = t.hasta - t.desde
    const fuente = Object.entries(t.fuentes).sort((a, b) => b[1] - a[1])[0][0]
    const detalle = Object.entries(t.detalles).filter(([k]) => k !== 'sin dato').sort((a, b) => b[1] - a[1])[0]?.[0] || 'sin dato'
    const sinDato = (t.fuentes.sin_dato || 0) / largo
    return { km: +largo.toFixed(1), cond: t.cond, fuente: sinDato > 0.5 ? 'sin_dato' : fuente, detalle }
  })
  const suma = salida.slice(0, -1).reduce((a, t) => a + t.km, 0)
  salida[salida.length - 1].km = +(total - suma).toFixed(2)
  return salida
}

export async function sugerirTerreno(puntos, total, { alProgresar = () => {}, paso = 0.25, radio = 40 } = {}) {
  const pts = muestrear(puntos, paso)
  const asignados = []
  const errores = []
  const lote = 30
  const n = Math.ceil((pts.length - 1) / lote)
  for (let i = 0; i < n; i++) {
    alProgresar(i / n)
    await procesar(pts.slice(i * lote, (i + 1) * lote + 1), radio, asignados, errores)
  }
  // el último punto de la ruta toma la clasificación del anterior
  if (asignados.length) asignados.push({ ...asignados[asignados.length - 1], km: pts[pts.length - 1][3] })
  alProgresar(1)
  for (const a of asignados) if (a.fuente === 'sin_respuesta') a.fuente = 'sin_dato'
  const tramos = armarTramos(asignados, total)
  const kmPor = (f) => (asignados.filter((a) => a.fuente === f).length / asignados.length) * total
  const sinRespuesta = errores.length ? (errores.length * 16 * paso) : 0
  return { tramos, resumen: { osm: kmPor('osm'), inferido: kmPor('inferido'), sinDato: kmPor('sin_dato'), errores: errores.length, primerError: errores[0] || '', sinRespuesta } }
}
