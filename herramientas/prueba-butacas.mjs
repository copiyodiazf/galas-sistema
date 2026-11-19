// Prueba de las butacas numeradas (tema santiago-ritmica), con el pago SIMULADO y avisos firmados de verdad.
// Servidor local:
//   (en backend) TEMA=santiago-ritmica DB_NAME=gala_ritmica PORT=3047 node server.js
//   (en backend) DB_NAME=gala_ritmica node ../herramientas/prueba-butacas.mjs 3047
// Borra las compras de la base LOCAL gala_ritmica y crea sus usuarios de prueba (la clave no sirve en ningún otro lado).
import { readFileSync } from 'fs'
import { createHmac, randomBytes, scryptSync } from 'crypto'
import { sequelize, Orden, Entrada, SinImputar, Usuario, Evento } from '../backend/models/index.js'
import { crearApartadas } from '../backend/apartadas.js'

if (process.env.DB_NAME !== 'gala_ritmica') { console.log('Esta prueba borra compras: solo corre contra la base local gala_ritmica (DB_NAME=gala_ritmica)'); process.exit(1) }
const BASE = `http://localhost:${process.argv[2] || 3047}`
const env = Object.fromEntries(readFileSync(new URL('../backend/.env', import.meta.url), 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]))
// Tres funciones el domingo 13/12 con la misma sala (16 h muestra, 18 h y 21 h): cada una con sus butacas.
const EV = 'el-origen-de-ser-18', EV2 = 'el-origen-de-ser-21', MUESTRA = 'divas-del-pop'
// Platea $20.000 y zona verde $10.000, más el 10 % de servicio encima (desgloseServicio)
const TIPOS = [{ id: 'platea', nombre: 'Platea', corto: 'Platea', detalle: 'Filas 1 a 13 · butaca numerada', precio: 20000, cupo: 321 },
  { id: 'zona-verde', nombre: 'Zona verde', corto: 'Zona verde', detalle: 'Fila 14, al fondo, detrás de la cabina', precio: 10000, cupo: 16 }]
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
const comprar = (butacas, dni, email = `c${dni}@ejemplo.com`, evento = EV) => api('/api/orders', { metodo: 'POST', cuerpo: { evento, butacas, nombre: 'Ana Prueba', email, dni } })
const ocupadas = async (orden, evento = EV) => new Set((await api(`/api/sala?evento=${evento}${orden ? '&orden=' + orden : ''}`)).d.ocupadas || [])
// El plano público tiene 3 segundos de caché: para ver lo que cambió recién por la base, se espera a que venza.
const ocupacion10 = async () => { await espera(3100); return ocupadas() }

// 0) Base limpia, usuarios de prueba y el evento como lo deja la ficha
await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} }); await SinImputar.destroy({ where: {} })
for (const [rol, usuario] of [['admin', 'jose'], ['organizador', 'eugenia'], ['control', 'puerta1'], ['venta', 'boleteria']]) {
  const salt = randomBytes(16).toString('hex'), hash = scryptSync(CLAVE, salt, 64).toString('hex')
  const [u, nuevo] = await Usuario.findOrCreate({ where: { usuario }, defaults: { usuario, rol, salt, hash } })
  if (!nuevo) await u.update({ rol, salt, hash, activo: true })
}
for (const id of [EV, EV2, MUESTRA]) {
  const ev0 = await Evento.findByPk(id)
  ev0.bloqueadas = []; ev0.reservadas = []; ev0.publicado = false; ev0.tipos = TIPOS
  await ev0.save()
}
const login = async u => (await api('/api/admin/login', { metodo: 'POST', cuerpo: { usuario: u, password: CLAVE } })).d.token
const T = { admin: await login('jose'), org: await login('eugenia'), puerta: await login('puerta1'), venta: await login('boleteria') }
// El panel recarga la cartelera en memoria al editar: se publica desde ahí.
let r = await api(`/api/admin/eventos/${EV}`, { metodo: 'PUT', token: T.org, cuerpo: { publicado: true, ventaAbierta: true, tipos: TIPOS } })
ok(r.status === 200, 'la organización publica la función de las 18 h desde el panel', JSON.stringify(r.d))
r = await api(`/api/admin/eventos/${EV2}`, { metodo: 'PUT', token: T.org, cuerpo: { publicado: true, ventaAbierta: true, tipos: TIPOS } })
ok(r.status === 200, '…y la de las 21 h', JSON.stringify(r.d))

