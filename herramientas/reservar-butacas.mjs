// Reserva butacas de una función para las invitaciones de la organización: se ven ocupadas para todos (compra y
// panel) y el panel no las nombra ni las cuenta (ver `reservadas` en models/Evento.js). Pedido de Rítmica, 17/11/2026.
// La lista que se pasa REEMPLAZA a la que había. Sin --aplicar solo muestra lo que haría.
//   (en backend) TEMA=santiago-ritmica DB_NAME=gala_ritmica node ../herramientas/reservar-butacas.mjs el-origen-de-ser-21 1-* 2-10..13 3-13..14
//   contra Render: ENV_RENDER=render-env-ritmica.txt node herramientas/con-env-render.mjs ../herramientas/reservar-butacas.mjs <evento> <butacas> [--aplicar]
// Butacas: "5-7" (una), "2-10..13" (de la 10 a la 13 de la fila 2), "1-*" (toda la fila 1). "ninguna" las saca todas.
// Si alguna estaba guardada (a la vista), pasa a reservada. No se reserva una vendida o pagándose.
import { join } from 'path'
import { leerSitio } from '../backend/sitio.js'
import { crearSala, resumenButacas } from '../backend/butacas.js'
import { sequelize } from '../backend/database.js'

const args = process.argv.slice(2), aplicar = args.includes('--aplicar')
const [evento, ...pedidos] = args.filter(a => a !== '--aplicar')
if (!evento || !pedidos.length) { console.log('Uso: reservar-butacas.mjs <evento> <butacas...|ninguna> [--aplicar]'); process.exit(1) }
const tema = process.env.TEMA || 'santiago-ritmica'
const { sitio } = leerSitio(join(import.meta.dirname, '..', 'temas', tema, 'sitio.json'))
if (!sitio.sala) { console.log(`El tema ${tema} no tiene butacas numeradas`); process.exit(1) }
const sala = crearSala(sitio.sala)

const lista = []
for (const p of pedidos) {
  if (p === 'ninguna') continue
  let m
  if ((m = p.match(/^([^-]+)-\*$/))) lista.push(...[...sala.porId.values()].filter(b => b.fila === m[1]).map(b => b.id))
  else if ((m = p.match(/^([^-]+)-(\d+)\.\.(\d+)$/))) for (let n = Number(m[2]); n <= Number(m[3]); n++) lista.push(`${m[1]}-${n}`)
  else lista.push(p)
}
const malas = lista.filter(id => !sala.porId.has(id))
if (malas.length) { console.log('✗ No existen en la sala:', malas.join(', ')); process.exit(1) }
const nuevas = [...new Set(lista)]

// La columna la crea el servidor al arrancar; si la base todavía corre una versión anterior, se crea acá.
const qi = sequelize.getQueryInterface()
if (!(await qi.describeTable('eventos')).reservadas) {
  if (!aplicar) console.log('(falta la columna "reservadas": se crea al aplicar)')
  else { await qi.addColumn('eventos', 'reservadas', { type: 'TEXT', allowNull: true }); console.log('Columna "reservadas" creada') }
}

const t = await sequelize.transaction()
try {
  const [[ev]] = await sequelize.query('SELECT * FROM eventos WHERE id = ? FOR UPDATE', { replacements: [evento], transaction: t })
  if (!ev) throw new Error('No existe la función ' + evento)
  const [ord] = await sequelize.query("SELECT butacas FROM ordenes WHERE evento = ? AND estado IN ('pagada','pendiente') AND butacas IS NOT NULL", { replacements: [evento], transaction: t })
  const tomadas = new Set(ord.flatMap(o => String(o.butacas).split(',').map(s => s.trim())))
  const choque = nuevas.filter(id => tomadas.has(id))
  if (choque.length) throw new Error(`Ya vendidas o pagándose (no se reservan): ${resumenButacas(sala, choque)}`)
  const antes = JSON.parse(ev.reservadas || '[]'), guardadas = JSON.parse(ev.bloqueadas || '[]')
  const siguenGuardadas = guardadas.filter(id => !nuevas.includes(id))
  console.log(`${evento}: reservadas ${antes.length} → ${nuevas.length}${nuevas.length ? ` (${resumenButacas(sala, nuevas)})` : ''}`)
  if (siguenGuardadas.length !== guardadas.length) console.log(`  dejan de estar guardadas (a la vista): ${guardadas.length - siguenGuardadas.length}`)
  if (aplicar) {
    await sequelize.query('UPDATE eventos SET reservadas = ?, bloqueadas = ?, updatedAt = NOW() WHERE id = ?',
      { replacements: [JSON.stringify(nuevas), JSON.stringify(siguenGuardadas), evento], transaction: t })
    await t.commit()
    console.log('Aplicado. El servidor lee las funciones al arrancar (o cuando el panel edita una): reiniciarlo para verlo.')
  } else { await t.rollback(); console.log('(ensayo: no se cambió nada; para hacerlo, --aplicar)') }
} catch (e) { await t.rollback().catch(() => {}); console.error('✗', e.message); process.exitCode = 1 }
await sequelize.close()
