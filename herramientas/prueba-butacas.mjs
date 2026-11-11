// Prueba de las butacas numeradas (tema santiago-ritmica), con el pago SIMULADO y avisos firmados de verdad.
// Servidor local:
//   (en backend) TEMA=santiago-ritmica DB_NAME=gala_ritmica PORT=3047 node server.js
//   (en backend) DB_NAME=gala_ritmica node ../herramientas/prueba-butacas.mjs 3047
// Borra las compras de la base LOCAL gala_ritmica y crea sus usuarios de prueba (la clave no sirve en ningún otro lado).
import { readFileSync } from 'fs'
import { createHmac, randomBytes, scryptSync } from 'crypto'
import { sequelize, Orden, Entrada, SinImputar, Usuario, Evento } from '../backend/models/index.js'

if (process.env.DB_NAME !== 'gala_ritmica') { console.log('Esta prueba borra compras: solo corre contra la base local gala_ritmica (DB_NAME=gala_ritmica)'); process.exit(1) }
const BASE = `http://localhost:${process.argv[2] || 3047}`
const env = Object.fromEntries(readFileSync(new URL('../backend/.env', import.meta.url), 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]))
const EV = 'gala-santiago-ritmica-2026'
const CLAVE = 'prueba-local-' + randomBytes(4).toString('hex')

let fallas = 0, n = 0, total = 0
const ok = (cond, txt, extra = '') => { total++; console.log(`${cond ? '✓' : '✗'} ${txt}${!cond && extra ? '  → ' + extra : ''}`); if (!cond) fallas++ }
async function api(ruta, { metodo = 'GET', cuerpo, token, crudo, headers = {}, ip } = {}) {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || `198.51.100.${++n % 250}`, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: crudo ?? (cuerpo ? JSON.stringify(cuerpo) : undefined) })
  const t = await r.text(); let d; try { d = JSON.parse(t) } catch { d = t }
  return { status: r.status, d }
}
function aviso(cuerpo, id = 'wh_' + Math.random().toString(36).slice(2)) {
  const crudo = JSON.stringify(cuerpo), t = Math.floor(Date.now() / 1000)
  const v1 = createHmac('sha256', env.CHYTAPAY_WEBHOOK_SECRET).update(`${t}.${crudo}`).digest('hex')
  return api('/api/webhooks/chytapay', { metodo: 'POST', crudo, headers: { 'X-Chytapay-Signature': `t=${t},v1=${v1}`, 'X-Chytapay-Webhook-Id': id } })
}
const espera = ms => new Promise(r => setTimeout(r, ms))
const comprar = (butacas, dni, email = `c${dni}@ejemplo.com`) => api('/api/orders', { metodo: 'POST', cuerpo: { evento: EV, butacas, nombre: 'Ana Prueba', email, dni } })
const ocupadas = async (orden) => new Set((await api(`/api/sala?evento=${EV}${orden ? '&orden=' + orden : ''}`)).d.ocupadas || [])

// 0) Base limpia, usuarios de prueba y el evento como lo deja la ficha
await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} }); await SinImputar.destroy({ where: {} })
for (const [rol, usuario] of [['admin', 'jose'], ['organizador', 'eugenia'], ['control', 'puerta1'], ['venta', 'boleteria']]) {
  const salt = randomBytes(16).toString('hex'), hash = scryptSync(CLAVE, salt, 64).toString('hex')
  const [u, nuevo] = await Usuario.findOrCreate({ where: { usuario }, defaults: { usuario, rol, salt, hash } })
  if (!nuevo) await u.update({ rol, salt, hash, activo: true })
}
const ev0 = await Evento.findByPk(EV)
ev0.bloqueadas = []; ev0.publicado = false
ev0.tipos = [{ id: 'platea', nombre: 'Platea', corto: 'Platea', detalle: 'Butaca numerada', precio: 10000, cupo: 337 }]
await ev0.save()
const login = async u => (await api('/api/admin/login', { metodo: 'POST', cuerpo: { usuario: u, password: CLAVE } })).d.token
const T = { admin: await login('jose'), org: await login('eugenia'), puerta: await login('puerta1'), venta: await login('boleteria') }
// El panel recarga la cartelera en memoria al editar: se publica desde ahí.
let r = await api(`/api/admin/eventos/${EV}`, { metodo: 'PUT', token: T.org, cuerpo: { publicado: true, ventaAbierta: true,
  tipos: [{ id: 'platea', nombre: 'Platea', corto: 'Platea', detalle: 'Butaca numerada', precio: 10000, cupo: 337 }] } })