// 1) El plano
const cfg = (await api('/api/config')).d
const sala = cfg.sitio.sala
ok(sala?.total === 337 && sala.filas.length === 14, 'config: la sala del Paraninfo, 14 filas y 337 butacas')
ok(sala.filas[0].asientos === 22 && sala.filas[1].asientos === 21 && sala.filas.slice(2, 12).every(f => f.asientos === 26), 'filas 1 (22), 2 (21) y 3 a 12 (26)')
ok(sala.filas[12].bloques[1].texto === 'Cabina' && sala.filas[12].asientos === 18 && sala.filas[13].asientos === 16 && sala.filas[13].zona === 'Zona verde', 'fila 13: 9 + cabina + 9 · fila 14 (zona verde): 8 + 8')
ok(sala.asiento1 === 'derecha', 'el asiento 1 de cada fila, a la derecha del plano (mirando desde el escenario, a su izquierda)')
const e18 = cfg.eventos.find(e => e.id === EV)
ok(e18?.vendible && e18.tipos.platea.precio === 20000 && e18.tipos.platea.final === 22000, 'la de las 18 h está a la venta: platea $20.000 + 10 % = $22.000', JSON.stringify(e18?.tipos))
ok(e18.tipos['zona-verde']?.precio === 10000 && e18.tipos['zona-verde'].final === 11000, 'zona verde (fila 14): $10.000 + 10 % = $11.000')
ok(cfg.sitio.desgloseServicio === true && cfg.cargoPct === 10, 'la página muestra el precio "+ costo de servicio" (10 %)')
ok(!cfg.eventos.some(e => e.id === MUESTRA), 'la muestra, sin publicar, no aparece')
ok((await ocupadas()).size === 0, 'al empezar no hay butacas ocupadas')

// 2) Compra online con butacas
const c1 = await comprar(['5-12', '5-13'], '30111222')
ok(c1.status === 200 && c1.d.total === 44000 && c1.d.pago?.pk === 'simulado', 'compra de 2 butacas (fila 5: 12 y 13): $44.000 con el servicio', JSON.stringify(c1.d))
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

// 2b) Una hora para transferir (José, 19/11/2026: en patín una transferencia tardó casi una hora; antes eran 10 minutos)
ok(cfg.reservaMinutos === 60 && c1.d.pago?.minutos === 60, 'al ir a pagar, las butacas quedan apartadas 60 minutos y el cobro de Chytapay vence a la hora', `${cfg.reservaMinutos} ${c1.d.pago?.minutos}`)
const lenta = await comprar(['10-1', '10-2'], '31000111')
await Orden.update({ createdAt: new Date(Date.now() - 50 * 60000) }, { where: { id: lenta.d.orderId } })
ok((await ocupacion10()).has('10-1'), 'a los 50 minutos sin acreditarse, sus butacas siguen siendo suyas')
await Orden.update({ createdAt: new Date(Date.now() - 61 * 60000) }, { where: { id: lenta.d.orderId } })   // el aviso de vencido todavía no llegó
oc = await ocupacion10()
ok(oc.has('10-1') && oc.has('10-2'), 'pasada la hora sin que llegue la plata, sus butacas NO se sueltan solas: siguen guardadas (José, 19/11/2026)')
const rapida = await comprar(['10-2', '10-3'], '31000222')
ok(rapida.status === 409, 'otra persona no puede tomarlas')
await aviso({ event: 'payment_request.expired', referenceId: lenta.d.orderId, stateType: 'overdue', paidAmount: 0 })
await espera(400)
ok((await ocupacion10()).has('10-1'), 'tampoco cuando llega el aviso de que venció el cobro')
await aviso({ event: 'payment.unmatched', reason: 'expired', amount: 44000, payerName: 'LENTA', payerCuil: 20310001115,
  paymentRequest: { referenceId: lenta.d.orderId }, operationDate: new Date().toISOString() })
await espera(900)
const oLenta = await Orden.findByPk(lenta.d.orderId)
ok(oLenta.estado === 'pagada' && oLenta.butacas === '10-1,10-2', 'su transferencia llega tarde desde su cuenta: se emite sola, con las mismas butacas que eligió', `${oLenta.estado} ${oLenta.butacas}`)
const lenta2 = await comprar(['11-5'], '31000333')
await Orden.update({ createdAt: new Date(Date.now() - 61 * 60000) }, { where: { id: lenta2.d.orderId } })
await aviso({ event: 'payment.unmatched', reason: 'expired', amount: 22000, payerName: 'LENTA DOS', payerCuil: 27310003334,
  paymentRequest: { referenceId: lenta2.d.orderId }, operationDate: new Date().toISOString() })
