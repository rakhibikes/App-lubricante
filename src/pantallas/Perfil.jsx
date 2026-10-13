import { useMemo, useState } from 'react'
import { asignarSegmento, SEGMENTOS, FORMA_LUBRICANTE, opcionesLubricante, buscarProducto } from '../lib/motor.js'
import { Atras, Check } from '../ui/iconos.jsx'

const CONDICIONES = [
  ['limpio', 'Seco y limpio', 'var(--mix1)'],
  ['polvo', 'Polvo o tierra', 'var(--mix2)'],
  ['humedo', 'Lluvia o barro', 'var(--mix3)'],
  ['extremo', 'Extremo', 'var(--mix4)'],
]
const TOTAL = 8

const aEnteros = (mix) => Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, Math.round(v * 100)]))

function Opcion({ activa, onClick, children, detalle }) {
  return (
    <button type="button" className="opcion" aria-pressed={activa} onClick={onClick}>
      <span>{children}{detalle && <small>{detalle}</small>}</span>
      {activa && <Check />}
    </button>
  )
}

export default function Perfil({ inicial, onListo, onSalir }) {
  const [paso, setPaso] = useState(0)
  const [p, setP] = useState(() => ({
    disciplina: null, electrica: null, compite: null, ultra: null,
    mezcla: null, mezclaTocada: false, sacaCadena: null, kmSemana: null, actual: undefined,
    ...(inicial || {}),
    ...(inicial?.mezcla ? { mezcla: aEnteros(inicial.mezcla) } : {}),
  }))
  const [busca, setBusca] = useState('')
  const [forma, setForma] = useState(false)
  const opciones = useMemo(opcionesLubricante, [])

  const set = (cambios) => setP((x) => ({ ...x, ...cambios }))
  const segmento = p.disciplina ? asignarSegmento({ ...p, electrica: !!p.electrica, compite: !!p.compite, ultra: !!p.ultra }) : null

  // Al llegar a la mezcla, la precarga con la del segmento si la persona no la ha movido.
  const irA = (n) => {
    if (n === 4 && segmento && (!p.mezcla || !p.mezclaTocada)) set({ mezcla: aEnteros(SEGMENTOS[segmento].mix) })
    setPaso(n)
    window.scrollTo(0, 0)
  }
  const siguiente = () => (paso < TOTAL - 1 ? irA(paso + 1) : terminar())
  const elegir = (cambios) => { set(cambios); setTimeout(() => irA(paso + 1), 140) }

  function moverMezcla(clave, valor) {
    const m = { ...p.mezcla }
    const otros = Object.keys(m).filter((k) => k !== clave)
    const resto = 100 - valor
    const sumaOtros = otros.reduce((a, k) => a + m[k], 0)
    otros.forEach((k) => { m[k] = sumaOtros > 0 ? (m[k] / sumaOtros) * resto : resto / otros.length })
    m[clave] = valor
    // Redondea y deja el ajuste en la condición más grande para que sume exactamente 100.
    const r = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)]))
    const dif = 100 - Object.values(r).reduce((a, b) => a + b, 0)
    if (dif) { const k = otros.sort((a, b) => r[b] - r[a])[0]; r[k] += dif }
    set({ mezcla: r, mezclaTocada: true })
  }

  function terminar(saltar = false) {
    const mezcla = Object.fromEntries(Object.entries(p.mezcla).map(([k, v]) => [k, v / 100]))
    onListo({
      disciplina: p.disciplina,
      electrica: !!p.electrica,
      compite: !!p.compite,
      ultra: !!p.ultra,
      segmento,
      mezcla,
      mezclaTocada: p.mezclaTocada,
      sacaCadena: p.sacaCadena || 'no_se',
      kmSemana: p.kmSemana || 100,
      actual: saltar ? null : p.actual ?? null,
      importancias: inicial?.segmento === segmento ? inicial?.importancias : undefined,
      creado: inicial?.creado || new Date().toISOString(),
    })
  }

  const puedeSeguir = [
    p.disciplina, p.electrica !== null, p.compite !== null, p.ultra !== null,
    p.mezcla, p.sacaCadena, p.kmSemana > 0, true,
  ][paso]

  const filtradas = busca.trim().length > 0
    ? opciones.filter((o) => o.nombre.toLowerCase().includes(busca.trim().toLowerCase())).slice(0, 30)
    : opciones.slice(0, 12)
  const actualNombre = p.actual?.nombre

  return (
    <main className="app sin-nav">
      <div className="fila" style={{ padding: '4px 0' }}>
        <button type="button" className="circulo claro" aria-label="Atrás" onClick={() => (paso === 0 ? onSalir() : irA(paso - 1))}><Atras /></button>
        <div className="avance" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={paso + 1} aria-label={`Pregunta ${paso + 1} de ${TOTAL}`}>
          <div style={{ width: `${((paso + 1) / TOTAL) * 100}%` }} />
        </div>
        <span className="peq muted" style={{ width: 36, textAlign: 'right' }}>{paso + 1}/{TOTAL}</span>
      </div>

      {paso === 0 && (<>
        <h1 className="pregunta">¿Dónde andas la mayor parte del tiempo?</h1>
        <div className="opciones">
          {[['ruta', 'Ruta'], ['gravel', 'Gravel'], ['mtb', 'MTB'], ['ciudad', 'Ciudad']].map(([v, t]) => (
            <Opcion key={v} activa={p.disciplina === v} onClick={() => elegir({ disciplina: v })}>{t}</Opcion>
          ))}
        </div>
      </>)}

      {paso === 1 && (<>
        <h1 className="pregunta">¿Tu bici es eléctrica?</h1>
        <p className="ayuda">Con asistencia el desgaste sube y el lubricante dura más o menos la mitad.</p>
        <div className="opciones dos">
          <Opcion activa={p.electrica === true} onClick={() => elegir({ electrica: true })}>Sí</Opcion>
          <Opcion activa={p.electrica === false} onClick={() => elegir({ electrica: false })}>No</Opcion>
        </div>
      </>)}

      {paso === 2 && (<>
        <h1 className="pregunta">¿Compites o entrenas buscando rendimiento?</h1>
        <div className="opciones dos">
          <Opcion activa={p.compite === true} onClick={() => elegir({ compite: true })}>Sí</Opcion>
          <Opcion activa={p.compite === false} onClick={() => elegir({ compite: false })}>No</Opcion>
        </div>
      </>)}

      {paso === 3 && (<>
        <h1 className="pregunta">¿Haces eventos de más de 12 horas?</h1>
        <p className="ayuda">Ultra distancia o bikepacking de carrera.</p>
        <div className="opciones dos">
          <Opcion activa={p.ultra === true} onClick={() => elegir({ ultra: true })}>Sí</Opcion>
          <Opcion activa={p.ultra === false} onClick={() => elegir({ ultra: false })}>No</Opcion>
        </div>
      </>)}

      {paso === 4 && p.mezcla && (<>
        <h1 className="pregunta">¿Cómo es lo que andas?</h1>
        <p className="ayuda">Viene con lo típico de tu tipo de ciclismo. Mueve una barra y las demás se ajustan.</p>
        <div className="card">
          <div className="mezcla" aria-hidden="true" style={{ marginBottom: 6 }}>
            {CONDICIONES.map(([k, , c]) => <div key={k} style={{ width: `${p.mezcla[k]}%`, background: c }} />)}
          </div>
          {CONDICIONES.map(([k, t, c]) => (
            <div className="barra" key={k}>
              <div className="entre">
                <label htmlFor={`m-${k}`} className="fila" style={{ gap: 8 }}><span className="punto" style={{ background: c }} />{t}</label>
                <span className="valor">{p.mezcla[k]} %</span>
              </div>
              <input id={`m-${k}`} type="range" min="0" max="100" step="5" value={p.mezcla[k]} onChange={(e) => moverMezcla(k, Number(e.target.value))} />
            </div>
          ))}
          <p className="peq muted" style={{ margin: '6px 0 0' }}>Extremo es barro profundo, arena o sal.</p>
        </div>
      </>)}

      {paso === 5 && (<>
        <h1 className="pregunta">¿Sacarías la cadena para encerarla cada 300 a 1.300 km?</h1>
        <p className="ayuda">La cera de inmersión es lo que más protege la cadena, pero hay que sacarla y meterla en una olla.</p>
        <div className="opciones">
          <Opcion activa={p.sacaCadena === 'si'} onClick={() => elegir({ sacaCadena: 'si' })}>Sí</Opcion>
          <Opcion activa={p.sacaCadena === 'no'} onClick={() => elegir({ sacaCadena: 'no' })}>No</Opcion>
          <Opcion activa={p.sacaCadena === 'no_se'} onClick={() => set({ sacaCadena: 'no_se' })}>No sé</Opcion>
        </div>
        {p.sacaCadena === 'no_se' && (
          <div className="aviso">Sacar, encerar y poner la cadena toma unos 15 minutos con un eslabón rápido. Te mostramos los dos rankings, con y sin sacarla, para que decidas.</div>
        )}
      </>)}

      {paso === 6 && (<>
        <h1 className="pregunta">¿Cuántos km andas por semana?</h1>
        <div className="opciones dos">
          {[50, 100, 200, 400].map((v) => (
            <Opcion key={v} activa={p.kmSemana === v} onClick={() => elegir({ kmSemana: v })}>{v} km</Opcion>
          ))}
        </div>
        <label className="ayuda" htmlFor="kmlibre">U otro número</label>
        <input id="kmlibre" className="buscador" type="number" inputMode="numeric" min="1" max="3000" placeholder="Ej.: 150"
          value={[50, 100, 200, 400].includes(p.kmSemana) || !p.kmSemana ? '' : p.kmSemana}
          onChange={(e) => set({ kmSemana: Math.max(0, Math.min(3000, Number(e.target.value) || 0)) || null })} />
      </>)}

      {paso === 7 && !forma && (<>
        <h1 className="pregunta">¿Qué lubricante usas hoy?</h1>
        <p className="ayuda">Para compararlo con el recomendado. Puedes saltarte esta pregunta.</p>
        <label htmlFor="busca" className="oculto">Buscar lubricante</label>
        <input id="busca" className="buscador" type="search" placeholder="Busca por nombre o marca" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
        <div className="lista">
          {filtradas.map((o) => (
            <button type="button" key={`${o.id}-${o.nombre}`} aria-pressed={actualNombre === o.nombre} onClick={() => set({ actual: { id: o.id, nombre: o.nombre } })}>
              <span>{o.nombre}</span><span>{o.detalle}</span>
            </button>
          ))}
          {filtradas.length === 0 && <p className="muted peq" style={{ padding: 12, margin: 0 }}>No aparece en la lista.</p>}
        </div>
        <div className="opciones dos">
          <Opcion activa={p.actual === null && p.actualMotivo === 'no_se'} onClick={() => set({ actual: null, actualMotivo: 'no_se' })}>No sé</Opcion>
          <Opcion activa={p.actual === null && p.actualMotivo === 'no_uso'} onClick={() => set({ actual: null, actualMotivo: 'no_uso' })}>No uso</Opcion>
        </div>
        <button type="button" className="enlace" style={{ alignSelf: 'flex-start', margin: '2px 4px' }} onClick={() => setForma(true)}>No está en la lista</button>
      </>)}

      {paso === 7 && forma && (<>
        <h1 className="pregunta">¿Cómo es tu lubricante?</h1>
        <p className="ayuda">Lo comparamos con el típico de ese tipo, marcado como estimado.</p>
        <div className="opciones">
          {FORMA_LUBRICANTE.map((f) => {
            const prod = buscarProducto(f.id)
            const nombre = prod.nombre
            return (
              <Opcion key={f.id} activa={p.actual?.id === f.id} onClick={() => { set({ actual: { id: f.id, nombre } }); setForma(false) }}>{f.texto}</Opcion>
            )
          })}
        </div>
        <button type="button" className="enlace" style={{ alignSelf: 'flex-start', margin: '2px 4px' }} onClick={() => setForma(false)}>Volver al buscador</button>
      </>)}

      <div className="pie">
        {paso === 7 && <button type="button" className="btn btn-secundario" onClick={() => terminar(true)}>Saltar</button>}
        <button type="button" className="btn btn-primario" disabled={!puedeSeguir} onClick={siguiente}>
          {paso === TOTAL - 1 ? 'Ver mi lubricante' : 'Siguiente'}
        </button>
      </div>
    </main>
  )
}
