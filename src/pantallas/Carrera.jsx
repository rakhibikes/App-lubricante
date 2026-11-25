import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PRODUCTOS, buscarProducto, NOMBRE_TIPO, esCeraSilca, superSecretRecomendado } from '../lib/motor.js'
import { simular, CONDICIONES, NO_RECARGABLE, reglaDeBolsillo, fraccionUmbral, condicion, conClima, COLUMNAS_REGLA } from '../lib/carrera.js'
import { estadoCadena, factorPropio, medicionesDe } from '../lib/cadena.js'
import { leerGpx } from '../lib/gpx.js'
import { sugerirTerreno } from '../lib/terreno.js'
import { n0, n1, pct } from '../lib/formato.js'
import { Atras } from '../ui/iconos.jsx'

const COLOR = { seca: '#E2A877', ruta_mojada: '#8FB3CF', gravel: '#C46A3C', gravel_mojado: '#3E6A8A', barro: '#5A2A16' }
const color = (k) => COLOR[k] || COLOR.gravel
// Al cortar un tramo, el nuevo parte con la condición que más suele seguir a la actual.
const SIGUIENTE = { seca: 'ruta_mojada', ruta_mojada: 'seca', gravel: 'gravel_mojado', gravel_mojado: 'barro', barro: 'gravel' }
const ORIGEN = { osm: 'OpenStreetMap', inferido: 'Deducido del tipo de camino', sin_dato: 'Sin dato: revísalo', manual: 'Elegido por ti' }
const COLOR_ESTR = ['var(--accent)', 'var(--accent-deep)', 'var(--muted)']
const COLOR_ESTR_HEX = ['#C46A3C', '#8E3F1E', '#5B6168']
const idPorNombre = (n) => PRODUCTOS.find((p) => p.nombre === n)?.id
const chile = () => PRODUCTOS.filter((p) => p.chile)
const nombreCorto = (p) => p?.nombre.replace('Silca Hot Melt + Endurance Chip', 'Hot Melt + Chip') || ''

function estrategiasIniciales(perfil) {
  const chip = idPorNombre('Silca Hot Melt + Endurance Chip')
  const effetto = idPorNombre('Effetto Mariposa Flower Power')
  const ss = superSecretRecomendado()?.id
  const lista = []
  if (chip !== undefined) lista.push({ inicio: chip, respaldo: ss ?? effetto ?? null })
  if (effetto !== undefined) lista.push({ inicio: effetto, respaldo: null })
  const actual = perfil?.actual?.id
  if (actual !== undefined && actual !== null && !lista.some((e) => String(e.inicio) === String(actual))) lista.push({ inicio: actual, respaldo: null })
  return lista.slice(0, 3)
}