await espera(900)
const oLenta2 = await Orden.findByPk(lenta2.d.orderId)
ok(oLenta2.estado === 'pagada' && oLenta2.butacas === '11-5', 'otra que llega tarde, también con la que eligió', `${oLenta2.estado} ${oLenta2.butacas}`)

// 2b') La organización revisa una vencida y decide liberarla desde el panel
{
  const ret = await comprar(['11-8', '11-9'], '31000444')
  await Orden.update({ createdAt: new Date(Date.now() - 70 * 60000) }, { where: { id: ret.d.orderId } })
  await espera(3100)
  let s = (await api(`/api/admin/sala?evento=${EV}`, { token: T.org })).d
  ok(s.butacas['11-8']?.estado === 'retenida' && s.butacas['11-8'].nombre === 'Ana Prueba' && s.cuentas.retenida === 2, 'el plano del panel la muestra "venció sin pagar", con el nombre, y la cuenta', JSON.stringify({ b: s.butacas['11-8'], c: s.cuentas }))
  const opsR = (await api(`/api/admin/operaciones?evento=${EV}&estado=retenida`, { token: T.org })).d
  ok(opsR.cuentas.retenida === 1 && opsR.ordenes[0]?.id === ret.d.orderId && opsR.ordenes[0].estadoVista === 'retenida', 'operaciones: el filtro "vencidas con butacas" la trae', JSON.stringify(opsR.cuentas))
  ok((await api(`/api/admin/resumen?evento=${EV}`, { token: T.org })).d.retenidas === 1, 'el resumen avisa que hay una para revisar')
  r = await api(`/api/admin/orden/${ret.d.orderId}/liberar`, { metodo: 'POST', token: T.venta })
  ok(r.status === 403, 'la boletería no libera')
  const fresca = await comprar(['11-12'], '31000555')
  r = await api(`/api/admin/orden/${fresca.d.orderId}/liberar`, { metodo: 'POST', token: T.org })
  ok(r.status === 409 && /dentro de la hora/.test(r.d.error), 'una que todavía está dentro de la hora no se libera', JSON.stringify(r.d))
  await Orden.destroy({ where: { id: fresca.d.orderId } })
  const si = await SinImputar.create({ avisoId: 'prueba_ret_' + Date.now(), motivo: 'expired', monto: 44000, pagador: 'OTRA CUENTA', orden_id: ret.d.orderId, fecha: new Date() })
  r = await api(`/api/admin/orden/${ret.d.orderId}/liberar`, { metodo: 'POST', token: T.org })
  ok(r.status === 409 && /sin asignar/.test(r.d.error), 'con una transferencia suya esperando en "sin asignar", no deja liberar', JSON.stringify(r.d))
  await si.destroy()
  r = await api(`/api/admin/orden/${ret.d.orderId}/liberar`, { metodo: 'POST', token: T.org })
  ok(r.status === 200 && r.d.butacas === 'Fila 11: 8, 9', 'la organización la libera', JSON.stringify(r.d))
  const oRet = await Orden.findByPk(ret.d.orderId)
  ok(oRet.liberadaPor === 'eugenia' && oRet.liberadaEn && oRet.estado === 'abandonada', 'queda anotado quién y cuándo')
  ok(!(await ocupadas()).has('11-8'), 'y sus butacas vuelven a la venta')
  r = await api(`/api/admin/orden/${ret.d.orderId}/liberar`, { metodo: 'POST', token: T.org })
  ok(r.status === 404, 'liberarla dos veces no hace nada')
  const toma = await comprar(['11-8'], '31000666')
  ok(toma.status === 200, 'otra persona toma la 11-8')
  await api(`/api/dev/confirmar/${toma.d.orderId}`, { metodo: 'POST' })
  await aviso({ event: 'payment_request.payment_received', referenceId: ret.d.orderId, stateType: 'total_payment', paidAmount: 44000, reconciledPayerName: 'LIBERADA' })
  await espera(900)
  const oRet2 = await Orden.findByPk(ret.d.orderId)
  ok(oRet2.estado === 'pagada' && !oRet2.butacas.split(',').includes('11-8') && oRet2.butacas.split(',').length === 2, 'si igual llega su pago, se emite con otras 2 (la 11-8 ya era de otro)', `${oRet2.estado} ${oRet2.butacas}`)
  // Vuelve con el botón del mail ("Retomar mi compra"): sus butacas guardadas le aparecen libres y puede pagarlas
  const otra = await comprar(['12-1', '12-2'], '31000777', 'vuelve@ejemplo.com')
  await Orden.update({ createdAt: new Date(Date.now() - 70 * 60000) }, { where: { id: otra.d.orderId } })
  await espera(3100)
  ok(!(await ocupadas(otra.d.orderId)).has('12-1') && (await ocupadas()).has('12-1'), 'con su compra en el enlace del mail, sus butacas le salen libres a ella y ocupadas al resto')
  r = await comprar(['12-1', '12-2'], '31000888', 'otro@ejemplo.com')
  ok(r.status === 409, 'otra persona no puede comprarlas')
  r = await comprar(['12-1', '12-2'], '31000777', 'vuelve@ejemplo.com')
  ok(r.status === 200 && r.d.orderId !== otra.d.orderId, 'ella sí: vuelve a pagar las mismas (con un cobro nuevo)')
  const vieja = await Orden.findByPk(otra.d.orderId)
  ok(vieja.liberadaPor === 'comprador', 'y la compra vieja queda liberada por ella misma')
  await Entrada.destroy({ where: { orden_id: [ret.d.orderId, toma.d.orderId] } })
  await Orden.destroy({ where: { id: [ret.d.orderId, toma.d.orderId, otra.d.orderId, r.d.orderId] } })
  await espera(3100)
}

