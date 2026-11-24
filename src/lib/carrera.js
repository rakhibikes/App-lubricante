// Módulo 7: planificador de carrera.
// Exposición de la lubricación: cada km suma 1 / autonomía del producto en esa condición.
// Confiabilidad de la lubricación: R = exp(−ln 2 · D^β), β = 4. Se re-aplica antes de bajar del umbral.
import { PARAMS, autonomiaCondicion, buscarProducto, tasa, combinacion } from './motor.js'

const LN2 = Math.log(2)
export const CONDICIONES = {
  seca: { nombre: 'Ruta seca', sal: 'ruta', bloque: { limpio: 1, polvo: 0, humedo: 0, extremo: 0 } },
  gravel: { nombre: 'Gravel o tierra', sal: 'gravel', bloque: { limpio: 0, polvo: 1, humedo: 0, extremo: 0 } },
  barro: { nombre: 'Barro, lluvia o arena', sal: 'extremo', bloque: { limpio: 0, polvo: 0, humedo: 0, extremo: 1 } },
}

const betaL = () => PARAMS.BETA_LUB || 4
export const Rlub = (D) => Math.exp(-LN2 * Math.pow(Math.max(0, D), betaL()))
// Fracción de la autonomía a la que se re-aplica para no bajar del umbral (0,41 con 98 %).
export const fraccionUmbral = (u = PARAMS.UMBRAL || 0.98) => Math.pow(-Math.log(u) / LN2, 1 / betaL())

export const reglaDeBolsillo = (p) => Object.fromEntries(
  Object.entries(CONDICIONES).map(([k, c]) => [k, fraccionUmbral() * autonomiaCondicion(p, c.sal)]),
)

export const NO_RECARGABLE = new Set(['inmersion', 'hibrido'])

function condicionEn(tramos, km) {
  let acc = 0
  for (const t of tramos) { acc += Number(t.km) || 0; if (km < acc) return t.cond }
  return tramos[tramos.length - 1]?.cond || 'gravel'
}

// Simula una estrategia: { inicio, respaldo } (ids de producto).
export function simular({ tramos, modo = 'libre', controles = [], estrategia, potencia = 200, velocidad = 22, K }) {
  const total = tramos.reduce((a, t) => a + (Number(t.km) || 0), 0)
  const inicio = buscarProducto(estrategia.inicio)
  if (!inicio || total <= 0) return null
  const respaldo = estrategia.respaldo ? buscarProducto(estrategia.respaldo) : null
  // Partir con la combinación Hot Melt + Super Secret implica re-aplicar ese Super Secret.
  const ssDeCombo = { 15: 17, 61: 60 }[inicio.id]
  const recarga = respaldo || (ssDeCombo !== undefined ? buscarProducto(ssDeCombo) : NO_RECARGABLE.has(inicio.tipo) ? null : inicio)
  // Super Secret sobre cera Silca: dura como el goteo y desgasta como la combinación ensayada.
  const recargaDesgaste = recarga ? combinacion(inicio, recarga) : null
  // La combinación parte con un encerado de Hot Melt: el primer tramo dura como la cera.
  const inicioReal = ssDeCombo !== undefined ? buscarProducto(0) || inicio : inicio
  const umbral = PARAMS.UMBRAL || 0.98
  const dx = Math.max(0.25, total / 2400)
  const Kp = K || PARAMS.K || 2
  const ctrl = [...controles].map(Number).filter((x) => x > 0 && x < total).sort((a, b) => a - b)

  // D al recorrer [a, b) con un producto
  const exposicion = (p, a, b) => {
    let D = 0
    for (let x = a; x < b; x += dx) D += Math.min(dx, b - x) / autonomiaCondicion(p, CONDICIONES[condicionEn(tramos, x)].sal)
    return D
  }

  let prod = inicioReal
  let prodDesgaste = inicioReal
  let D = 0
  let Racum = 1
  let desgaste = 0
  let kmSeco = 0
  const paradas = []
  const curva = []
  let sinParar = 0
  for (let x = 0; x < total; x += dx) {
    const paso = Math.min(dx, total - x)
    const cond = condicionEn(tramos, x)
    // ¿re-aplicar aquí?
    if (recarga && x > 0) {
      let parar = false
      if (modo === 'libre') {
        const Dsig = D + paso / autonomiaCondicion(prod, CONDICIONES[cond].sal)
        parar = Rlub(Dsig) < umbral
      } else {
        const c = ctrl.find((k) => k >= x && k < x + paso)
        if (c !== undefined) {
          const siguiente = ctrl.find((k) => k > c) ?? total
          parar = Rlub(D + exposicion(prod, x, siguiente)) < umbral
        }
      }
      if (parar) {
        Racum *= Rlub(D)
        paradas.push({ km: x, producto: recarga, cond, R: Rlub(D) })
        prod = recarga
        prodDesgaste = recargaDesgaste
        D = 0
      }
    }
    D += paso / autonomiaCondicion(prod, CONDICIONES[cond].sal)
    sinParar += paso / autonomiaCondicion(inicioReal, CONDICIONES[cond].sal)
    desgaste += (paso * Kp * tasa(prodDesgaste, CONDICIONES[cond].bloque)) / 1000
    kmSeco += paso * (1 - Rlub(D))
    curva.push({ km: x + paso, R: Racum * Rlub(D), cond })
  }
  const Rfinal = Racum * Rlub(D)
  const horasSeco = kmSeco / velocidad
  const minPerdidos = (horasSeco * 60 * (PARAMS.W_SECA || 10)) / (3 * potencia)
  return {
    total, inicio, respaldo, recarga, paradas, curva, Rfinal,
    Rsin: Rlub(sinParar), desgaste, ml: paradas.length * (PARAMS.ML_PARADA || 1.5),
    kmSeco, minPerdidos,
  }
}
