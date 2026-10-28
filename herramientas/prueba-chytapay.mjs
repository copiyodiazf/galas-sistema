// Prueba del camino REAL de Chytapay (sin el modo simulado) contra un Chytapay de imitación que responde
// como su API según la documentación: OAuth de la academia, /me, crear y consultar cobros, renovar el token.
// Levanta la imitación en el puerto 3099. Antes, en otra consola (en backend):
//   PUBLIC_URL=http://localhost:3032 PORT=3032 CHYTAPAY_SIMULADO=false CHYTAPAY_CLIENT_ID=cli_prueba \
//   CHYTAPAY_CLIENT_SECRET=sec_prueba CHYTAPAY_PK=pk_test_prueba CHYTAPAY_API_URL=http://localhost:3099 \
//   CHYTAPAY_AUTH_URL=http://localhost:3099 node server.js
//   node herramientas/prueba-chytapay.mjs 3032
// Borra la base LOCAL gala_molde al empezar.
import http from 'http'
import { readFileSync } from 'fs'
import { sequelize, Orden, Entrada, Vinculo, SinImputar } from '../backend/models/index.js'

const BASE = `http://localhost:${process.argv[2] || 3032}`
const env = Object.fromEntries(readFileSync(new URL('../backend/.env', import.meta.url), 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]))
if (env.DB_NAME !== 'gala_molde') { console.log('Esta prueba borra la base: solo corre contra gala_molde'); process.exit(1) }
const claves = {}
for (const l of readFileSync(new URL('../backend/usuarios-panel.txt', import.meta.url), 'utf8').split('\n')) { const [, u, c] = l.split('\t'); if (c) claves[u] = c.trim() }

// ═══ Chytapay de imitación ═══
const falso = { cobros: new Map(), refrescos: 0, tokenVencido: null, ultimoCobro: null, n: 0 }
const leer = req => new Promise(ok => { let b = ''; req.on('data', d => b += d); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}) } catch { ok({}) } }) })
const responder = (res, status, cuerpo) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo)) }
const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), cuerpo = req.method === 'POST' ? await leer(req) : {}
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '')
  const credsOk = cuerpo.clientId === 'cli_prueba' && cuerpo.clientSecret === 'sec_prueba'
  if (url.pathname === '/integration/oauth2/token') {
    if (!credsOk || cuerpo.grantType !== 'authorization_code' || cuerpo.code !== 'codigo-ok' || !/\/chytapay\/vuelta$/.test(cuerpo.redirectUri || '')) return responder(res, 400, { code: 'InvalidGrantError' })
    return responder(res, 200, { idToken: 'id-1', refreshToken: 'rt-secreto-academia', tokenType: 'Bearer', expiresIn: 3600 })
  }
  if (url.pathname === '/integration/oauth2/refresh') {
    if (!credsOk || cuerpo.refreshToken !== 'rt-secreto-academia') return responder(res, 400, { code: 'InvalidGrantError' })
    falso.refrescos++
    return responder(res, 200, { idToken: 'id-' + (1 + falso.refrescos), tokenType: 'Bearer', expiresIn: 3600 })
  }
  if (!/^id-\d+$/.test(token) || token === falso.tokenVencido) return responder(res, 401)
  if (url.pathname === '/me') return responder(res, 200, { merchantUserId: 'm-123', email: 'academia@falsa.com', fantasyName: 'Academia Falsa', accountHolderName: 'Academia Falsa SRL', accountHolderTaxId: '30712345671', integration: { name: 'Prueba' }, linkedAt: new Date().toISOString() })
  if (url.pathname === '/payment-request' && req.method === 'POST') {
    falso.ultimoCobro = cuerpo
    if (falso.cobros.has(cuerpo.referenceId)) return responder(res, 409, { error: 'ReferenceIdAlreadyExists', referenceId: cuerpo.referenceId })
    const c = { paymentRequestId: 'pr-' + (++falso.n), type: cuerpo.type, referenceId: cuerpo.referenceId, amount: cuerpo.amount, state: 'pending', paidAmount: 0 }
    falso.cobros.set(cuerpo.referenceId, c)
    return responder(res, 201, c)
  }
  const m = url.pathname.match(/^\/payment-request\/(.+)$/)
  if (m && req.method === 'GET') { const c = falso.cobros.get(decodeURIComponent(m[1])); return c ? responder(res, 200, c) : responder(res, 404, { message: 'Payment request not found' }) }
  responder(res, 404, { message: 'no existe en la imitación' })
})
await new Promise(ok => servidor.listen(3099, ok))
const pagar = ref => { const c = falso.cobros.get(ref); c.state = 'total_payment'; c.paidAmount = c.amount }