// 2c) La butaca es del primero que la toca (José, 19/11/2026): queda apartada para él 15 minutos mientras completa
// sus datos; si no va a pagar, se libera. Antes se apartaba recién al tocar «Ir a pagar».
{
  const cli = x => `cliente-prueba-${x}-${randomBytes(4).toString('hex')}`
  const A = cli('a'), B = cli('b'), C = cli('c'), D = cli('d'), E = cli('e')
  const tocar = (cliente, butaca, extra = {}) => api('/api/sala/apartar', { metodo: 'POST', cuerpo: { evento: EV, cliente, butaca, ...extra } })
  const salaDe = async cliente => (await api(`/api/sala?evento=${EV}&cliente=${cliente}`)).d
  const creadas = []
  ok(cfg.apartarMinutos === 15, 'config: al tocarlas, las butacas quedan apartadas 15 minutos', String(cfg.apartarMinutos))
  r = await tocar(A, '12-10')
  ok(r.status === 200 && r.d.mias?.includes('12-10') && r.d.quedan > 14 * 60 && r.d.quedan <= 15 * 60, 'A toca la 12-10: es suya por 15 minutos', JSON.stringify(r.d).slice(0, 160))
  r = await tocar(B, '12-10')
  ok(r.status === 409 && /otra persona/.test(r.d.error) && r.d.ocupadas?.includes('12-10'), 'B la toca un momento después: "ya la eligió otra persona", y su plano la muestra ocupada', JSON.stringify(r.d).slice(0, 160))
  ok((await salaDe(B)).ocupadas.includes('12-10') && !(await salaDe(A)).ocupadas.includes('12-10') && (await salaDe(A)).mias.includes('12-10'),
    'en el plano de B está ocupada; en el de A, elegida')
  ok((await ocupadas()).has('12-10'), 'y para cualquiera que mira el plano')
  const juntos = await Promise.all([A, B, C].map(x => tocar(x, '12-11')))
  ok(juntos.filter(x => x.status === 200).length === 1 && juntos.filter(x => x.status === 409).length === 2, 'tres tocan la 12-11 en el mismo instante: una sola se la queda', juntos.map(x => x.status).join(','))
  const gana11 = [A, B, C][juntos.findIndex(x => x.status === 200)]
  await tocar(gana11, '12-11', { soltar: true })
  ok(!(await salaDe(B)).ocupadas.includes('12-11'), 'la suelta (la toca de nuevo) y queda libre para los demás')

  // Nadie más la puede comprar mientras A la tiene apartada: ni online, ni en la boletería, ni como cortesía
  r = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: EV, butacas: ['12-10'], nombre: 'Bruno Prueba', email: 'b31500111@ejemplo.com', dni: '31500111', cliente: B } })
  ok(r.status === 409 && r.d.ocupadas?.includes('12-10'), 'B no puede comprarla aunque vaya directo a pagar')
  r = await api('/api/admin/venta-punto', { metodo: 'POST', token: T.venta, cuerpo: { evento: EV, butacas: ['12-10'], cobro: 'efectivo', nombre: 'Juan Boleteria', email: 'juan12@ejemplo.com', dni: '30555612' } })
  ok(r.status === 409, 'ni la boletería', JSON.stringify(r.d))
  r = await api('/api/admin/entrada-cortesia', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['12-10'], nombre: 'Invitada', email: 'inv12@ejemplo.com' } })
  ok(r.status === 409, 'ni como cortesía')
  r = await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['12-10'], bloquear: true } })
  ok(r.status === 409 && /eligiendo/.test(r.d.error), 'ni se puede guardar', JSON.stringify(r.d))
  for (const [quien, token] of [['la organización', T.org], ['la boletería', T.venta]]) {
    const s = (await api(`/api/admin/sala?evento=${EV}`, { token })).d
    ok(s.butacas['12-10']?.estado === 'eligiendo' && s.cuentas.eligiendo === 1, `el plano de ${quien} la muestra "eligiéndose en la web" y la cuenta`, JSON.stringify({ b: s.butacas['12-10'], c: s.cuentas }))
  }

  // A va a pagar: la compra se queda con la butaca y lo apartado se suelta (ahora la cuida la hora para transferir)
  r = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: EV, butacas: ['12-10'], nombre: 'Ana Apartada', email: 'a31500222@ejemplo.com', dni: '31500222', cliente: A } })
  ok(r.status === 200 && r.d.pago?.minutos === 60, 'A va a pagar: su compra sale bien, con una hora para transferir', JSON.stringify(r.d).slice(0, 160))
  creadas.push(r.d.orderId)
  const sA = await salaDe(A)
  ok(sA.mias.length === 0 && sA.quedan === null, 'lo apartado al tocar se soltó: ya no corre su reloj de 15 minutos')
  ok((await salaDe(B)).ocupadas.includes('12-10'), 'y para los demás sigue ocupada (se está pagando)')
  // Su compra sin pagar: si vuelve a elegir esas butacas, son suyas
  r = await tocar(A, '12-10', { orden: r.d.orderId })
  ok(r.status === 200, 'si la suelta y la vuelve a tocar con su compra sin pagar, puede (es suya)')
  await tocar(A, '12-10', { soltar: true })

  // Tope por compra
  for (let i = 1; i <= 10; i++) await tocar(D, `13-${i}`)
  r = await tocar(D, '13-11')
  ok(r.status === 409 && /hasta 10/.test(r.d.error) && r.d.mias.length === 10, 'más de 10 apartadas a la vez: se rechaza la 11.ª', JSON.stringify(r.d).slice(0, 120))
  await api('/api/sala/soltar', { metodo: 'POST', cuerpo: { evento: EV, cliente: D } })
  ok((await salaDe(D)).mias.length === 0 && !(await salaDe(B)).ocupadas.includes('13-5'), 'al cerrar la página se sueltan todas juntas')
  r = await tocar(E, '15-1')
  ok(r.status === 400, 'una butaca que no existe se rechaza')
  r = await api('/api/sala/apartar', { metodo: 'POST', cuerpo: { evento: EV, cliente: 'corto', butaca: '12-1' } })
  ok(r.status === 400, 'sin un número de navegador válido, no se aparta')
  r = await tocar(E, '6-1')
  ok(r.status === 409, 'una que se está pagando no se aparta', JSON.stringify(r.d).slice(0, 120))

  // Pago que llega tarde: el que pagó se queda con sus butacas aunque otro las esté eligiendo
  const x = await comprar(['12-20', '12-21'], '31500333')
  creadas.push(x.d.orderId)
  await aviso({ event: 'payment_request.expired', referenceId: x.d.orderId, stateType: 'overdue', paidAmount: 0 })
  await espera(400)
  await Orden.update({ createdAt: new Date(Date.now() - 2 * 3600e3) }, { where: { id: x.d.orderId } })
  await espera(3100)   // el plano tiene 3 s de caché y el vencimiento se cambió directo en la base
  r = await tocar(E, '12-20')
  ok(r.status === 409, 'su compra venció, pero sus butacas siguen guardadas: E no puede tocarlas')
  r = await api(`/api/admin/orden/${x.d.orderId}/liberar`, { metodo: 'POST', token: T.org })
  ok(r.status === 200, 'la organización la libera')
  r = await tocar(E, '12-20')
  ok(r.status === 200, 'y E toca la 12-20, que quedó libre')
  await aviso({ event: 'payment_request.payment_received', referenceId: x.d.orderId, stateType: 'total_payment', paidAmount: 44000, reconciledPayerName: 'TARDE APARTADA' })
  await espera(900)
  const oX = await Orden.findByPk(x.d.orderId)
  ok(oX.estado === 'pagada' && oX.butacas === '12-20,12-21', 'llega su transferencia: se queda con las suyas (pagó primero)', `${oX.estado} ${oX.butacas}`)
  const sE = await salaDe(E)
  ok(!sE.mias.includes('12-20') && sE.ocupadas.includes('12-20'), 'a E se le saca de lo apartado y le aparece ocupada (en la pantalla: "Se ocupó")')

  // Limpieza de esta parte (lo que sigue cuenta butacas)
  for (const c of [A, B, C, D, E]) await api('/api/sala/soltar', { metodo: 'POST', cuerpo: { evento: EV, cliente: c } })
  await Entrada.destroy({ where: { orden_id: creadas } }); await Orden.destroy({ where: { id: creadas } })
  await espera(3100)
}

