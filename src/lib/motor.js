// Motor de cálculo: recomendador AHP con precios en CLP, solidez y comparación anual.
// Port directo de los análisis en Python (a6_ahp_chile.py y a7_clp_comparar.py).
import catalogoBase from '../data/catalogo.json'

const P = catalogoBase.params
export const CATALOGO = catalogoBase
export const PRODUCTOS = catalogoBase.productos
export const TIPICOS = catalogoBase.tipicos
export const SIN_ENSAYO = catalogoBase.sin_ensayo
export const SEGMENTOS = P.SEG
export const PARAMS = P
export const GRUPOS = catalogoBase.grupos

const BLOQUE = { limpio: 'b1', polvo: 'b2', humedo: 'b4', extremo: 'b6' }
const SALCOL = { ruta: 'sal_ruta', gravel: 'sal_gravel', extremo: 'sal_extremo' }
const SACA = new Set(['inmersion', 'hibrido'])
const S9 = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export const NOMBRE_TIPO = {
  inmersion: 'Cera de inmersión',
  hibrido: 'Inmersión más goteo',
  goteo_cera: 'Goteo de cera',
  emulsion: 'Emulsión de cera',
  humedo_top: 'Húmedo de alto desempeño',
  humedo: 'Húmedo o seco convencional',
}

const nz = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? d : v)
const cercano = (r) => S9.reduce((b, s) => (Math.abs(s - r) < Math.abs(b - r) ? s : b), 1)

function matrizPares(imp) {
  return imp.map((a) => imp.map((b) => {
    const r = a / b
    return r >= 1 ? cercano(r) : 1 / cercano(1 / r)
  }))
}

export function pesosAHP(imp) {
  const A = matrizPares(imp)
  const n = A.length
  const g = A.map((fila) => Math.pow(fila.reduce((x, y) => x * y, 1), 1 / n))
  const s = g.reduce((x, y) => x + y, 0)
  return g.map((x) => x / s)
}

const precioMl = (nombre) => PRODUCTOS.find((p) => p.nombre === nombre)?.precio_ml || 0

// Intervalos de re-aplicación (km) con que ZFC midió el desgaste en cada condición.
// Normal: 3 aplicaciones por bloque limpio de 1.000 km y 6 por bloque contaminado.
// Extendido (*E.A): 1 y 2 (3 en el bloque extremo). Doble (*D.A): 6 y 12.
export const PROTOCOLO = {
  normal: { limpio: 1000 / 3, polvo: 1000 / 6, humedo: 1000 / 6, extremo: 1000 / 6 },
  extendido: { limpio: 1000, polvo: 500, humedo: 500, extremo: 1000 / 3 },
  doble: { limpio: 1000 / 6, polvo: 1000 / 12, humedo: 1000 / 12, extremo: 1000 / 12 },
}

// Mezcla Hot Melt + Super Secret: 1 encerado cada 5 aplicaciones, las otras 4 con goteo.
function costoAplicacion(p) {
  if (p.precio_ml === 'hib' || p.precio_ml === 'hib2') {
    const goteo = p.precio_ml === 'hib2' ? precioMl('Silca Super Secret 2.0') || precioMl('Silca Super Secret 1.0') : precioMl('Silca Super Secret 1.0')
    return (P.CONS.inmersion * precioMl('Silca Hot Melt') + 4 * P.CONS.goteo_cera * goteo) / 5
  }
  return P.CONS[p.tipo === 'hibrido' ? 'inmersion' : p.tipo] * p.precio_ml
}