// ═══ Prueba ═══
let fallas = 0, n = 0
const ok = (cond, txt) => { console.log(`${cond ? '✓' : '✗'} ${txt}`); if (!cond) fallas++ }
async function api(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  const r = await fetch(BASE + ruta, { method: metodo, redirect: 'manual', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `203.0.113.${++n % 250}`, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  const t = await r.text(); let d; try { d = JSON.parse(t) } catch { d = t }
  return { status: r.status, d, location: r.headers.get('location') }
}
const comprar = (dni) => api('/api/orders', { metodo: 'POST', cuerpo: { tipo: 'general', cantidad: 2, nombre: 'Ana Prueba', email: `c${dni}@ejemplo.com`, dni } })

await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} }); await SinImputar.destroy({ where: {} }); await Vinculo.destroy({ where: {} })
const admin = (await api('/api/admin/login', { metodo: 'POST', cuerpo: { usuario: 'jose', password: claves.jose } })).d.token
const org = (await api('/api/admin/login', { metodo: 'POST', cuerpo: { usuario: 'academia', password: claves.academia } })).d.token

ok((await api('/api/admin/chytapay', { token: admin })).d.vinculo === null, 'al empezar no hay cuenta de la academia conectada')
const sinCuenta = await comprar('30100100')
ok(sinCuenta.status === 500 && await Orden.count() === 0, 'sin cuenta conectada la compra falla y no queda guardando lugar')

const con = (await api('/api/admin/chytapay/conectar', { metodo: 'POST', token: admin })).d
const u = new URL(con.url), state = u.searchParams.get('state')
ok(u.origin === 'http://localhost:3099' && u.pathname === '/integration/oauth2/authorize' && u.searchParams.get('client_id') === 'cli_prueba'
  && u.searchParams.get('redirect_uri') === BASE + '/chytapay/vuelta' && state?.length > 20, 'el enlace de conexión lleva client_id, redirect_uri y un state aleatorio')
ok((await api('/api/admin/chytapay/conectar', { metodo: 'POST', token: org })).status === 403, 'la academia no puede generar el enlace (solo el admin)')
ok((await api(`/chytapay/vuelta?code=codigo-ok&state=inventado`)).location === '/admin?chytapay=vencido', 'vuelta con un state inventado: rechazada')
const vuelta = await api(`/chytapay/vuelta?code=codigo-ok&state=${encodeURIComponent(state)}`)
ok(vuelta.location === '/admin?chytapay=ok', 'vuelta con el state correcto: la cuenta queda conectada')
ok((await api(`/chytapay/vuelta?code=codigo-ok&state=${encodeURIComponent(state)}`)).location === '/admin?chytapay=vencido', 'el mismo enlace no sirve dos veces')
const est = (await api('/api/admin/chytapay', { token: admin })).d
ok(est.vinculo?.nombre === 'Academia Falsa SRL' && est.vinculo?.cuit === '30712345671', 'el panel muestra la cuenta conectada (titular y CUIT)')
const fila = await Vinculo.findByPk(1, { raw: true })
ok(fila && !String(fila.refreshCifrado).includes('rt-secreto') && fila.refreshCifrado.split('.').length === 3, 'el token de la academia queda CIFRADO en la base')

const c1 = await comprar('30200200')
ok(c1.status === 200 && c1.d.pago.paymentId === 'pr-1' && c1.d.pago.pk === 'pk_test_prueba', 'compra: crea el cobro en Chytapay y devuelve lo que necesita el widget')
const enviado = falso.ultimoCobro
ok(enviado.type === 'checkout' && enviado.amount === 22000 && enviado.referenceId === c1.d.orderId && enviado.expiresInMinutes === 30 && enviado.metadata?.orden === c1.d.orderId,
  'el cobro va como checkout, por el total ($22.000), con el número de compra y 30 minutos para pagar')
ok(!('webhookUrl' in enviado), 'en local (http) no manda webhookUrl; en Render (https) sí')
ok((await api(`/api/orders/${c1.d.orderId}/confirmar`, { metodo: 'POST' })).d.estado === 'pendiente', 'antes de pagar: pendiente')
pagar(c1.d.orderId)
await new Promise(r => setTimeout(r, 4200))   // la página no consulta a Chytapay más de una vez cada 4 s por compra
const r1 = (await api(`/api/orders/${c1.d.orderId}/confirmar`, { metodo: 'POST' })).d
ok(r1.estado === 'pagada' && r1.qrs?.length === 2, 'cuando Chytapay dice pagado, la consulta de la página emite los 2 QR')

falso.tokenVencido = 'id-1'
const c2 = await comprar('30300300')
ok(c2.status === 200 && falso.refrescos === 1, 'si el token de 1 hora venció, lo renueva solo con el refresh y la compra sigue')
const c3 = await comprar('30400400')
ok(c3.status === 200 && falso.refrescos === 1, 'el token renovado se reutiliza (no pide uno nuevo en cada compra)')

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodo bien')
servidor.close(); await sequelize.close()
process.exit(fallas ? 1 : 0)
