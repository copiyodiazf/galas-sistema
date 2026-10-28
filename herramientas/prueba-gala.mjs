// Prueba de punta a punta del molde de galas, con el pago de Chytapay SIMULADO y avisos firmados de verdad.
// Servidor local con el evento de prueba (dos funciones, la de las 21 h con cupo 3):
//   (en backend) EVENTO_ARCHIVO=../herramientas/evento-prueba.json PORT=3031 node server.js
//   node herramientas/prueba-gala.mjs 3031
// Usa los usuarios de backend/usuarios-panel.txt (jose, academia, puerta1, boleteria) y el secreto de
// avisos de backend/.env. Limpia la base antes de empezar (es la base LOCAL de prueba).
import { readFileSync } from 'fs'
import { createHmac } from 'crypto'
import { sequelize, Orden, Entrada, SinImputar } from '../backend/models/index.js'

const BASE = `http://localhost:${process.argv[2] || 3031}`
const env = Object.fromEntries(readFileSync(new URL('../backend/.env', import.meta.url), 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]))
if (env.DB_NAME !== 'gala_molde') { console.log('Esta prueba borra la base: solo corre contra gala_molde'); process.exit(1) }
const claves = {}
for (const l of readFileSync(new URL('../backend/usuarios-panel.txt', import.meta.url), 'utf8').split('\n')) { const [, u, c] = l.split('\t'); if (c) claves[u] = c.trim() }

