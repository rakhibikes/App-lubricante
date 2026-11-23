import { hayCuentas, entrarConGoogle } from '../lib/supabase.js'
import { Google } from '../ui/iconos.jsx'

// Pantalla para las secciones que guardan datos durante meses y necesitan cuenta.
export default function CuentaRequerida({ titulo, texto }) {
  const demo = `${window.location.pathname}?demo${window.location.hash}`
  return (
    <main className="app">
      <section className="hero tx-naranja" style={{ minHeight: 240 }}>
        <span className="chip" style={{ alignSelf: 'flex-start' }}>Con cuenta</span>
        <div className="col" style={{ gap: 8 }}><h1>{titulo}</h1><p>{texto}</p></div>
      </section>
      <div className="card col" style={{ gap: 12 }}>
        <p className="muted" style={{ margin: 0 }}>Esta sección guarda tus datos durante meses, así que necesita una cuenta. Es gratis y solo pide tu nombre y correo.</p>
        {hayCuentas && <button type="button" className="btn btn-primario btn-bloque" onClick={entrarConGoogle}><Google /> Continuar con Google</button>}
        <a className="enlace" href={demo} style={{ alignSelf: 'center' }}>Probar sin cuenta en modo demo</a>
      </div>
    </main>
  )
}

export function BandaDemo() {
  const salir = `${window.location.pathname}${window.location.hash}`
  return (
    <div className="aviso entre" role="status" style={{ marginBottom: 2 }}>
      <span>Modo demo: lo que anotes queda solo en este navegador.</span>
      <a className="enlace" href={salir}>Salir</a>
    </div>
  )
}
