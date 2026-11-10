// Prueba de las novedades del molde (31/10/2026): etapas de precio, precio final con el cargo adentro
// (precioIncluyeCargo), último día de venta online (ventaHasta), que el panel no borre las etapas,
// boletería al precio del día y sedes de Chytapay (payment.unmatched de otra sede). Desde el 09-10/11: retomar
// la misma compra, traza de la pantalla de pago y transferencias que llegan después de vencer el cobro.
// Servidor local con el tema de la gala y el pago SIMULADO, en una base LOCAL de prueba:
//   (en backend) TEMA=patin-fa DB_NAME=gala_quinto PORT=3045 CHYTAPAY_SEDE=patin-fa node server.js
//   DB_NAME=gala_quinto node herramientas/prueba-etapas.mjs 3045 usuarios-panel-quinto.txt
// Usuarios: admin jose y venta boleteria (crear-usuarios.mjs con USUARIOS_ARCHIVO=usuarios-panel-quinto.txt).
import { readFileSync } from 'fs'
import { createHmac } from 'crypto'
import { sequelize, Orden, SinImputar } from '../backend/models/index.js'

const BASE = `http://localhost:${process.argv[2] || 3045}`
const env = Object.fromEntries(readFileSync(new URL('../backend/.env', import.meta.url), 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]))
if (!/^(localhost|127\.0\.0\.1)$/.test(env.DB_HOST)) { console.log('Solo contra la base local'); process.exit(1) }
const claves = {}
for (const l of readFileSync(new URL(`../backend/${process.argv[3] || 'usuarios-panel-quinto.txt'}`, import.meta.url), 'utf8').split('\n')) { const [, u, c] = l.split('\t'); if (c) claves[u] = c.trim() }

let fallas = 0, n = 0
const ok = (cond, txt) => { console.log(`${cond ? '✓' : '✗'} ${txt}`); if (!cond) fallas++ }
async function api(ruta, { metodo = 'GET', cuerpo, token, crudo, headers = {} } = {}) {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `203.0.113.${++n % 250}`, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: crudo ?? (cuerpo ? JSON.stringify(cuerpo) : undefined) })
  const t = await r.text(); let d; try { d = JSON.parse(t) } catch { d = t }
  return { status: r.status, d }
}
function aviso(cuerpo) {
  const crudo = JSON.stringify(cuerpo), t = Math.floor(Date.now() / 1000)
  const v1 = createHmac('sha256', env.CHYTAPAY_WEBHOOK_SECRET).update(`${t}.${crudo}`).digest('hex')
  return api('/api/webhooks/chytapay', { metodo: 'POST', crudo, headers: { 'X-Chytapay-Signature': `t=${t},v1=${v1}`, 'X-Chytapay-Webhook-Id': 'wh_' + Math.random().toString(36).slice(2) } })
}
const espera = ms => new Promise(r => setTimeout(r, ms))
const login = async u => (await api('/api/admin/login', { metodo: 'POST', cuerpo: { usuario: u, password: claves[u] } })).d.token
const dia = d => new Date(Date.now() - 3 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)   // hoy ± d, hora argentina
const T = { admin: await login('jose'), venta: await login('boleteria') }
ok(T.admin && T.venta, 'login de admin y boletería')
const incluye = (await api('/api/admin/config', { token: T.admin })).d.precioIncluyeCargo
const fin = p => incluye ? p : p + Math.round(p * 0.1)   // precio final que ve el público

// 1) Portada propia del tema y su imagen para compartir
const portada = await fetch(BASE + '/').then(r => r.text())
ok(!portada.includes('%%') && /<title>[^<]+<\/title>/.test(portada), 'la portada sale con el nombre (sin marcas sin reemplazar)')
const molde = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8')
ok(portada.length !== molde.length, 'usa la portada del tema, no la del molde')