ok(r.status === 200, 'la organización publica la gala desde el panel', JSON.stringify(r.d))

// 1) El plano
const cfg = (await api('/api/config')).d
const sala = cfg.sitio.sala
ok(sala?.total === 337 && sala.filas.length === 14, 'config: la sala del Paraninfo, 14 filas y 337 butacas')
ok(sala.filas[0].asientos === 22 && sala.filas[1].asientos === 21 && sala.filas.slice(2, 12).every(f => f.asientos === 26), 'filas 1 (22), 2 (21) y 3 a 12 (26)')
ok(sala.filas[12].bloques[1].texto === 'Cabina' && sala.filas[12].asientos === 18 && sala.filas[13].asientos === 16 && sala.filas[13].zona === 'Zona verde', 'fila 13: 9 + cabina + 9 · fila 14 (zona verde): 8 + 8')
ok(sala.asiento1 === 'derecha', 'el asiento 1 de cada fila, a la derecha del plano (mirando desde el escenario, a su izquierda)')
ok(cfg.eventos[0]?.vendible && cfg.eventos[0].tipos.platea.final === 10000, 'la gala está a la venta: platea a $10.000 final')
ok((await ocupadas()).size === 0, 'al empezar no hay butacas ocupadas')

// 2) Compra online con butacas
const c1 = await comprar(['5-12', '5-13'], '30111222')
ok(c1.status === 200 && c1.d.total === 20000 && c1.d.pago?.pk === 'simulado', 'compra de 2 butacas (fila 5: 12 y 13): $20.000', JSON.stringify(c1.d))
let oc = await ocupadas()
ok(oc.has('5-12') && oc.has('5-13') && oc.size === 2, 'mientras paga, sus butacas aparecen ocupadas para los demás')
ok(!(await ocupadas(c1.d.orderId)).has('5-12'), '…pero libres para su propio navegador (puede volver a pagarlas)')
r = await comprar(['5-13', '5-14'], '30999888')
ok(r.status === 409 && r.d.ocupadas?.includes('5-13') && /Fila 5 · Asiento 13/.test(r.d.error), 'otra persona no puede tomar una butaca que se está pagando (409 y cuál)', JSON.stringify(r.d))
r = await comprar(['5-12', '5-13'], '30111222')
ok(r.status === 200 && r.d.retomada && r.d.orderId === c1.d.orderId, 'la misma persona con las mismas butacas retoma su compra (no crea otra)')
const c1b = await comprar(['6-1', '6-2'], '30111222')
ok(c1b.status === 200 && c1b.d.orderId !== c1.d.orderId, 'si cambia de butacas, se crea otra compra')
ok((await Orden.findByPk(c1.d.orderId)).estado === 'abandonada' && !(await ocupadas()).has('5-12'), '…y las que tenía antes se liberan')
r = await comprar(['15-1'], '30222333')
ok(r.status === 400, 'una butaca que no existe se rechaza')
r = await comprar(['7-1', '7-1'], '30222333')
ok(r.status === 400, 'la misma butaca dos veces se rechaza')
r = await comprar(Array.from({ length: 11 }, (_, i) => `8-${i + 1}`), '30222333')
ok(r.status === 400 && /hasta 10/.test(r.d.error), 'más de 10 butacas por compra se rechaza', JSON.stringify(r.d))
r = await comprar([], '30222333')
ok(r.status === 400, 'sin butacas no se puede comprar')

