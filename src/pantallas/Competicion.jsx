import { useMemo, useState } from 'react'
import { analizarCompeticion } from '../lib/competicion.js'
import { km, clpR, n0, n1, pct } from '../lib/formato.js'
import { Atras } from '../ui/iconos.jsx'

const W = 340
const H = 210
const PAD = { l: 44, r: 12, t: 12, b: 30 }

function Grafico({ a }) {
  const ws = a.medidos.map((f) => f.w)
  const wmin = Math.floor(Math.min(...ws) * 2) / 2 - 0.25
  const wmax = Math.ceil(Math.max(...ws) * 2) / 2 + 0.25
  const lmin = Math.log(1500)
  const lmax = Math.log(50000)
  const x = (w) => PAD.l + ((w - wmin) / (wmax - wmin)) * (W - PAD.l - PAD.r)
  const y = (v) => H - PAD.b - ((Math.log(v) - lmin) / (lmax - lmin)) * (H - PAD.t - PAD.b)
  const ticksY = [2000, 5000, 10000, 20000, 40000]
  const ticksX = []
  for (let w = Math.ceil(wmin); w <= wmax; w += 1) ticksX.push(w)
  const frente = a.frente
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Vatios perdidos contra vida de cadena. El frente lo forman ${frente.map((f) => f.producto.nombre).join(' y ')}.`}>
      {ticksY.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={PAD.l - 6} y={y(t) + 3} fontSize="10" textAnchor="end" fill="var(--muted)">{n0(t / 1000)} mil</text>
        </g>
      ))}
      {ticksX.map((t) => <text key={t} x={x(t)} y={H - 10} fontSize="10" textAnchor="middle" fill="var(--muted)">{t} W</text>)}
      <polyline points={frente.map((f) => `${x(f.w)},${y(f.vida)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      {a.medidos.filter((f) => !f.frente).map((f) => <circle key={f.producto.id} cx={x(f.w)} cy={y(f.vida)} r="5" fill="var(--ring)" />)}
      {frente.map((f) => <circle key={f.producto.id} cx={x(f.w)} cy={y(f.vida)} r={f === a.ganador ? 8 : 6} fill={f === a.ganador ? 'var(--accent)' : 'var(--accent-deep)'} stroke="var(--card)" strokeWidth="2" />)}
      {a.actual && a.actual.w && <circle cx={x(a.actual.w)} cy={y(a.actual.vida)} r="9" fill="none" stroke="var(--text)" strokeWidth="1.5" strokeDasharray="3 2" />}
      {a.medidos.map((f) => {
        const enFrente = f.frente
        const derecha = x(f.w) < W - 110
        // Los del frente se rotulan arriba del punto y los demás abajo, para que no se monten.
        return (
          <text key={`t${f.producto.id}`} x={x(f.w) + (derecha ? 8 : -8)} y={y(f.vida) + (enFrente ? -9 : 15)} fontSize={enFrente ? 11 : 10} fontWeight={enFrente ? 700 : 400}
            textAnchor={derecha ? 'start' : 'end'} fill={enFrente ? 'var(--text)' : 'var(--muted)'}>{f.producto.nombre.replace('Ceramic Speed ', '').replace('Muc-Off ', '').replace('Silca Super Secret Drip', 'Super Secret')}</text>
        )
      })}
    </svg>
  )
}

function Campo({ id, label, valor, onChange, min, max, paso = 1, sufijo }) {
  return (
    <label htmlFor={id} className="col peq" style={{ gap: 6 }}>
      <span className="muted">{label}</span>
      <span className="fila" style={{ gap: 6 }}>
        <input id={id} className="buscador" style={{ height: 46 }} type="number" inputMode="numeric" min={min} max={max} step={paso} value={valor}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} />
        <span className="muted" style={{ width: 28 }}>{sufijo}</span>
      </span>
    </label>
  )
}