// 2d) El reloj de lo apartado, sin esperar 15 minutos (backend/apartadas.js con un reloj de mentira)
{
  let t = 0
  const ap = crearApartadas({ minutos: 15, maxPorCliente: 3, maxPorIp: 4, reloj: () => t })
  const h = ap.apartar('ev', 'c1', '1-1', 'ip1').hasta
  t = 10 * 60000
  ok(ap.apartar('ev', 'c1', '1-2', 'ip1').hasta === h, 'sumar otra butaca no estira el tiempo (corre desde la primera)')
  ok(ap.apartar('ev', 'c2', '1-1', 'ip2').error === 'ajena', 'a los 10 minutos sigue siendo de c1')
  t = 15 * 60000 + 1
  ok(ap.de('ev', 'c1') === null && ap.apartar('ev', 'c2', '1-1', 'ip2').hasta === t + 15 * 60000, 'a los 15 minutos se libera sola y otro la puede tomar')
  ap.apartar('ev', 'c3', '2-1', 'ip3'); ap.apartar('ev', 'c3', '2-2', 'ip3'); ap.apartar('ev', 'c3', '2-3', 'ip3')
  ok(ap.apartar('ev', 'c3', '2-4', 'ip3').error === 'tope', 'tope por navegador')
  ap.apartar('ev', 'c4', '3-1', 'ip3')
  ok(ap.apartar('ev', 'c5', '3-2', 'ip3').error === 'tope_ip', 'tope por conexión')
  ap.soltar('ev', 'c4', '3-1')
  t += 60000
  ok(ap.apartar('ev', 'c4', '3-1', 'ip1').hasta === t + 15 * 60000, 'el que soltó todo arranca de cero la próxima vez')
  ap.quitar('ev', ['2-1'])
  ok(!ap.de('ev', 'c3').butacas.includes('2-1') && ap.todas('ev').length === 4, 'a un pago que llegó tarde se le dan las suyas aunque otro las tenga apartadas', JSON.stringify(ap.todas('ev')))
  t += 20 * 60000
  ok(ap.purgar() >= 2 && ap.todas('ev').length === 0, 'lo vencido se borra de la memoria')
}

