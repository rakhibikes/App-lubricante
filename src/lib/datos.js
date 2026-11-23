// Datos de los módulos con cuenta (bicicletas, cadenas, bitácora y carreras).
// Dos fuentes con la misma interfaz: Supabase cuando hay sesión, o el navegador en modo demo
// (?demo en la dirección), que sirve para probar y presentar sin cuenta.
import { supabase } from './supabase.js'

const CLAVE = 'lub.demo.v1'
export const enDemo = () => {
  try { return new URLSearchParams(window.location.search).has('demo') } catch { return false }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))

function leerDemo() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || {} } catch { return {} }
}
function guardarDemo(d) {
  try { localStorage.setItem(CLAVE, JSON.stringify(d)) } catch { /* sin almacenamiento */ }
}
const tablaDemo = (t) => leerDemo()[t] || []
function escribirDemo(t, filas) { const d = leerDemo(); d[t] = filas; guardarDemo(d) }

function local() {
  const listar = async (t, filtro = () => true) => tablaDemo(t).filter(filtro)
  const guardar = async (t, fila) => {
    const filas = tablaDemo(t)
    const f = { ...fila, id: fila.id || uid(), creado: fila.creado || new Date().toISOString() }
    const i = filas.findIndex((x) => x.id === f.id)
    if (i >= 0) filas[i] = f; else filas.push(f)
    escribirDemo(t, filas)
    return f
  }
  const borrar = async (t, id) => escribirDemo(t, tablaDemo(t).filter((x) => x.id !== id))
  return {
    tipo: 'demo',
    bicis: () => listar('bicicletas'),
    guardarBici: (b) => guardar('bicicletas', b),
    borrarBici: async (id) => {
      const cad = tablaDemo('cadenas').filter((c) => c.bici_id === id).map((c) => c.id)
      escribirDemo('eventos', tablaDemo('eventos').filter((e) => !cad.includes(e.cadena_id)))
      escribirDemo('cadenas', tablaDemo('cadenas').filter((c) => c.bici_id !== id))
      await borrar('bicicletas', id)
    },
    cadenas: (biciId) => listar('cadenas', (c) => !biciId || c.bici_id === biciId),
    guardarCadena: (c) => guardar('cadenas', c),
    eventos: (cadenaIds) => listar('eventos', (e) => !cadenaIds || cadenaIds.includes(e.cadena_id)),
    guardarEvento: (e) => guardar('eventos', e),
    borrarEvento: (id) => borrar('eventos', id),
    carreras: () => listar('carreras'),
    guardarCarrera: (c) => guardar('carreras', c),
    borrarCarrera: (id) => borrar('carreras', id),
    subirGpx: async () => null,
  }
}

function remoto(usuario) {
  const sb = supabase
  const uidU = usuario.id
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data }
  const guardar = async (t, fila) => {
    const f = { ...fila, user_id: uidU }
    if (!f.id) delete f.id
    delete f.creado
    return ok(await sb.from(t).upsert(f).select().single())
  }
  return {
    tipo: 'cuenta',
    bicis: async () => ok(await sb.from('bicicletas').select('*').order('creado')),
    guardarBici: (b) => guardar('bicicletas', b),
    borrarBici: async (id) => ok(await sb.from('bicicletas').delete().eq('id', id)),
    cadenas: async (biciId) => {
      let q = sb.from('cadenas').select('*').order('creado')
      if (biciId) q = q.eq('bici_id', biciId)
      return ok(await q)
    },
    guardarCadena: (c) => guardar('cadenas', c),
    eventos: async (cadenaIds) => {
      let q = sb.from('eventos').select('*').order('fecha').order('creado')
      if (cadenaIds) q = q.in('cadena_id', cadenaIds.length ? cadenaIds : ['00000000-0000-0000-0000-000000000000'])
      return ok(await q)
    },
    guardarEvento: (e) => guardar('eventos', e),
    borrarEvento: async (id) => ok(await sb.from('eventos').delete().eq('id', id)),
    carreras: async () => ok(await sb.from('carreras').select('*').order('fecha')),
    guardarCarrera: (c) => guardar('carreras', c),
    borrarCarrera: async (id) => ok(await sb.from('carreras').delete().eq('id', id)),
    subirGpx: async (archivo) => {
      const ruta = `${uidU}/${uid()}.gpx`
      const { error } = await sb.storage.from('gpx').upload(ruta, archivo, { contentType: 'application/gpx+xml' })
      if (error) throw new Error(error.message)
      return ruta
    },
  }
}

// Devuelve la fuente de datos, o null si hace falta iniciar sesión.
export function fuente(usuario) {
  if (enDemo()) return local()
  if (usuario && supabase) return remoto(usuario)
  return null
}
