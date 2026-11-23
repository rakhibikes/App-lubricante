import { useEffect, useMemo, useState } from 'react'
import { CATALOGO, setCatalogo, recomendar, NOMBRE_TIPO, NOMBRE_SEGMENTO } from '../lib/motor.js'
import { admin } from '../lib/datos.js'
import { estadoCadena, factorPropio } from '../lib/cadena.js'
import { clp, n0, n1 } from '../lib/formato.js'
import { Atras } from '../ui/iconos.jsx'

const copia = (x) => JSON.parse(JSON.stringify(x))
const hoy = () => new Date().toISOString().slice(0, 10)
const TIPOS = Object.keys(NOMBRE_TIPO)
const PESTANAS = [['productos', 'Productos'], ['sin', 'Sin ensayo'], ['grupos', 'Grupos'], ['params', 'Parámetros'], ['publicar', 'Revisar y publicar'], ['versiones', 'Versiones'], ['avisos', 'Avisos']]
const CRITERIOS = ['Proteger', 'Eficiencia', 'Autonomía', 'Costo', 'Trabajo']
const COND = ['limpio', 'polvo', 'humedo', 'extremo']
const PARAMS_EDITABLES = [
  ['K', 'K, rodillo a uso real', 0.1], ['FLOOR', 'Tasa mínima por bloque', 0.001], ['BETA_CADENA', 'Forma de la Weibull de la cadena', 0.1],
  ['BETA_LUB', 'Forma de la Weibull de la lubricación', 0.1], ['UMBRAL', 'Umbral por aplicación (0 a 1)', 0.01], ['AUD_CLP', 'Dólar australiano a peso', 1],
  ['cadena_def', 'Cadena por defecto (CLP)', 500], ['cassette_def', 'Cassette por defecto (CLP)', 1000], ['EMPATE', 'Empate técnico (puntos)', 0.5],
  ['SIGMA', 'Perturbación de la solidez', 0.05], ['ITER', 'Repeticiones de la solidez', 100], ['W_SECA', 'Vatios extra con la cadena seca', 1],
]
const cantidadEnvase = (envase) => { const m = String(envase || '').match(/[\d.,]+/); return m ? Number(m[0].replace(',', '.')) : null }
const diasDesde = (f) => (f ? (Date.now() - new Date(`${f}T12:00:00`).getTime()) / 864e5 : Infinity)

function ganadores(cat) {
  const anterior = CATALOGO
  setCatalogo(cat)
  const out = {}
  try {
    for (const seg of Object.keys(cat.params.SEG)) {
      const perfil = { segmento: seg }
      out[seg] = {
        sin: recomendar(perfil, { sacaCadena: false, iteraciones: 1 }).ranking[0]?.producto.nombre,
        con: recomendar(perfil, { sacaCadena: true, iteraciones: 1 }).ranking[0]?.producto.nombre,
      }
    }
  } finally { setCatalogo(anterior) }
  return out
}