// 3) Zonas con otro precio: el evento tiene el tipo "zona-verde" y la fila 14 es de ese tipo
r = await comprar(['14-1', '5-1'], '30333444')
ok(r.status === 400 && /distinto precio/.test(r.d.error), 'butacas de zonas con distinto precio en la misma compra: se rechaza')
const cVerde = await comprar(['14-1', '14-2'], '30333444')
ok(cVerde.status === 200 && cVerde.d.total === 22000, 'dos de la zona verde: $22.000 (su precio con el servicio)', JSON.stringify(cVerde.d))
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

// 5b) Reservadas para las invitaciones (Rítmica, 17/11/2026): ocupadas para todos y el panel no las nombra ni las cuenta
const salaAntes = (await api(`/api/admin/sala?evento=${EV}`, { token: T.org })).d
const evR = await Evento.findByPk(EV); evR.reservadas = ['9-1', '9-2', '9-3']; await evR.save()
await api(`/api/admin/eventos/${EV}`, { metodo: 'PUT', token: T.org, cuerpo: {} })   // el panel recarga la cartelera
oc = await ocupacion10()
ok(['9-1', '9-2', '9-3'].every(id => oc.has(id)), 'las reservadas aparecen ocupadas en la compra')
ok((await comprar(['9-2'], '30444556')).status === 409, 'no se pueden comprar online')
r = await api('/api/admin/venta-punto', { metodo: 'POST', token: T.venta, cuerpo: { evento: EV, butacas: ['9-2'], cobro: 'efectivo', nombre: 'Juan Boleteria', email: 'juan9@ejemplo.com', dni: '30555699' } })
ok(r.status === 409, 'ni en la boletería', JSON.stringify(r.d))
r = await api('/api/admin/entrada-cortesia', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['9-1'], nombre: 'Invitada', email: 'invitada@ejemplo.com' } })
ok(r.status === 409, 'ni como cortesía (la invitación va por fuera del sistema)')
r = await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['9-3'], bloquear: true } })
ok(r.status === 409, 'no se pueden guardar desde el panel')
for (const [quien, token] of [['la organización', T.org], ['la boletería', T.venta], ['la puerta', T.puerta]]) {
  const s = (await api(`/api/admin/sala?evento=${EV}`, { token })).d
  ok(JSON.stringify(s.butacas['9-1']) === '{"estado":"ocupada"}' && s.total === salaAntes.total - 3 && s.cuentas.libres === salaAntes.cuentas.libres - 3
    && s.cuentas.bloqueada === salaAntes.cuentas.bloqueada, `en el plano de ${quien}: ocupadas sin nombre, fuera del total y de las libres`, JSON.stringify({ b: s.butacas['9-1'], total: s.total, c: s.cuentas }))
}
ok(!JSON.stringify((await api('/api/admin/eventos', { token: T.admin })).d).includes('reservadas'), 'la cartelera del panel no las trae')
evR.reservadas = []; await evR.save()
await api(`/api/admin/eventos/${EV}`, { metodo: 'PUT', token: T.org, cuerpo: {} })
ok(!(await ocupacion10()).has('9-2'), 'sin reservar, vuelven a estar libres')

