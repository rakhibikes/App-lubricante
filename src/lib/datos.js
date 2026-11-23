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

// Catálogo publicado por el administrador (módulo 8). Si no hay, la app usa el que trae incorporado.
export async function catalogoPublicado() {
  if (!supabase || enDemo()) return null
  try {
    const { data } = await supabase.from('catalogo_versiones').select('nombre, datos, creado')
      .eq('publicado', true).order('creado', { ascending: false }).limit(1).maybeSingle()
    return data ? { ...data.datos, version: data.nombre } : null
  } catch { return null }
}

export async function registrarBusqueda(texto) {
  if (!supabase || enDemo() || !texto || texto.length < 3) return
  try { await supabase.from('busquedas').insert({ texto: texto.slice(0, 80) }) } catch { /* no importa */ }
}

export async function esAdmin(usuario) {
  if (!supabase || !usuario) return false
  try {
    const { data } = await supabase.rpc('es_admin')
    return data === true
  } catch { return false }
}

// Funciones del panel de catálogo (solo administrador; las reglas de Supabase lo exigen).
export const admin = {
  versiones: async () => {
    const { data, error } = await supabase.from('catalogo_versiones').select('id, nombre, publicado, creado, nota').order('creado', { ascending: false }).limit(30)
    if (error) throw new Error(error.message)
    return data
  },
  version: async (id) => {
    const { data, error } = await supabase.from('catalogo_versiones').select('*').eq('id', id).single()
    if (error) throw new Error(error.message)
    return data
  },
  publicar: async (nombre, datos, nota) => {
    const { data, error } = await supabase.from('catalogo_versiones').insert({ nombre, datos, publicado: true, nota }).select().single()
    if (error) throw new Error(error.message)
    return data
  },
  busquedas: async () => {
    const { data } = await supabase.from('busquedas').select('texto, creado').order('creado', { ascending: false }).limit(300)
    return data || []
  },
  mediciones: async () => {
    const { data: ev } = await supabase.from('eventos').select('*').eq('tipo', 'medicion')
    const { data: cad } = await supabase.from('cadenas').select('*')
    const { data: todos } = await supabase.from('eventos').select('*')
    return { mediciones: ev || [], cadenas: cad || [], eventos: todos || [] }
  },
}