export default function Competicion({ perfil, onGuardar }) {
  const guardado = perfil?.competicion || {}
  const [potencia, setPotencia] = useState(guardado.potencia || 250)
  const [horas, setHoras] = useState(guardado.horas || 4)
  const [carreras, setCarreras] = useState(guardado.carreras || 10)
  const [kmCarrera, setKmCarrera] = useState(guardado.kmCarrera || 150)
  const [pref, setPref] = useState(guardado.preferencia ?? 0.6)

  const a = useMemo(() => analizarCompeticion(perfil, { potencia, horas, carreras, kmCarrera, preferencia: pref }), [perfil, potencia, horas, carreras, kmCarrera, pref])
  const guardar = (cambios) => onGuardar?.({ competicion: { potencia, horas, carreras, kmCarrera, preferencia: pref, ...cambios } })
  const otro = a.ganador === a.masDurable ? a.masEficiente : a.masDurable
  const ventaja = a.segundos(a.ganador, otro)

  return (
    <main className="app">
      <section className="hero tx-naranja" style={{ minHeight: 210 }}>
        <div className="hero-top">
          <a className="circulo" href="#/resultado" aria-label="Volver al resultado"><Atras /></a>
          <span className="chip">{n0(potencia)} W · {n1(horas)} h · {n0(carreras)} carreras</span>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <span className="sub">Con tu preferencia gana</span>
          <h1 style={{ fontSize: 34 }}>{a.ganador.producto.nombre}</h1>
          <p>
            {ventaja > 0
              ? `+${n0(ventaja)} s por carrera frente a ${otro.producto.nombre}`
              : `Su cadena dura ${n1(a.ganador.vida / otro.vida)} veces más que con ${otro.producto.nombre}`}
          </p>
        </div>
      </section>

      <div className="card col" style={{ gap: 8, padding: '14px 14px 10px' }}>
        <div className="entre peq muted" style={{ padding: '0 4px' }}><span>Que dure</span><span>Que sea eficiente</span></div>
        <label htmlFor="pref" className="oculto">Preferencia entre duración y eficiencia</label>
        <input id="pref" type="range" min="0" max="100" value={Math.round(pref * 100)}
          onChange={(e) => setPref(Number(e.target.value) / 100)} onPointerUp={() => guardar({})} onKeyUp={() => guardar({})} />
        <Grafico a={a} />
        <p className="peq muted" style={{ margin: '0 4px' }}>
          Vida de cadena (km, escala logarítmica) contra vatios perdidos a {n0(potencia)} W. La línea es el frente de Pareto: ningún producto es a la vez más eficiente y más durable que los que están en ella.
          {a.actual?.w ? ' El círculo punteado es tu lubricante.' : ''}
        </p>
      </div>

      <div className="card">
        <h2>Lo que significa en carrera</h2>
        <ul className="resto">
          <li><span>Equilibrio entre ambos</span><strong>{a.rodilla.producto.nombre}</strong></li>
          <li><span>La barra cambia de ganador en</span><strong>{pct(a.umbral)} hacia eficiencia</strong></li>
          {a.frente.length > 1 && <li><span>{a.masEficiente.producto.nombre} gana frente a {a.masDurable.producto.nombre}</span><strong>{n0(a.segundos(a.masEficiente, a.masDurable))} s por carrera</strong></li>}
          {a.costoPorVatio !== null && <li><span>Cada vatio ganado cuesta</span><strong>{clpR(a.costoPorVatio)} cada 6.000 km</strong></li>}
          {a.actual && a.actual !== a.ganador && a.actual.w && <li><span>Frente a tu {a.actual.producto.nombre}</span><strong>{a.segundos(a.ganador, a.actual) >= 0 ? '+' : ''}{n0(a.segundos(a.ganador, a.actual))} s por carrera</strong></li>}
        </ul>
      </div>

      {a.dosCadenas && (
        <div className="card fila" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flex: 'none', paddingTop: 2 }}>
            <div className="tx-naranja" style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--card)' }} />
            <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--card)', background: 'var(--accent-deep)', marginLeft: -10 }} />
          </div>
          <div className="col">
            <h3>Usa dos cadenas</h3>
            <span className="peq muted">
              Carrera con {a.dosCadenas.carrera.producto.nombre}, entrenamiento con {a.dosCadenas.entrenamiento.producto.nombre}.
              Con {n0(carreras)} carreras de {n0(kmCarrera)} km al año, la cadena de carrera dura unos {n0(Math.max(1, a.dosCadenas.anos))} años.
              El costo extra es una cadena y un eslabón rápido.
            </span>
          </div>
        </div>
      )}

      <div className="card col" style={{ gap: 12 }}>
        <h2>Tus carreras</h2>
        <div className="podio" onBlur={() => guardar({})}>
          <Campo id="c-pot" label="Potencia media" valor={potencia} onChange={setPotencia} min={80} max={500} sufijo="W" />
          <Campo id="c-h" label="Duración típica" valor={horas} onChange={setHoras} min={0.5} max={48} paso={0.5} sufijo="h" />
          <Campo id="c-n" label="Carreras al año" valor={carreras} onChange={setCarreras} min={1} max={100} sufijo="" />
          <Campo id="c-km" label="Km por carrera" valor={kmCarrera} onChange={setKmCarrera} min={10} max={2000} sufijo="km" />
        </div>
      </div>

      <div className="card">
        <h2>Productos con eficiencia medida</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="tabla">
            <thead><tr><th scope="col">Producto</th><th scope="col">Pérdida</th><th scope="col">Vida</th><th scope="col">Lubricante cada 6.000 km</th></tr></thead>
            <tbody>
              {[...a.medidos].sort((x, y) => x.w - y.w).map((f) => (
                <tr key={f.producto.id}>
                  <th scope="row" style={{ color: 'var(--text)', fontWeight: f.frente ? 700 : 500 }}>{f.producto.nombre}{f.frente ? <span className="dif">en el frente</span> : null}</th>
                  <td>{n1(f.w)} W<span className="dif">{n0(f.segHora)} s/h</span></td>
                  <td>{km(f.vida)}</td>
                  <td>{clpR(f.lubricante6000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="peq muted" style={{ margin: '10px 0 0' }}>
          Sin eficiencia medida, no entran al frente: {a.grises.map((f) => f.producto.nombre).join(', ')}.
        </p>
        <p className="peq muted" style={{ margin: '8px 0 0' }}>
          Segundos con Δt ≈ t · ΔW / (3 · P). El ensayo de eficiencia es con la cadena limpia y recién lubricada; en barro o polvo la diferencia cambia.
        </p>
      </div>
    </main>
  )
}