// 3) Zonas con otro precio: un tipo "zona-verde" en el evento y la fila 14 pasa sola a ese tipo
r = await api(`/api/admin/eventos/${EV}`, { metodo: 'PUT', token: T.admin, cuerpo: { tipos: [
  { id: 'platea', nombre: 'Platea', corto: 'Platea', detalle: 'Butaca numerada', precio: 10000, cupo: 337 },
  { id: 'zona-verde', nombre: 'Zona verde', corto: 'Z. verde', detalle: 'Fila 14', precio: 8000, cupo: 16 }] } })
ok(r.status === 200, 'se agrega el tipo "Zona verde" a $8.000', JSON.stringify(r.d))
r = await comprar(['14-1', '5-1'], '30333444')
ok(r.status === 400 && /distinto precio/.test(r.d.error), 'butacas de zonas con distinto precio en la misma compra: se rechaza')
const cVerde = await comprar(['14-1', '14-2'], '30333444')
ok(cVerde.status === 200 && cVerde.d.total === 16000, 'dos de la zona verde: $16.000 (su precio)', JSON.stringify(cVerde.d))
ok((await Orden.findByPk(cVerde.d.orderId)).tipo === 'zona-verde', 'la compra queda con el tipo de la zona')

// 4) Pago, QR con la butaca y puerta
await api(`/api/dev/confirmar/${c1b.d.orderId}`, { metodo: 'POST' })
const pagada = (await api(`/api/orders/${c1b.d.orderId}/confirmar`, { metodo: 'POST' })).d
ok(pagada.estado === 'pagada' && pagada.qrs.length === 2, 'pagada: 2 QR')
ok(pagada.qrs.map(q => q.butaca).join(' | ') === 'Fila 6 · Asiento 1 | Fila 6 · Asiento 2', 'cada QR lleva su butaca', JSON.stringify(pagada.qrs.map(q => q.butaca)))
const ent = await Entrada.findAll({ where: { orden_id: c1b.d.orderId }, order: [['indice', 'ASC']] })
ok(ent.map(e => e.butaca).join(',') === '6-1,6-2', 'las entradas guardan la butaca (6-1, 6-2)')
const puerta = (await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo: ent[0].codigo, evento: EV } })).d
ok(puerta.ok && puerta.butaca === 'Fila 6 · Asiento 1', 'en la puerta, al escanear, sale la butaca para indicarle a dónde ir', JSON.stringify(puerta))
const mias = (await api('/api/mis-entradas', { metodo: 'POST', cuerpo: { email: 'c30111222@ejemplo.com', dni: '30111222' } })).d
ok(mias.ordenes?.[0]?.qrs?.[1]?.butaca === 'Fila 6 · Asiento 2', '"Mis entradas" muestra la butaca de cada QR')

// 5) Butacas guardadas por la organización
r = await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['7-1', '7-2', '7-3'], bloquear: true } })
ok(r.status === 200, 'la organización guarda 3 butacas (fila 7: 1 a 3)')
oc = await ocupadas()
ok(oc.has('7-1') && oc.has('7-3'), 'las guardadas aparecen ocupadas en la compra (sin decir por qué)')
r = await comprar(['7-2'], '30444555')
ok(r.status === 409, 'no se pueden comprar online')
r = await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['6-1'], bloquear: true } })
ok(r.status === 409, 'no se puede guardar una butaca ya vendida')
r = await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.venta, cuerpo: { evento: EV, butacas: ['8-1'], bloquear: true } })
ok(r.status === 403, 'la boletería no guarda butacas')
r = await api('/api/admin/entrada-cortesia', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['7-1', '7-2'], nombre: 'Familia Molina', email: 'familia@ejemplo.com' } })
ok(r.status === 200 && r.d.cantidad === 2, 'cortesía con 2 de las guardadas', JSON.stringify(r.d))
ok(JSON.stringify((await Evento.findByPk(EV)).bloqueadas) === '["7-3"]', 'las que se dieron dejan de estar guardadas (queda la 7-3)')
r = await api('/api/admin/entrada-cortesia', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['6-2'], nombre: 'Otra', email: 'otra@ejemplo.com' } })
ok(r.status === 409, 'una cortesía no puede usar una butaca vendida')
r = await api(`/api/admin/eventos/${EV}`, { metodo: 'PUT', token: T.org, cuerpo: { subtitulo: 'Santiago Rítmica · Gala 2026 · 10 años' } })
ok(r.status === 200 && JSON.stringify((await Evento.findByPk(EV)).bloqueadas) === '["7-3"]', 'editar la gala en el panel no borra las guardadas')
r = await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['7-3'], bloquear: false } })
ok(r.status === 200 && !(await ocupadas()).has('7-3'), 'la que queda se larga de nuevo a la venta')

