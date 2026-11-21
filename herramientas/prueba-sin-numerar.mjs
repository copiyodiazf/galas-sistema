// Prueba de las funciones de la sala que NO son numeradas (Rítmica, 20/11/2026: solo la de las 16 h tiene butacas;
// a las 18 y a las 21 h se compra por cantidad y la ubicación es por orden de llegada). Pago SIMULADO.
// Servidor local, con la ficha como está (sala.funciones = ["divas-del-pop"]), SIN SALA_FUNCIONES:
//   (en backend) TEMA=santiago-ritmica DB_NAME=gala_ritmica PORT=3048 node server.js
//   (en backend) DB_NAME=gala_ritmica node ../herramientas/prueba-sin-numerar.mjs 3048
// Borra las compras de la base LOCAL gala_ritmica y crea sus usuarios de prueba (la clave no sirve en ningún otro lado).
import { randomBytes, scryptSync } from 'crypto'
import { sequelize, Orden, Entrada, SinImputar, Usuario, Evento } from '../backend/models/index.js'

if (process.env.DB_NAME !== 'gala_ritmica') { console.log('Esta prueba borra compras: solo corre contra la base local gala_ritmica (DB_NAME=gala_ritmica)'); process.exit(1) }
const BASE = `http://localhost:${process.argv[2] || 3048}`
const E16 = 'divas-del-pop', E18 = 'el-origen-de-ser-18', E21 = 'el-origen-de-ser-21'
const TIPOS = [{ id: 'platea', nombre: 'Platea', corto: 'Platea', detalle: 'Filas 1 a 13', precio: 20000, cupo: 321 },
  { id: 'zona-verde', nombre: 'Zona verde', corto: 'Zona verde', detalle: 'Fila 14, al fondo', precio: 10000, cupo: 16 }]
// Las 28 de las invitaciones de Eugenia en la función de las 21 h, como en producción
const RESERVADAS_21 = [...Array.from({ length: 22 }, (_, i) => `1-${i + 1}`), '2-10', '2-11', '2-12', '2-13', '3-13', '3-14']
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
const datos = (dni, extra = {}) => ({ nombre: 'Ana Prueba', email: `s${dni}@ejemplo.com`, dni, ...extra })

// 0) Base limpia, usuarios de prueba y las tres funciones publicadas (las 21 h con sus 28 reservadas)
await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} }); await SinImputar.destroy({ where: {} })
for (const [rol, usuario] of [['admin', 'jose'], ['organizador', 'eugenia'], ['control', 'puerta1'], ['venta', 'boleteria']]) {
  const salt = randomBytes(16).toString('hex'), hash = scryptSync(CLAVE, salt, 64).toString('hex')
  const [u, nuevo] = await Usuario.findOrCreate({ where: { usuario }, defaults: { usuario, rol, salt, hash } })
  if (!nuevo) await u.update({ rol, salt, hash, activo: true })
}
for (const id of [E16, E18, E21]) {
  const ev0 = await Evento.findByPk(id)
  ev0.bloqueadas = []; ev0.reservadas = id === E21 ? RESERVADAS_21 : []; ev0.tipos = TIPOS
  await ev0.save()
}
const login = async u => (await api('/api/admin/login', { metodo: 'POST', cuerpo: { usuario: u, password: CLAVE } })).d.token
const T = { admin: await login('jose'), org: await login('eugenia'), puerta: await login('puerta1'), venta: await login('boleteria') }
for (const id of [E16, E18, E21]) {
  const r = await api(`/api/admin/eventos/${id}`, { metodo: 'PUT', token: T.org, cuerpo: { publicado: true, ventaAbierta: true, tipos: TIPOS } })
  ok(r.status === 200, `la organización publica ${id}`, JSON.stringify(r.d))
}
await espera(300)

// 1) Qué función es numerada
const cfg = (await api('/api/config')).d
const ev = id => cfg.eventos.find(e => e.id === id)
ok(ev(E16)?.numerada === true, 'config: la de las 16 h es numerada', JSON.stringify(ev(E16)))
ok(ev(E18)?.numerada === false && ev(E21)?.numerada === false, 'config: las de las 18 y las 21 h no son numeradas')
ok(cfg.sitio.sala?.total === 337, 'la sala sigue en la ficha (la usa la de las 16 h)')
const acfg = (await api('/api/admin/config', { token: T.org })).d
ok(acfg.eventos.find(e => e.id === E16)?.numerada === true && acfg.eventos.find(e => e.id === E18)?.numerada === false, 'el panel también sabe cuál es numerada')
ok((await api(`/api/sala?evento=${E18}`)).status === 404, 'las 18 h no tiene plano público')
ok((await api(`/api/sala?evento=${E16}`)).status === 200, 'las 16 h sí')
ok((await api('/api/sala/apartar', { metodo: 'POST', cuerpo: { evento: E21, butaca: '5-5', cliente: 'cliente-de-prueba-1234' } })).status === 404, 'a las 21 h no se aparta una butaca al tocarla')
ok((await api(`/api/admin/sala?evento=${E18}`, { token: T.org })).d.sala === null, 'el plano del panel, a las 18 h, no hay')

