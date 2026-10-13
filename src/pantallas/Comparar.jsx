import { useMemo, useState } from 'react'
import { comparar, buscarProducto, puntajeDe, opcionesLubricante, FORMA_LUBRICANTE, PARAMS } from '../lib/motor.js'
import { km, clpR, n0, n1, n2 } from '../lib/formato.js'
import { Atras } from '../ui/iconos.jsx'

function Selector({ onElegir }) {
  const [busca, setBusca] = useState('')
  const [forma, setForma] = useState(false)
  const opciones = useMemo(opcionesLubricante, [])
  const q = busca.trim().toLowerCase()
  const lista = q ? opciones.filter((o) => o.nombre.toLowerCase().includes(q)).slice(0, 30) : opciones.slice(0, 10)
  if (forma) {
    return (
      <div className="card col" style={{ gap: 10 }}>
        <h2>¿Cómo es tu lubricante?</h2>
        <div className="opciones">
          {FORMA_LUBRICANTE.map((f) => (
            <button key={f.id} type="button" className="opcion" style={{ background: 'var(--pill)' }} onClick={() => onElegir({ id: f.id, nombre: buscarProducto(f.id).nombre })}>{f.texto}</button>
          ))}
        </div>
        <button type="button" className="enlace" style={{ alignSelf: 'flex-start' }} onClick={() => setForma(false)}>Volver al buscador</button>
      </div>
    )
  }
  return (
    <div className="col" style={{ gap: 10 }}>
      <label htmlFor="busca-c" className="oculto">Buscar tu lubricante</label>
      <input id="busca-c" className="buscador" type="search" placeholder="Busca tu lubricante" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
      <div className="lista">
        {lista.map((o) => (
          <button type="button" key={`${o.id}-${o.nombre}`} onClick={() => onElegir({ id: o.id, nombre: o.nombre })}>
            <span>{o.nombre}</span><span>{o.detalle}</span>
          </button>
        ))}
      </div>
      <button type="button" className="enlace" style={{ alignSelf: 'flex-start', marginLeft: 4 }} onClick={() => setForma(true)}>No está en la lista</button>
    </div>
  )
}

const veces = (x) => (x >= 1.95 ? `${n0(x)} veces` : `${n1(x)} veces`)