// 6) Boletería
r = await api('/api/admin/venta-punto', { metodo: 'POST', token: T.venta, cuerpo: { evento: EV, butacas: ['8-5', '8-6'], cobro: 'efectivo', nombre: 'Juan Boleteria', email: 'juan@ejemplo.com', dni: '30555666' } })
ok(r.status === 200 && r.d.total === 20000 && r.d.qrs[0].butaca === 'Fila 8 · Asiento 5', 'la boletería vende 2 butacas elegidas en el plano y el QR sale con la butaca', JSON.stringify(r.d))
r = await api('/api/admin/venta-punto', { metodo: 'POST', token: T.venta, cuerpo: { evento: EV, butacas: ['8-6'], cobro: 'efectivo', nombre: 'Pedro Boleteria', email: 'pedro@ejemplo.com', dni: '30555667' } })
ok(r.status === 409, 'la boletería tampoco puede vender una ya vendida')

// 7) El plano del panel
const sOrg = (await api(`/api/admin/sala?evento=${EV}`, { token: T.org })).d
ok(sOrg.butacas['6-1']?.estado === 'vendida' && sOrg.butacas['6-1'].nombre === 'Ana Prueba' && sOrg.butacas['6-1'].entro === true, 'panel: la 6-1 vendida, de quién es y que ya entró')
ok(sOrg.butacas['7-1']?.estado === 'cortesia' && sOrg.butacas['14-1']?.estado === 'pagando' && sOrg.butacas['8-5']?.metodo === 'punto', 'panel: cortesías, pagándose y vendidas en la boletería')
ok(sOrg.cuentas.vendida === 4 && sOrg.cuentas.cortesia === 2 && sOrg.cuentas.pagando === 2 && sOrg.cuentas.libres === 337 - 8, 'panel: las cuentas (4 vendidas, 2 cortesías, 2 pagándose, 329 libres)', JSON.stringify(sOrg.cuentas))
const sVenta = (await api(`/api/admin/sala?evento=${EV}`, { token: T.venta })).d
ok(sVenta.butacas['6-1']?.estado === 'vendida' && !sVenta.butacas['6-1'].nombre, 'la boletería ve qué está ocupado, pero no de quién')
const res = (await api(`/api/admin/resumen?evento=${EV}`, { token: T.org })).d
ok(res.tipos.platea.cupo === 321 && res.tipos['zona-verde'].cupo === 16, 'resumen: la capacidad de cada tipo son sus butacas (321 platea, 16 zona verde)', JSON.stringify(res.tipos))
const ops = (await api(`/api/admin/operaciones?evento=${EV}&estado=pagada`, { token: T.org })).d
ok(ops.ordenes.some(o => o.butacas === 'Fila 6: 1, 2'), 'operaciones: cada compra con sus butacas')
const csv = await fetch(`${BASE}/api/admin/exportar?evento=${EV}`, { headers: { Authorization: 'Bearer ' + T.org } }).then(x => x.text())
ok(/;"butacas";|;butacas;/.test(csv.split('\n')[0]) && csv.includes('Fila 8: 5, 6'), 'la planilla lleva la columna de butacas')

