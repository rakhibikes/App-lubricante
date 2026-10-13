const nf0 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export const n0 = (x) => nf0.format(x)
export const n1 = (x) => nf1.format(x)
export const clp = (x) => '$' + nf0.format(Math.round(x))
// Redondeo amable para montos grandes: $602.431 → $602.000
export const clpR = (x) => {
  const paso = Math.abs(x) >= 100000 ? 1000 : Math.abs(x) >= 10000 ? 100 : 10
  return '$' + nf0.format(Math.round(x / paso) * paso)
}
export const km = (x) => {
  const paso = x >= 10000 ? 1000 : x >= 500 ? 100 : 10
  return nf0.format(Math.round(x / paso) * paso) + ' km'
}
export const pct = (x) => nf0.format(Math.round(x * 100)) + ' %'
const nf2 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
export const n2 = (x) => nf2.format(x)
