import { useEffect, useMemo, useState, useDeferredValue } from 'react'
import { recomendar } from './lib/motor.js'
import { leerLocal, guardarLocal } from './lib/almacen.js'
import { supabase, sincronizar, leerPerfil } from './lib/supabase.js'
import Nav from './ui/Nav.jsx'
import Perfil from './pantallas/Perfil.jsx'
import Resultado from './pantallas/Resultado.jsx'
import Comparar from './pantallas/Comparar.jsx'
import Tu from './pantallas/Tu.jsx'
import Inicio, { Bienvenida, Pronto } from './pantallas/Inicio.jsx'

const leerRuta = () => (window.location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0]
const ir = (r) => { window.location.hash = `/${r}` }

export default function App() {
  const [ruta, setRuta] = useState(leerRuta)
  const [perfil, setPerfil] = useState(leerLocal)
  const [usuario, setUsuario] = useState(null)
  const [saca, setSaca] = useState(() => (leerLocal()?.sacaCadena ?? 'no_se') !== 'no')

  useEffect(() => {
    const f = () => { setRuta(leerRuta()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  // Sesión de Google: al entrar, sube el perfil local o trae el guardado en la cuenta.
  useEffect(() => {
    if (!supabase) return
    const alEntrar = async (u) => {
      setUsuario(u)
      if (!u) return
      const local = leerLocal()
      if (local) await sincronizar(u, local, null)
      else {
        const remoto = await leerPerfil(u)
        if (remoto) { setPerfil(remoto); guardarLocal(remoto); setSaca(remoto.sacaCadena !== 'no') }
      }
    }
    supabase.auth.getSession().then(({ data }) => alEntrar(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUsuario(s?.user ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  const imp = useDeferredValue(perfil?.importancias)
  const resultado = useMemo(() => (perfil ? recomendar({ ...perfil, importancias: imp }, { sacaCadena: saca }) : null), [perfil, imp, saca])

  const actualizar = (cambios) => {
    setPerfil((p) => {
      const nuevo = { ...p, ...cambios }
      guardarLocal(nuevo)
      return nuevo
    })
  }

  const alTerminarPerfil = (nuevo) => {
    const s = nuevo.sacaCadena !== 'no'
    setPerfil(nuevo)
    setSaca(s)
    guardarLocal(nuevo)
    if (usuario) sincronizar(usuario, nuevo, recomendar(nuevo, { sacaCadena: s }))
    ir('resultado')
  }

  if (ruta === 'perfil') {
    return <Perfil inicial={perfil} onListo={alTerminarPerfil} onSalir={() => ir(perfil ? 'tu' : 'inicio')} />
  }
  if (!perfil) {
    if (ruta === 'tu') return (<><Tu perfil={null} usuario={usuario} /><Nav ruta={ruta} /></>)
    return <Bienvenida usuario={usuario} onEmpezar={() => ir('perfil')} />
  }

  let pantalla
  switch (ruta) {
    case 'resultado':
      pantalla = <Resultado perfil={perfil} resultado={resultado} saca={saca} setSaca={setSaca}
        onImportancias={(v) => actualizar({ importancias: v })} onEditar={() => ir('perfil')} />
      break
    case 'comparar':
      pantalla = <Comparar perfil={perfil} resultado={resultado} saca={saca} onActual={(a) => actualizar({ actual: a })} />
      break
    case 'tu':
      pantalla = <Tu perfil={perfil} usuario={usuario} onEditar={() => ir('perfil')}
        onBorrar={() => { guardarLocal(null); setPerfil(null); ir('inicio') }} />
      break
    case 'cadena':
      pantalla = <Pronto titulo="Salud de la cadena" texto="Anota tus km y te avisamos cuándo lubricar, medir y cambiar la cadena." />
      break
    case 'carreras':
      pantalla = <Pronto titulo="Planificador de carreras" texto="Sube el GPX de tu carrera y te decimos dónde re-aplicar para llegar con la cadena lubricada." />
      break
    default:
      pantalla = <Inicio perfil={perfil} resultado={resultado} usuario={usuario} />
  }
  return (<>{pantalla}<Nav ruta={ruta} /></>)
}