// Criterios de un producto (o perfil típico) para una mezcla de condiciones.
export function criterios(p, mix, ebike = false) {
  const t = p.tipo
  const tipico = String(p.id).startsWith('tip-')
  let rate = 0
  for (const c of Object.keys(mix)) {
    const v = tipico ? P.RATE[t][c] : nz(p[BLOQUE[c]], P.RATE[t][c])
    rate += mix[c] * Math.max(P.FLOOR, v)
  }
  const sal = {}
  for (const k of Object.keys(SALCOL)) sal[k] = tipico ? P.SAL[t][k] : nz(p[SALCOL[k]], P.SAL[t][k])
  // El desgaste medido vale si se re-aplica al menos tan seguido como en el ensayo: el intervalo
  // recomendado es el menor entre la autonomía y el intervalo del protocolo con que se midió.
  const proto = PROTOCOLO[p.protocolo] || PROTOCOLO.normal
  let inv = 0
  let invSal = 0
  for (const c of Object.keys(mix)) {
    const s = sal[P.MAPSAL[c]]
    inv += mix[c] / (P.TOPE_PROTOCOLO === false ? s : Math.min(s, proto[c]))
    invSal += mix[c] / s
  }
  let auto = 1 / inv
  let autoSal = 1 / invSal
  if (ebike) { auto /= 2; autoSal /= 2 }
  // Combinación Hot Melt + Super Secret (esquema de Silca): re-encerar cada REENCERAR_KM y
  // re-aplicar Super Secret entre encerados.
  const combo = !tipico && (p.precio_ml === 'hib' || p.precio_ml === 'hib2')
  const cadaEncerado = P.REENCERAR_KM || 1200
  const encPorMil = combo ? Math.min(1000 / auto, 1000 / cadaEncerado) : 0
  const gotPorMil = combo ? Math.max(0, 1000 / auto - encPorMil) : 0
  let esfuerzo = combo ? encPorMil * P.MIN_APP.inmersion + gotPorMil * P.MIN_APP.goteo_cera : (1000 / auto) * P.MIN_APP[t]
  for (const c of Object.keys(mix)) esfuerzo += mix[c] * (1000 / P.INT_LIMP[c]) * P.MIN_LIMP[t]
  const wMedido = !tipico && p.w !== null && p.w !== undefined
  const w = wMedido ? p.w : P.W[t]
  let costo
  let costoEstimado = false
  if (combo) {
    const goteo = p.precio_ml === 'hib2' ? precioMl('Silca Super Secret 2.0') || precioMl('Silca Super Secret 1.0') : precioMl('Silca Super Secret 1.0')
    costo = 6 * (encPorMil * P.CONS.inmersion * precioMl('Silca Hot Melt') + gotPorMil * P.CONS.goteo_cera * goteo)
  } else if (!tipico && p.precio_ml !== null && p.precio_ml !== undefined) {
    costo = (6000 / auto) * costoAplicacion(p)
  } else {
    costo = nz(tipico ? null : p.costo_aud, P.COSTO[t]) * P.AUD_CLP
    costoEstimado = true
  }
  const estimado = !tipico && Array.isArray(p.estimado) ? p.estimado : []
  return { vida: 1000 / (P.K * rate), w, wEstimado: !wMedido || estimado.includes('w'), auto, autoSal, costo, costoEstimado: costoEstimado || estimado.includes('precio'), esfuerzo, estimado, b4: tipico ? P.RATE[t].humedo : nz(p.b4, P.RATE[t].humedo) }
}

function puntajes(lista, mix, ebike, imp) {
  const cr = lista.map((p) => criterios(p, mix, ebike))
  const filas = [
    cr.map((c) => c.vida), cr.map((c) => 1 / c.w), cr.map((c) => c.auto),
    cr.map((c) => 1 / c.costo), cr.map((c) => 1 / c.esfuerzo),
  ]
  const norm = filas.map((f) => { const s = f.reduce((a, b) => a + b, 0); return f.map((x) => x / s) })
  const w = pesosAHP(imp)
  const s = lista.map((_, j) => norm.reduce((acc, f, i) => acc + w[i] * f[j], 0))
  return { s, cr, w }
}

// Generador pseudoaleatorio con semilla, para que la solidez no cambie entre recargas.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function normal(r) {
  const u = Math.max(r(), 1e-12); const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function asignarSegmento(perfil) {
  const { disciplina, electrica, compite, ultra } = perfil
  if (electrica && (disciplina === 'mtb' || disciplina === 'gravel')) return 'e-MTB'
  if (ultra) return 'Ultra distancia'
  if (disciplina === 'ruta') return compite ? 'Ruta competitivo' : 'Ruta recreativo/fondo'
  if (disciplina === 'gravel') return 'Gravel/aventura'
  if (disciplina === 'mtb') return 'MTB/enduro'
  return 'Urbano/commuter'
}

