// Ficha del sitio (sitio.json o el archivo de SITIO_ARCHIVO): datos del lugar u organizador y las fechas
// iniciales de la cartelera. Las fechas viven en la base (tabla eventos): las de la ficha se cargan una
// sola vez, si todavía no existen; las nuevas se cargan desde el panel.
// Si la ficha está mal, el servidor no arranca: mejor eso que vender con un precio equivocado.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, isAbsolute } from 'path'

const aqui = dirname(fileURLToPath(import.meta.url))
const limpio = (s, max = 200) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
// MySQL devuelve los sí/no como 0/1; el panel, como true/false. Sin dato = sí.
const apagado = v => v === false || v === 0 || v === '0' || v === 'false'

export function slug(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

// Valida y normaliza un evento (de la ficha o del panel). Devuelve { evento } o { error }.
export function normalizarEvento(d, { idFijo } = {}) {
  const nombre = limpio(d.nombre, 120)
  if (nombre.length < 3) return { error: 'Falta el nombre del evento' }
  const fecha = String(d.fecha || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(new Date(fecha + 'T12:00:00Z'))) return { error: 'La fecha va como AAAA-MM-DD' }
  const hora = limpio(d.hora, 10)
  if (hora && !/^\d{1,2}:\d{2}$/.test(hora)) return { error: 'La hora va como 21:30' }
  const artistas = (Array.isArray(d.artistas) ? d.artistas : String(d.artistas || '').split(/\n|,/)).map(a => limpio(a, 80)).filter(Boolean).slice(0, 20)
  // Un evento puede publicarse SIN tipos de entrada todavía (precio a confirmar): se ve en la cartelera
  // como "Entradas muy pronto" y no se puede comprar hasta que se le cargue al menos un tipo.
  const tiposEntrada = Array.isArray(d.tipos) ? d.tipos : []
  const tipos = [], vistos = new Set()
  for (const t of tiposEntrada.slice(0, 10)) {
    const tn = limpio(t.nombre, 60)
    const id = slug(t.id || tn).slice(0, 40)
    if (!id || !tn) return { error: 'Cada tipo de entrada necesita un nombre' }
    if (vistos.has(id)) return { error: `El tipo "${tn}" está repetido` }
    vistos.add(id)
    const precio = Math.round(Number(t.precio)), cupo = Math.round(Number(t.cupo))
    if (!(precio > 0)) return { error: `"${tn}": falta el precio` }
    if (!(cupo > 0)) return { error: `"${tn}": falta la capacidad (cupo)` }
    tipos.push({ id, nombre: tn, corto: limpio(t.corto || tn, 24), detalle: limpio(t.detalle, 80), precio, cupo })
  }
  const externoUrl = limpio(d.externoUrl, 300)
  if (externoUrl && !/^https:\/\/[^\s<>"']+$/i.test(externoUrl)) return { error: 'El enlace de la otra ticketera tiene que empezar con https://' }
  if (externoUrl && tipos.length) return { error: 'Una fecha que vende otra ticketera no lleva entradas propias: sacá los tipos de entrada o el enlace' }
  const id = idFijo || slug(d.id || `${fecha}-${nombre}`)
  if (!/^[a-z0-9-]{3,60}$/.test(id)) return { error: 'No se pudo armar el identificador del evento' }
  return {
    evento: {
      id, nombre, subtitulo: limpio(d.subtitulo, 160) || null, fecha, hora: hora || null, puertas: limpio(d.puertas, 40) || null,
      artistas, descripcion: String(d.descripcion ?? '').trim().slice(0, 3000) || null, imagen: limpio(d.imagen, 200) || null, tipos,
      nota: limpio(d.nota, 120) || null, externoUrl: externoUrl || null, externoTexto: limpio(d.externoTexto, 80) || null, externoPrecio: limpio(d.externoPrecio, 80) || null,
      publicado: !apagado(d.publicado), ventaAbierta: !apagado(d.ventaAbierta),
    },
  }
}

export function leerSitio(archivo = process.env.SITIO_ARCHIVO || 'sitio.json') {
  const ruta = isAbsolute(archivo) ? archivo : join(aqui, archivo)
  const s = JSON.parse(readFileSync(ruta, 'utf8'))
  if (!limpio(s.nombre)) throw new Error('sitio.json: falta el nombre')
  if (!limpio(s.lugar)) throw new Error('sitio.json: falta el lugar')
  const eventos = []
  for (const e of s.eventos || []) {
    const r = normalizarEvento(e)
    if (r.error) throw new Error(`sitio.json, evento "${e.nombre || '?'}": ${r.error}`)
    eventos.push(r.evento)
  }
  return {
    sitio: {
      nombre: limpio(s.nombre, 80), lema: limpio(s.lema, 120), organiza: limpio(s.organiza, 120), lugar: limpio(s.lugar, 120),
      direccion: limpio(s.direccion, 160), ciudad: limpio(s.ciudad, 80), instagram: limpio(s.instagram, 80).replace(/^@/, ''),
      ayudaWhatsapp: String(s.ayudaWhatsapp || '').replace(/\D/g, ''), menores: limpio(s.menores, 200),
      // "gala" = un solo evento: la portada lo muestra en grande. "cartelera" = lista de fechas.
      modo: s.modo === 'gala' ? 'gala' : 'cartelera',
      // Secciones opcionales de la página: quiénes somos y el llamado a feriantes/emprendedores.
      sobre: s.sobre?.titulo ? { titulo: limpio(s.sobre.titulo, 80), parrafos: (s.sobre.parrafos || []).map(p => limpio(p, 600)).filter(Boolean).slice(0, 6) } : null,
      facebook: /^https:\/\//.test(s.facebook || '') ? limpio(s.facebook, 200) : '',
      // "Lo que se vive": 3 o 4 tarjetas cortas con un ícono (emoji), título y texto.
      destacados: (s.destacados || []).slice(0, 6).map(d => ({ icono: limpio(d.icono, 8), titulo: limpio(d.titulo, 60), texto: limpio(d.texto, 220) })).filter(d => d.titulo),
      feriantes: s.feriantes?.whatsapp ? { titulo: limpio(s.feriantes.titulo || 'Feriantes y emprendedores', 80), texto: limpio(s.feriantes.texto, 600),
        whatsapp: String(s.feriantes.whatsapp).replace(/\D/g, ''), mensaje: limpio(s.feriantes.mensaje, 200) } : null,
    },
    eventos,
  }
}
