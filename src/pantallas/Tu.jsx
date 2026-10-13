import { useState } from 'react'
import { NOMBRE_SEGMENTO } from '../lib/motor.js'
import { hayCuentas, entrarConGoogle, salir, borrarCuenta } from '../lib/supabase.js'
import { n0, pct } from '../lib/formato.js'
import { Google } from '../ui/iconos.jsx'

const DISC = { ruta: 'Ruta', gravel: 'Gravel', mtb: 'MTB', ciudad: 'Ciudad' }
const SACA = { si: 'Sí', no: 'No', no_se: 'No sé' }
const COND = { limpio: 'Seco', polvo: 'Polvo', humedo: 'Lluvia o barro', extremo: 'Extremo' }

export default function Tu({ perfil, usuario, onEditar, onBorrar }) {
  const [confirmar, setConfirmar] = useState(false)
  const filas = perfil ? [
    ['Tipo de ciclismo', NOMBRE_SEGMENTO[perfil.segmento]],
    ['Dónde andas', DISC[perfil.disciplina]],
    ['Bici eléctrica', perfil.electrica ? 'Sí' : 'No'],
    ['Km por semana', n0(perfil.kmSemana)],
    ['Sacarías la cadena', SACA[perfil.sacaCadena]],
    ['Condiciones', Object.entries(perfil.mezcla).filter(([, v]) => v > 0).map(([k, v]) => `${COND[k]} ${pct(v)}`).join(' · ')],
    ['Lubricante actual', perfil.actual?.nombre || 'Sin indicar'],
  ] : []

  return (
    <main className="app">
      <section className="hero tx-naranja" style={{ minHeight: 180 }}>
        <span className="chip" style={{ alignSelf: 'flex-start' }}>{usuario ? 'Con cuenta' : 'Sin cuenta'}</span>
        <div className="col" style={{ gap: 6 }}>
          <h1>{usuario?.user_metadata?.full_name || 'Tú'}</h1>
          <p>{usuario ? usuario.email : 'Tus respuestas quedan en este teléfono'}</p>
        </div>
      </section>

      <div className="card col" style={{ gap: 10 }}>
        <h2>Cuenta</h2>
        {!hayCuentas && <p className="peq muted" style={{ margin: 0 }}>Las cuentas con Google se activan cuando conectemos la base de datos. Mientras, todo se guarda en este teléfono.</p>}
        {hayCuentas && !usuario && (<>
          <p className="peq muted" style={{ margin: 0 }}>Guarda tu perfil para verlo en otro equipo. Más adelante, la cuenta habilita el seguimiento de la cadena y el planificador de carreras.</p>
          <button type="button" className="btn btn-secundario btn-bloque" onClick={entrarConGoogle}><Google /> Continuar con Google</button>
        </>)}
        {hayCuentas && usuario && (
          <button type="button" className="btn btn-secundario btn-bloque" onClick={salir}>Cerrar sesión</button>
        )}
      </div>

      {perfil && (
        <div className="card">
          <div className="entre"><h2>Tu perfil</h2><button type="button" className="enlace" onClick={onEditar}>Editar</button></div>
          <ul className="resto">
            {filas.map(([k, v]) => <li key={k}><span className="muted">{k}</span><strong style={{ textAlign: 'right' }}>{v}</strong></li>)}
          </ul>
        </div>
      )}

      {perfil && (
        <div className="card col" style={{ gap: 10 }}>
          <h2>Tus datos</h2>
          <p className="peq muted" style={{ margin: 0 }}>
            {usuario ? 'Tu perfil y tus recomendaciones se guardan en tu cuenta para mejorar la app. Puedes borrarlos cuando quieras.' : 'Puedes borrar tus respuestas de este teléfono.'}
          </p>
          {!confirmar && <button type="button" className="btn btn-tinte btn-bloque" onClick={() => setConfirmar(true)}>Borrar mis datos</button>}
          {confirmar && (
            <div className="pie" style={{ paddingTop: 0 }}>
              <button type="button" className="btn btn-secundario" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button type="button" className="btn btn-primario" onClick={async () => { if (usuario) await borrarCuenta(usuario); onBorrar() }}>Sí, borrar</button>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