export const NOMBRE_SEGMENTO = {
  'Ruta competitivo': 'Ruta competitivo',
  'Ruta recreativo/fondo': 'Ruta recreativo',
  'Gravel/aventura': 'Gravel',
  'MTB/enduro': 'MTB',
  'e-MTB': 'e-MTB',
  'Urbano/commuter': 'Urbano',
  'Ultra distancia': 'Ultra distancia',
}

export function recomendar(perfil, { sacaCadena, imp, iteraciones = P.ITER || 1500 } = {}) {
  const seg = SEGMENTOS[perfil.segmento]
  const mix = perfil.mezcla || seg.mix
  const ebike = perfil.electrica || seg.ebike
  const pesosImp = imp || perfil.importancias || seg.imp
  const saca = sacaCadena ?? perfil.sacaCadena === 'si'
  const lista = PRODUCTOS.filter((p) => p.chile && (saca || !SACA.has(p.tipo)))
  const { s, cr, w } = puntajes(lista, mix, ebike, pesosImp)
  const r = rng(7)
  const gana = new Array(lista.length).fill(0)
  for (let k = 0; k < iteraciones; k++) {
    const imp2 = pesosImp.map((x) => x * Math.exp((P.SIGMA ?? 0.35) * normal(r)))
    const { s: s2 } = puntajes(lista, mix, ebike, imp2)
    let best = 0
    for (let j = 1; j < s2.length; j++) if (s2[j] > s2[best]) best = j
    gana[best]++
  }
  const max = Math.max(...s)
  const ranking = lista.map((p, j) => ({
    producto: p, puntaje: (s[j] / max) * 100, solidez: gana[j] / iteraciones, ...cr[j],
  })).sort((a, b) => b.puntaje - a.puntaje)
  return { ranking, pesos: w, mezcla: mix, ebike }
}

export function etiquetaSolidez(x) {
  if (x > 0.8) return 'Alta'
  if (x >= 0.5) return 'Media'
  return 'Baja'
}

// Comparación anual entre dos lubricantes con los km de la persona.
export function comparar(actual, recomendado, perfil, precios = {}) {
  const seg = SEGMENTOS[perfil.segmento]
  const mix = perfil.mezcla || seg.mix
  const ebike = perfil.electrica || seg.ebike
  const km = (perfil.kmSemana || 100) * 52
  const cadena = precios.cadena || P.cadena_def
  const cassette = precios.cassette || P.cassette_def
  const fila = (p) => {
    const c = criterios(p, mix, ebike)
    const cadenas = km / c.vida
    return {
      ...c,
      cadenas,
      transmision: cadenas * (cadena + cassette / P.cad_por_cas),
      aplicaciones: km / c.auto,
      lubricante: (c.costo * km) / 6000,
      horas: (c.esfuerzo * km) / 1000 / 60,
      segPorHora: (3600 * c.w) / (3 * P.P_ref),
    }
  }
  const a = fila(actual)
  const b = fila(recomendado)
  return { a, b, ahorro: a.transmision + a.lubricante - (b.transmision + b.lubricante), km }
}

export function buscarProducto(id) {
  return PRODUCTOS.find((p) => String(p.id) === String(id)) || TIPICOS.find((p) => p.id === id)
}

// Puntaje (0 a 100) de un producto cualquiera frente al ranking de la persona,
// aunque no esté en Chile o sea un perfil típico.
export function puntajeDe(producto, perfil, { sacaCadena, imp } = {}) {
  const seg = SEGMENTOS[perfil.segmento]
  const mix = perfil.mezcla || seg.mix
  const ebike = perfil.electrica || seg.ebike
  const pesosImp = imp || perfil.importancias || seg.imp
  const saca = sacaCadena ?? perfil.sacaCadena === 'si'
  const lista = PRODUCTOS.filter((p) => p.chile && (saca || !SACA.has(p.tipo)))
  const esta = lista.some((p) => p.id === producto.id)
  const conjunto = esta ? lista : [...lista, producto]
  const { s } = puntajes(conjunto, mix, ebike, pesosImp)
  const max = Math.max(...s.slice(0, lista.length))
  const j = conjunto.findIndex((p) => p.id === producto.id)
  return Math.min(100, (s[j] / max) * 100)
}