// 6) Boletería
r = await api('/api/admin/venta-punto', { metodo: 'POST', token: T.venta, cuerpo: { evento: EV, butacas: ['8-5', '8-6'], cobro: 'efectivo', nombre: 'Juan Boleteria', email: 'juan@ejemplo.com', dni: '30555666' } })
ok(r.status === 200 && r.d.total === 44000 && r.d.qrs[0].butaca === 'Fila 8 · Asiento 5', 'la boletería vende 2 butacas elegidas en el plano y el QR sale con la butaca', JSON.stringify(r.d))
r = await api('/api/admin/venta-punto', { metodo: 'POST', token: T.venta, cuerpo: { evento: EV, butacas: ['8-6'], cobro: 'efectivo', nombre: 'Pedro Boleteria', email: 'pedro@ejemplo.com', dni: '30555667' } })
ok(r.status === 409, 'la boletería tampoco puede vender una ya vendida')

// 7) El plano del panel
const sOrg = (await api(`/api/admin/sala?evento=${EV}`, { token: T.org })).d
ok(sOrg.butacas['6-1']?.estado === 'vendida' && sOrg.butacas['6-1'].nombre === 'Ana Prueba' && sOrg.butacas['6-1'].entro === true, 'panel: la 6-1 vendida, de quién es y que ya entró')
ok(sOrg.butacas['7-1']?.estado === 'cortesia' && sOrg.butacas['14-1']?.estado === 'pagando' && sOrg.butacas['8-5']?.metodo === 'punto', 'panel: cortesías, pagándose y vendidas en la boletería')
// (2 pagándose: desde que las vencidas guardan sus butacas, la 10-2 y la 10-3 de "rapida" ya no se venden)
ok(sOrg.cuentas.vendida === 7 && sOrg.cuentas.cortesia === 2 && sOrg.cuentas.pagando === 2 && sOrg.cuentas.libres === 337 - 11, 'panel: las cuentas (7 vendidas, 2 cortesías, 2 pagándose, 326 libres)', JSON.stringify(sOrg.cuentas))
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
ok((await api(`/api/admin/orden/${tarde.d.orderId}/liberar`, { metodo: 'POST', token: T.org })).status === 200, 'su compra venció y la organización liberó sus butacas')
const gana = await comprar(['9-10'], '30777888')
ok(gana.status === 200, 'otra persona toma la 9-10')
await api(`/api/dev/confirmar/${gana.d.orderId}`, { metodo: 'POST' })
await aviso({ event: 'payment_request.payment_received', referenceId: tarde.d.orderId, stateType: 'total_payment', paidAmount: 44000, reconciledPayerName: 'TARDE' })
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
await api(`/api/admin/orden/${sinLugar.d.orderId}/liberar`, { metodo: 'POST', token: T.org })
const libresVerde = Array.from({ length: 16 }, (_, i) => `14-${i + 1}`).filter(id => !['14-1', '14-2'].includes(id))
r = await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: libresVerde, bloquear: true } })
ok(r.status === 200, 'la organización guarda todas las de la zona verde que quedaban')
await aviso({ event: 'payment_request.payment_received', referenceId: sinLugar.d.orderId, stateType: 'total_payment', paidAmount: 11000 })
await espera(800)
ok((await Orden.findByPk(sinLugar.d.orderId)).estado === 'abandonada', 'paga, pero no queda ninguna butaca de su zona: NO se emite')
const si = (await api('/api/admin/sin-imputar', { token: T.org })).d.pagos.find(p => p.orden === sinLugar.d.orderId)
ok(si?.motivo === 'sin_butacas' && !si.resuelto, 'queda en "Transferencias sin asignar" para que lo resuelva la academia')
await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV, butacas: ['14-16'], bloquear: false } })
await aviso({ event: 'payment_request.payment_received', referenceId: sinLugar.d.orderId, stateType: 'total_payment', paidAmount: 11000 })
await espera(800)
const oSin = await Orden.findByPk(sinLugar.d.orderId)
ok(oSin.estado === 'pagada' && oSin.butacas === '14-16', 'se libera una y el aviso siguiente la emite con esa butaca', `${oSin.estado} ${oSin.butacas}`)
ok((await SinImputar.findOne({ where: { avisoId: `sin_butacas_${sinLugar.d.orderId}` } }))?.resuelto, 'y la fila de "sin asignar" queda resuelta')