export default function Comparar({ perfil, resultado, saca, onActual }) {
  const [cambiar, setCambiar] = useState(!perfil.actual)
  const [cadena, setCadena] = useState(perfil.precioCadena || PARAMS.cadena_def)
  const [cassette, setCassette] = useState(perfil.precioCassette || PARAMS.cassette_def)
  const g = resultado?.ranking[0]

  const datos = useMemo(() => {
    if (!perfil.actual || !g) return null
    const actual = buscarProducto(perfil.actual.id)
    if (!actual) return null
    const c = comparar(actual, g.producto, perfil, { cadena, cassette })
    const pa = puntajeDe(actual, perfil, { sacaCadena: saca })
    return { actual, c, pa }
  }, [perfil, g, cadena, cassette, saca])

  const elegir = (a) => { onActual(a); setCambiar(false) }

  if (!g) return null
  const volver = <a className="circulo" href="#/resultado" aria-label="Volver al resultado"><Atras /></a>

  if (cambiar || !datos) {
    return (
      <main className="app">
        <section className="hero tx-naranja" style={{ minHeight: 170 }}>
          <div className="hero-top">{volver}</div>
          <div className="col"><span className="sub">Comparar con</span><h1>{g.producto.nombre}</h1></div>
        </section>
        <h2 className="pregunta" style={{ fontSize: 24 }}>¿Qué lubricante usas hoy?</h2>
        <Selector onElegir={elegir} />
      </main>
    )
  }

  const { actual, c, pa } = datos
  const { a, b } = c
  const mismo = String(actual.id) === String(g.producto.id)
  const nombreA = perfil.actual.nombre
  const estA = String(actual.id).startsWith('tip-') || nombreA !== actual.nombre
  const menosCadenas = a.cadenas - b.cadenas

  let frase
  if (mismo) frase = `Ya usas el lubricante recomendado para ti.`
  else if (c.ahorro > 0) frase = `Con ${g.producto.nombre} ahorrarías unos ${clpR(c.ahorro)} al año${menosCadenas >= 1 ? ` y cambiarías la cadena ${n0(Math.floor(menosCadenas))} ${Math.floor(menosCadenas) === 1 ? 'vez' : 'veces'} menos` : ''}.`
  else frase = `${g.producto.nombre} te costaría unos ${clpR(-c.ahorro)} más al año, a cambio de lo que muestra la tabla.`

  const dif = (va, vb, fmt, menosEsMejor = true) => {
    const d = va - vb
    if (Math.abs(d) < 1e-9) return ''
    return fmt(Math.abs(d)) + ((d > 0) === menosEsMejor ? ' menos' : ' más')
  }
  const mejor = (va, vb, menosEsMejor = true) => (menosEsMejor ? vb < va : vb > va)
  const est = (x) => (x ? <span className="est">*</span> : null)

  const filas = [
    ['Vida de cadena', km(a.vida), km(b.vida), b.vida >= a.vida ? `${veces(b.vida / a.vida)} más` : `${veces(a.vida / b.vida)} menos`, mejor(a.vida, b.vida, false), estA],
    ['Cadenas al año', n1(a.cadenas), n1(b.cadenas), dif(a.cadenas, b.cadenas, (x) => `${n1(x)} cadenas`), mejor(a.cadenas, b.cadenas), estA],
    ['Gasto en transmisión', clpR(a.transmision), clpR(b.transmision), dif(a.transmision, b.transmision, clpR), mejor(a.transmision, b.transmision), estA],
    ['Km por aplicación', km(a.auto), km(b.auto), '', mejor(a.auto, b.auto, false), estA],
    ['Aplicaciones al año', n0(a.aplicaciones), n0(b.aplicaciones), dif(Math.round(a.aplicaciones), Math.round(b.aplicaciones), n0), mejor(a.aplicaciones, b.aplicaciones), estA],
    ['Gasto en lubricante', <>{clpR(a.lubricante)}{est(a.costoEstimado)}</>, <>{clpR(b.lubricante)}{est(b.costoEstimado)}</>, dif(a.lubricante, b.lubricante, clpR), mejor(a.lubricante, b.lubricante)],
    ['Tiempo de mantención', `${n1(a.horas)} h`, `${n1(b.horas)} h`, dif(a.horas, b.horas, (x) => `${n1(x)} h`), mejor(a.horas, b.horas), estA],
    ['Pérdida a 250 W', <>{n1(a.w)} W{est(a.wEstimado)}</>, <>{n1(b.w)} W{est(b.wEstimado)}</>, a.w > b.w ? `${n1(a.w - b.w)} W menos, unos ${n0(a.segPorHora - b.segPorHora)} s por hora` : dif(a.w, b.w, (x) => `${n1(x)} W`), mejor(a.w, b.w)],
    ['Desgaste con lluvia o barro', n2(a.b4), n2(b.b4), a.b4 > b.b4 && b.b4 > 0 ? `${veces(a.b4 / b.b4)} menos` : '', mejor(a.b4, b.b4), estA],
    ['Puntaje del recomendador', n0(pa), n0(g.puntaje), '', mejor(pa, g.puntaje, false)],
  ]

  return (
    <main className="app">
      <section className="hero tx-naranja" style={{ minHeight: 230 }}>
        <div className="hero-top">
          {volver}
          <span className="chip">{n0(c.km)} km al año</span>
        </div>
        <div className="col" style={{ gap: 8 }}>
          <span className="sub">{nombreA} contra {g.producto.nombre}</span>
          <h1 style={{ fontSize: 28, lineHeight: 1.1 }}>{frase}</h1>
        </div>
      </section>

      <div className="card" style={{ padding: '8px 14px' }}>
        <table className="tabla">
          <caption className="oculto">Comparación anual entre tu lubricante y el recomendado</caption>
          <thead>
            <tr><th scope="col">Al año</th><th scope="col">{nombreA}</th><th scope="col">{g.producto.nombre}</th></tr>
          </thead>
          <tbody>
            {filas.map(([t, va, vb, d, esMejor, estimadoA]) => (
              <tr key={t}>
                <th scope="row">{t}</th>
                <td>{va}{estimadoA ? <span className="est">*</span> : null}</td>
                <td className={esMejor && !mismo ? 'mejor' : ''}>{vb}{d && !mismo ? <span className="dif">{d}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Precios de tu transmisión</h2>
        <p className="peq muted" style={{ margin: '0 0 6px' }}>Por defecto, nivel Shimano 105 o SLX. Se asume un cassette cada {PARAMS.cad_por_cas} cadenas.</p>
        <div className="podio">
          <label className="col peq">Cadena
            <input className="buscador" type="number" inputMode="numeric" value={cadena} min="1000" step="500" onChange={(e) => setCadena(Number(e.target.value) || PARAMS.cadena_def)} />
          </label>
          <label className="col peq">Cassette
            <input className="buscador" type="number" inputMode="numeric" value={cassette} min="1000" step="1000" onChange={(e) => setCassette(Number(e.target.value) || PARAMS.cassette_def)} />
          </label>
        </div>
      </div>

      <p className="peq muted" style={{ margin: '0 6px' }}>
        * Estimado: {estA ? `${nombreA} se compara con la mediana de los productos de su tipo` : 'el dato falta en el ensayo y se usa la mediana de su tipo'}.
        Vida de cadena hasta 0,5 % de elongación, con tu mezcla de condiciones y los ensayos de Zero Friction Cycling.
      </p>
      <button type="button" className="btn btn-secundario btn-bloque" onClick={() => setCambiar(true)}>Comparar con otro lubricante</button>
    </main>
  )
}
