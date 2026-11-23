import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useDeferredValue } from 'react'
import { recomendar, setCatalogo, CATALOGO } from './lib/motor.js'
import { leerLocal, guardarLocal } from './lib/almacen.js'
import { supabase, sincronizar, leerPerfil } from './lib/supabase.js'
import { fuente, enDemo, catalogoPublicado, esAdmin } from './lib/datos.js'
import Nav from './ui/Nav.jsx'
import Perfil from './pantallas/Perfil.jsx'
import Resultado from './pantallas/Resultado.jsx'
import Comparar from './pantallas/Comparar.jsx'
import Competicion from './pantallas/Competicion.jsx'
import Tu from './pantallas/Tu.jsx'
import Inicio, { Bienvenida } from './pantallas/Inicio.jsx'
import CuentaRequerida, { BandaDemo } from './pantallas/Cuenta.jsx'
import Cadena from './pantallas/Cadena.jsx'
import Bici from './pantallas/Bici.jsx'
import Carreras from './pantallas/Carreras.jsx'
const Carrera = lazy(() => import('./pantallas/Carrera.jsx'))
const Catalogo = lazy(() => import('./pantallas/Catalogo.jsx'))

const leerRuta = () => (window.location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0]
const ir = (r) => { window.location.hash = `/${r}` }
const SIN_PERFIL = new Set(['tu', 'cadena', 'bici', 'carreras', 'carrera', 'competicion', 'catalogo'])

