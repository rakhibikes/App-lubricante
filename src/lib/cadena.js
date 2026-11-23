// Módulo 6: salud de la cadena.
// La exposición E se mide en vidas medianas hasta 0,5 % de elongación (E = 1 → vida mediana).
// Dispersión entre cadenas: Weibull de forma β (3). Llegar a 0,75 % ocurre a 1,5 veces la
// exposición de 0,5 %, porque la elongación crece con el desgaste acumulado.
import { PARAMS, PRODUCTOS, TIPICOS, buscarProducto, criterios, tasa, SEGMENTOS, segmentoPorTipoBici, GRUPOS } from './motor.js'

const LN2 = Math.log(2)
const beta = () => PARAMS.BETA_CADENA || 3
const rFalla = () => PARAMS.R_FALLA || 1.5

// Probabilidad de que la cadena siga bajo 0,5 % con exposición E.
export const R = (E) => Math.exp(-LN2 * Math.pow(Math.max(0, E), beta()))

// Cambio óptimo por edad: minimiza el costo por unidad de uso entre cambiar a tiempo (Cp, solo la
// cadena) y llegar tarde a 0,75 % (Cc, cadena y cassette). r = Cc / Cp. Devuelve T* en unidades de E.
const cacheT = new Map()
export function cambioOptimo(r) {
  const clave = `${r.toFixed(3)}-${beta()}-${rFalla()}`
  if (cacheT.has(clave)) return cacheT.get(clave)
  const Rf = (t) => R(t / rFalla()) // supervivencia hasta 0,75 %
  let mejor = { T: 1, costo: Infinity }
  const n = 400
  for (let T = 0.2; T <= 3.5; T += 0.005) {
    let integral = 0
    for (let i = 0; i < n; i++) integral += Rf(((i + 0.5) * T) / n) * (T / n)
    const costo = (Rf(T) + r * (1 - Rf(T))) / integral
    if (costo < mejor.costo) mejor = { T, costo }
  }
  // Costo de esperar a que falle: r / vida media hasta 0,75 %.
  let media = 0
  const m = 4000
  for (let i = 0; i < m; i++) media += Rf(((i + 0.5) * 6) / m) * (6 / m)
  const res = { T: mejor.T, ahorro: 1 - mejor.costo / (r / media) }
  cacheT.set(clave, res)
  return res
}

// Mezcla del período según cómo estuvo el clima.
export function mezclaClima(base, clima) {
  const m = { limpio: 0, polvo: 0, humedo: 0, extremo: 0, ...base }
  if (clima === 'seco') {
    const resto = m.limpio + m.polvo + m.extremo
    return resto > 0 ? { limpio: m.limpio / resto, polvo: m.polvo / resto, humedo: 0, extremo: m.extremo / resto } : { limpio: 1, polvo: 0, humedo: 0, extremo: 0 }
  }
  if (clima === 'lluvia') {
    const seco = m.limpio + m.polvo
    const f = seco > 0 ? 0.35 / seco : 0
    return { limpio: seco > 0 ? m.limpio * f : 0.175, polvo: seco > 0 ? m.polvo * f : 0.175, humedo: 0.5, extremo: 0.15 }
  }
  return m
}

export function mezclaBase(perfil, bici) {
  if (perfil?.mezcla) return perfil.mezcla
  return SEGMENTOS[segmentoPorTipoBici(bici?.tipo)].mix
}

export function grupoDe(bici) { return GRUPOS.find((g) => g.id === bici?.grupo) || null }

export function preciosBici(bici) {
  const g = grupoDe(bici)
  const cadena = Number(bici?.precio_cadena) || g?.cadena || PARAMS.cadena_def
  const cassette = Number(bici?.precio_cassette) || g?.cassette || PARAMS.cassette_def
  return { cadena, cassette, r: (cadena + cassette) / cadena }
}

const GAMA_ALTA = new Set(['dura-ace', 'red', 'xtr', 'xx', 'x0', 'xo1'])
export const esGamaAlta = (bici) => GAMA_ALTA.has(bici?.grupo)