export default function Catalogo({ onPublicado }) {
  const [tab, setTab] = useState('productos')
  const [borrador, setBorrador] = useState(() => copia(CATALOGO))
  const [filtro, setFiltro] = useState('chile')
  const [versiones, setVersiones] = useState([])
  const [busquedas, setBusquedas] = useState([])
  const [kSugerido, setKSugerido] = useState(null)
  const [nota, setNota] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cambiado = JSON.stringify(borrador) !== JSON.stringify(CATALOGO)
  const prod = (i, cambios) => setBorrador((b) => { const c = copia(b); Object.assign(c.productos[i], cambios); return c })
  const param = (k, v) => setBorrador((b) => ({ ...b, params: { ...b.params, [k]: v } }))

  useEffect(() => {
    if (tab === 'versiones') admin.versiones().then(setVersiones).catch((e) => setMsg(e.message))
    if (tab === 'avisos') {
      admin.busquedas().then(setBusquedas)
      admin.mediciones().then(({ cadenas, eventos }) => {
        const meds = []
        for (const c of cadenas) {
          const s = estadoCadena({ cadena: c, eventos, perfil: null, bici: null, K: 1 })
          meds.push(...s.medicionesU)
        }
        setKSugerido({ ...factorPropio(meds), cadenas: cadenas.length })
      }).catch(() => setKSugerido(null))
    }
  }, [tab])

  const antes = useMemo(() => (tab === 'publicar' ? ganadores(CATALOGO) : null), [tab])
  const despues = useMemo(() => (tab === 'publicar' ? ganadores(borrador) : null), [tab, borrador])

  async function publicar() {
    setOcupado(true)
    setMsg('')
    try {
      const d = new Date()
      const base = `cat-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const existentes = (await admin.versiones()).filter((v) => v.nombre.startsWith(base)).length
      const nombre = existentes ? `${base}-${existentes + 1}` : base
      const datos = { ...borrador, version: nombre }
      await admin.publicar(nombre, datos, nota || null)
      onPublicado(datos)
      setBorrador(copia(datos))
      setNota('')
      setMsg(`Publicada la versión ${nombre}. Las recomendaciones nuevas ya la usan.`)
    } catch (e) { setMsg(`No se pudo publicar: ${e.message}`) }
    setOcupado(false)
  }

  async function restaurar(v) {
    setOcupado(true)
    try {
      const full = await admin.version(v.id)
      const nombre = `${v.nombre}-restaurada`
      const datos = { ...full.datos, version: nombre }
      await admin.publicar(nombre, datos, `Vuelta a ${v.nombre}`)
      onPublicado(datos)
      setBorrador(copia(datos))
      setVersiones(await admin.versiones())
      setMsg(`Volviste a ${v.nombre}.`)
    } catch (e) { setMsg(e.message) }
    setOcupado(false)
  }

  const lista = borrador.productos.map((p, i) => ({ p, i })).filter(({ p }) => filtro === 'todos' || p.chile)
  const viejos = borrador.productos.filter((p) => p.chile && diasDesde(p.revision) > 90)
  const conteo = Object.entries(busquedas.reduce((m, b) => { const k = b.texto.trim().toLowerCase(); m[k] = (m[k] || 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 20)

  return (
    <main className="app">
      <div className="fila" style={{ padding: '4px 0' }}>
        <a className="circulo claro" href="#/tu" aria-label="Volver"><Atras /></a>
        <div className="col"><h1 className="pregunta" style={{ fontSize: 26, margin: 0 }}>Catálogo y parámetros</h1>
          <span className="peq muted">Versión vigente {CATALOGO.version || 'incorporada'}{cambiado ? ' · tienes cambios sin publicar' : ''}</span></div>
      </div>
      <div className="pestanas chips" role="tablist" aria-label="Secciones del catálogo">
        {PESTANAS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className="chip-op" onClick={() => setTab(k)}>{t}</button>)}
      </div>
      {msg && <p className="aviso" role="status" style={{ margin: 0 }}>{msg}</p>}

      {tab === 'productos' && (
        <div className="card">
          <div className="entre"><h2>Productos con datos ZFC</h2>
            <div className="chips"><button type="button" className="chip-op" aria-checked={filtro === 'chile'} role="radio" onClick={() => setFiltro('chile')}>En Chile</button><button type="button" role="radio" className="chip-op" aria-checked={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</button></div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla" style={{ minWidth: 760 }}>
              <thead><tr><th scope="col">Producto</th><th scope="col">En Chile</th><th scope="col">Envase</th><th scope="col">Precio</th><th scope="col">$ por ml o g</th><th scope="col">Revisado</th></tr></thead>
              <tbody>
                {lista.map(({ p, i }) => (
                  <tr key={p.id}>
                    <th scope="row" style={{ color: 'var(--text)' }}>{p.nombre}<span className="dif">{NOMBRE_TIPO[p.tipo]}</span></th>
                    <td><input type="checkbox" aria-label={`${p.nombre} se vende en Chile`} checked={!!p.chile} onChange={(e) => prod(i, { chile: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} /></td>
                    <td><input className="celda" aria-label={`Envase de ${p.nombre}`} value={p.envase || ''} onChange={(e) => prod(i, { envase: e.target.value })} /></td>
                    <td><input className="celda" type="number" aria-label={`Precio de ${p.nombre}`} value={p.precio ?? ''} onChange={(e) => {
                      const precio = e.target.value === '' ? null : Number(e.target.value)
                      const q = cantidadEnvase(p.envase)
                      prod(i, { precio, revision: hoy(), ...(p.precio_ml !== 'hib' && precio && q ? { precio_ml: +(precio / q).toFixed(3) } : {}) })
                    }} /></td>
                    <td>{p.precio_ml === 'hib' ? 'mezcla' : <input className="celda" type="number" step="0.1" aria-label={`Precio por ml de ${p.nombre}`} value={p.precio_ml ?? ''} onChange={(e) => prod(i, { precio_ml: e.target.value === '' ? null : Number(e.target.value), revision: hoy() })} />}</td>
                    <td><input className="celda" type="date" aria-label={`Fecha de revisión de ${p.nombre}`} value={p.revision || ''} onChange={(e) => prod(i, { revision: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="peq muted" style={{ margin: '8px 0 0' }}>Al cambiar el precio se recalcula el precio por ml o g con el número del envase, y la fecha de revisión pasa a hoy. Los datos de desgaste, autonomía y eficiencia vienen de ZFC.</p>
        </div>
      )}

      {tab === 'sin' && (
        <div className="card col" style={{ gap: 10 }}>
          <h2>Productos sin ensayo</h2>
          <p className="peq muted" style={{ margin: 0 }}>Aparecen en el buscador del lubricante actual y se comparan como el típico de su tipo.</p>
          {borrador.sin_ensayo.map((s, i) => (
            <div key={i} className="tramo" style={{ gridTemplateColumns: 'minmax(0,1fr) 170px auto' }}>
              <input className="buscador" aria-label="Nombre" value={s.nombre} onChange={(e) => setBorrador((b) => { const c = copia(b); c.sin_ensayo[i].nombre = e.target.value; return c })} />
              <select className="buscador" aria-label="Tipo" value={s.tipo} onChange={(e) => setBorrador((b) => { const c = copia(b); c.sin_ensayo[i].tipo = e.target.value; return c })}>
                {TIPOS.filter((t) => ['inmersion', 'goteo_cera', 'emulsion', 'humedo'].includes(t)).map((t) => <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>)}
              </select>
              <button type="button" className="enlace peq" onClick={() => setBorrador((b) => { const c = copia(b); c.sin_ensayo.splice(i, 1); return c })}>Quitar</button>
            </div>
          ))}
          <button type="button" className="btn btn-secundario" onClick={() => setBorrador((b) => ({ ...b, sin_ensayo: [...b.sin_ensayo, { nombre: '', tipo: 'humedo' }] }))}>Agregar producto</button>
        </div>
      )}

      {tab === 'grupos' && (
        <div className="card">
          <h2>Grupos de transmisión</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla" style={{ minWidth: 520 }}>
              <thead><tr><th scope="col">Grupo</th><th scope="col">Cadena</th><th scope="col">Cassette</th><th scope="col">r</th></tr></thead>
              <tbody>
                {borrador.grupos.map((g, i) => (
                  <tr key={g.id}>
                    <th scope="row" style={{ color: 'var(--text)' }}>{g.marca} {g.nombre}</th>
                    {['cadena', 'cassette'].map((k) => (
                      <td key={k}><input className="celda" type="number" aria-label={`${k} ${g.nombre}`} value={g[k]} onChange={(e) => setBorrador((b) => { const c = copia(b); c.grupos[i][k] = Number(e.target.value) || 0; c.grupos_revision = hoy(); return c })} /></td>
                    ))}
                    <td>{n1((g.cadena + g.cassette) / (g.cadena || 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="peq muted" style={{ margin: '8px 0 0' }}>r = (cadena + cassette) / cadena. Revisados por última vez el {borrador.grupos_revision || '—'}.</p>
        </div>
      )}

      {tab === 'params' && (
        <>
          <div className="card">
            <h2>Parámetros del modelo</h2>
            <ul className="resto">
              {PARAMS_EDITABLES.map(([k, t, paso]) => (
                <li key={k}><label htmlFor={`p-${k}`}>{t}</label>
                  <input id={`p-${k}`} className="celda" style={{ width: 110 }} type="number" step={paso} value={borrador.params[k] ?? ''} onChange={(e) => param(k, Number(e.target.value))} /></li>
              ))}
              <li><label htmlFor="p-goteo">Consumo por aplicación de goteo (ml)</label>
                <input id="p-goteo" className="celda" style={{ width: 110 }} type="number" step="0.1" value={borrador.params.CONS.goteo_cera}
                  onChange={(e) => { const v = Number(e.target.value); param('CONS', { ...borrador.params.CONS, goteo_cera: v, emulsion: v, humedo_top: v, humedo: v }) }} /></li>
              <li><label htmlFor="p-cera">Consumo por encerado (g)</label>
                <input id="p-cera" className="celda" style={{ width: 110 }} type="number" step="0.5" value={borrador.params.CONS.inmersion}
                  onChange={(e) => param('CONS', { ...borrador.params.CONS, inmersion: Number(e.target.value) })} /></li>
            </ul>
          </div>
          <div className="card">
            <h2>Mezclas e importancias por segmento</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="tabla" style={{ minWidth: 820 }}>
                <thead><tr><th scope="col">Segmento</th>{COND.map((c) => <th key={c} scope="col">{c}</th>)}{CRITERIOS.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(borrador.params.SEG).map(([seg, v]) => (
                    <tr key={seg}>
                      <th scope="row" style={{ color: 'var(--text)' }}>{NOMBRE_SEGMENTO[seg] || seg}</th>
                      {COND.map((c) => <td key={c}><input className="celda" type="number" step="0.05" min="0" max="1" aria-label={`${seg} ${c}`} value={v.mix[c]}
                        onChange={(e) => setBorrador((b) => { const x = copia(b); x.params.SEG[seg].mix[c] = Number(e.target.value); return x })} /></td>)}
                      {v.imp.map((n, j) => <td key={j}><input className="celda" type="number" min="1" max="9" aria-label={`${seg} ${CRITERIOS[j]}`} value={n}
                        onChange={(e) => setBorrador((b) => { const x = copia(b); x.params.SEG[seg].imp[j] = Number(e.target.value); return x })} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="peq muted" style={{ margin: '8px 0 0' }}>La mezcla de cada segmento debe sumar 1. Las importancias van de 1 a 9.</p>
          </div>
        </>
      )}

      {tab === 'publicar' && (
        <div className="card col" style={{ gap: 10 }}>
          <h2>Cómo cambian los ganadores</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla" style={{ minWidth: 520 }}>
              <thead><tr><th scope="col">Segmento</th><th scope="col">Sin sacar la cadena</th><th scope="col">Sacando la cadena</th></tr></thead>
              <tbody>
                {Object.keys(despues || {}).map((seg) => (
                  <tr key={seg}>
                    <th scope="row" style={{ color: 'var(--text)' }}>{NOMBRE_SEGMENTO[seg] || seg}</th>
                    {['sin', 'con'].map((k) => {
                      const cambia = antes?.[seg]?.[k] !== despues[seg][k]
                      return <td key={k} className={cambia ? 'cambio-ganador' : ''}>{despues[seg][k]}{cambia && <span className="dif">antes: {antes?.[seg]?.[k] || '—'}</span>}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!cambiado && <p className="peq muted" style={{ margin: 0 }}>No hay cambios respecto de la versión vigente.</p>}
          <label className="col" htmlFor="pub-nota" style={{ gap: 6 }}>
            <span className="etiqueta">Nota de la versión (opcional)</span>
            <input id="pub-nota" className="buscador" placeholder="Precios revisados en enero" value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
          <div className="pie" style={{ paddingTop: 0 }}>
            <button type="button" className="btn btn-secundario" disabled={!cambiado} onClick={() => setBorrador(copia(CATALOGO))}>Descartar cambios</button>
            <button type="button" className="btn btn-primario" disabled={!cambiado || ocupado} onClick={publicar}>{ocupado ? 'Publicando…' : 'Publicar versión'}</button>
          </div>
        </div>
      )}

      {tab === 'versiones' && (
        <div className="card">
          <h2>Versiones publicadas</h2>
          {versiones.length === 0 && <p className="peq muted">Todavía no publicas ninguna: la app usa el catálogo incorporado (cat-2026-10).</p>}
          <ul className="resto">
            {versiones.map((v, i) => (
              <li key={v.id}>
                <span>{v.nombre}<span className="dif">{new Date(v.creado).toLocaleDateString('es-CL')}{v.nota ? ` · ${v.nota}` : ''}</span></span>
                {i === 0 ? <strong>Vigente</strong> : <button type="button" className="enlace peq" disabled={ocupado} onClick={() => restaurar(v)}>Volver a esta</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'avisos' && (
        <>
          <div className="card">
            <h2>Precios sin revisar hace más de 3 meses</h2>
            {viejos.length === 0 ? <p className="peq muted">Todos los precios están al día.</p> : (
              <ul className="resto">{viejos.map((p) => <li key={p.id}><span>{p.nombre}</span><strong>{p.revision || 'sin fecha'} · {p.precio ? clp(p.precio) : '—'}</strong></li>)}</ul>
            )}
          </div>
          <div className="card">
            <h2>Lubricantes que la gente busca y no están</h2>
            {conteo.length === 0 ? <p className="peq muted">Nadie ha buscado un lubricante que falte.</p> : (
              <ul className="resto">{conteo.map(([t, n]) => <li key={t}><span>{t}</span><strong>{n0(n)} {n === 1 ? 'vez' : 'veces'}</strong></li>)}</ul>
            )}
          </div>
          <div className="card col" style={{ gap: 6 }}>
            <h2>Calibración de K con las mediciones</h2>
            {kSugerido && kSugerido.n > 0 ? (
              <>
                <p className="peq muted" style={{ margin: 0 }}>Con {n0(kSugerido.n)} mediciones de {n0(kSugerido.cadenas)} cadenas, el K que mejor las explica es {n1(kSugerido.K)} (el vigente es {n1(borrador.params.K)}).</p>
                <button type="button" className="btn btn-secundario" onClick={() => { param('K', +kSugerido.K.toFixed(2)); setTab('publicar') }}>Usar K = {n1(kSugerido.K)} y revisar</button>
              </>
            ) : <p className="peq muted" style={{ margin: 0 }}>Todavía no hay mediciones de cadena de los usuarios.</p>}
          </div>
        </>
      )}
    </main>
  )
}