// 2) Evento nuevo con etapas: la primera ya pasó, la segunda rige
const nuevo = await api('/api/admin/eventos', { metodo: 'POST', token: T.admin, cuerpo: { nombre: 'Prueba etapas', fecha: dia(10), hora: '17:00',
  tipos: [{ id: 'general', nombre: 'General', precio: 3000, cupo: 50, etapas: [{ hasta: dia(-1), precio: 1000, nombre: 'Primera' }, { hasta: dia(5), precio: 2000, nombre: 'Segunda' }] }] } })
ok(nuevo.status === 200, 'crea el evento con etapas')
const ID = nuevo.d.id
let cfg = (await api('/api/config')).d, ev = cfg.eventos.find(e => e.id === ID), t = ev?.tipos.general
ok(t?.final === fin(2000), `rige la segunda etapa: ${t?.final}`)
ok(t?.etapas?.[0].paso && !t.etapas[0].vigente && t.etapas[1].vigente, 'la primera figura como pasada y la segunda como vigente')
ok(t?.finalDespues === fin(3000), 'después de las etapas, el precio base')

// 3) Compra online de 3: total exacto
const c = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: ID, tipo: 'general', cantidad: 3, nombre: 'Ana Etapas', email: 'ana.etapas@ejemplo.com', dni: '30111222' } })
ok(c.status === 200 && c.d.orderId, 'crea la orden')
const o = c.d.orderId ? await Orden.findByPk(c.d.orderId, { raw: true }) : null
ok(o && o.total === fin(2000) * 3 && o.subtotal + o.cargo === o.total, `total ${o?.total} = 3 × ${fin(2000)} (academia ${o?.subtotal}, cargo ${o?.cargo})`)
if (incluye) ok(o && o.subtotal === Math.round(6000 / 1.1), 'con el cargo adentro, la academia recibe total ÷ 1,10')

// 4) Editar desde el panel SIN mandar las etapas: se conservan
const ed = await api(`/api/admin/eventos/${ID}`, { metodo: 'PUT', token: T.admin, cuerpo: { nombre: 'Prueba etapas', fecha: dia(10), tipos: [{ id: 'general', nombre: 'General', precio: 3000, cupo: 60 }] } })
ok(ed.status === 200, 'edita el evento como lo hace el panel')
cfg = (await api('/api/config')).d; t = cfg.eventos.find(e => e.id === ID)?.tipos.general
ok(t?.etapas?.length === 2 && t.final === fin(2000), 'las etapas siguen ahí')

// 5) Validaciones de la ficha
ok((await api('/api/admin/eventos', { metodo: 'POST', token: T.admin, cuerpo: { nombre: 'Mal orden', fecha: dia(10), tipos: [{ nombre: 'G', precio: 10, cupo: 5, etapas: [{ hasta: dia(5), precio: 1 }, { hasta: dia(2), precio: 2 }] }] } })).status === 400, 'rechaza etapas fuera de orden')
ok((await api('/api/admin/eventos', { metodo: 'POST', token: T.admin, cuerpo: { nombre: 'Venta tarde', fecha: dia(10), ventaHasta: dia(11), tipos: [{ nombre: 'G', precio: 10, cupo: 5 }] } })).status === 400, 'rechaza un último día de venta después del evento')

// 6) Venta online cerrada por fecha (ventaHasta ayer): no se vende online, la boletería sí
const cerrado = await api('/api/admin/eventos', { metodo: 'POST', token: T.admin, cuerpo: { nombre: 'Solo puerta', fecha: dia(3), ventaHasta: dia(-1),
  tipos: [{ id: 'general', nombre: 'General', precio: 2600, cupo: 50, etapas: [{ hasta: dia(-1), precio: 2400 }] }] } })
