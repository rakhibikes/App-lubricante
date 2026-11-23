import { useMemo, useState } from 'react'
import { GRUPOS, PARAMS, PRODUCTOS, NOMBRE_TIPO, buscarProducto } from '../lib/motor.js'
import { clp } from '../lib/formato.js'
import { Atras } from '../ui/iconos.jsx'

const TIPOS = [['ruta', 'Ruta'], ['gravel', 'Gravel'], ['mtb', 'MTB'], ['urbana', 'Urbana'], ['electrica', 'Eléctrica']]
const hoy = () => new Date().toISOString().slice(0, 10)

function Opciones({ valor, onChange, opciones, etiqueta }) {
  return (
    <div className="chips" role="radiogroup" aria-label={etiqueta}>
      {opciones.map(([v, t]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} className="chip-op" onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  )
}

// Formulario del módulo 2. bici y cadena vienen vacías para una bici nueva.
export default function Bici({ bici, cadena, perfil, onGuardar, onBorrar }) {
  const nueva = !bici?.id
  const [b, setB] = useState(() => ({
    nombre: '', tipo: perfil?.disciplina === 'ciudad' ? 'urbana' : perfil?.disciplina || 'gravel', velocidades: 12, grupo: '', precio_cadena: '', precio_cassette: '', union: 'rapido',
    ...bici,
  }))
  const [c, setC] = useState(() => ({
    instalada_fecha: hoy(), instalada_odo: '', lubricante_id: perfil?.actual?.id ?? '', edad_desconocida: false, ...cadena,
  }))
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const g = GRUPOS.find((x) => x.id === b.grupo)
  const marcas = useMemo(() => [...new Set(GRUPOS.map((x) => x.marca))], [])
  const productos = useMemo(() => PRODUCTOS.filter((p) => p.chile).sort((x, y) => x.nombre.localeCompare(y.nombre)), [])
  const actual = c.lubricante_id !== '' ? buscarProducto(c.lubricante_id) : null
  const cad = Number(b.precio_cadena) || g?.cadena || PARAMS.cadena_def
  const cas = Number(b.precio_cassette) || g?.cassette || PARAMS.cassette_def

  async function guardar(e) {
    e.preventDefault()
    if (!b.nombre.trim()) return setError('Ponle un nombre a la bici.')
    if (c.instalada_odo === '' || Number(c.instalada_odo) < 0) return setError(c.edad_desconocida ? 'Anota los km del odómetro de hoy.' : 'Anota los km del odómetro cuando instalaste la cadena.')
    setError('')
    setGuardando(true)
    try {
      await onGuardar({
        ...b, nombre: b.nombre.trim(), velocidades: Number(b.velocidades),
        precio_cadena: b.precio_cadena === '' ? null : Number(b.precio_cadena),
        precio_cassette: b.precio_cassette === '' ? null : Number(b.precio_cassette),
        grupo: b.grupo || null,
      }, {
        ...c, instalada_odo: Number(c.instalada_odo),
        instalada_fecha: c.edad_desconocida ? hoy() : c.instalada_fecha,
        lubricante_id: c.lubricante_id === '' ? null : String(c.lubricante_id),
      })
    } catch (err) {
      setError(`No se pudo guardar: ${err.message}`)
    }
    setGuardando(false)
  }

  return (
    <main className="app">
      <div className="fila" style={{ padding: '4px 0' }}>
        <a className="circulo claro" href="#/cadena" aria-label="Volver"><Atras /></a>
        <h1 className="pregunta" style={{ fontSize: 26, margin: 0 }}>{nueva ? 'Agregar bicicleta' : 'Editar bicicleta'}</h1>
      </div>
      <form className="col" style={{ gap: 10 }} onSubmit={guardar}>
        <div className="card col" style={{ gap: 14 }}>
          <label className="col" htmlFor="b-nombre" style={{ gap: 6 }}>
            <span className="etiqueta">Nombre</span>
            <input id="b-nombre" className="buscador" placeholder="La gravelera" value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} />
          </label>
          <div className="col" style={{ gap: 6 }}>
            <span className="etiqueta">Tipo</span>
            <Opciones etiqueta="Tipo de bici" valor={b.tipo} onChange={(v) => setB({ ...b, tipo: v })} opciones={TIPOS} />
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span className="etiqueta">Velocidades</span>
            <Opciones etiqueta="Velocidades" valor={Number(b.velocidades)} onChange={(v) => setB({ ...b, velocidades: v })} opciones={[9, 10, 11, 12, 13].map((v) => [v, String(v)])} />
          </div>
          <label className="col" htmlFor="b-grupo" style={{ gap: 6 }}>
            <span className="etiqueta">Grupo</span>
            <select id="b-grupo" className="buscador" value={b.grupo || ''} onChange={(e) => setB({ ...b, grupo: e.target.value })}>
              <option value="">Otro o no sé (precios de nivel 105 / SLX)</option>
              {marcas.map((m) => (
                <optgroup key={m} label={m}>
                  {GRUPOS.filter((x) => x.marca === m).map((x) => <option key={x.id} value={x.id}>{m} {x.nombre}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="podio">
            <label className="col peq" htmlFor="b-cad" style={{ gap: 6 }}>
              <span className="muted">Precio de la cadena</span>
              <input id="b-cad" className="buscador" type="number" inputMode="numeric" min="0" step="500" placeholder={String(g?.cadena || PARAMS.cadena_def)}
                value={b.precio_cadena ?? ''} onChange={(e) => setB({ ...b, precio_cadena: e.target.value })} />
            </label>
            <label className="col peq" htmlFor="b-cas" style={{ gap: 6 }}>
              <span className="muted">Precio del cassette</span>
              <input id="b-cas" className="buscador" type="number" inputMode="numeric" min="0" step="1000" placeholder={String(g?.cassette || PARAMS.cassette_def)}
                value={b.precio_cassette ?? ''} onChange={(e) => setB({ ...b, precio_cassette: e.target.value })} />
            </label>
          </div>
          <p className="peq muted" style={{ margin: 0 }}>
            Llegar tarde al cambio cuesta {clp(cad + cas)} (cadena y cassette); a tiempo, {clp(cad)}. Razón de costo r = {((cad + cas) / cad).toFixed(1).replace('.', ',')}.
          </p>
          <div className="col" style={{ gap: 6 }}>
            <span className="etiqueta">Unión de la cadena</span>
            <Opciones etiqueta="Unión de la cadena" valor={b.union} onChange={(v) => setB({ ...b, union: v })} opciones={[['rapido', 'Eslabón rápido'], ['pasador', 'Pasador']]} />
          </div>
        </div>

        {(nueva || cadena) && (
          <div className="card col" style={{ gap: 14 }}>
            <h2>Cadena instalada</h2>
            <label className="col" htmlFor="b-lub" style={{ gap: 6 }}>
              <span className="etiqueta">Lubricante</span>
              <select id="b-lub" className="buscador" value={c.lubricante_id ?? ''} onChange={(e) => setC({ ...c, lubricante_id: e.target.value })}>
                <option value="">El de mi perfil{perfil?.actual ? ` (${perfil.actual.nombre})` : ''}</option>
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {actual && <span className="peq muted">{NOMBRE_TIPO[actual.tipo]}</span>}
            </label>
            <label className="fila peq" htmlFor="b-nose" style={{ gap: 10 }}>
              <input id="b-nose" type="checkbox" checked={!!c.edad_desconocida} onChange={(e) => setC({ ...c, edad_desconocida: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
              No sé cuándo la instalé
            </label>
            {!c.edad_desconocida && (
              <label className="col" htmlFor="b-fecha" style={{ gap: 6 }}>
                <span className="etiqueta">Fecha de instalación</span>
                <input id="b-fecha" className="buscador" type="date" value={c.instalada_fecha || ''} max={hoy()} onChange={(e) => setC({ ...c, instalada_fecha: e.target.value })} />
              </label>
            )}
            <label className="col" htmlFor="b-odo" style={{ gap: 6 }}>
              <span className="etiqueta">{c.edad_desconocida ? 'Km del odómetro hoy' : 'Km del odómetro al instalarla'}</span>
              <input id="b-odo" className="buscador" type="number" inputMode="numeric" min="0" value={c.instalada_odo ?? ''} onChange={(e) => setC({ ...c, instalada_odo: e.target.value })} />
            </label>
            {c.edad_desconocida && <p className="aviso" style={{ margin: 0 }}>Contamos desde hoy como si la cadena fuera nueva. Mídela pronto para saber cómo está.</p>}
          </div>
        )}

        {b.union === 'pasador' && <p className="aviso" style={{ margin: 0 }}>Con pasador no puedes sacar la cadena para encerar. Instala un eslabón rápido en el próximo cambio.</p>}
        {b.tipo === 'electrica' && <p className="aviso" style={{ margin: 0 }}>En bici eléctrica, cada aplicación de lubricante dura más o menos la mitad.</p>}
        {error && <p className="aviso" role="alert" style={{ margin: 0 }}>{error}</p>}

        <button type="submit" className="btn btn-primario btn-bloque" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar bicicleta'}</button>
        {!nueva && onBorrar && <button type="button" className="btn btn-tinte btn-bloque" onClick={onBorrar}>Borrar bicicleta y su historial</button>}
      </form>
    </main>
  )
}