function producto(id, perfil) {
  return buscarProducto(id) || buscarProducto(perfil?.actual?.id) || TIPICOS.find((t) => t.id === 'tip-humedo')
}

// Recorre la bitácora de una cadena y arma los períodos entre lecturas del odómetro.
export function periodos(cadena, eventos, perfil, bici) {
  const base = mezclaBase(perfil, bici)
  const ev = [...eventos].filter((e) => e.cadena_id === cadena.id)
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (Number(a.odo) || 0) - (Number(b.odo) || 0))
  let odo = Number.isFinite(Number(cadena.instalada_odo)) && cadena.instalada_odo !== null && cadena.instalada_odo !== '' ? Number(cadena.instalada_odo) : null
  let prod = producto(cadena.lubricante_id, perfil)
  const salida = []
  for (const e of ev) {
    const o = Number(e.odo)
    if (Number.isFinite(o) && e.odo !== null && e.odo !== '') {
      if (odo === null) odo = o
      if (o > odo) {
        const clima = e.tipo === 'km' ? e.clima || 'normal' : 'normal'
        salida.push({ desde: odo, hasta: o, km: o - odo, clima, mezcla: mezclaClima(base, clima), producto: prod, fecha: e.fecha })
        odo = o
      }
    }
    if (e.tipo === 'lub' && e.producto_id) prod = producto(e.producto_id, perfil)
    salida.push({ evento: e, odo: odo ?? 0, producto: prod })
  }
  return { pasos: salida, odo: odo ?? 0, producto: prod, base }
}

// Exposición acumulada (sin K) en cada punto: u = Σ km · tasa / 1000. E = K · u.
function recorrer(cadena, eventos, perfil, bici) {
  const { pasos, odo, producto: prodActual, base } = periodos(cadena, eventos, perfil, bici)
  let u = 0
  let kmLub = 0 // fracción de autonomía gastada desde la última lubricación
  let ultimaLubOdo = Number(cadena.instalada_odo) || 0
  const curva = [{ km: 0, u: 0 }]
  const mediciones = []
  const inicio = Number(cadena.instalada_odo) || (pasos.find((p) => p.km)?.desde ?? odo)
  for (const p of pasos) {
    if (p.km) {
      u += (p.km * tasa(p.producto, p.mezcla)) / 1000
      const auto = criterios(p.producto, p.mezcla, bici?.tipo === 'electrica').auto
      kmLub += p.km / auto
      curva.push({ km: p.hasta - inicio, u })
    } else if (p.evento) {
      const e = p.evento
      if (e.tipo === 'lub') { kmLub = 0; ultimaLubOdo = p.odo }
      if (e.tipo === 'medicion') mediciones.push({ km: p.odo - inicio, u, resultado: e.resultado, fecha: e.fecha })
    }
  }
  return { u, kmLub, ultimaLubOdo, curva, mediciones, odo, inicio, producto: prodActual, base }
}

// Factor propio K: máximo a posteriori con todas las mediciones de la persona.
// Previa log-normal centrada en el K del modelo; cada medición aporta la probabilidad de su resultado.
export function factorPropio(medicionesU) {
  const K0 = PARAMS.K || 2
  const sigma = 0.3
  const kmin = PARAMS.K_MIN || 1
  const kmax = PARAMS.K_MAX || 3
  if (!medicionesU.length) return { K: K0, n: 0 }
  let mejor = { K: K0, lp: -Infinity }
  for (let K = Math.max(0.5, kmin * 0.6); K <= kmax * 1.4; K += 0.01) {
    let lp = -Math.pow(Math.log(K / K0), 2) / (2 * sigma * sigma)
    for (const m of medicionesU) {
      const E = K * m.u
      let p
      if (m.resultado === 'bajo') p = R(E)
      else if (m.resultado === 'medio') p = R(E / rFalla()) - R(E)
      else p = 1 - R(E / rFalla())
      lp += Math.log(Math.max(p, 1e-9))
    }
    if (lp > mejor.lp) mejor = { K, lp }
  }
  return { K: Math.min(kmax, Math.max(kmin, mejor.K)), n: medicionesU.length }
}