// 10) Tres funciones el mismo día: cada una tiene sus propias butacas
oc = await ocupadas(null, EV2)
ok(oc.size === 0, 'a las 21 h la sala está entera libre, aunque a las 18 h ya se vendieron butacas')
const c21 = await comprar(['6-1', '6-2'], '30999000', undefined, EV2)
ok(c21.status === 200 && c21.d.total === 44000, 'la 6-1 y la 6-2, vendidas a las 18 h, se pueden comprar para las 21 h', JSON.stringify(c21.d))
await api(`/api/dev/confirmar/${c21.d.orderId}`, { metodo: 'POST' })
await espera(3100)
oc = await ocupadas(null, EV2)
ok(oc.has('6-1') && !oc.has('8-5'), 'el plano de las 21 h muestra solo lo suyo')
r = await api('/api/admin/sala/bloquear', { metodo: 'POST', token: T.org, cuerpo: { evento: EV2, butacas: ['2-1'], bloquear: true } })
ok(r.status === 200 && !(await ocupacion10()).has('2-1'), 'guardar una butaca a las 21 h no la guarda a las 18 h')
const e21 = await Entrada.findOne({ where: { orden_id: c21.d.orderId } })
const enLa18 = (await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo: e21.codigo, evento: EV } })).d
ok(!enLa18.ok && enLa18.estado === 'otro_evento' && /de las 21:00 h: no es esta función/.test(enLa18.msg), 'en la puerta de las 18 h, una entrada de las 21 h: "no es esta función" (no "hoy no vale")', JSON.stringify(enLa18))
ok((await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo: e21.codigo, evento: EV2 } })).d.ok, '…y a las 21 h entra')

// 11) Lo que no cambia
ok((await api('/api/admin/entrada-prueba', { metodo: 'POST', token: T.admin, cuerpo: { evento: EV } })).status === 200, 'la entrada de prueba (sin butaca) sigue andando')
r = await api(`/api/sala?evento=no-existe`)
ok(r.status === 404, 'el plano de un evento que no existe da 404')

// Limpieza (base local): sin compras y sin guardadas; el evento queda oculto como en la ficha
await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} }); await SinImputar.destroy({ where: {} })
for (const id of [EV, EV2, MUESTRA]) { const evF = await Evento.findByPk(id); evF.bloqueadas = []; evF.reservadas = []; evF.publicado = false; await evF.save() }
console.log(`\n${total - fallas} de ${total} bien${fallas ? `, ${fallas} MAL` : ''}`)
await sequelize.close()
process.exit(fallas ? 1 : 0)
