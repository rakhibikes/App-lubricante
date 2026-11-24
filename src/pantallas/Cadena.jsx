import { useMemo, useState } from 'react'
import { estadoCadena, factorPropio, medicionesDe, esGamaAlta, grupoDe, productosChile, mezclaBase } from '../lib/cadena.js'
import { km, n0, n1, pct } from '../lib/formato.js'
import { Check } from '../ui/iconos.jsx'

const hoy = () => new Date().toISOString().slice(0, 10)
const CLIMAS = [['seco', 'Seco'], ['normal', 'Normal'], ['lluvia', 'Mucha lluvia o barro']]
// Qué significa cada opción de "¿Cómo estuvo?" y cómo cambia la mezcla con que se calcula el desgaste.
function definicionesClima(base) {
  const p = (x) => `${Math.round(x * 100)} %`
  return {
    seco: 'Sin lluvia ni charcos. Asfalto o tierra seca, aunque haya polvo. Se quita de tu mezcla la parte con lluvia.',
    normal: `Como andas siempre, según tu perfil: ${p(base.limpio)} limpio y seco, ${p(base.polvo)} con polvo o tierra, ${p(base.humedo)} con lluvia o barro y ${p(base.extremo)} extremo.`,
    lluvia: 'Varios días con lluvia, charcos o barro, o salidas que terminaron con la cadena sucia de agua y tierra. Se cuenta la mitad de los km con lluvia o barro y 15 % en condición extrema.',
  }
}
const MEDIDAS = [['bajo', 'Bajo 0,5 %'], ['medio', 'Entre 0,5 y 0,75 %'], ['alto', 'Sobre 0,75 %']]
const NOMBRE_EVENTO = { km: 'Anduve', lub: 'Lubriqué', limpie: 'Limpié', medicion: 'Medí', cambio: 'Cambié la cadena' }
const fechaCorta = (f) => {
  try { return new Date(`${f}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) } catch { return f }
}
const fechaEn = (semanas) => {
  if (semanas === null || !Number.isFinite(semanas)) return ''
  const d = new Date(Date.now() + semanas * 7 * 864e5)
  return d.toLocaleDateString('es-CL', { month: 'long', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

function Historial({ s }) {
  const W = 340
  const H = 170
  const pad = { l: 36, r: 10, t: 10, b: 26 }
  const xmax = Math.max(s.kmCambioTotal * 1.08, s.kmRecorridos * 1.05, 10)
  const ymax = Math.max(s.tStar * 1.15, s.E * 1.1, 1.1)
  const x = (k) => pad.l + (k / xmax) * (W - pad.l - pad.r)
  const y = (e) => H - pad.b - (e / ymax) * (H - pad.t - pad.b)
  const pts = s.curva.map((c) => `${x(c.km)},${y(c.E)}`).join(' ')
  // proyección con la mezcla normal hasta el cambio
  const proy = `${x(s.kmRecorridos)},${y(s.E)} ${x(s.kmCambioTotal)},${y(s.tStar)}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Desgaste estimado: ${pct(s.vida)} del camino al cambio óptimo, con ${s.mediciones.length} mediciones.`}>
      <line x1={pad.l} x2={W - pad.r} y1={y(1)} y2={y(1)} stroke="var(--line)" strokeDasharray="4 3" />
      <text x={pad.l - 4} y={y(1) + 3} fontSize="10" textAnchor="end" fill="var(--muted)">0,5 %</text>
      <line x1={x(s.kmCambioTotal)} x2={x(s.kmCambioTotal)} y1={pad.t} y2={H - pad.b} stroke="var(--accent)" strokeDasharray="3 3" />
      <text x={x(s.kmCambioTotal) - 4} y={pad.t + 10} fontSize="10" textAnchor="end" fill="var(--accent-deep)">cambio</text>
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" />
      <polyline points={proy} fill="none" stroke="var(--ring)" strokeWidth="2" strokeDasharray="4 4" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      {s.mediciones.map((m, i) => (
        <circle key={i} cx={x(m.km)} cy={y(m.E)} r="5" fill={m.resultado === 'bajo' ? 'var(--card)' : 'var(--accent-deep)'} stroke="var(--accent-deep)" strokeWidth="2" />
      ))}
      <text x={pad.l} y={H - 8} fontSize="10" fill="var(--muted)">0 km</text>
      <text x={W - pad.r} y={H - 8} fontSize="10" textAnchor="end" fill="var(--muted)">{n0(xmax)} km</text>
    </svg>
  )
}

function Tarea({ hecho, nivel, titulo, detalle }) {
  const color = nivel === 'alto' ? 'var(--accent)' : 'var(--ring)'
  return (
    <div className="tarea">
      <div className="anillo" style={{ borderColor: color, borderWidth: nivel === 'alto' ? 2 : 1.5 }}>{hecho && <Check />}</div>
      <div className="col" style={{ gap: 2, flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{titulo}</div>
        <div className="peq" style={{ color: nivel === 'alto' ? 'var(--tint-text)' : 'var(--muted)' }}>{detalle}</div>
      </div>
    </div>
  )
}

export default function Cadena({ datos, bicis, cadenas, eventos, perfil, biciId, onRecargar, cargando }) {
  const [panel, setPanel] = useState(null) // 'menu' | 'km' | 'lub' | 'medicion' | 'cambio'
  const [odo, setOdo] = useState('')
  const [clima, setClima] = useState('normal')
  const [prodLub, setProdLub] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const bici = bicis.find((b) => b.id === biciId) || bicis[0]
  const cadena = bici && cadenas.filter((c) => c.bici_id === bici.id && !c.retirada_odo && c.retirada_odo !== 0).slice(-1)[0]
  const kmSemanaEst = useMemo(() => {
    if (perfil?.kmSemana) return perfil.kmSemana
    const kmEv = eventos.filter((e) => e.tipo === 'km' && e.odo !== null).sort((a, b) => a.fecha.localeCompare(b.fecha))
    if (kmEv.length >= 2) {
      const a = kmEv[0]; const b = kmEv[kmEv.length - 1]
      const dias = (new Date(b.fecha) - new Date(a.fecha)) / 864e5
      if (dias >= 7) return ((b.odo - a.odo) / dias) * 7
    }
    return 100
  }, [perfil, eventos])
  const meds = useMemo(() => medicionesDe(cadenas, eventos, perfil, bicis), [cadenas, eventos, perfil, bicis])
  const factor = useMemo(() => factorPropio(meds), [meds])
  const s = useMemo(() => (cadena ? estadoCadena({ cadena, eventos, perfil, bici, K: factor.K, kmSemana: kmSemanaEst }) : null), [cadena, eventos, perfil, bici, factor.K, kmSemanaEst])

  if (!bici) {
    return (
      <main className="app">
        <section className="hero tx-naranja" style={{ minHeight: 240 }}>
          <span className="chip" style={{ alignSelf: 'flex-start' }}>Salud de la cadena</span>
          <div className="col" style={{ gap: 8 }}><h1>Registra tu bici</h1><p>Toma un minuto. Con tus km te avisamos cuándo lubricar, medir y cambiar la cadena.</p></div>
        </section>
        <a className="btn btn-primario btn-bloque" href="#/bici/nueva">{cargando ? 'Cargando…' : 'Agregar bicicleta'}</a>
      </main>
    )
  }
  if (!cadena || !s) return <main className="app"><p className="muted">Cargando…</p></main>

  // Km sumados por cada registro (diferencia con el registro anterior).
  const sumados = {}
  {
    let previo = Number(cadena.instalada_odo) || 0
    for (const e of eventos.filter((x) => x.cadena_id === cadena.id && x.tipo === 'km').sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.odo - b.odo)) {
      sumados[e.id] = e.odo - previo
      previo = e.odo
    }
  }
  const evCadena = eventos.filter((e) => e.cadena_id === cadena.id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.odo || 0) - (a.odo || 0))
  const ultimoOdo = s.odo
  const abrir = (p) => {
    setError('')
    setOdo('')
    setProdLub(String(s.combinado ? (s.reencerar ? 0 : s.relleno.id) : s.producto.id))
    setPanel(p)
  }
  const lubAviso = s.avisos.find((a) => a.tipo === 'lubricar')
  const cambiarAviso = s.avisos.find((a) => a.tipo === 'cambiar' || a.tipo === 'cassette')
  const medirAviso = s.avisos.find((a) => a.tipo === 'medir')
  const g = grupoDe(bici)
  const restante = Math.max(0, 1 - s.vida)

  async function registrar(evento, extra) {
    setOcupado(true)
    setError('')
    try {
      const o = evento.odo === undefined ? ultimoOdo : evento.odo
      if (Number.isFinite(o) && o < ultimoOdo) throw new Error(`El odómetro no puede ser menor que el último registro (${n0(ultimoOdo)} km).`)
      await datos.guardarEvento({ cadena_id: cadena.id, fecha: hoy(), odo: o, ...evento })
      if (extra) await extra(o)
      setPanel(null)
      await onRecargar()
    } catch (e) { setError(e.message) }
    setOcupado(false)
  }

  const cambiarCadena = () => registrar({ tipo: 'cambio', odo: ultimoOdo + (Number(odo) || 0) }, async (o) => {
    await datos.guardarCadena({ ...cadena, retirada_odo: o, retirada_fecha: hoy() })
    await datos.guardarCadena({ bici_id: bici.id, instalada_fecha: hoy(), instalada_odo: o, lubricante_id: cadena.lubricante_id, edad_desconocida: false })
  })

  return (
    <main className="app">
      {bicis.length > 1 && (
        <div className="chips" role="tablist" aria-label="Tus bicicletas">
          {bicis.map((b) => <a key={b.id} role="tab" aria-selected={b.id === bici.id} className="chip-op" href={`#/cadena/${b.id}`}>{b.nombre}</a>)}
          <a className="chip-op" href="#/bici/nueva">+ Bici</a>
        </div>
      )}
      <div style={{ position: 'relative', paddingBottom: 26 }}>
        <section className="hero tx-naranja" style={{ minHeight: 270, paddingBottom: 30 }}>
          <div className="hero-top">
            <a className="circulo" href={`#/bici/${bici.id}`} aria-label="Editar bicicleta">
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 14.5V16h1.5l8.6-8.6-1.5-1.5zM15.2 6.3l-1.5-1.5 1-1a1 1 0 0 1 1.5 0 1 1 0 0 1 0 1.5z" fill="currentColor" /></svg>
            </a>
            {bicis.length === 1 ? <a className="chip" href="#/bici/nueva" style={{ textDecoration: 'none', color: '#fff' }}>+ Otra bici</a> : <span className="chip">{g ? `${g.marca} ${g.nombre}` : 'Grupo sin registrar'}</span>}
          </div>
          <div className="col" style={{ gap: 12 }}>
            <h1>{bici.nombre}</h1>
            <div className="fila" style={{ gap: 12 }}>
              <div className="bateria" aria-hidden="true"><div style={{ height: `${Math.max(4, restante * 100)}%` }} /></div>
              <div className="col">
                <div style={{ fontSize: 26, fontWeight: 700 }}>{cambiarAviso ? 'Cambia la cadena' : km(s.kmAlCambio)}</div>
                <div style={{ fontSize: 14 }}>{cambiarAviso ? cambiarAviso.texto : `para cambiar la cadena${s.semanasAlCambio !== null ? ` · ${fechaEn(s.semanasAlCambio)}` : ''}`}</div>
              </div>
            </div>
          </div>
        </section>
        <button type="button" className="fab" aria-label="Anotar" aria-expanded={panel !== null} onClick={() => (panel ? setPanel(null) : setPanel('menu'))}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: panel ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>

      {panel === 'menu' && (
        <div className="card acciones">
          <button type="button" className="btn btn-secundario" onClick={() => abrir('km')}>Anotar km</button>
          <button type="button" className="btn btn-secundario" onClick={() => abrir('lub')}>Lubriqué</button>
          <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={() => registrar({ tipo: 'limpie' })}>Limpié</button>
          <button type="button" className="btn btn-secundario" onClick={() => abrir('medicion')}>Medí la cadena</button>
          <button type="button" className="btn btn-tinte" onClick={() => abrir('cambio')}>Cambié la cadena</button>
        </div>
      )}
      {panel && panel !== 'menu' && (
        <form className="card col" style={{ gap: 12 }} onSubmit={(e) => {
          e.preventDefault()
          if (panel === 'km') {
            if (!(Number(odo) > 0)) { setError('Anota cuántos km anduviste.'); return }
            registrar({ tipo: 'km', odo: ultimoOdo + Number(odo), clima })
          }
          if (panel === 'lub') registrar({ tipo: 'lub', producto_id: prodLub })
          if (panel === 'cambio') cambiarCadena()
        }}>
          <h2>{{ km: 'Anotar km', lub: 'Lubriqué', medicion: '¿Cómo salió la medición?', cambio: 'Cambié la cadena' }[panel]}</h2>
          {(panel === 'km' || panel === 'cambio') && (
            <label className="col" htmlFor="ev-odo" style={{ gap: 6 }}>
              <span className="etiqueta">{panel === 'km' ? 'Km que anduviste esta semana' : 'Km sin anotar desde tu último registro'}</span>
              <input id="ev-odo" className="buscador" type="number" inputMode="numeric" min="0" placeholder={panel === 'km' ? 'Ej.: 150' : '0'} value={odo} onChange={(e) => setOdo(e.target.value)} autoFocus />
              <span className="peq muted">{panel === 'km' ? `Se suman a los ${n0(s.kmRecorridos)} km que lleva la cadena${Number(odo) > 0 ? `: quedaría en ${n0(s.kmRecorridos + Number(odo))} km` : ''}.` : 'Si ya anotaste todo, déjalo en 0.'}</span>
            </label>
          )}
          {panel === 'km' && (
            <div className="col" style={{ gap: 6 }}>
              <span className="etiqueta">¿Cómo estuvo?</span>
              <div className="opciones" role="radiogroup" aria-label="Cómo estuvo el clima">
                {CLIMAS.map(([v, t]) => (
                  <button key={v} type="button" role="radio" aria-checked={clima === v} aria-pressed={clima === v} className="opcion opcion-chica" onClick={() => setClima(v)}>
                    <span>{t}<small>{definicionesClima(mezclaBase(perfil, bici))[v]}</small></span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {panel === 'lub' && (
            <label className="col" htmlFor="ev-prod" style={{ gap: 6 }}>
              <span className="etiqueta">Producto</span>
              <select id="ev-prod" className="buscador" value={prodLub} onChange={(e) => setProdLub(e.target.value)}>
                {!productosChile().some((p) => String(p.id) === String(s.producto.id)) && <option value={s.producto.id}>{s.producto.nombre}</option>}
                {productosChile().map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
          )}
          {panel === 'medicion' && (
            <div className="opciones">
              {MEDIDAS.map(([v, t]) => <button key={v} type="button" className="opcion" disabled={ocupado} onClick={() => registrar({ tipo: 'medicion', resultado: v })}>{t}</button>)}
              <p className="peq muted" style={{ margin: 0 }}>Con un medidor de cadena (CC-4 u otro). Si no tienes, pide que la midan en un taller.</p>
            </div>
          )}
          {panel === 'cambio' && <p className="peq muted" style={{ margin: 0 }}>Guardamos la vida de esta cadena ({km(s.kmRecorridos + (Number(odo) || 0))}) y empezamos a contar una nueva con el mismo lubricante.</p>}
          {error && <p className="aviso" role="alert" style={{ margin: 0 }}>{error}</p>}
          {panel !== 'medicion' && (
            <div className="pie" style={{ paddingTop: 0 }}>
              <button type="button" className="btn btn-secundario" onClick={() => setPanel(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
            </div>
          )}
        </form>
      )}

      <div className="card" style={{ padding: '4px 18px' }}>
        <Tarea nivel={lubAviso?.nivel} titulo={s.queAplicar.charAt(0).toUpperCase() + s.queAplicar.slice(1)}
          detalle={`${s.reencerar ? 'Llevas 1.200 km o más desde el último encerado' : lubAviso?.nivel === 'alto' ? `Ya toca · ${km(s.kmDesdeLub)} desde la última vez` : `${lubAviso ? 'Pronto · ' : ''}te quedan unos ${km(Math.max(0, s.autonomia - s.kmDesdeLub))} de ${km(s.autonomia)}`}${s.combinado && !s.reencerar ? ` · re-encerar en ${km(s.kmAlEncerado)}` : ''}`} />
        <div className="barra-lub" aria-hidden="true"><div style={{ width: `${Math.min(100, s.lubFraccion * 100)}%`, background: s.lubFraccion >= 0.8 ? 'var(--accent)' : 'var(--ring)' }} /></div>
        <Tarea nivel={medirAviso ? 'alto' : null} titulo="Medir la cadena"
          detalle={medirAviso ? 'Ya toca medir' : `En ${km(s.kmAMedir)}${s.semanasAMedir !== null ? `, unas ${n0(Math.max(1, s.semanasAMedir))} semanas` : ''} · ${pct(s.probMed)} de seguir bajo 0,5 %`} />
        <Tarea nivel={cambiarAviso ? 'alto' : null} titulo="Cambiar la cadena"
          detalle={cambiarAviso ? cambiarAviso.texto : `En ${km(s.kmAlCambio)}${s.semanasAlCambio !== null ? ` · unas ${n0(s.semanasAlCambio)} semanas` : ''}`} />
      </div>

      {s.ceraSola && <p className="aviso" style={{ margin: 0 }}>Opción de Silca: entre encerados puedes re-aplicar Super Secret por goteo y re-encerar cada 1.200 km. Si lo haces, anótalo como "Lubriqué" con Super Secret y la app sigue ese esquema.</p>}
      {cadena.edad_desconocida && s.mediciones.length === 0 && <p className="aviso" style={{ margin: 0 }}>No sabemos la edad de esta cadena: mídela para que el cálculo parta de su estado real.</p>}
      {esGamaAlta(bici) && <p className="aviso" style={{ margin: 0 }}>Gama alta: los cassettes livianos o de titanio se gastan antes. Cambia la cadena justo al 0,5 %, sin estirarla.</p>}
      {bici.union === 'pasador' && <p className="aviso" style={{ margin: 0 }}>Tu cadena va con pasador: instala un eslabón rápido para poder encerar.</p>}

      <div className="card col" style={{ gap: 8 }}>
        <div className="entre"><h2>Desgaste estimado</h2><span className="peq muted">{pct(Math.min(s.vida, 9.99))} al cambio</span></div>
        <Historial s={s} />
        <p className="peq muted" style={{ margin: 0 }}>
          El cambio óptimo es a {km(s.kmCambioTotal)}, {n1(s.tStar)} veces la vida mediana hasta 0,5 % con tu grupo (r = {n1(s.r)}). Cambiar ahí cuesta {pct(s.ahorro)} menos por km que esperar a que se gaste el cassette.
          {' '}Los círculos son tus mediciones; la línea punteada, la proyección con tus condiciones de siempre.
        </p>
        <ul className="resto">
          <li><span>Km con esta cadena</span><strong>{n0(s.kmRecorridos)} km</strong></li>
          <li><span>{factor.n >= 3 ? 'Tu factor' : 'Factor rodillo a uso real'}</span><strong>K = {n1(factor.K)}{factor.n >= 3 ? '' : ` (desde la 3.ª medición se ajusta a ti)`}</strong></li>
        </ul>
      </div>

      <div className="card" style={{ padding: '12px 18px 4px' }}>
        <div className="etiqueta" style={{ paddingBottom: 4 }}>Bitácora ({evCadena.length})</div>
        {evCadena.length === 0 && <p className="peq muted">Todavía no anotas nada. Usa el botón + para registrar km, lubricaciones y mediciones.</p>}
        {evCadena.slice(0, 12).map((e) => (
          <div key={e.id} className="tarea hecha">
            <div className="anillo lleno"><Check /></div>
            <div style={{ flex: 1 }} className="peq">
              <span style={{ fontSize: 15 }}>{NOMBRE_EVENTO[e.tipo]}</span>
              <span className="muted"> · {fechaCorta(e.fecha)}{e.tipo === 'km' ? ` · ${n0(sumados[e.id] ?? 0)} km, total ${n0(Math.max(0, e.odo - (cadena.instalada_odo || 0)))} km` : ''}{e.tipo === 'km' && e.clima !== 'normal' ? ` · ${CLIMAS.find((c) => c[0] === e.clima)?.[1].toLowerCase()}` : ''}{e.tipo === 'medicion' ? ` · ${MEDIDAS.find((m) => m[0] === e.resultado)?.[1]}` : ''}</span>
            </div>
            {e.tipo !== 'cambio' && <button type="button" className="enlace peq" aria-label="Borrar registro" onClick={async () => { await datos.borrarEvento(e.id); onRecargar() }}>Borrar</button>}
          </div>
        ))}
      </div>
    </main>
  )
}
