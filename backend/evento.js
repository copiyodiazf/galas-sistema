// Ficha del evento: lee evento.json (o el archivo de EVENTO_ARCHIVO) y la valida al arrancar.
// Si algo está mal, el servidor no arranca: mejor eso que vender con un precio equivocado.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, isAbsolute } from 'path'

const aqui = dirname(fileURLToPath(import.meta.url))

export function leerEvento(archivo = process.env.EVENTO_ARCHIVO || 'evento.json') {
  const ruta = isAbsolute(archivo) ? archivo : join(aqui, archivo)
  const e = JSON.parse(readFileSync(ruta, 'utf8'))
  const faltan = ['nombre', 'cuando', 'fecha', 'lugar'].filter(k => !String(e[k] || '').trim())
  if (faltan.length) throw new Error(`evento.json: faltan ${faltan.join(', ')}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha)) throw new Error('evento.json: la fecha va como AAAA-MM-DD')
  if (!Array.isArray(e.tipos) || !e.tipos.length) throw new Error('evento.json: falta al menos un tipo de entrada')
  const tipos = {}
  for (const t of e.tipos) {
    if (!/^[a-z0-9_-]{1,40}$/.test(t.id || '')) throw new Error(`evento.json: id de tipo inválido "${t.id}" (minúsculas, números, - y _)`)
    if (tipos[t.id]) throw new Error(`evento.json: el tipo "${t.id}" está repetido`)
    if (!(Number(t.precio) > 0)) throw new Error(`evento.json: el tipo "${t.id}" no tiene precio`)
    if (!(Number(t.cupo) > 0)) throw new Error(`evento.json: el tipo "${t.id}" no tiene cupo`)
    tipos[t.id] = { nombre: t.nombre || t.id, corto: t.corto || t.nombre || t.id, detalle: t.detalle || '',
      precio: Math.round(Number(t.precio)), cupo: Math.round(Number(t.cupo)) }
  }
  return {
    nombre: e.nombre, organiza: e.organiza || '', cuando: e.cuando, fecha: e.fecha, lugar: e.lugar,
    direccion: e.direccion || '', puertas: e.puertas || '', ciudad: e.ciudad || '', menores: e.menores || '',
    ayudaWhatsapp: String(e.ayudaWhatsapp || '').replace(/\D/g, ''), tipos,
  }
}