export const FORMA_LUBRICANTE = [
  { id: 'tip-inmersion', texto: 'Cera que se derrite en una olla' },
  { id: 'tip-goteo_cera', texto: 'Cera líquida que se seca en la cadena' },
  { id: 'tip-emulsion', texto: 'Líquido blanco o lechoso, de base agua' },
  { id: 'tip-humedo', texto: 'Aceite o lubricante seco en gotas o spray' },
]

// Lista para el buscador de "¿Qué lubricante usas hoy?": Chile primero, luego el resto
// de productos ensayados y al final los populares sin ensayo, asociados a su tipo.
export function opcionesLubricante() {
  const chile = PRODUCTOS.filter((p) => p.chile && p.tipo !== 'hibrido')
    .map((p) => ({ id: p.id, nombre: p.nombre, detalle: NOMBRE_TIPO[p.tipo] }))
  const resto = PRODUCTOS.filter((p) => !p.chile)
    .map((p) => ({ id: p.id, nombre: p.nombre, detalle: NOMBRE_TIPO[p.tipo] }))
  const sin = SIN_ENSAYO.map((p) => ({ id: `tip-${p.tipo}`, nombre: p.nombre, detalle: `Sin ensayo, se compara como ${NOMBRE_TIPO[p.tipo].toLowerCase()} típico` }))
  return [...chile, ...resto, ...sin]
}

// Tasa de desgaste ponderada (sin el factor K): vida hasta 0,5 % = 1000 / (K · tasa).
export function tasa(p, mix) {
  const tipico = String(p.id).startsWith('tip-')
  let r = 0
  for (const c of Object.keys(mix)) {
    const v = tipico ? P.RATE[p.tipo][c] : nz(p[BLOQUE[c]], P.RATE[p.tipo][c])
    r += mix[c] * Math.max(P.FLOOR, v)
  }
  return r
}

// Autonomía (km por aplicación) en una condición de carrera: 'ruta' | 'gravel' | 'extremo'.
export function autonomiaCondicion(p, cond) {
  const tipico = String(p.id).startsWith('tip-')
  return tipico ? P.SAL[p.tipo][cond] : nz(p[SALCOL[cond]], P.SAL[p.tipo][cond])
}

export const segmentoPorTipoBici = (tipo) => ({
  ruta: 'Ruta recreativo/fondo', gravel: 'Gravel/aventura', mtb: 'MTB/enduro', urbana: 'Urbano/commuter', electrica: 'e-MTB',
}[tipo] || 'Gravel/aventura')

// Ceras Silca y su complemento: entre encerados se re-aplica Super Secret. La combinación
// Hot Melt + Super Secret fue ensayada por ZFC (con la 1.0); con la 2.0 se estima.
export const CERAS_SILCA = new Set(['0', '4', '15', '61'])
export const SUPER_SECRET = { 17: 15, 60: 61 } // goteo → combinación
export const esCeraSilca = (p) => !!p && CERAS_SILCA.has(String(p.id))
export const esSuperSecret = (p) => !!p && String(p.id) in SUPER_SECRET
export const superSecretRecomendado = () => PRODUCTOS.find((p) => p.id === 60) || PRODUCTOS.find((p) => p.id === 17)
// Producto que describe el desgaste cuando sobre una cadena con cera Silca se re-aplica Super Secret.
export function combinacion(base, relleno) {
  if (esCeraSilca(base) && esSuperSecret(relleno)) return PRODUCTOS.find((p) => p.id === SUPER_SECRET[relleno.id]) || relleno
  return relleno
}
