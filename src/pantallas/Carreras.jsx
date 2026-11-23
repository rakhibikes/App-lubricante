import { n0 } from '../lib/formato.js'
import { Flecha } from '../ui/iconos.jsx'

const fecha = (f) => {
  try { return new Date(`${f}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return f }
}

export default function Carreras({ carreras, cargando }) {
  const proximas = [...carreras].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
  return (
    <main className="app">
      <section className="hero tx-naranja" style={{ minHeight: 230 }}>
        <span className="chip" style={{ alignSelf: 'flex-start' }}>Planificador de carrera</span>
        <div className="col" style={{ gap: 8 }}>
          <h1>Llega a la meta con la cadena lubricada</h1>
          <p>Con qué partir, dónde re-aplicar y cuánto lubricante llevar.</p>
        </div>
      </section>
      <a className="btn btn-primario btn-bloque" href="#/carrera/nueva">Planificar una carrera</a>
      {cargando && <p className="muted peq">Cargando…</p>}
      {proximas.map((c) => (
        <a key={c.id} className="card entre" href={`#/carrera/${c.id}`} style={{ textDecoration: 'none' }}>
          <div className="col">
            <h2>{c.nombre}</h2>
            <span className="peq muted">
              {c.fecha ? fecha(c.fecha) : 'Sin fecha'} · {n0(c.distancia || 0)} km
              {c.plan?.Rfinal ? ` · ${n0(c.plan.Rfinal * 100)} % de llegar lubricado` : ''}
            </span>
          </div>
          <span className="circulo claro" style={{ background: 'var(--pill)' }}><Flecha /></span>
        </a>
      ))}
    </main>
  )
}