export default function App() {
  const [ruta, setRuta] = useState(leerRuta)
  const [perfil, setPerfil] = useState(leerLocal)
  const [usuario, setUsuario] = useState(null)
  const [admin, setAdmin] = useState(false)
  const [versionCat, setVersionCat] = useState(CATALOGO.version)
  const [saca, setSaca] = useState(() => (leerLocal()?.sacaCadena ?? 'no_se') !== 'no')
  const [bd, setBd] = useState({ bicis: [], cadenas: [], eventos: [], carreras: [], cargado: false, cargando: false, error: '' })

  useEffect(() => {
    const f = () => { setRuta(leerRuta()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  // Catálogo publicado por el administrador; si no hay, queda el incorporado.
  useEffect(() => {
    catalogoPublicado().then((c) => { if (c && setCatalogo(c)) setVersionCat(c.version) })
  }, [])

  // Sesión de Google: al entrar, sube el perfil local o trae el guardado en la cuenta.
  useEffect(() => {
    if (!supabase) return
    const alEntrar = async (u) => {
      setUsuario(u)
      if (!u) return
      esAdmin(u).then(setAdmin)
      const local = leerLocal()
      if (local) await sincronizar(u, local, null)
      else {
        const remoto = await leerPerfil(u)
        if (remoto) { setPerfil(remoto); guardarLocal(remoto); setSaca(remoto.sacaCadena !== 'no') }
      }
    }
    supabase.auth.getSession().then(({ data }) => alEntrar(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUsuario(s?.user ?? null)
      if (!s?.user) setAdmin(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const datos = useMemo(() => fuente(usuario), [usuario])

  const recargar = useCallback(async () => {
    if (!datos) return
    setBd((x) => ({ ...x, cargando: true }))
    try {
      const [bicis, cadenas, carreras] = await Promise.all([datos.bicis(), datos.cadenas(), datos.carreras()])
      const eventos = await datos.eventos(cadenas.map((c) => c.id))
      setBd({ bicis, cadenas, eventos, carreras, cargado: true, cargando: false, error: '' })
    } catch (e) {
      setBd((x) => ({ ...x, cargando: false, cargado: true, error: e.message }))
    }
  }, [datos])

  const seccion = ruta.split('/')[0]
  const necesitaDatos = ['cadena', 'bici', 'carreras', 'carrera'].includes(seccion)
  useEffect(() => { if (necesitaDatos && datos && !bd.cargado && !bd.cargando) recargar() }, [necesitaDatos, datos, bd.cargado, bd.cargando, recargar])

  const imp = useDeferredValue(perfil?.importancias)
  const resultado = useMemo(() => (perfil ? recomendar({ ...perfil, importancias: imp }, { sacaCadena: saca }) : null),
    // versionCat fuerza el recálculo cuando llega un catálogo nuevo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perfil, imp, saca, versionCat])

  const actualizar = (cambios) => {
    setPerfil((p) => {
      const nuevo = { ...(p || {}), ...cambios }
      guardarLocal(nuevo)
      return nuevo
    })
  }

  const alTerminarPerfil = (nuevo) => {
    const s = nuevo.sacaCadena !== 'no'
    const conCompeticion = { ...nuevo, competicion: perfil?.competicion }
    setPerfil(conCompeticion)
    setSaca(s)
    guardarLocal(conCompeticion)
    if (usuario) sincronizar(usuario, conCompeticion, recomendar(conCompeticion, { sacaCadena: s }), CATALOGO.version)
    ir('resultado')
  }

  if (ruta === 'perfil') {
    return <Perfil inicial={perfil} onListo={alTerminarPerfil} onSalir={() => ir(perfil ? 'tu' : 'inicio')} />
  }
  if (!perfil && !SIN_PERFIL.has(seccion)) {
    return <Bienvenida usuario={usuario} onEmpezar={() => ir('perfil')} />
  }

  const conCuenta = (contenido, titulo, texto) => {
    if (!datos) return <CuentaRequerida titulo={titulo} texto={texto} />
    if (bd.error) return <main className="app"><p className="aviso">No se pudieron cargar tus datos: {bd.error}. Si acabas de instalar la app, revisa que el esquema de Supabase esté al día.</p></main>
    return <>{enDemo() && <div className="app" style={{ minHeight: 0, paddingBottom: 0 }}><BandaDemo /></div>}{contenido}</>
  }

  const [, param] = ruta.split('/')
  let pantalla
  switch (seccion) {
    case 'resultado':
      pantalla = <Resultado perfil={perfil} resultado={resultado} saca={saca} setSaca={setSaca}
        onImportancias={(v) => actualizar({ importancias: v })} onEditar={() => ir('perfil')} />
      break
    case 'comparar':
      pantalla = <Comparar perfil={perfil} resultado={resultado} saca={saca} onActual={(a) => actualizar({ actual: a })} />
      break
    case 'competicion':
      pantalla = <Competicion perfil={perfil} onGuardar={actualizar} />
      break
    case 'tu':
      pantalla = <Tu perfil={perfil} usuario={usuario} admin={admin} onEditar={() => ir('perfil')}
        onBorrar={() => { guardarLocal(null); setPerfil(null); ir('inicio') }} />
      break
    case 'cadena':
      pantalla = conCuenta(
        <Cadena datos={datos} perfil={perfil} biciId={param} onRecargar={recargar} cargando={!bd.cargado} {...bd} />,
        'Salud de la cadena', 'Anota tus km y te avisamos cuándo lubricar, medir y cambiar la cadena.')
      break
    case 'bici': {
      const bici = param === 'nueva' ? null : bd.bicis.find((b) => b.id === param)
      const cadena = bici ? bd.cadenas.filter((c) => c.bici_id === bici.id && (c.retirada_odo === null || c.retirada_odo === undefined)).slice(-1)[0] : null
      pantalla = conCuenta(
        (param !== 'nueva' && !bici) ? <main className="app"><p className="muted">{bd.cargado ? 'No encontramos esa bicicleta.' : 'Cargando…'}</p></main> : (
          <Bici key={param} bici={bici} cadena={cadena} perfil={perfil}
            onGuardar={async (b, c) => {
              const guardada = await datos.guardarBici(b)
              if (!bici) await datos.guardarCadena({ ...c, bici_id: guardada.id })
              else if (cadena) await datos.guardarCadena({ ...cadena, ...c, bici_id: guardada.id })
              await recargar()
              ir(`cadena/${guardada.id}`)
            }}
            onBorrar={bici ? async () => {
              if (!window.confirm(`¿Borrar ${bici.nombre} y todo su historial?`)) return
              await datos.borrarBici(bici.id)
              await recargar()
              ir('cadena')
            } : null} />
        ), 'Mi bicicleta', 'Registra tu bici y su cadena para seguir el desgaste.')
      break
    }
    case 'carreras':
      pantalla = conCuenta(<Carreras carreras={bd.carreras} cargando={!bd.cargado} />,
        'Planificador de carrera', 'Sube el GPX de tu carrera y te decimos dónde re-aplicar para llegar a la meta con la cadena lubricada.')
      break
    case 'carrera': {
      const carrera = param === 'nueva' ? null : bd.carreras.find((c) => c.id === param)
      pantalla = conCuenta(
        (param !== 'nueva' && !carrera) ? <main className="app"><p className="muted">{bd.cargado ? 'No encontramos esa carrera.' : 'Cargando…'}</p></main> : (
          <Carrera key={param} carrera={carrera} perfil={perfil} datos={datos} bd={bd}
            onGuardada={async (c) => { await recargar(); if (param === 'nueva') ir(`carrera/${c.id}`) }}
            onBorrar={carrera ? async () => {
              if (!window.confirm(`¿Borrar la carrera ${carrera.nombre}?`)) return
              await datos.borrarCarrera(carrera.id)
              await recargar()
              ir('carreras')
            } : null} />
        ), 'Planificador de carrera', 'Sube el GPX de tu carrera y te decimos dónde re-aplicar.')
      break
    }
    case 'catalogo':
      pantalla = admin ? <Catalogo onPublicado={(c) => { setCatalogo(c); setVersionCat(c.version) }} />
        : <main className="app"><p className="aviso">Esta sección es solo para el administrador del catálogo.</p></main>
      break
    default:
      pantalla = perfil ? <Inicio perfil={perfil} resultado={resultado} usuario={usuario} /> : <Bienvenida usuario={usuario} onEmpezar={() => ir('perfil')} />
  }
  return (<><Suspense fallback={<main className="app"><p className="muted">Cargando…</p></main>}>{pantalla}</Suspense><Nav ruta={ruta} /></>)
}