// ---------- Mapa ----------
function Mapa({ puntos, tramos, paradas, controles }) {
  const div = useRef(null)
  const mapa = useRef(null)
  const capa = useRef(null)
  useEffect(() => {
    if (!div.current || mapa.current) return
    mapa.current = L.map(div.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(mapa.current)
    capa.current = L.layerGroup().addTo(mapa.current)
    return () => { mapa.current?.remove(); mapa.current = null }
  }, [])
  useEffect(() => {
    if (!mapa.current || !puntos?.length) return
    const g = capa.current
    g.clearLayers()
    let acc = 0
    const limites = tramos.map((t) => { const a = acc; acc += Number(t.km) || 0; return { a, b: acc, cond: t.cond } })
    for (const lim of limites) {
      const seg = puntos.filter((p) => p[3] >= lim.a - 0.01 && p[3] <= lim.b + 0.01).map((p) => [p[0], p[1]])
      if (seg.length > 1) L.polyline(seg, { color: color(lim.cond), weight: 5, opacity: 0.95 }).addTo(g)
    }
    const enKm = (k) => puntos.reduce((m, p) => (Math.abs(p[3] - k) < Math.abs(m[3] - k) ? p : m), puntos[0])
    for (const c of controles) {
      const p = enKm(c)
      L.circleMarker([p[0], p[1]], { radius: 6, color: '#111214', weight: 2, fillColor: '#FFFFFF', fillOpacity: 1 }).bindTooltip(`Control · km ${n0(c)}`).addTo(g)
    }
    for (const s of paradas) {
      const p = enKm(s.km)
      L.circleMarker([p[0], p[1]], { radius: 8, color: '#FFFFFF', weight: 2, fillColor: '#8E3F1E', fillOpacity: 1 }).bindTooltip(`Re-aplicar · km ${n0(s.km)}`).addTo(g)
    }
    L.circleMarker([puntos[0][0], puntos[0][1]], { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#111214', fillOpacity: 1 }).bindTooltip('Partida').addTo(g)
    mapa.current.fitBounds(L.latLngBounds(puntos.map((p) => [p[0], p[1]])), { padding: [16, 16] })
  }, [puntos, tramos, paradas, controles])
  return <div ref={div} className="mapa" role="img" aria-label="Mapa de la ruta con los tramos por condición, los puntos de control y las paradas para re-aplicar" />
}

// ---------- Perfil de altura con tramos ----------
function PerfilRuta({ puntos, total, tramos, paradas, controles, onCortar }) {
  const W = 340
  const H = 120
  const pad = { l: 6, r: 6, t: 8, b: 30 }
  const eles = (puntos || []).map((p) => p[2]).filter((e) => e !== null)
  const emin = eles.length ? Math.min(...eles) : 0
  const emax = eles.length ? Math.max(...eles) : 1
  const x = (k) => pad.l + (k / total) * (W - pad.l - pad.r)
  const y = (e) => pad.t + (1 - (e - emin) / (emax - emin || 1)) * (H - pad.t - pad.b - 12)
  let acc = 0
  const bandas = tramos.map((t) => { const a = acc; acc += Number(t.km) || 0; return { a, b: acc, cond: t.cond } })
  const clic = (e) => {
    if (!onCortar) return
    const r = e.currentTarget.getBoundingClientRect()
    const k = ((e.clientX - r.left) / r.width * W - pad.l) / (W - pad.l - pad.r) * total
    if (k > 0 && k < total) onCortar(Math.round(k))
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" onClick={clic} style={{ cursor: onCortar ? 'crosshair' : 'default' }}
      role="img" aria-label={`Perfil de la ruta de ${n0(total)} km con ${tramos.length} tramos. Toca para cortar un tramo.`}>
      {eles.length > 1 && <polygon points={`${x(0)},${H - pad.b - 8} ${puntos.filter((p) => p[2] !== null).map((p) => `${x(p[3])},${y(p[2])}`).join(' ')} ${x(total)},${H - pad.b - 8}`} fill="var(--pill)" stroke="var(--ring)" />}
      {bandas.map((b, i) => <rect key={i} x={x(b.a)} y={H - pad.b - 6} width={Math.max(1, x(b.b) - x(b.a) - 1)} height="8" rx="3" fill={color(b.cond)} />)}
      {controles.map((c) => <line key={`c${c}`} x1={x(c)} x2={x(c)} y1={pad.t} y2={H - pad.b} stroke="var(--text)" strokeDasharray="2 3" />)}
      {paradas.map((s, i) => <circle key={i} cx={x(s.km)} cy={H - pad.b - 2} r="5" fill="var(--accent-deep)" stroke="var(--card)" strokeWidth="2" />)}
      <text x={pad.l} y={H - 8} fontSize="10" fill="var(--muted)">0</text>
      <text x={W - pad.r} y={H - 8} fontSize="10" textAnchor="end" fill="var(--muted)">{n0(total)} km</text>
      {eles.length > 1 && <text x={pad.l + 2} y={pad.t + 8} fontSize="10" fill="var(--muted)">{n0(emax)} m</text>}
    </svg>
  )
}

// ---------- Curva de confiabilidad ----------
function Curva({ sims, tramos, total }) {
  const W = 340
  const H = 180
  const pad = { l: 34, r: 8, t: 10, b: 26 }
  const x = (k) => pad.l + (k / total) * (W - pad.l - pad.r)
  const y = (r) => pad.t + (1 - r) * (H - pad.t - pad.b)
  let acc = 0
  const bandas = tramos.map((t) => { const a = acc; acc += Number(t.km) || 0; return { a, b: acc, cond: t.cond } })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Confiabilidad de la lubricación por km para ${sims.length} estrategias.`}>
      {bandas.map((b, i) => <rect key={i} x={x(b.a)} y={pad.t} width={Math.max(1, x(b.b) - x(b.a))} height={H - pad.t - pad.b} fill={color(b.cond)} opacity="0.12" />)}
      {[0, 0.5, 1].map((r) => (
        <g key={r}><line x1={pad.l} x2={W - pad.r} y1={y(r)} y2={y(r)} stroke="var(--line)" /><text x={pad.l - 4} y={y(r) + 3} fontSize="10" textAnchor="end" fill="var(--muted)">{n0(r * 100)} %</text></g>
      ))}
      {sims.map((s, i) => s && (
        <polyline key={i} fill="none" stroke={COLOR_ESTR[i]} strokeWidth={i === 0 ? 2.5 : 2} strokeDasharray={i === 2 ? '5 4' : undefined}
          points={s.curva.filter((_, j) => j % 3 === 0 || j === s.curva.length - 1).map((c) => `${x(c.km)},${y(c.R)}`).join(' ')} />
      ))}
      <text x={pad.l} y={H - 8} fontSize="10" fill="var(--muted)">0 km</text>
      <text x={W - pad.r} y={H - 8} fontSize="10" textAnchor="end" fill="var(--muted)">{n0(total)} km</text>
    </svg>
  )
}

function SelectorProducto({ id, valor, onChange, soloRecargables, vacio }) {
  const lista = chile().filter((p) => !soloRecargables || !NO_RECARGABLE.has(p.tipo)).sort((a, b) => a.nombre.localeCompare(b.nombre))
  return (
    <select id={id} className="buscador" value={valor ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
      {vacio && <option value="">{vacio}</option>}
      {lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  )
}

export default function Carrera({ carrera, perfil, datos, bd, onGuardada, onBorrar }) {
  const [c, setC] = useState(() => ({
    nombre: '', fecha: '', tramos: [{ km: 120, cond: 'seca' }, { km: 300, cond: 'gravel' }, { km: 50, cond: 'barro' }, { km: 130, cond: 'gravel' }],
    // El clima no se guarda: se deduce de los tramos.
    clima: (carrera?.tramos || []).some((t) => t.cond === 'ruta_mojada' || t.cond === 'gravel_mojado') ? 'mojado' : 'seco',
    modo: 'libre', controles: [], estrategias: estrategiasIniciales(perfil), potencia: 180, velocidad: 20, ruta: null, gpx_path: null, bici_id: bd.bicis[0]?.id || null,
    ...carrera,
  }))
  const [archivo, setArchivo] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [nuevoControl, setNuevoControl] = useState('')
  const [terreno, setTerreno] = useState(null) // { progreso } mientras consulta
  const [avisoTerreno, setAvisoTerreno] = useState('')
  const set = (cambios) => setC((x) => ({ ...x, ...cambios }))

  const total = c.ruta?.total || c.tramos.reduce((a, t) => a + (Number(t.km) || 0), 0)
  const sumaTramos = c.tramos.reduce((a, t) => a + (Number(t.km) || 0), 0)
  const tramosOk = Math.abs(sumaTramos - total) < 0.5

  // Estado de la cadena, si la persona usa el módulo 6.
  const bici = bd.bicis.find((b) => b.id === c.bici_id)
  const cadena = bici && bd.cadenas.filter((x) => x.bici_id === bici.id && (x.retirada_odo === null || x.retirada_odo === undefined)).slice(-1)[0]
  const factor = useMemo(() => factorPropio(medicionesDe(bd.cadenas, bd.eventos, perfil, bd.bicis)), [bd, perfil])
  const estado = useMemo(() => (cadena ? estadoCadena({ cadena, eventos: bd.eventos, perfil, bici, K: factor.K }) : null), [cadena, bd.eventos, perfil, bici, factor.K])

  const sims = useMemo(() => (tramosOk ? c.estrategias.map((e) => simular({ tramos: c.tramos, modo: c.modo, controles: c.controles, estrategia: e, potencia: c.potencia, velocidad: c.velocidad, K: factor.K })) : []),
    [c.tramos, c.modo, c.controles, c.estrategias, c.potencia, c.velocidad, factor.K, tramosOk])

  // La mejor combinación disponible en Chile: más confiable y, a igualdad, con menos paradas.
  const mejor = useMemo(() => {
    if (!tramosOk) return null
    let m = null
    for (const ini of chile()) {
      for (const resp of [null, ...chile().filter((p) => !NO_RECARGABLE.has(p.tipo))]) {
        if (resp && String(resp.id) === String(ini.id)) continue
        const s = simular({ tramos: c.tramos, modo: c.modo, controles: c.controles, estrategia: { inicio: ini.id, respaldo: resp?.id ?? null }, potencia: c.potencia, velocidad: c.velocidad, K: factor.K })
        if (!s) continue
        const puntaje = s.Rfinal - s.paradas.length * 0.004
        if (!m || puntaje > m.puntaje) m = { puntaje, s, estrategia: { inicio: ini.id, respaldo: resp?.id ?? null } }
      }
    }
    return m
  }, [c.tramos, c.modo, c.controles, c.potencia, c.velocidad, factor.K, tramosOk])

  async function cargarGpx(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setError('')
    try {
      const g = leerGpx(await f.text())
      setArchivo(f)
      set({
        ruta: { total: g.total, puntos: g.puntos, subida: g.subida },
        nombre: c.nombre || g.nombre,
        tramos: [{ km: g.total, cond: 'gravel' }],
        controles: g.controles.map((x) => x.km),
        modo: g.controles.length ? 'control' : c.modo,
      })
      setAviso(g.controles.length ? `Se leyeron ${g.controles.length} puntos de control del GPX.` : '')
      await sugerir(g.puntos, g.total, g.controles.length ? `Se leyeron ${g.controles.length} puntos de control del GPX. ` : '')
    } catch (err) { setError(err.message) }
  }

  // Terreno sugerido con los caminos de OpenStreetMap; cada tramo queda editable.
  async function sugerir(puntos = c.ruta?.puntos, total = c.ruta?.total, prefijo = '') {
    if (!puntos?.length) return
    setTerreno({ progreso: 0 })
    setError('')
    try {
      const r = await sugerirTerreno(puntos, total, { alProgresar: (p) => setTerreno({ progreso: p }) })
      // OpenStreetMap da la superficie; el clima lo define la persona.
      if (r.tramos.length) set({ tramos: r.tramos.map((t) => ({ ...t, cond: conClima(t.cond, c.clima) })) })
      const { osm, inferido, sinDato, errores, primerError } = r.resumen
      if (osm + inferido < 1 && errores) throw new Error(`${primerError || 'el servidor de mapas no respondió'}. Intenta de nuevo en unos minutos`)
      if (prefijo) setAviso(prefijo.trim())
      setAvisoTerreno(`Terreno sugerido: ${n0(osm)} km con la superficie de OpenStreetMap, ${n0(inferido)} km deducidos del tipo de camino${sinDato >= 1 ? ` y ${n0(sinDato)} km sin dato, que quedaron como gravel${c.clima === 'mojado' ? ' mojado' : ' seco'}` : ''}${errores ? ` (algunas partes se consultaron por otra vía; detalle técnico: ${primerError})` : ''}. El mapa no sabe si va a llover: elige el clima de la ruta y marca a mano los tramos de clima extremo. Revisa y cambia lo que no corresponda.`)
    } catch (err) {
      if (prefijo) setAviso(prefijo.trim())
      setAvisoTerreno(`No se pudo consultar OpenStreetMap (${err.message}). Marca los tramos a mano tocando el perfil.`)
    }
    setTerreno(null)
  }

  const cortar = (k) => {
    let acc = 0
    const nuevos = []
    for (const t of c.tramos) {
      const a = acc
      acc += Number(t.km) || 0
      if (k > a + 0.5 && k < acc - 0.5) nuevos.push({ ...t, km: +(k - a).toFixed(1) }, { km: +(acc - k).toFixed(1), cond: SIGUIENTE[t.cond] || 'gravel', fuente: 'manual' })
      else nuevos.push(t)
    }
    set({ tramos: nuevos })
  }
  const unirConSiguiente = (i) => {
    const t = [...c.tramos]
    t[i] = { ...t[i], km: +((Number(t[i].km) || 0) + (Number(t[i + 1].km) || 0)).toFixed(1), fuente: 'manual', detalle: undefined }
    t.splice(i + 1, 1)
    set({ tramos: t })
  }

  async function guardar() {
    if (!c.nombre.trim()) { setError('Ponle nombre a la carrera.'); return }
    setGuardando(true)
    setError('')
    try {
      let gpx_path = c.gpx_path
      if (archivo) {
        try { gpx_path = await datos.subirGpx(archivo) } catch (err) { setAviso(`La ruta quedó guardada, pero el archivo GPX no se pudo subir (${err.message}).`) }
      }
      const s0 = sims[0]
      const plan = s0 ? { Rfinal: s0.Rfinal, paradas: s0.paradas.map((p) => ({ km: Math.round(p.km), producto: p.producto.nombre })), ml: s0.ml } : null
      const g = await datos.guardarCarrera({
        id: c.id, nombre: c.nombre.trim(), fecha: c.fecha || null, distancia: +total.toFixed(1), tramos: c.tramos, modo: c.modo,
        controles: c.controles, estrategias: c.estrategias, potencia: c.potencia, velocidad: c.velocidad, ruta: c.ruta, gpx_path, bici_id: c.bici_id || null, plan,
      })
      setC((x) => ({ ...x, id: g.id, gpx_path }))
      setArchivo(null)
      await onGuardada(g)
      setAviso((a) => a || 'Carrera guardada.')
    } catch (err) { setError(`No se pudo guardar: ${err.message}`) }
    setGuardando(false)
  }

  const s0 = sims[0]
  const productosUsados = [...new Map(c.estrategias.flatMap((e) => [e.inicio, e.respaldo]).filter((x) => x !== null && x !== undefined).map((id) => [String(id), buscarProducto(id)])).values()].filter(Boolean)
  const desgasteTras = estado && s0 ? estado.E + s0.desgaste : null
  const cambiarAntes = estado && s0 ? desgasteTras > estado.tStar : false

  return (
    <main className="app">
      <section className="hero tx-naranja no-imprimir" style={{ minHeight: 220 }}>
        <div className="hero-top">
          <a className="circulo" href="#/carreras" aria-label="Volver a tus carreras"><Atras /></a>
          <span className="chip">{n0(total)} km · {c.tramos.length} tramo{c.tramos.length === 1 ? '' : 's'}</span>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <span className="sub">{c.nombre || 'Nueva carrera'}</span>
          {s0 ? <h1 style={{ fontSize: 34 }}>{n0(s0.Rfinal * 100)} % de llegar lubricado</h1> : <h1 style={{ fontSize: 30 }}>Arma tu plan</h1>}
          {s0 && <p>{nombreCorto(s0.inicio)}{s0.respaldo ? ` con ${nombreCorto(s0.respaldo)} de respaldo` : ''} · {s0.paradas.length ? `${s0.paradas.length} parada${s0.paradas.length > 1 ? 's' : ''}` : 'sin paradas'}</p>}
        </div>
      </section>

      <div className="card col no-imprimir" style={{ gap: 12 }}>
        <h2>La carrera</h2>
        <label className="col" htmlFor="ca-nombre" style={{ gap: 6 }}>
          <span className="etiqueta">Nombre</span>
          <input id="ca-nombre" className="buscador" value={c.nombre} placeholder="Ultra gravel de 600 km" onChange={(e) => set({ nombre: e.target.value })} />
        </label>
        <div className="podio">
          <label className="col peq" htmlFor="ca-fecha" style={{ gap: 6 }}>
            <span className="muted">Fecha</span>
            <input id="ca-fecha" className="buscador" type="date" value={c.fecha || ''} onChange={(e) => set({ fecha: e.target.value })} />
          </label>
          <label className="col peq" htmlFor="ca-gpx" style={{ gap: 6 }}>
            <span className="muted">Archivo GPX</span>
            <input id="ca-gpx" className="buscador archivo" type="file" accept=".gpx,application/gpx+xml" onChange={cargarGpx} />
          </label>
        </div>
        {c.ruta && <p className="peq muted" style={{ margin: 0 }}>Ruta de {n1(c.ruta.total)} km{c.ruta.subida ? ` y ${n0(c.ruta.subida)} m de subida` : ''}{c.gpx_path ? ' · GPX guardado en tu cuenta' : ''}.</p>}
        {c.ruta?.puntos?.length > 1 && <Mapa puntos={c.ruta.puntos} tramos={c.tramos} paradas={s0?.paradas || []} controles={c.controles} />}
        {c.ruta?.puntos?.length > 1 && (
          <PerfilRuta puntos={c.ruta.puntos} total={total} tramos={c.tramos} paradas={s0?.paradas || []} controles={c.controles} onCortar={cortar} />
        )}
        <div className="leyenda-cond peq">
          {Object.entries(CONDICIONES).map(([k, v]) => <span key={k}><i style={{ background: color(k) }} />{v.corto}</span>)}
        </div>
      </div>

      <div className="card col no-imprimir" style={{ gap: 10 }}>
        <div className="entre"><h2>Tramos</h2><span className={`peq ${tramosOk ? 'muted' : ''}`} style={tramosOk ? null : { color: 'var(--tint-text)' }}>{n1(sumaTramos)} de {n1(total)} km</span></div>
        <div className="col" style={{ gap: 4 }}>
          <span className="peq muted" id="ca-clima-t">Clima de la ruta</span>
          <div className="chips" role="radiogroup" aria-labelledby="ca-clima-t">
            {[['seco', 'Seco'], ['mojado', 'Mojado']].map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={(c.clima || 'seco') === k} className="chip-op"
                onClick={() => set({ clima: k, tramos: c.tramos.map((x) => ({ ...x, cond: conClima(x.cond, k) })) })}>{t}</button>
            ))}
          </div>
          <span className="peq muted">Cambia todos los tramos de ruta y gravel a su versión {(c.clima || 'seco') === 'seco' ? 'mojada' : 'seca'}. Los de clima extremo no cambian; cada tramo se puede ajustar a mano.</span>
        </div>
        {c.tramos.map((t, i) => (
          <div key={i} className="tramo-fila">
          <div className="tramo">
            <span className="punto" style={{ background: color(t.cond) }} aria-hidden="true" />
            <label className="oculto" htmlFor={`t-km-${i}`}>Km del tramo {i + 1}</label>
            <input id={`t-km-${i}`} className="buscador" type="number" inputMode="decimal" min="0" step="0.1" value={t.km}
              onChange={(e) => { const tr = [...c.tramos]; tr[i] = { ...t, km: e.target.value === '' ? '' : Number(e.target.value) }; set({ tramos: tr, ...(c.ruta ? {} : {}) }) }} />
            <label className="oculto" htmlFor={`t-c-${i}`}>Condición del tramo {i + 1}</label>
            <select id={`t-c-${i}`} className="buscador" value={t.cond} onChange={(e) => { const tr = [...c.tramos]; tr[i] = { ...t, cond: e.target.value, ...(t.fuente ? { fuente: 'manual', detalle: undefined } : {}) }; set({ tramos: tr }) }}>
              {Object.entries(CONDICIONES).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
            </select>
            {c.tramos.length > 1 && (i < c.tramos.length - 1
              ? <button type="button" className="enlace peq" onClick={() => unirConSiguiente(i)} aria-label={`Unir el tramo ${i + 1} con el siguiente`}>Unir</button>
              : <button type="button" className="enlace peq" onClick={() => set({ tramos: c.tramos.slice(0, -1) })} aria-label="Quitar el último tramo">Quitar</button>)}
          </div>
          {t.fuente && (
            <span className={`origen ${t.fuente === 'sin_dato' ? 'revisar' : ''}`}>
              {ORIGEN[t.fuente]}{t.detalle && t.fuente !== 'sin_dato' && t.fuente !== 'manual' ? ` · ${t.detalle}` : ''}
            </span>
          )}
          </div>
        ))}
        {!c.ruta && <button type="button" className="btn btn-secundario" onClick={() => set({ tramos: [...c.tramos, { km: 50, cond: 'gravel' }] })}>Agregar tramo</button>}
        {c.ruta && !tramosOk && <button type="button" className="btn btn-secundario" onClick={() => { const tr = [...c.tramos]; tr[tr.length - 1] = { ...tr[tr.length - 1], km: +((Number(tr[tr.length - 1].km) || 0) + total - sumaTramos).toFixed(1) }; set({ tramos: tr }) }}>Ajustar el último tramo al total</button>}
        {avisoTerreno && <p className="aviso" role="status" style={{ margin: 0 }}>{avisoTerreno}</p>}
        {c.ruta?.puntos?.length > 1 && (
          <button type="button" className="btn btn-secundario" disabled={!!terreno} onClick={() => sugerir()}>
            {terreno ? `Consultando OpenStreetMap… ${n0(terreno.progreso * 100)} %` : 'Sugerir terreno con OpenStreetMap'}
          </button>
        )}
        {c.ruta && <p className="peq muted" style={{ margin: 0 }}>Toca el perfil de altura donde cambia la condición para cortar un tramo. Superficie de caminos: © colaboradores de OpenStreetMap.</p>}
      </div>

      <div className="card col no-imprimir" style={{ gap: 10 }}>
        <h2>Dónde puedes re-aplicar</h2>
        <div className="chips" role="radiogroup" aria-label="Dónde puedes re-aplicar">
          <button type="button" role="radio" aria-checked={c.modo === 'libre'} className="chip-op" onClick={() => set({ modo: 'libre' })}>En cualquier punto</button>
          <button type="button" role="radio" aria-checked={c.modo === 'control'} className="chip-op" onClick={() => set({ modo: 'control' })}>Solo en puntos de control</button>
        </div>
        {c.modo === 'control' && (
          <>
            <div className="chips">
              {c.controles.map((k) => <button key={k} type="button" className="chip-op" onClick={() => set({ controles: c.controles.filter((x) => x !== k) })} aria-label={`Quitar control del km ${k}`}>km {n0(k)} ×</button>)}
            </div>
            <form className="fila" onSubmit={(e) => { e.preventDefault(); const k = Number(nuevoControl); if (k > 0 && k < total && !c.controles.includes(k)) set({ controles: [...c.controles, k].sort((a, b) => a - b) }); setNuevoControl('') }}>
              <label className="oculto" htmlFor="ca-ctrl">Km del punto de control</label>
              <input id="ca-ctrl" className="buscador" type="number" inputMode="numeric" placeholder="Km del punto de control" value={nuevoControl} onChange={(e) => setNuevoControl(e.target.value)} />
              <button type="submit" className="btn btn-secundario">Agregar</button>
            </form>
          </>
        )}
      </div>

      <div className="card col no-imprimir" style={{ gap: 12 }}>
        <h2>Estrategias</h2>
        {c.estrategias.map((e, i) => (
          <div key={i} className="estrategia" style={{ borderColor: COLOR_ESTR_HEX[i] }}>
            <div className="entre"><span className="etiqueta" style={{ color: COLOR_ESTR_HEX[i] }}>Estrategia {i + 1}</span>
              {c.estrategias.length > 1 && <button type="button" className="enlace peq" onClick={() => set({ estrategias: c.estrategias.filter((_, j) => j !== i) })}>Quitar</button>}</div>
            <label className="col peq" htmlFor={`e-ini-${i}`} style={{ gap: 4 }}>
              <span className="muted">Partir con</span>
              <SelectorProducto id={`e-ini-${i}`} valor={e.inicio} onChange={(v) => {
                const es = [...c.estrategias]
                const nuevo = buscarProducto(v ?? e.inicio)
                // Con cera Silca, el respaldo lógico es Super Secret (Silca los recomienda juntos).
                es[i] = { ...e, inicio: v ?? e.inicio, ...(esCeraSilca(nuevo) ? { respaldo: superSecretRecomendado()?.id ?? e.respaldo } : {}) }
                set({ estrategias: es })
              }} />
              {esCeraSilca(buscarProducto(e.inicio)) && <span className="peq muted">En carrera, Silca recomienda re-aplicar Super Secret sobre su cera.</span>}
            </label>
            <label className="col peq" htmlFor={`e-res-${i}`} style={{ gap: 4 }}>
              <span className="muted">Re-aplicar con</span>
              <SelectorProducto id={`e-res-${i}`} soloRecargables valor={e.respaldo} vacio={NO_RECARGABLE.has(buscarProducto(e.inicio)?.tipo) ? 'Sin respaldo (no se re-encera en carrera)' : 'El mismo de partida'}
                onChange={(v) => { const es = [...c.estrategias]; es[i] = { ...e, respaldo: v }; set({ estrategias: es }) }} />
            </label>
          </div>
        ))}
        {c.estrategias.length < 3 && <button type="button" className="btn btn-secundario" onClick={() => set({ estrategias: [...c.estrategias, { inicio: idPorNombre('Mspeedwax') ?? chile()[0].id, respaldo: idPorNombre('Effetto Mariposa Flower Power') ?? null }] })}>Agregar estrategia</button>}
        {mejor && !c.estrategias.some((e) => String(e.inicio) === String(mejor.estrategia.inicio) && String(e.respaldo ?? '') === String(mejor.estrategia.respaldo ?? '')) && (
          <div className="aviso">
            La mejor opción en Chile para esta ruta es partir con <strong>{mejor.s.inicio.nombre}</strong>{mejor.s.respaldo ? <> y llevar <strong>{mejor.s.respaldo.nombre}</strong></> : ''}: {n0(mejor.s.Rfinal * 100)} % con {mejor.s.paradas.length} parada{mejor.s.paradas.length === 1 ? '' : 's'}.
            {' '}<button type="button" className="enlace" onClick={() => set({ estrategias: [mejor.estrategia, ...c.estrategias].slice(0, 3) })}>Usarla</button>
          </div>
        )}
        <div className="podio">
          <label className="col peq" htmlFor="ca-pot" style={{ gap: 4 }}><span className="muted">Potencia esperada (W)</span>
            <input id="ca-pot" className="buscador" type="number" inputMode="numeric" min="50" max="500" value={c.potencia} onChange={(e) => set({ potencia: Number(e.target.value) || 180 })} /></label>
          <label className="col peq" htmlFor="ca-vel" style={{ gap: 4 }}><span className="muted">Velocidad media (km/h)</span>
            <input id="ca-vel" className="buscador" type="number" inputMode="decimal" min="5" max="50" value={c.velocidad} onChange={(e) => set({ velocidad: Number(e.target.value) || 20 })} /></label>
        </div>
      </div>

      {tramosOk && sims.length > 0 && (
        <>
          <div className="card col no-imprimir" style={{ gap: 8 }}>
            <h2>Confiabilidad por km</h2>
            <Curva sims={sims} tramos={c.tramos} total={total} />
            <p className="peq muted" style={{ margin: 0 }}>Probabilidad de seguir con la cadena lubricada. Se re-aplica antes de bajar de 98 % por aplicación, al {pct(fraccionUmbral())} de la autonomía del producto.</p>
          </div>
          {sims.map((s, i) => s && (
            <div key={i} className="card col no-imprimir" style={{ gap: 6, borderLeft: `4px solid ${COLOR_ESTR_HEX[i]}` }}>
              <div className="entre"><h3>{nombreCorto(s.inicio)}{s.respaldo ? ` + ${nombreCorto(s.respaldo)}` : ''}</h3><strong className="numero">{n0(s.Rfinal * 100)} %</strong></div>
              <ul className="resto">
                <li><span>Sin re-aplicar</span><strong>{n0(s.Rsin * 100)} %</strong></li>
                <li><span>Paradas</span><strong style={{ textAlign: 'right' }}>{s.paradas.length ? s.paradas.map((p) => `km ${n0(p.km)}`).join(', ') : 'Ninguna'}</strong></li>
                {s.paradas.length > 0 && <li><span>Lubricante a llevar</span><strong>{n1(s.ml)} ml de {s.recarga.nombre}</strong></li>}
                <li><span>Desgaste de cadena en la carrera</span><strong>{pct(s.desgaste)} del límite</strong></li>
                <li><span>Tiempo esperado con la cadena seca</span><strong>{s.minPerdidos < 1 ? 'menos de 1 min' : `${n0(s.minPerdidos)} min`}</strong></li>
              </ul>
            </div>
          ))}

          {s0 && s0.paradas.length > 0 && (
            <div className="card no-imprimir">
              <h2>Plan de paradas</h2>
              <ul className="resto">
                {s0.paradas.map((p, i) => <li key={i}><span>km {n0(p.km)} · antes de {condicion(p.cond).corto.toLowerCase()}</span><strong>{p.producto.nombre}</strong></li>)}
              </ul>
            </div>
          )}

          <div className="card no-imprimir">
            <h2>Regla de bolsillo</h2>
            <p className="peq muted" style={{ margin: '0 0 6px' }}>Km entre aplicaciones para mantener 98 %.</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="tabla">
                <thead><tr><th scope="col">Producto</th>{COLUMNAS_REGLA.map((x) => <th key={x.sal} scope="col">{x.nombre}</th>)}</tr></thead>
                <tbody>
                  {productosUsados.map((p) => { const r = reglaDeBolsillo(p); return <tr key={p.id}><th scope="row" style={{ color: 'var(--text)' }}>{p.nombre}</th>{COLUMNAS_REGLA.map((x) => <td key={x.sal}>{n0(r[x.sal])}</td>)}</tr> })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card col no-imprimir" style={{ gap: 8 }}>
            <h2>Tu cadena</h2>
            {bd.bicis.length > 0 ? (
              <>
                <label className="oculto" htmlFor="ca-bici">Bicicleta</label>
                <select id="ca-bici" className="buscador" value={c.bici_id || ''} onChange={(e) => set({ bici_id: e.target.value || null })}>
                  <option value="">Sin bici</option>
                  {bd.bicis.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
                {estado && s0 && (
                  <p className={cambiarAntes ? 'aviso' : 'peq muted'} style={{ margin: 0 }}>
                    {cambiarAntes
                      ? `Con esta carrera la cadena pasaría el cambio óptimo (${pct(desgasteTras / estado.tStar)} del camino). Cámbiala antes de largar.`
                      : `La carrera usa ${pct(s0.desgaste / estado.tStar)} del camino al cambio óptimo; después quedaría en ${pct(desgasteTras / estado.tStar)}. No hace falta cambiarla.`}
                  </p>
                )}
              </>
            ) : <p className="peq muted" style={{ margin: 0 }}>Si registras tu bici en Salud de la cadena, aquí verás si conviene cambiar la cadena antes de la carrera.</p>}
          </div>
        </>
      )}
      {!tramosOk && <p className="aviso no-imprimir">Los tramos suman {n1(sumaTramos)} km y la ruta tiene {n1(total)} km. Ajusta los tramos para ver el plan.</p>}

      {aviso && <p className="aviso no-imprimir" role="status" style={{ margin: 0 }}>{aviso}</p>}
      {error && <p className="aviso no-imprimir" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="pie no-imprimir" style={{ paddingTop: 0 }}>
        <button type="button" className="btn btn-secundario" disabled={!s0} onClick={() => window.print()}>Descargar PDF</button>
        <button type="button" className="btn btn-primario" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
      {onBorrar && <button type="button" className="btn btn-tinte btn-bloque no-imprimir" onClick={onBorrar}>Borrar carrera</button>}

      {s0 && (
        <section className="solo-impresion" aria-hidden="true">
          <h1>{c.nombre || 'Plan de lubricación'}</h1>
          <div>{c.fecha || ''} · {n0(total)} km · {n0(s0.Rfinal * 100)} % de llegar lubricado</div>
          <h2>Estrategia</h2>
          <div>Partir con {s0.inicio.nombre} ({NOMBRE_TIPO[s0.inicio.tipo]}){s0.recarga ? `; re-aplicar con ${s0.recarga.nombre}` : ''}. Llevar {n1(s0.ml)} ml.</div>
          {c.ruta?.puntos?.length > 1 && <PerfilRuta puntos={c.ruta.puntos} total={total} tramos={c.tramos} paradas={s0.paradas} controles={c.controles} />}
          <h2>Paradas</h2>
          <table><thead><tr><th>Km</th><th>Producto</th><th>Tramo que viene</th></tr></thead>
            <tbody>{s0.paradas.length ? s0.paradas.map((p, i) => <tr key={i}><td>{n0(p.km)}</td><td>{p.producto.nombre}</td><td>{condicion(p.cond).corto}</td></tr>) : <tr><td colSpan="3">Sin paradas</td></tr>}</tbody></table>
          <h2>Tramos</h2>
          <table><tbody>{c.tramos.map((t, i) => <tr key={i}><td>{i + 1}</td><td>{n1(t.km)} km</td><td>{condicion(t.cond).corto}</td></tr>)}</tbody></table>
          <h2>Regla de bolsillo (km entre aplicaciones, 98 %)</h2>
          <table><thead><tr><th>Producto</th>{COLUMNAS_REGLA.map((x) => <th key={x.sal}>{x.nombre}</th>)}</tr></thead>
            <tbody>{productosUsados.map((p) => { const r = reglaDeBolsillo(p); return <tr key={p.id}><td>{p.nombre}</td>{COLUMNAS_REGLA.map((x) => <td key={x.sal}>{n0(r[x.sal])}</td>)}</tr> })}</tbody></table>
          <h2>Preparación</h2>
          <ul>
            <li>Encerar o lubricar 1 a 2 días antes de la carrera.</li>
            <li>Llevar trapo y el lubricante de respaldo ({n1(s0.ml || 0)} ml como mínimo).</li>
            <li>Con lluvia o barro, re-aplicar antes si la cadena suena o se ve seca.</li>
            {cambiarAntes && <li>Cambiar la cadena antes de largar.</li>}
          </ul>
        </section>
      )}
    </main>
  )
}
