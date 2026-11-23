import { Inicio, Cadena, Gota, Bandera, Persona } from './iconos.jsx'

const ITEMS = [
  ['inicio', 'Inicio', Inicio],
  ['cadena', 'Cadena', Cadena],
  ['resultado', 'Lubricante', Gota],
  ['carreras', 'Carreras', Bandera],
  ['tu', 'Tú', Persona],
]

export default function Nav({ ruta }) {
  const activa = { comparar: 'resultado', competicion: 'resultado', bici: 'cadena', carrera: 'carreras', catalogo: 'tu' }[ruta.split('/')[0]] || ruta.split('/')[0]
  return (
    <nav className="nav" aria-label="Secciones">
      {ITEMS.map(([id, nombre, icono]) => (
        <a key={id} href={`#/${id}`} aria-label={nombre} aria-current={activa === id ? 'page' : undefined}>
          {icono()}
        </a>
      ))}
    </nav>
  )
}