// Estado completo de una cadena para la pantalla de salud.
export function estadoCadena({ cadena, eventos, perfil, bici, K, kmSemana }) {
  const rec = recorrer(cadena, eventos, perfil, bici)
  const Kp = K || PARAMS.K || 2
  const E = Kp * rec.u
  const { r, cadena: precioCadena, cassette } = preciosBici(bici)
  const opt = cambioOptimo(r)
  const tStar = opt.T // en unidades de E (vida mediana a 0,5 %)
  // km por unidad de E con la mezcla normal y el producto actual
  const tasaNormal = tasa(rec.producto, rec.base)
  const kmPorE = 1000 / (Kp * tasaNormal)
  const vidaMediana = kmPorE

  const ultima = rec.mediciones[rec.mediciones.length - 1]
  const Eult = ultima ? Kp * ultima.u : null
  let Emed // próxima medición sugerida
  let probMed
  if (!ultima || ultima.resultado !== 'bajo') {
    Emed = 0.5
    probMed = R(Emed)
  } else {
    Emed = Math.pow(Math.pow(Eult, beta()) + -Math.log(0.9) / LN2, 1 / beta())
    probMed = R(Emed) / R(Eult)
  }
  const avisos = []
  const kmAlCambio = Math.max(0, (tStar - E) * kmPorE)
  const kmAMedir = Math.max(0, (Emed - E) * kmPorE)
  if (ultima?.resultado === 'alto') avisos.push({ nivel: 'alto', tipo: 'cassette', texto: 'La medición dio sobre 0,75 %: cambia la cadena y prueba si salta; probablemente toque cassette.' })
  else if (ultima?.resultado === 'medio') avisos.push({ nivel: 'alto', tipo: 'cambiar', texto: 'La medición dio entre 0,5 y 0,75 %: cambia la cadena ahora.' })
  else if (E >= tStar) avisos.push({ nivel: 'alto', tipo: 'cambiar', texto: 'Llegaste al cambio óptimo: cambia la cadena.' })
  if (rec.kmLub >= 1) avisos.push({ nivel: 'alto', tipo: 'lubricar', texto: `Toca lubricar con ${rec.producto.nombre}.` })
  else if (rec.kmLub >= 0.8) avisos.push({ nivel: 'medio', tipo: 'lubricar', texto: `Pronto toca lubricar con ${rec.producto.nombre}.` })
  if (E >= Emed && !(ultima && ultima.resultado !== 'bajo')) avisos.push({ nivel: 'medio', tipo: 'medir', texto: 'Toca medir la cadena.' })

  const autoActual = criterios(rec.producto, rec.base, bici?.tipo === 'electrica').auto
  return {
    E, K: Kp, tStar, ahorro: opt.ahorro, r, precioCadena, cassette,
    vida: E / tStar, // fracción del camino al cambio óptimo
    kmRecorridos: rec.odo - rec.inicio,
    kmAlCambio, semanasAlCambio: kmSemana ? kmAlCambio / kmSemana : null,
    kmAMedir, semanasAMedir: kmSemana ? kmAMedir / kmSemana : null, probMed,
    kmCambioTotal: tStar * kmPorE, vidaMediana,
    lubFraccion: rec.kmLub, autonomia: autoActual, kmDesdeLub: rec.kmLub * autoActual,
    producto: rec.producto, curva: rec.curva.map((c) => ({ km: c.km, E: Kp * c.u })),
    mediciones: rec.mediciones.map((m) => ({ ...m, E: Kp * m.u })),
    medicionesU: rec.mediciones.map((m) => ({ u: m.u, resultado: m.resultado })),
    avisos, odo: rec.odo, ultima,
  }
}

// Mediciones (en u) de varias cadenas, para ajustar el factor propio.
export function medicionesDe(cadenas, eventos, perfil, bicis) {
  const out = []
  for (const c of cadenas) {
    const b = bicis.find((x) => x.id === c.bici_id)
    out.push(...recorrer(c, eventos, perfil, b).mediciones.map((m) => ({ u: m.u, resultado: m.resultado })))
  }
  return out
}

export const productosChile = () => PRODUCTOS.filter((p) => p.chile)
