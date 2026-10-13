import { NOMBRE_TIPO, NOMBRE_SEGMENTO } from '../lib/motor.js'
import { hayCuentas, entrarConGoogle } from '../lib/supabase.js'
import { km, n0 } from '../lib/formato.js'
import { Google, Flecha, Cadena, Bandera } from '../ui/iconos.jsx'

export function Bienvenida({ onEmpezar, usuario }) {
  return (
    <main className="app sin-nav" style={{ minHeight: '100dvh' }}>
      <section className="hero tx-naranja" style={{ flex: 1, minHeight: 420, padding: '22px 22px 26px' }}>
        <span className="chip" style={{ alignSelf: 'flex-start' }}>Datos de 54 lubricantes · precios en Chile</span>
        <div className="col" style={{ gap: 12 }}>
          <h1 className="grande">Encuentra tu lubricante en un minuto</h1>
          <p style={{ fontSize: 17, maxWidth: 340 }}>Ocho preguntas sobre cómo andas y te decimos cuál protege mejor tu cadena, cada cuánto aplicarlo y cuánto ahorras.</p>
        </div>
      </section>
      <div className="col" style={{ gap: 8, paddingTop: 4 }}>
        <button type="button" className="btn btn-primario btn-bloque" onClick={onEmpezar}>Empezar</button>
        {hayCuentas && !usuario && (
          <button type="button" className="btn btn-secundario btn-bloque" onClick={entrarConGoogle}><Google /> Continuar con Google</button>
        )}
        <p className="peq muted" style={{ textAlign: 'center', margin: '4px 12px 0' }}>
          {hayCuentas ? 'No necesitas cuenta. Con Google guardas tu perfil en todos tus equipos.' : 'No necesitas cuenta: tus respuestas quedan guardadas en este teléfono.'}
        </p>
      </div>
    </main>
  )
}

export default function Inicio({ perfil, resultado, usuario }) {
  const g = resultado.ranking[0]
  const semanas = Math.max(1, Math.round(g.auto / perfil.kmSemana))
  const nombre = usuario?.user_metadata?.full_name?.split(' ')[0]
  return (
    <main className="app">
      <section className="hero tx-naranja" style={{ minHeight: 260 }}>
        <div className="hero-top">
          <span className="chip">{nombre ? `Hola, ${nombre}` : 'Hola'}</span>
          <span className="chip">{NOMBRE_SEGMENTO[perfil.segmento]}</span>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <span className="sub">Tu lubricante</span>
          <h1>{g.producto.nombre}</h1>
          <p>{NOMBRE_TIPO[g.producto.tipo]} · re-aplicar cada {km(g.auto)}, unas {semanas} semana{semanas === 1 ? '' : 's'}</p>
        </div>
      </section>

      <a className="card entre" href="#/resultado" style={{ textDecoration: 'none' }}>
        <div className="col">
          <h2>Ver el ranking</h2>
          <span className="peq muted">Por qué gana, el 2.º y 3.º y lo que te importa</span>
        </div>
        <span className="circulo claro" style={{ background: 'var(--pill)' }}><Flecha /></span>
      </a>

      <a className="card entre" href="#/comparar" style={{ textDecoration: 'none' }}>
        <div className="col">
          <h2>{perfil.actual ? `Contra tu ${perfil.actual.nombre}` : 'Compáralo con el tuyo'}</h2>
          <span className="peq muted">Lo que ahorras al año con {n0(perfil.kmSemana)} km por semana</span>
        </div>
        <span className="circulo claro" style={{ background: 'var(--pill)' }}><Flecha /></span>
      </a>

      <div className="podio">
        <a className="mini" href="#/cadena" style={{ textDecoration: 'none' }}>
          <span className="circulo claro" style={{ background: 'var(--tint)', color: 'var(--tint-text)' }}><Cadena /></span>
          <span className="nom">Salud de la cadena</span>
          <span className="peq muted">Próximamente</span>
        </a>
        <a className="mini" href="#/carreras" style={{ textDecoration: 'none' }}>
          <span className="circulo claro" style={{ background: 'var(--tint)', color: 'var(--tint-text)' }}><Bandera /></span>
          <span className="nom">Planificador de carreras</span>
          <span className="peq muted">Próximamente</span>
        </a>
      </div>
    </main>
  )
}

export function Pronto({ titulo, texto }) {
  return (
    <main className="app">
      <section className="hero tx-naranja" style={{ minHeight: 220 }}>
        <span className="chip" style={{ alignSelf: 'flex-start' }}>Próximamente</span>
        <div className="col" style={{ gap: 8 }}><h1>{titulo}</h1><p>{texto}</p></div>
      </section>
      <div className="card"><p className="muted" style={{ margin: 0 }}>Esta sección llega en la siguiente fase. Mientras, tu recomendación y la comparación ya funcionan.</p></div>
    </main>
  )
}
