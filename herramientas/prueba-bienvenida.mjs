// Prueba del mail de bienvenida del día del show (EPA, 27/11/2026): al escanear la primera entrada de una compra, al
// comprador le llega UN mail con su nombre y el cronograma; las demás entradas de la misma compra no mandan otro.
// También con el ingreso manual del panel. El correo sale por Ethereal (sin EMAIL_USER no llega a ninguna bandeja).
// Servidor local con la ficha de EPA, guardando lo que imprime (la prueba lee de ahí los mails):
//   (en backend) TEMA=epa DB_NAME=gala_epa PORT=3050 node server.js > salida.log
//   (en backend) DB_NAME=gala_epa node ../herramientas/prueba-bienvenida.mjs 3050 salida.log
// Usa la base LOCAL gala_epa: crea dos usuarios y un tipo de entrada de prueba y al final deja todo como estaba.
import { randomBytes, scryptSync } from 'crypto'
import { readFileSync } from 'fs'
import { Orden, Entrada, Usuario, Evento } from '../backend/models/index.js'

if (process.env.DB_NAME !== 'gala_epa') { console.log('Esta prueba toca compras: solo corre contra la base local gala_epa (DB_NAME=gala_epa)'); process.exit(1) }
const BASE = `http://localhost:${process.argv[2] || 3050}`
const LOG = process.argv[3]
const EV = '2026-12-13-se-la-princesa'
const CLAVE = 'prueba-local-' + randomBytes(4).toString('hex')
let fallas = 0, n = 0, total = 0
const ok = (cond, txt, extra = '') => { total++; console.log(`${cond ? '✓' : '✗'} ${txt}${!cond && extra ? '  → ' + extra : ''}`); if (!cond) fallas++ }
async function api(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${++n % 250}`, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  const t = await r.text(); let d; try { d = JSON.parse(t) } catch { d = t }
  return { status: r.status, d }
}
const espera = ms => new Promise(r => setTimeout(r, ms))
const bienvenidas = () => LOG ? (readFileSync(LOG, 'utf8').match(/💌 Bienvenida.*/g) || []) : []
// El mail sale en segundo plano (Ethereal tarda unos segundos): esperar a que aparezca en la salida del servidor
async function esperarBienvenidas(cuantas, desde) { for (let i = 0; i < 40 && bienvenidas().length - desde < cuantas; i++) await espera(500); return bienvenidas().slice(desde) }

const ev0 = await Evento.findByPk(EV)
const tiposAntes = ev0.tipos, publicadoAntes = ev0.publicado
const USUARIOS = [['admin', 'prueba-admin'], ['control', 'prueba-puerta']]
const creadas = []
try {
  for (const [rol, usuario] of USUARIOS) {
    const salt = randomBytes(16).toString('hex'), hash = scryptSync(CLAVE, salt, 64).toString('hex')
    const [u, nuevo] = await Usuario.findOrCreate({ where: { usuario }, defaults: { usuario, rol, salt, hash } })
    if (!nuevo) await u.update({ rol, salt, hash, activo: true })
  }
  const login = async u => (await api('/api/admin/login', { metodo: 'POST', cuerpo: { usuario: u, password: CLAVE } })).d.token
  const T = { admin: await login('prueba-admin'), puerta: await login('prueba-puerta') }
  ok(Boolean(T.admin && T.puerta), 'usuarios de prueba con sesión')
  // Un tipo de entrada solo para la prueba (la ficha de EPA todavía no tiene precios)
  const r0 = await api(`/api/admin/eventos/${EV}`, { metodo: 'PUT', token: T.admin, cuerpo: { tipos: [{ id: 'general', nombre: 'General', precio: 20000, cupo: 1000 }] } })
  ok(r0.status === 200, 'tipo de entrada de prueba', JSON.stringify(r0.d))

  // 1) El cronograma y la bienvenida están en la ficha
  const cfg = (await api('/api/config')).d
  ok(cfg.sitio?.cronograma?.bloques?.length === 5, 'config: el cronograma tiene sus 5 horarios')
  ok(cfg.sitio?.cronograma?.bloques?.[4]?.numeros?.[0]?.n === null, 'el saludo final va sin número')
  ok(cfg.eventos?.[0]?.hora === '20:00', 'el show empieza a las 20:00', cfg.eventos?.[0]?.hora)

  // 2) Una compra de tres (cortesía): escanear la primera manda la bienvenida, las otras dos no
  const antes = bienvenidas().length
  const rc = await api('/api/admin/entrada-cortesia', { metodo: 'POST', token: T.admin, cuerpo: { evento: EV, tipo: 'general', nombre: 'MARÍA JOSÉ Prueba', email: 'familia.prueba@ejemplo.com', cantidad: 3 } })
  ok(rc.status === 200, 'cortesía de 3 emitida', JSON.stringify(rc.d))
  const orden = await Orden.findOne({ where: { email: 'familia.prueba@ejemplo.com' }, order: [['createdAt', 'DESC']] })
  creadas.push(orden.id)
  const entradas = await Entrada.findAll({ where: { orden_id: orden.id }, order: [['base', 'ASC']] })
  ok(entradas.length === 3, 'tres QR')
  const v1 = await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo: entradas[0].codigo, evento: EV } })
  ok(v1.d.ok === true, 'la primera entrada pasa', JSON.stringify(v1.d))
  await espera(6000)
  await orden.reload()
  ok(Boolean(orden.bienvenidaEn), 'la compra quedó marcada con la bienvenida')
  const marca = orden.bienvenidaEn?.getTime()
  for (const e of entradas.slice(1)) ok((await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo: e.codigo, evento: EV } })).d.ok === true, 'otra entrada de la familia pasa')
  await espera(3000)
  await orden.reload()
  ok(orden.bienvenidaEn?.getTime() === marca, 'las otras dos no vuelven a mandarla')
  if (LOG) {
    const nuevas = await esperarBienvenidas(1, antes)
    ok(nuevas.length === 1, 'salió un solo mail de bienvenida', nuevas.join(' | '))
    if (nuevas[0]) console.log('   ', nuevas[0])
  }
  ok((await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo: entradas[0].codigo, evento: EV } })).d.estado === 'usado', 'y la primera no entra dos veces')

  // 3) Ingreso manual desde el panel (el celular no prende): también la manda, una vez
  const rc2 = await api('/api/admin/entrada-cortesia', { metodo: 'POST', token: T.admin, cuerpo: { evento: EV, tipo: 'general', nombre: 'pedro Prueba', email: 'otra.prueba@ejemplo.com', cantidad: 2 } })
  ok(rc2.status === 200, 'otra cortesía, de 2')
  const orden2 = await Orden.findOne({ where: { email: 'otra.prueba@ejemplo.com' }, order: [['createdAt', 'DESC']] })
  creadas.push(orden2.id)
  const m = await api(`/api/admin/orden/${orden2.id}/ingresar`, { metodo: 'POST', token: T.puerta, cuerpo: { evento: EV } })
  ok(m.status === 200 && m.d.marcadas === 2, 'ingreso manual de la compra', JSON.stringify(m.d))
  await espera(6000)
  await orden2.reload()
  ok(Boolean(orden2.bienvenidaEn), 'el ingreso manual también manda la bienvenida')
  if (LOG) ok((await esperarBienvenidas(2, antes)).length === 2, 'en total, dos mails (uno por compra)')
} finally {
  // Dejar la base como estaba: sin las compras ni los usuarios de prueba, y el evento sin precios
  if (creadas.length) { await Entrada.destroy({ where: { orden_id: creadas } }); await Orden.destroy({ where: { id: creadas } }) }
  await Usuario.destroy({ where: { usuario: USUARIOS.map(u => u[1]) } })
  const ev1 = await Evento.findByPk(EV); ev1.tipos = tiposAntes; ev1.publicado = publicadoAntes; await ev1.save()
}
console.log(`\n${total - fallas}/${total} bien${fallas ? ` · ${fallas} FALLAS` : ''} (el servidor guarda el evento en memoria: reiniciarlo para que vuelva a "Entradas muy pronto")`)
process.exit(fallas ? 1 : 0)