// 8) La transferencia que llega tarde, cuando sus butacas ya se vendieron
const tarde = await comprar(['9-10', '9-11'], '30666777')
await aviso({ event: 'payment_request.expired', referenceId: tarde.d.orderId, stateType: 'overdue', paidAmount: 0 })
await espera(400)
await Orden.update({ createdAt: new Date(Date.now() - 2 * 3600e3) }, { where: { id: tarde.d.orderId } })
const gana = await comprar(['9-10'], '30777888')
ok(gana.status === 200, 'su compra venció y otra persona toma la 9-10')
await api(`/api/dev/confirmar/${gana.d.orderId}`, { metodo: 'POST' })
await aviso({ event: 'payment_request.payment_received', referenceId: tarde.d.orderId, stateType: 'total_payment', paidAmount: 20000, reconciledPayerName: 'TARDE' })
await espera(900)
const oTarde = await Orden.findByPk(tarde.d.orderId)
const nuevas = String(oTarde.butacas).split(',')
ok(oTarde.estado === 'pagada' && nuevas.length === 2 && !nuevas.includes('9-10'), 'llega su pago: se emite igual, con otras 2 butacas (la 9-10 ya era de otra persona)', `${oTarde.estado} ${oTarde.butacas}`)
ok(nuevas[0].split('-')[0] === nuevas[1].split('-')[0] && Math.abs(nuevas[0].split('-')[1] - nuevas[1].split('-')[1]) === 1, 'las nuevas son juntas, en la misma fila', oTarde.butacas)
ok((await Entrada.findAll({ where: { orden_id: oTarde.id } })).map(e => e.butaca).sort().join(',') === [...nuevas].sort().join(','), 'y sus QR llevan las butacas nuevas')

// 9) Pago tarde sin ninguna butaca libre de su zona: no se emite, queda para la academia
const sinLugar = await comprar(['14-3'], '30888999')
await aviso({ event: 'payment_request.expired', referenceId: sinLugar.d.orderId, stateType: 'overdue', paidAmount: 0 })
await espera(300)
await Orden.update({ createdAt: new Date(Date.now() - 2 * 3600e3) }, { where: { id: sinLugar.d.orderId } })
const libresVerde = Array.from({ length: 16 }, (_, i) => `14-${i + 1}`).filter(id => !['14-1', '14-2'].includes(id))
r = await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: libresVerde, bloquear: true } })
ok(r.status === 200, 'la organización guarda todas las de la zona verde que quedaban')
await aviso({ event: 'payment_request.payment_received', referenceId: sinLugar.d.orderId, stateType: 'total_payment', paidAmount: 8000 })
await espera(800)
ok((await Orden.findByPk(sinLugar.d.orderId)).estado === 'abandonada', 'paga, pero no queda ninguna butaca de su zona: NO se emite')
const si = (await api('/api/admin/sin-imputar', { token: T.org })).d.pagos.find(p => p.orden === sinLugar.d.orderId)
ok(si?.motivo === 'sin_butacas' && !si.resuelto, 'queda en "Transferencias sin asignar" para que lo resuelva la academia')
await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['14-16'], bloquear: false } })
await aviso({ event: 'payment_request.payment_received', referenceId: sinLugar.d.orderId, stateType: 'total_payment', paidAmount: 8000 })
await espera(800)
const oSin = await Orden.findByPk(sinLugar.d.orderId)
ok(oSin.estado === 'pagada' && oSin.butacas === '14-16', 'se libera una y el aviso siguiente la emite con esa butaca', `${oSin.estado} ${oSin.butacas}`)
ok((await SinImputar.findOne({ where: { avisoId: `sin_butacas_${sinLugar.d.orderId}` } }))?.resuelto, 'y la fila de "sin asignar" queda resuelta')

// 10) Lo que no cambia
ok((await api('/api/admin/entrada-prueba', { metodo: 'POST', token: T.admin, cuerpo: { evento: EV } })).status === 200, 'la entrada de prueba (sin butaca) sigue andando')
r = await api(`/api/sala?evento=no-existe`)
ok(r.status === 404, 'el plano de un evento que no existe da 404')

// Limpieza (base local): sin compras y sin guardadas; el evento queda oculto como en la ficha
await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} }); await SinImputar.destroy({ where: {} })
const evF = await Evento.findByPk(EV); evF.bloqueadas = []; await evF.save()
console.log(`\n${total - fallas} de ${total} bien${fallas ? `, ${fallas} MAL` : ''}`)
await sequelize.close()
process.exit(fallas ? 1 : 0)
