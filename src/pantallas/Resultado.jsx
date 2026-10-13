import { useState } from 'react'
import { NOMBRE_TIPO, NOMBRE_SEGMENTO, SEGMENTOS, etiquetaSolidez } from '../lib/motor.js'
import { km, clpR, n0, pct } from '../lib/formato.js'
import { Flecha } from '../ui/iconos.jsx'

const CRITERIOS = ['Proteger la cadena', 'Eficiencia (vatios)', 'Km entre aplicaciones', 'Costo', 'Poco trabajo']

export default function Resultado({ perfil, resultado, saca, setSaca, onImportancias, onEditar }) {
  const [verTodo, setVerTodo] = useState(false)
  const [ajustar, setAjustar] = useState(false)
  if (!resultado) return null
  const { ranking } = resultado
  const [g, s2, s3] = ranking
  const kmAnual = perfil.kmSemana * 52
  const semanas = g.auto / perfil.kmSemana
  const empate = s2 && g.puntaje - s2.puntaje < 3
  const estimado = g.wEstimado || g.costoEstimado
  const imp = perfil.importancias || SEGMENTOS[perfil.segmento].imp
  const masBarato = empate ? [g, s2].sort((a, b) => a.costo - b.costo)[0] : null
  const alternativa = estimado && g.producto.nombre.includes('Endurance Chip')
    ? ranking.find((r) => r.producto.nombre === 'Silca Hot Melt') : null
  const max = ranking[0].puntaje

  return (
    <main className="app">
      <section className="hero tx-naranja" style={{ minHeight: 300 }} aria-labelledby="ganador">
        <div className="hero-top">
          <span className="chip">{NOMBRE_SEGMENTO[perfil.segmento]} · {n0(perfil.kmSemana)} km/sem</span>
          <span className="solidez" title="Veces que gana al mover tus prioridades">Solidez {etiquetaSolidez(g.solidez).toLowerCase()} · {pct(g.solidez)}</span>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <span className="sub">{empate ? 'Empate técnico, tu mejor opción' : 'Tu lubricante'}</span>
          <h1 id="ganador">{g.producto.nombre}</h1>
          <p>{NOMBRE_TIPO[g.producto.tipo]}{g.producto.precio ? ` · $${n0(g.producto.precio)} (${g.producto.envase})` : ''}</p>
        </div>
        <div className="datos">
          <div><div className="n">{km(g.auto)}</div><div className="l">re-aplicar, unas {Math.max(1, Math.round(semanas))} sem.</div></div>
          <div><div className="n">{km(g.vida)}</div><div className="l">vida de la cadena</div></div>
          <div><div className="n">{clpR((g.costo * kmAnual) / 6000)}{g.costoEstimado ? '*' : ''}</div><div className="l">lubricante al año</div></div>
        </div>
      </section>

      {empate && (
        <div className="aviso">
          {s2.producto.nombre} queda a menos de 3 puntos: cualquiera de los dos te sirve.
          {' '}Por km sale más barato <strong>{masBarato.producto.nombre}</strong>.
        </div>
      )}
      {estimado && (
        <div className="aviso">
          * {g.wEstimado ? 'Su eficiencia no está medida' : 'Su costo no tiene precio verificado'}; usamos la mediana de su tipo.
          {alternativa && <> Si prefieres todo medido, <strong>{alternativa.producto.nombre}</strong> queda con {n0(alternativa.puntaje)} puntos.</>}
        </div>
      )}

      <div className="podio">
        {[s2, s3].filter(Boolean).map((r, i) => (
          <div className="mini" key={r.producto.id}>
            <span className="pos">{i + 2}.º</span>
            <span className="nom">{r.producto.nombre}</span>
            <span className="pts">{n0(r.puntaje)}<span className="peq muted" style={{ fontWeight: 500 }}> / 100</span></span>
            <span className="peq muted">{km(r.vida)} de cadena</span>
          </div>
        ))}
      </div>

      <a className="card entre" href="#/comparar" style={{ textDecoration: 'none' }}>
        <div className="col">
          <h2>{perfil.actual ? `${perfil.actual.nombre} contra ${g.producto.nombre}` : 'Compáralo con el tuyo'}</h2>
          <span className="peq muted">Cadenas, pesos y horas al año, con tus km</span>
        </div>
        <span className="circulo claro" style={{ background: 'var(--pill)' }}><Flecha /></span>
      </a>

      <div className="card">
        <div className="interruptor">
          <div className="col">
            <h3 id="lbl-saca">Sacando la cadena</h3>
            <span className="peq muted">{saca ? 'Incluye cera de inmersión y el híbrido' : 'Solo lubricantes que se aplican en la bici'}</span>
          </div>
          <button type="button" role="switch" aria-checked={saca} aria-labelledby="lbl-saca" onClick={() => setSaca(!saca)} />
        </div>
      </div>

      <div className="card">
        <div className="entre">
          <h2>Lo que te importa</h2>
          <button type="button" className="enlace" onClick={() => setAjustar(!ajustar)}>{ajustar ? 'Listo' : 'Ajustar'}</button>
        </div>
        {!ajustar && (
          <div className="col" style={{ gap: 8, marginTop: 8 }}>
            {CRITERIOS.map((c, i) => (
              <div key={c} className="fila" style={{ gap: 10 }}>
                <span className="peq" style={{ width: 150, flex: 'none' }}>{c}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line)' }}>
                  <div style={{ width: `${resultado.pesos[i] * 100 / Math.max(...resultado.pesos)}%`, height: '100%', borderRadius: 4, background: 'var(--accent)' }} />
                </div>
                <span className="peq muted" style={{ width: 36, textAlign: 'right' }}>{pct(resultado.pesos[i])}</span>
              </div>
            ))}
          </div>
        )}
        {ajustar && (<>
          {CRITERIOS.map((c, i) => (
            <div className="barra" key={c}>
              <div className="entre"><label htmlFor={`imp-${i}`}>{c}</label><span className="valor">{imp[i]}</span></div>
              <input id={`imp-${i}`} type="range" min="1" max="9" step="1" value={imp[i]}
                onChange={(e) => { const v = [...imp]; v[i] = Number(e.target.value); onImportancias(v) }} />
            </div>
          ))}
          <button type="button" className="enlace" style={{ marginTop: 8 }} onClick={() => onImportancias(undefined)}>Volver a lo típico de {NOMBRE_SEGMENTO[perfil.segmento].toLowerCase()}</button>
        </>)}
      </div>

      <div className="card">
        <div className="entre">
          <h2>Ranking completo</h2>
          <span className="peq muted">{ranking.length} opciones en Chile</span>
        </div>
        <ol className="resto">
          {(verTodo ? ranking : ranking.slice(0, 6)).map((r, i) => (
            <li key={r.producto.id}>
              <span className="num">{i + 1}</span>
              <span style={{ flex: 1 }}>
                {r.producto.nombre}{(r.wEstimado || r.costoEstimado) ? <span className="est"> *</span> : ''}
                <div className="barrita" style={{ width: `${(r.puntaje / max) * 100}%`, opacity: i === 0 ? 1 : 0.45 }} />
              </span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{n0(r.puntaje)}</strong>
            </li>
          ))}
        </ol>
        {ranking.length > 6 && (
          <button type="button" className="enlace" onClick={() => setVerTodo(!verTodo)}>{verTodo ? 'Ver menos' : `Ver las ${ranking.length}`}</button>
        )}
        <p className="peq muted" style={{ margin: '10px 0 0' }}>* Dato estimado con la mediana de su tipo. Datos de desgaste: Zero Friction Cycling. Precios de tiendas en Chile, octubre 2026.</p>
      </div>

      <button type="button" className="btn btn-secundario btn-bloque" onClick={onEditar}>Cambiar mis respuestas</button>
    </main>
  )
}