let fallas = 0, n = 0
const ok = (cond, txt) => { console.log(`${cond ? '✓' : '✗'} ${txt}`); if (!cond) fallas++ }
async function api(ruta, { metodo = 'GET', cuerpo, token, crudo, headers = {} } = {}) {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${++n % 250}`, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: crudo ?? (cuerpo ? JSON.stringify(cuerpo) : undefined) })
  const t = await r.text(); let d; try { d = JSON.parse(t) } catch { d = t }
  return { status: r.status, d }
}
// Aviso firmado como lo firma Chytapay: HMAC-SHA256 de "{t}.{cuerpo}" con el secreto whsec_...
function aviso(cuerpo, { id = 'wh_' + Math.random().toString(36).slice(2), secreto = env.CHYTAPAY_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000) } = {}) {
  const crudo = JSON.stringify(cuerpo)
  const v1 = createHmac('sha256', secreto).update(`${t}.${crudo}`).digest('hex')
  return api('/api/webhooks/chytapay', { metodo: 'POST', crudo, headers: { 'X-Chytapay-Signature': `t=${t},v1=${v1}`, 'X-Chytapay-Webhook-Id': id } })
}
const espera = ms => new Promise(r => setTimeout(r, ms))
const login = async u => (await api('/api/admin/login', { metodo: 'POST', cuerpo: { usuario: u, password: claves[u] } })).d
const comprar = (tipo, cantidad, dni, email = `c${dni}@ejemplo.com`) => api('/api/orders', { metodo: 'POST', cuerpo: { tipo, cantidad, nombre: 'Ana Prueba', email, dni } })

// 0) Base limpia
await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} }); await SinImputar.destroy({ where: {} })

// 1) Portada y config
const portada = await fetch(BASE + '/').then(r => r.text())
ok(portada.includes('<title>Gala de Prueba 2026</title>') && !portada.includes('%%'), 'la portada sale con el nombre del evento (vista previa de WhatsApp)')
const cfg = (await api('/api/config')).d
ok(cfg.ventaAbierta && cfg.tipos.f18.final === 11000 && cfg.tipos.f21.final === 13200, 'config: venta abierta y precio final con el 10 % adentro (11.000 y 13.200)')

// 2) Usuarios
const T = { admin: (await login('jose')).token, org: (await login('academia')).token, puerta: (await login('puerta1')).token, venta: (await login('boleteria')).token }
ok(Object.values(T).every(Boolean), 'ingresan los cuatro roles')

// 3) Compra online con pago simulado
const c1 = await comprar('f18', 2, '30111222')
ok(c1.status === 200 && c1.d.pago?.pk === 'simulado' && c1.d.total === 22000, 'compra de 2 × 18 h: pide el pago por $22.000')
ok((await api(`/api/orders/${c1.d.orderId}/confirmar`, { metodo: 'POST' })).d.estado === 'pendiente', 'antes de pagar, la orden está pendiente')
await api(`/api/dev/confirmar/${c1.d.orderId}`, { metodo: 'POST' })
const r1 = (await api(`/api/orders/${c1.d.orderId}/confirmar`, { metodo: 'POST' })).d
ok(r1.estado === 'pagada' && r1.qrs.length === 2, 'pagada: 2 QR en la pantalla de resultado')

// 4) Avisos firmados de Chytapay
const c2 = await comprar('f18', 1, '30222333')
ok((await aviso({ event: 'payment_request.payment_received', referenceId: c2.d.orderId, stateType: 'total_payment', paidAmount: 11000, reconciledPayerName: 'ANA PRUEBA' }, { secreto: 'whsec_otro' })).status === 401, 'aviso con firma falsa: rechazado (401)')
ok((await aviso({ event: 'payment_request.payment_received', referenceId: c2.d.orderId, stateType: 'total_payment', paidAmount: 11000 }, { t: Math.floor(Date.now() / 1000) - 900 })).status === 401, 'aviso firmado hace 15 minutos: rechazado (no se puede repetir uno viejo)')
ok((await aviso({ event: 'payment_request.payment_received', referenceId: c2.d.orderId, stateType: 'partial_payment', paidAmount: 5000 })).status === 200, 'pago parcial: se recibe el aviso')
await espera(300)
ok((await Orden.findByPk(c2.d.orderId)).estado === 'pendiente', 'pago parcial: NO emite')
const idAviso = 'wh_pago_total_c2'
ok((await aviso({ event: 'payment_request.payment_received', referenceId: c2.d.orderId, stateType: 'total_payment', paidAmount: 11000, reconciledPayerName: 'ANA PRUEBA' }, { id: idAviso })).status === 200, 'pago total firmado: aceptado')
await espera(800)
const o2 = await Orden.findByPk(c2.d.orderId)
ok(o2.estado === 'pagada' && o2.pagador === 'ANA PRUEBA' && await Entrada.count({ where: { orden_id: o2.id } }) === 1, 'pago total: emite 1 QR y guarda quién pagó')
await aviso({ event: 'payment_request.payment_received', referenceId: c2.d.orderId, stateType: 'total_payment', paidAmount: 11000 }, { id: idAviso })
await espera(300)
ok(await Entrada.count({ where: { orden_id: o2.id } }) === 1, 'el mismo aviso repetido no emite dos veces')
const c3 = await comprar('f18', 1, '30333444')
await aviso({ event: 'payment_request.payment_received', referenceId: c3.d.orderId, stateType: 'total_payment', paidAmount: 100 })
await espera(300)
ok((await Orden.findByPk(c3.d.orderId)).estado === 'pendiente', 'aviso "pagado" por menos plata que el total: NO emite')
await aviso({ event: 'payment_request.expired', referenceId: c3.d.orderId, stateType: 'overdue', paidAmount: 0 })
await espera(300)
ok((await Orden.findByPk(c3.d.orderId)).estado === 'abandonada', 'cobro vencido: la orden queda abandonada y libera el lugar')
await aviso({ event: 'payment.unmatched', reason: 'no_cuil_match', amount: 11000, payerName: 'TIA DE ANA', payerCuil: 27111222333, operationDate: new Date().toISOString() }, { id: 'wh_sin_imputar_1' })
await espera(300)
const si = (await api('/api/admin/sin-imputar', { token: T.org })).d
ok(si.pagos?.length === 1 && si.pagos[0].pagador === 'TIA DE ANA', 'transferencia de otra persona: queda en "sin asignar" y la academia la ve')
ok((await api('/api/webhooks/chytapay', { metodo: 'POST', cuerpo: { test: true }, headers: { 'X-Chytapay-Webhook-Test': 'true' } })).status === 200, 'el aviso de prueba del Portal responde 200')
await aviso({ event: 'payment_request.payment_received', referenceId: c3.d.orderId, stateType: 'total_payment', paidAmount: 11000 })
await espera(800)
ok((await Orden.findByPk(c3.d.orderId)).estado === 'pagada', 'pago tardío que la academia asigna a mano: se emite igual')

// 5) Cupo (función 21 h, cupo 3)
const k1 = await comprar('f21', 2, '30444555')
const k2 = await comprar('f21', 2, '30555666')
ok(k1.status === 200 && k2.status === 409 && /Quedan 1/.test(k2.d.error), 'cupo: con 3 lugares y 2 reservados, pedir 2 más dice "Quedan 1"')
await api(`/api/dev/confirmar/${k1.d.orderId}`, { metodo: 'POST' })
ok((await comprar('f21', 1, '30666777')).status === 200, 'el último lugar se puede comprar')
const cfg2 = (await api('/api/config')).d
ok(cfg2.tipos.f21.estado === 'agotado' || cfg2.tipos.f21.estado === 'pocas', 'la 21 h figura agotada o con pocas')

// 6) Topes anti-abuso
await comprar('f18', 1, '31000000', 'tope@ejemplo.com'); await comprar('f18', 1, '31000000', 'tope@ejemplo.com')
ok((await comprar('f18', 1, '31000000', 'tope@ejemplo.com')).status === 429, 'tercera compra sin pagar del mismo DNI: frenada')
ok((await api('/api/orders', { metodo: 'POST', cuerpo: { tipo: 'f18', cantidad: 1, nombre: '<script>', email: 'x@ejemplo.com', dni: '30123456' } })).status === 400, 'nombre con código: rechazado')

// 7) Puerta
const qrs = (await api(`/api/admin/orden/${c1.d.orderId}/qrs`, { token: T.puerta })).d.qrs
const codigo = decodeURIComponent(qrs[0].url.split('c=')[1])
ok((await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo, tipo: 'f21' } })).d.estado === 'otro_tipo', 'puerta de la 21 h: una entrada de las 18 h no pasa')
ok((await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo } })).d.ok === true, 'la entrada pasa')
ok((await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo } })).d.estado === 'usado', 'y no pasa dos veces')
ok((await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo: codigo.slice(0, -2) + 'ff' } })).d.estado === 'invalido', 'un QR adulterado no pasa')
ok((await api('/api/validar', { metodo: 'POST', cuerpo: { codigo } })).status === 401, 'sin sesión no se puede validar')

// 8) Boletería, cortesía, roles
const vp = await api('/api/admin/venta-punto', { metodo: 'POST', token: T.venta, cuerpo: { tipo: 'f18', cantidad: 3, nombre: 'Juan Punto', email: 'juan@ejemplo.com', dni: '28999888', cobro: 'efectivo' } })
ok(vp.status === 200 && vp.d.total === 33000 && vp.d.qrs.length === 3, 'boletería: 3 × $11.000 = $33.000 (mismo precio que online) y 3 QR')
ok((await api('/api/admin/entrada-cortesia', { metodo: 'POST', token: T.admin, cuerpo: { tipo: 'f18', nombre: 'Invitada', email: 'invitada@ejemplo.com', cantidad: 2 } })).status === 200, 'cortesía emitida')
ok((await api('/api/admin/venta-punto', { metodo: 'POST', token: T.org, cuerpo: {} })).status === 403, 'la academia NO vende en boletería')
ok((await api('/api/admin/chytapay', { token: T.org })).status === 403, 'la academia NO ve la configuración de Chytapay')
ok((await api('/api/admin/resumen', { token: T.puerta })).status === 403, 'la puerta NO ve el resumen')
const res = (await api('/api/admin/resumen', { token: T.org })).d
// 18 h: 2 + 1 + 1 (tardía) online, 3 en boletería y 2 cortesías = 9. Para la academia: 7 × 10.000 + 2 × 12.000 (21 h) = 94.000.
ok(res.tipos.f18.vendidas === 9 && res.tipos.f21.vendidas === 2 && res.recaudado === 94000 && res.sinImputar === 1,
  `resumen: 9 vendidas de las 18 h, 2 de las 21 h, $94.000 para la academia y 1 sin asignar (${res.tipos?.f18?.vendidas}, ${res.recaudado})`)
ok((await api('/api/admin/exportar', { token: T.org })).status === 200, 'la academia descarga la planilla')

// 9) Mis entradas
const mis = (await api('/api/mis-entradas', { metodo: 'POST', cuerpo: { email: 'c30111222@ejemplo.com', dni: '30.111.222' } })).d
ok(mis.ordenes?.length === 1 && mis.ordenes[0].qrs.some(q => q.usado), 'mis entradas: encuentra la compra y marca la que ya ingresó')

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodo bien')
await sequelize.close()
process.exit(fallas ? 1 : 0)