const ID2 = cerrado.d.id
ev = (await api('/api/config')).d.eventos.find(e => e.id === ID2)
ok(ev && ev.vendible === false && ev.tipos.general.final === fin(2600), 'después del último día: no vendible online y rige el precio de puerta')
ok((await api('/api/orders', { metodo: 'POST', cuerpo: { evento: ID2, tipo: 'general', cantidad: 1, nombre: 'Beto Tarde', email: 'beto@ejemplo.com', dni: '30111333' } })).status === 400, 'la compra online se rechaza')
const p = await api('/api/admin/venta-punto', { metodo: 'POST', token: T.venta, cuerpo: { evento: ID2, tipo: 'general', cantidad: 2, nombre: 'Caro Puerta', email: 'caro@ejemplo.com', dni: '30111444', cobro: 'efectivo' } })
ok(p.status === 200 && p.d.total === fin(2600) * 2, `la boletería vende al precio de puerta: ${p.d.total}`)
const ac = (await api('/api/admin/config', { token: T.venta })).d.eventos.find(e => e.id === ID2)
ok(ac?.tipos[0].unidadPunto === fin(2600), 'el panel recibe el precio por entrada de la boletería')

// 6b) La pantalla de pago no abrió y vuelve a tocar "Ir a pagar": se retoma el mismo cobro (09/11, Vanesa)
const datosR = { evento: ID, tipo: 'general', nombre: 'Rita Retoma', email: 'retoma@ejemplo.com', dni: '30111999' }
const r1 = await api('/api/orders', { metodo: 'POST', cuerpo: { ...datosR, cantidad: 1 } })
const r2 = await api('/api/orders', { metodo: 'POST', cuerpo: { ...datosR, cantidad: 1 } })
ok(r2.status === 200 && r2.d.retomada === true && r2.d.orderId === r1.d.orderId && r2.d.pago?.paymentId === r1.d.pago?.paymentId,
  'la misma compra otra vez: retoma el mismo cobro, no crea otro')
ok((await api('/api/orders', { metodo: 'POST', cuerpo: { ...datosR, cantidad: 2 } })).status === 200, 'otra cantidad: es otra compra')
const r3 = await api('/api/orders', { metodo: 'POST', cuerpo: { ...datosR, cantidad: 3 } })
ok(r3.status === 429 && /retomar/.test(r3.d.error || ''), 'tercera compra distinta sin pagar: frenada, y explica cómo retomar')
// Traza de la pantalla de pago: el navegador una sola vez y después los pasos
await api(`/api/orders/${r1.d.orderId}/traza`, { metodo: 'POST', cuerpo: { paso: 'SDK cargado 120ms' }, headers: { 'User-Agent': 'Prueba/1.0 (iPhone)' } })
await espera(300)
await api(`/api/orders/${r1.d.orderId}/traza`, { metodo: 'POST', cuerpo: { paso: 'pantalla: ready | inyectado\nx' } })
await espera(300)
const tz = (await Orden.findByPk(r1.d.orderId, { raw: true }))?.traza || ''
ok(/^\[Prueba\/1\.0 \(iPhone\)\] \d\d:\d\d:\d\d SDK cargado 120ms \| \d\d:\d\d:\d\d pantalla: ready +inyectado x$/.test(tz), 'traza: navegador + pasos, sin poder colar separadores')
ok((await api('/api/orders/orden_no-existe/traza', { metodo: 'POST', cuerpo: { paso: 'x' } })).status === 204, 'traza de una orden que no existe: se ignora')

// 7) Sedes de Chytapay
const cy = (await api('/api/admin/chytapay', { token: T.admin })).d
ok(cy.sede === (env.CHYTAPAY_SEDE || process.env.CHYTAPAY_SEDE || cy.sede), `muestra la sede de esta gala (${cy.sede || 'sin sede'})`)
if (cy.sede) {
  const antes = await SinImputar.count()
  await aviso({ event: 'payment.unmatched', tenantKey: 'otra-gala', reason: 'no_match', amount: 5000, payerName: 'De Otra Sede' })
  await aviso({ event: 'payment.unmatched', tenantKey: cy.sede, reason: 'no_match', amount: 7000, payerName: 'De Esta Sede' })
  await espera(400)
  const nuevos = await SinImputar.findAll({ where: {}, order: [['id', 'DESC']], limit: 2, raw: true })
  ok(await SinImputar.count() === antes + 1 && nuevos[0]?.pagador === 'De Esta Sede', 'guarda el pago sin imputar de su sede e ignora el de otra')
}

