// Guardado local para quien usa la app sin cuenta.
const CLAVE = 'lub.perfil.v1'

export function leerLocal() {
  try {
    const t = localStorage.getItem(CLAVE)
    return t ? JSON.parse(t) : null
  } catch {
    return null
  }
}

export function guardarLocal(perfil) {
  try {
    if (perfil) localStorage.setItem(CLAVE, JSON.stringify(perfil))
    else localStorage.removeItem(CLAVE)
  } catch {
    /* sin almacenamiento: la app sigue en memoria */
  }
}