// 2) Compra por cantidad a las 18 h
let r = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: E18, tipo: 'platea', cantidad: 3, ...datos('30111001') } })
ok(r.status === 200 && r.d.total === 66000, 'a las 18 h se compran 3 de platea por cantidad: $66.000', JSON.stringify(r.d))
const o18 = r.d.orderId
let fila = await Orden.findByPk(o18, { raw: true })
ok(fila.butacas === null && fila.cantidad === 3 && fila.tipo === 'platea', 'la compra no lleva butacas')
r = await api(`/api/dev/confirmar/${o18}`, { metodo: 'POST' })
ok(r.status === 200, 'se paga (simulado)', JSON.stringify(r.d))
await espera(300)
let ent = await Entrada.findAll({ where: { orden_id: o18 }, raw: true })
ok(ent.length === 3 && ent.every(e => e.butaca === null && e.evento === E18), '3 QR sin butaca, para las 18 h')
// Una página vieja (con el plano en memoria) que manda butacas: no se guardan, cuenta la cantidad
r = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: E18, tipo: 'zona-verde', cantidad: 2, butacas: ['14-1', '14-2'], ...datos('30111002') } })
fila = r.d.orderId && await Orden.findByPk(r.d.orderId, { raw: true })
ok(r.status === 200 && fila?.butacas === null && fila.cantidad === 2 && fila.tipo === 'zona-verde', 'si llegan butacas a las 18 h, no se guardan: 2 de zona verde', JSON.stringify(r.d))

// 3) La capacidad es la de la sala: platea 321, zona verde 16; a las 21 h sin las 28 reservadas (293)
let res = (await api(`/api/admin/resumen?evento=${E21}`, { token: T.org })).d
ok(res.tipos.platea.cupo === 293 && res.tipos['zona-verde'].cupo === 16, '21 h: platea 293 (321 menos las 28 reservadas) y zona verde 16', JSON.stringify(res.tipos))
res = (await api(`/api/admin/resumen?evento=${E18}`, { token: T.org })).d
ok(res.tipos.platea.cupo === 321 && res.tipos.platea.vendidas === 3 && res.tipos['zona-verde'].reservadas === 2, '18 h: platea 321 con 3 vendidas; zona verde con 2 pagándose', JSON.stringify(res.tipos))
// Zona verde: 16 lugares. Ya hay 2 pagándose: 10 más entran, 5 más no (quedan 4)
r = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: E18, tipo: 'zona-verde', cantidad: 10, ...datos('30111003') } })
ok(r.status === 200, '10 más de zona verde a las 18 h', JSON.stringify(r.d))
r = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: E18, tipo: 'zona-verde', cantidad: 5, ...datos('30111004') } })
ok(r.status === 409 && /Quedan 4/.test(r.d.error), 'la zona verde no se pasa de 16: "Quedan 4"', JSON.stringify(r.d))

// 4) Boletería y cortesía por cantidad a las 21 h
r = await api('/api/admin/venta-punto', { metodo: 'POST', token: T.venta, cuerpo: { evento: E21, tipo: 'platea', cantidad: 2, cobro: 'efectivo', ...datos('30111005') } })
ok(r.status === 200 && r.d.qrs?.length === 2 && r.d.qrs.every(q => !q.butaca), 'la boletería vende 2 a las 21 h, sin butaca', JSON.stringify(r.d))
r = await api('/api/admin/entrada-cortesia', { metodo: 'POST', token: T.org, cuerpo: { evento: E21, tipo: 'platea', cantidad: 4, nombre: 'Invitada', email: 'inv@ejemplo.com' } })
ok(r.status === 200 && r.d.cantidad === 4, 'la organización da 4 cortesías a las 21 h, por cantidad', JSON.stringify(r.d))
res = (await api(`/api/admin/resumen?evento=${E21}`, { token: T.org })).d
ok(res.tipos.platea.vendidas === 2 && res.tipos.platea.cortesias === 4 && res.tipos.platea.libres === 287, '21 h: 2 vendidas, 4 cortesías y 287 libres', JSON.stringify(res.tipos.platea))

// 5) La puerta: el QR de las 18 h entra a las 18 h y no a las 21 h
const q18 = ent[0].codigo
ok(!(await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo: q18, evento: E21 } })).d.ok, 'el QR de las 18 h no entra a las 21 h')
ok((await api('/api/validar', { metodo: 'POST', token: T.puerta, cuerpo: { codigo: q18, evento: E18 } })).d.ok, '…y a las 18 h entra')

// 6) La de las 16 h sigue con butacas
r = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: E16, tipo: 'platea', cantidad: 2, ...datos('30111006') } })
ok(r.status === 400 && /butacas/.test(r.d.error), 'a las 16 h sin butacas no se compra: "Elegí tus butacas en el plano"', JSON.stringify(r.d))
r = await api('/api/orders', { metodo: 'POST', cuerpo: { evento: E16, butacas: ['5-12', '5-13'], ...datos('30111007') } })
fila = r.d.orderId && await Orden.findByPk(r.d.orderId, { raw: true })
ok(r.status === 200 && fila?.butacas === '5-12,5-13', 'a las 16 h se compran las butacas 12 y 13 de la fila 5', JSON.stringify(r.d))
await espera(3100)
ok((await api(`/api/sala?evento=${E16}`)).d.ocupadas.includes('5-12'), '…y salen ocupadas en el plano de las 16 h')

// Limpieza
await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} })
await Evento.update({ reservadas: [] }, { where: { id: E21 } })
await sequelize.close()
console.log(`\n${total - fallas} de ${total} bien`)
process.exit(fallas ? 1 : 0)
