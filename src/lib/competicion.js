// Módulo 5: modo competición. Frente de Pareto entre eficiencia (vatios perdidos) y duración
// (vida de cadena), con los productos de Chile que tienen eficiencia medida por Ceramic Speed.
import { PRODUCTOS, PARAMS, criterios, SEGMENTOS } from './motor.js'

export function analizarCompeticion(perfil, { potencia = 250, horas = 4, carreras = 10, kmCarrera = 150, preferencia = 0.5 } = {}, precios = {}) {
  const segm = SEGMENTOS[perfil?.segmento] || SEGMENTOS['Ruta competitivo']
  const mix = perfil?.mezcla || segm.mix
  const cadena = precios.cadena || PARAMS.cadena_def
  const cassette = precios.cassette || PARAMS.cassette_def
  const filas = PRODUCTOS.filter((p) => p.chile).map((p) => {
    const c = criterios(p, mix, perfil?.electrica)
    const escala = potencia / PARAMS.P_ref // la pérdida medida a 250 W escala con la potencia
    const w = c.wEstimado ? null : c.w * escala
    const transmision = (6000 / c.vida) * (cadena + cassette / PARAMS.cad_por_cas)
    return { producto: p, w, vida: c.vida, costo6000: c.costo + transmision, lubricante6000: c.costo, segHora: w ? (3600 * w) / (3 * potencia) : null }
  })
  const medidos = filas.filter((f) => f.w !== null)
  const grises = filas.filter((f) => f.w === null)
  // Frente: nadie es a la vez más eficiente y más durable.
  for (const f of medidos) f.frente = !medidos.some((o) => o !== f && o.w <= f.w && o.vida >= f.vida && (o.w < f.w || o.vida > f.vida))
  const wmin = Math.min(...medidos.map((f) => f.w))
  const wmax = Math.max(...medidos.map((f) => f.w))
  const lmin = Math.log(Math.min(...medidos.map((f) => f.vida)))
  const lmax = Math.log(Math.max(...medidos.map((f) => f.vida)))
  for (const f of medidos) {
    f.eff = (wmax - f.w) / (wmax - wmin || 1)
    f.dur = (Math.log(f.vida) - lmin) / (lmax - lmin || 1)
  }
  const frente = medidos.filter((f) => f.frente).sort((a, b) => a.w - b.w)
  const rodilla = frente.reduce((m, f) => (Math.hypot(1 - f.eff, 1 - f.dur) < Math.hypot(1 - m.eff, 1 - m.dur) ? f : m), frente[0])
  const ganadorCon = (p) => frente.reduce((m, f) => (p * f.eff + (1 - p) * f.dur > p * m.eff + (1 - p) * m.dur ? f : m), frente[0])
  const ganador = ganadorCon(preferencia)
  const masDurable = frente.reduce((m, f) => (f.vida > m.vida ? f : m), frente[0])
  const masEficiente = frente[0]
  // Punto de la barra donde deja de ganar el más durable.
  let umbral = 1
  for (let p = 0; p <= 1.0001; p += 0.005) if (ganadorCon(p) !== masDurable) { umbral = p; break }
  const t = horas * 3600
  const segundos = (a, b) => (t * (b.w - a.w)) / (3 * potencia) // segundos que gana a frente a b
  const costoPorVatio = ganador !== masDurable && masDurable.w > ganador.w
    ? (ganador.costo6000 - masDurable.costo6000) / (masDurable.w - ganador.w) : null
  const kmCarrerasAno = carreras * kmCarrera
  const dosCadenas = preferencia > umbral && ganador !== masDurable
    ? { carrera: ganador, entrenamiento: masDurable, anos: ganador.vida / Math.max(1, kmCarrerasAno) }
    : null
  const actual = perfil?.actual ? filas.find((f) => String(f.producto.id) === String(perfil.actual.id)) : null
  return { filas, medidos, grises, frente, rodilla, ganador, masDurable, masEficiente, umbral, costoPorVatio, dosCadenas, actual, segundos, potencia, horas }
}