// 7b) Transferencia que llega después de vencer el cobro (10/11, Alan: el banco la demoró 34 minutos)
ok((await api('/api/config')).d.reservaMinutos === 60, 'el cobro dura 60 minutos (el máximo de Chytapay)')
const tarde = async (nombre, dni) => {
  const r = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: ID, tipo: 'general', cantidad: 2, nombre, email: `${dni}@ejemplo.com`, dni } })
  await aviso({ event: 'payment_request.expired', referenceId: r.d.orderId })
  return { id: r.d.orderId, total: r.d.total }
}
const sinAsignar = (o, extra) => aviso({ event: 'payment.unmatched', ...(cy.sede ? { tenantKey: cy.sede } : {}), reason: 'expired', amount: o.total,
  payerName: 'Pagó Tarde', paymentRequest: { referenceId: o.id }, operationDate: new Date().toISOString(), ...extra })
const estado = async id => { await espera(500); const x = await Orden.findByPk(id, { raw: true }); return { estado: x?.estado, qr: await sequelize.query(`SELECT COUNT(*) n FROM entradas WHERE orden_id = ${sequelize.escape(id)}`, { plain: true }).then(f => Number(f.n)) } }
const filaDe = id => SinImputar.findOne({ where: { orden_id: id }, order: [['id', 'DESC']], raw: true })
const L = await tarde('Lara Tarde', '30111555')
ok((await estado(L.id)).estado === 'abandonada', 'tardía: el cobro venció y la compra quedó sin pagar')
await sinAsignar(L, { payerCuil: '27301115554' })
let e1 = await estado(L.id), f1 = await filaDe(L.id)
for (let i = 0; i < 20 && f1 && !Number(f1.emitida); i++) { await espera(250); f1 = await filaDe(L.id) }   // se marca después del mail
ok(e1.estado === 'pagada' && e1.qr === 2, `tardía, mismo DNI y por el total: se emite sola (${e1.estado}, ${e1.qr} QR)`)
ok(f1 && Boolean(Number(f1.emitida)) && !Number(f1.resuelto), 'queda en "sin asignar" marcada como emitida, para que la academia la asigne en Chytapay')
await aviso({ event: 'payment_request.payment_received', referenceId: L.id, stateType: 'total_payment', paidAmount: L.total })
e1 = await estado(L.id); f1 = await filaDe(L.id)
ok(e1.qr === 2 && Boolean(Number(f1?.resuelto)), 'cuando la academia la asigna: no emite dos veces y la fila queda resuelta')
const M = await tarde('Mario Otro', '30111666')
await sinAsignar(M, { payerCuil: '20999999990' })
const e2 = await estado(M.id), f2 = await filaDe(M.id)
ok(e2.estado === 'abandonada' && e2.qr === 0 && f2 && !Number(f2.emitida), 'tardía desde la cuenta de otra persona: no se emite, la decide la academia')
const N = await tarde('Nora Menos', '30111777')
await sinAsignar(N, { payerCuil: '27301117774', amount: N.total - 500 })
ok((await estado(N.id)).estado === 'abandonada', 'tardía por menos del total: no se emite')
const P = await tarde('Pia SinCuil', '30111888')
await sinAsignar(P)
ok((await estado(P.id)).estado === 'abandonada', 'tardía sin CUIL del que pagó: no se emite')

// Limpieza: borra lo que creó esta prueba
await Orden.destroy({ where: { evento: [ID, ID2] } })
await sequelize.query('DELETE FROM entradas WHERE orden_id NOT IN (SELECT id FROM ordenes)').catch(() => {})
for (const id of [ID, ID2]) await api(`/api/admin/eventos/${id}`, { metodo: 'DELETE', token: T.admin })
await SinImputar.destroy({ where: { pagador: ['De Esta Sede', 'Pagó Tarde'] } })
await sequelize.close()
console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ Todo OK')
process.exit(fallas ? 1 : 0)
