// Cliente de Supabase. Si faltan las variables de entorno, la app funciona solo como invitado.
import { createClient } from '@supabase/supabase-js'

// La clave publishable está hecha para ir en el navegador; la seguridad la dan las reglas RLS.
// Las variables de entorno, si existen, tienen prioridad (útil para un proyecto de pruebas).
const url = import.meta.env.VITE_SUPABASE_URL || 'https://muujzcczvaldqyqcphbp.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_OhS4FrhUR7QmV0NuazIFTg_ypqSczuk'

export const supabase = url && key ? createClient(url, key) : null
export const hayCuentas = Boolean(supabase)

export async function entrarConGoogle() {
  if (!supabase) return
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  })
}

export async function salir() {
  if (supabase) await supabase.auth.signOut()
}

// Guarda el perfil (una fila por persona) y agrega la recomendación al historial.
export async function sincronizar(usuario, perfil, resultado) {
  if (!supabase || !usuario) return
  await supabase.from('perfiles').upsert({
    user_id: usuario.id,
    email: usuario.email,
    nombre: usuario.user_metadata?.full_name || null,
    datos: perfil,
    actualizado: new Date().toISOString(),
  })
  if (resultado) {
    const top = resultado.ranking.slice(0, 5).map((r) => ({ id: r.producto.id, nombre: r.producto.nombre, puntaje: Math.round(r.puntaje * 10) / 10 }))
    await supabase.from('recomendaciones').insert({
      user_id: usuario.id,
      segmento: perfil.segmento,
      ganador: top[0]?.nombre,
      solidez: resultado.ranking[0]?.solidez,
      top,
      perfil,
    })
  }
}

export async function leerPerfil(usuario) {
  if (!supabase || !usuario) return null
  const { data } = await supabase.from('perfiles').select('datos').eq('user_id', usuario.id).maybeSingle()
  return data?.datos || null
}

export async function borrarCuenta(usuario) {
  if (!supabase || !usuario) return
  await supabase.from('recomendaciones').delete().eq('user_id', usuario.id)
  await supabase.from('perfiles').delete().eq('user_id', usuario.id)
}
