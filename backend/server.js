// ───────────────────────────────────────────────────────────────
//  Backend - Venta de entradas de una gala (molde para las galas de fin de año)
//
//  Sale del sistema del Festival del Agricultor (QR + mail + panel + puerta), con:
//   · los datos del evento y los tipos de entrada en evento.json (precio y cupo de cada uno);
//   · cupo por tipo, con bloqueo en la base para que dos compras simultáneas no se pasen;
//   · cobro con Chytapay (transferencia, un CVU por compra, conciliación por CUIL). La comisión
//     de José la transfiere Chytapay sola en cada pago (Distribución): acá no se calcula;
//   · venta en puntos físicos (efectivo o transferencia), al mismo precio final que online.
// ───────────────────────────────────────────────────────────────

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { randomUUID, randomBytes, createHmac, timingSafeEqual, scryptSync } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, readFileSync } from 'fs'
import QRCode from 'qrcode'
import nodemailer from 'nodemailer'
import { Op, QueryTypes, fn, col } from 'sequelize'
import { sequelize, Orden, Entrada, Usuario, Visita, SinImputar } from './models/index.js'
import { leerEvento } from './evento.js'
import { chytapayConfigurado, chytapayEsProduccion, clavePublicable, crearCobroCheckout, cobroPagado, firmaValida,
  urlAutorizar, canjearCode, guardarVinculo, vinculoActual } from './chytapay.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })
const FRONT = join(__dirname, '..', 'frontend')
const EVENTO = leerEvento()
const TIPOS = EVENTO.tipos

const app = express()
app.set('trust proxy', true)
app.disable('x-powered-by')
// Encabezados de seguridad: sin incrustar el sitio en otras páginas (el panel no se puede "disfrazar"),
// sin adivinar tipos de archivo, https obligatorio y la cámara solo para el escáner de la puerta.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'SAMEORIGIN')
  res.set('Content-Security-Policy', "frame-ancestors 'self'")
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()')
  if (req.headers['x-forwarded-proto'] === 'https') res.set('Strict-Transport-Security', 'max-age=15552000')
  next()
})
// La API la usan solo las páginas del propio sitio. Los avisos de Chytapay no mandan "Origin"
// (son de servidor a servidor): no les afecta.
const ORIGENES = [process.env.PUBLIC_URL, process.env.FRONTEND_URL, ...String(process.env.ORIGENES_EXTRA || '').split(',')]
  .map(u => String(u || '').trim().replace(/\/$/, '')).filter(Boolean)
app.use(cors({ origin: (origen, cb) => cb(null, !origen || ORIGENES.includes(origen) || /^http:\/\/localhost(:\d+)?$/.test(origen)) }))
// Los avisos de Chytapay se firman sobre el cuerpo CRUDO: se guarda antes de parsearlo.
app.use(express.json({ limit: '50kb', verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/webhooks/')) req.cuerpoCrudo = Buffer.from(buf) } }))

// ───── Configuración ─────
const PORT = process.env.PORT || 3030
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '')
const FRONTEND_URL = (process.env.FRONTEND_URL || PUBLIC_URL).replace(/\/$/, '')
// OJO: no usar `Number(x) || def`: un 0 explícito (por ejemplo CARGO_PCT=0) caería en el default.
function numEnv(clave, porDefecto) {
  const v = process.env[clave]
  if (v === undefined || String(v).trim() === '') return porDefecto
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}
const CARGO_PCT = numEnv('CARGO_PCT', 10)              // costo de servicio online (lo paga el comprador, va adentro del precio)
const CARGO_PUNTO_PCT = numEnv('CARGO_PUNTO_PCT', 10)  // en los puntos de venta: mismo precio final que online
const MAX_ENTRADAS = numEnv('MAX_ENTRADAS', 10)
const RESERVA_MINUTOS = Math.min(60, Math.max(10, numEnv('RESERVA_MINUTOS', 30)))  // también es el vencimiento del cobro en Chytapay (3 a 60)
const POCAS = numEnv('AVISO_POCAS', 30)                // desde cuántas libres se avisa "quedan pocas"
const VENTA_ABIERTA = String(process.env.VENTA_ABIERTA || 'true') !== 'false'
const ORGANIZACION = ['admin', 'organizador']          // ven resumen, ventas y planilla

const EVENTO_MAIL_FROM = process.env.EVENTO_MAIL_FROM || 'entradas@ejemplo.com.ar'
const IS_PROD = process.env.NODE_ENV === 'production'
const QR_SECRET = process.env.QR_SECRET || 'CAMBIAR_ESTE_SECRETO_EN_PRODUCCION'
if (IS_PROD && (QR_SECRET.startsWith('CAMBIAR') || QR_SECRET.length < 24)) {
  console.error('❌ Falta QR_SECRET (o es muy corto): sin eso los QR y las sesiones se podrían falsificar. No arranco.')
  process.exit(1)
}
const SCAN_TOKEN = process.env.SCAN_TOKEN || ''
const precioDe = tipo => TIPOS[tipo].precio
const conCargo = (precio, pct) => precio + Math.round(precio * pct / 100)

// La portada con los datos del evento puestos por el servidor: WhatsApp y Google no ejecutan JavaScript,
// así que el título y la descripción de la vista previa tienen que venir ya en el HTML.
const escAttr = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const PORTADA = readFileSync(join(FRONT, 'index.html'), 'utf8')
  .replaceAll('%%NOMBRE%%', escAttr(EVENTO.nombre))
  .replaceAll('%%DESCRIPCION%%', escAttr([EVENTO.organiza, EVENTO.cuando, EVENTO.lugar].filter(Boolean).join(' · ') + '. Entradas online con QR al instante.'))
  .replaceAll('%%URL%%', escAttr(FRONTEND_URL))
app.get(['/', '/index.html'], (_req, res) => { res.set('Cache-Control', 'no-cache'); res.type('html').send(PORTADA) })

// La página y sus archivos. Las fotos casi no cambian: caché de un día. El HTML, siempre fresco.
app.use(express.static(FRONT, {
  setHeaders(res, ruta) {
    if (/\.(webp|jpg|jpeg|png|mp4|woff2|svg|ico)$/i.test(ruta)) res.set('Cache-Control', 'public, max-age=86400')
    else res.set('Cache-Control', 'no-cache')
  },
}))
const NO_VENTA = ['prueba']                 // no ocupan lugar ni son plata
const NO_PLATA = ['prueba', 'cortesia']     // ocupan lugar pero no son venta

// ───── Seguridad ─────
// Firma HMAC del contenido del QR: no se puede falsificar sin el secreto.
function firmarQR(base) {
  const sig = createHmac('sha256', QR_SECRET).update(base).digest('hex').slice(0, 16)
  return `${base}::${sig}`
}
function verificarQR(codigo) {
  const parts = String(codigo).split('::')
  if (parts.length < 3) return null
  const sig = parts.pop()
  const base = parts.join('::')
  const esperado = createHmac('sha256', QR_SECRET).update(base).digest('hex').slice(0, 16)
  const a = Buffer.from(sig), b = Buffer.from(esperado)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return base // "ordenId::indice"
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function ipDe(req) {
  const cf = String(req.headers['cf-connecting-ip'] || '').trim()
  if (cf) return cf
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean)
  return xff[xff.length - 1] || req.socket.remoteAddress || 'x'   // el último lo agrega el proxy, no el cliente
}
// Límite simple por IP, en memoria.
function rateLimit({ windowMs, max, msg }) {
  const hits = new Map()
  return (req, res, next) => {
    const ip = ipDe(req), now = Date.now()
    let rec = hits.get(ip)
    if (!rec || now > rec.reset) { rec = { count: 0, reset: now + windowMs }; hits.set(ip, rec) }
    rec.count++
    if (hits.size > 50000) hits.clear()
    if (rec.count > max) return res.status(429).json({ error: msg || 'Demasiadas solicitudes. Probá en un momento.' })
    next()
  }
}

// ───── Sesiones del panel ─────
function hashPassword(password, salt) { return scryptSync(String(password), salt, 64).toString('hex') }
function verifyPassword(password, salt, hash) {
  const a = Buffer.from(hashPassword(password, salt), 'hex'), b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
// Token firmado (mini-JWT con HMAC), válido 12 h
function firmarToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 12 * 3600 * 1000 })).toString('base64url')
  const sig = createHmac('sha256', QR_SECRET).update(body).digest('base64url').slice(0, 32)
  return `${body}.${sig}`
}
function verificarToken(token) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  const esperado = createHmac('sha256', QR_SECRET).update(body).digest('base64url').slice(0, 32)
  const a = Buffer.from(sig), b = Buffer.from(esperado)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (p.exp && Date.now() > p.exp) return null
    return p
  } catch { return null }
}
const tokenDeReq = req => verificarToken((req.headers.authorization || '').replace(/^Bearer /, ''))
const _activos = new Map()   // usuario → { activo, rol, t }: se consulta la base como mucho una vez por minuto
async function sigueActivo(p) {
  const c = _activos.get(p.usuario)
  if (c && Date.now() - c.t < 60000) return c.activo && c.rol === p.rol
  const u = await Usuario.findOne({ where: { usuario: p.usuario }, attributes: ['activo', 'rol'], raw: true }).catch(() => null)
  const v = { activo: Boolean(u) && Number(u.activo) !== 0, rol: u?.rol, t: Date.now() }   // MySQL lo devuelve como 0/1
  _activos.set(p.usuario, v)
  return v.activo && v.rol === p.rol
}
function requireAuth(roles) {
  return async (req, res, next) => {
    const p = tokenDeReq(req)
    if (!p) return res.status(401).json({ error: 'No autorizado' })
    if (roles && !roles.includes(p.rol)) return res.status(403).json({ error: 'Sin permiso' })
    if (!(await sigueActivo(p))) return res.status(401).json({ error: 'Este acceso está deshabilitado' })
    req.usuario = p
    next()
  }
}

// ───── QR ─────
const QR_COLOR = { dark: '#111111', light: '#ffffff' }   // casi negro: lo leen bien hasta las cámaras malas
const urlQR = codigo => `/qr?c=${encodeURIComponent(codigo)}`
// La imagen se arma al vuelo desde el código firmado: el disco de Render se borra en cada deploy.
app.get('/qr', async (req, res) => {
  try {
    const codigo = String(req.query.c || '')
    if (!verificarQR(codigo)) return res.status(400).send('QR inválido')
    const png = await QRCode.toBuffer(codigo, { width: 440, margin: 2, color: QR_COLOR })
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(png)
  } catch (e) {
    console.error('❌ Error generando QR al vuelo:', e?.message || e)
    res.status(500).send('Error generando QR')
  }
})

// ───── Hora argentina ─────
// Argentina es UTC-3 todo el año y Render corre en UTC.
const HORAS_AR = 3
function comienzoDelDiaArgentino() {
  const aca = new Date(Date.now() - HORAS_AR * 3600 * 1000)
  return new Date(Date.UTC(aca.getUTCFullYear(), aca.getUTCMonth(), aca.getUTCDate(), HORAS_AR, 0, 0))
}
const pesos = n => '$' + Number(n).toLocaleString('es-AR')

// ═══════════════════════════════════════════════════════════════
//  CUPO (por tipo de entrada)
//  Ocupan lugar las entradas pagadas (también las cortesías) y las compras
//  empezadas hace menos de RESERVA_MINUTOS, que todavía pueden pagarse.
// ═══════════════════════════════════════════════════════════════
async function ocupacion(transaction) {
  const corte = new Date(Date.now() - RESERVA_MINUTOS * 60 * 1000)
  const filas = await Orden.findAll({
    attributes: ['tipo', 'estado', [fn('SUM', col('cantidad')), 'cant']],
    where: {
      metodo: { [Op.notIn]: NO_VENTA },
      [Op.or]: [{ estado: 'pagada' }, { estado: 'pendiente', createdAt: { [Op.gte]: corte } }],
    },
    group: ['tipo', 'estado'], raw: true, transaction,
  })
  const oc = Object.fromEntries(Object.keys(TIPOS).map(k => [k, { vendidas: 0, reservadas: 0, cupo: TIPOS[k].cupo, libres: 0 }]))
  for (const f of filas) if (oc[f.tipo]) oc[f.tipo][f.estado === 'pagada' ? 'vendidas' : 'reservadas'] += Number(f.cant)
  for (const t of Object.values(oc)) t.libres = Math.max(0, t.cupo - t.vendidas - t.reservadas)
  return oc
}

// Un solo proceso a la vez cuenta el cupo y crea la orden (bloqueo con nombre de MySQL).
// El nombre lleva la base: varias galas pueden compartir el mismo servidor de Aiven.
const LOCK = `cupo_${String(process.env.DB_NAME || 'gala').replace(/[^A-Za-z0-9_]/g, '').slice(0, 50)}`
async function conCupo(trabajo) {
  return sequelize.transaction(async transaction => {
    const [r] = await sequelize.query('SELECT GET_LOCK(?, 15) AS ok', { replacements: [LOCK], type: QueryTypes.SELECT, transaction })
    if (!r || Number(r.ok) !== 1) throw new Error('No se pudo reservar el cupo, probá de nuevo')
    try { return await trabajo(transaction) }
    finally { await sequelize.query('SELECT RELEASE_LOCK(?)', { replacements: [LOCK], type: QueryTypes.SELECT, transaction }) }
  })
}
// Valida tipo y cantidad, y crea la orden si hay lugar. Devuelve { orden } o { error, status }.
async function crearOrdenConCupo(datos) {
  return conCupo(async transaction => {
    const oc = await ocupacion(transaction)
    const libres = oc[datos.tipo].libres
    if (libres < datos.cantidad) {
      const que = TIPOS[datos.tipo].nombre.toLowerCase()
      return { status: 409, error: libres > 0 ? `Quedan ${libres} (${que}).` : `Se agotaron (${que}).` }
    }
    const orden = await Orden.create(datos, { transaction })
    return { orden }
  })
}
function validarCompra(body, { maximo = MAX_ENTRADAS } = {}) {
  const tipo = String(body.tipo || '')
  if (!TIPOS[tipo]) return { error: 'Elegí el tipo de entrada.' }
  const cantidad = parseInt(body.cantidad, 10)
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > maximo) return { error: `La cantidad va de 1 a ${maximo}.` }
  const nombre = String(body.nombre || '').trim().replace(/\s+/g, ' ')
  const email = String(body.email || '').trim().toLowerCase()
  const dni = String(body.dni || '').replace(/\D/g, '')
  if (nombre.length < 3) return { error: 'Falta tu nombre y apellido.' }
  if (nombre.length > 80 || !/^[\p{L}][\p{L}\p{M} '’.-]*$/u.test(nombre)) return { error: 'Revisá el nombre: solo letras y espacios.' }
  if (email.length > 120 || !/^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]{2,}$/.test(email)) return { error: 'Revisá el email: ahí te llegan las entradas.' }
  if (dni.length < 7 || dni.length > 9) return { error: 'Revisá el DNI (solo números).' }
  return { tipo, cantidad, nombre, email, dni }
}

// ═══════════════════════════════════════════════════════════════
//  EMAIL
// ═══════════════════════════════════════════════════════════════
let _transporter = null
async function getTransporter() {
  if (_transporter) return _transporter
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false },
    })
    console.log(`📮 Email: Gmail (${process.env.EMAIL_USER})`)
  } else {
    // Sin credenciales: Ethereal (solo vista previa, no llega a ninguna bandeja)
    const cuenta = await nodemailer.createTestAccount()
    _transporter = nodemailer.createTransport({ host: 'smtp.ethereal.email', port: 587, secure: false, auth: { user: cuenta.user, pass: cuenta.pass } })
    console.log('📮 Email: Ethereal (vista previa)')
  }
  return _transporter
}
const remitente = () => `"${EVENTO.nombre.replace(/"/g, '')}" <${process.env.EMAIL_USER || EVENTO_MAIL_FROM}>`
const LOGO_MAIL = join(FRONT, 'assets', 'mail-logo.png')
const primerNombre = n => escapeHtml(String(n || '').split(' ')[0])
const cuantasEntradas = (orden) => orden.cantidad === 1 ? '1 entrada' : `${orden.cantidad} entradas`

function encabezadoMail() {
  const logo = existsSync(LOGO_MAIL) ? `<img src="cid:logo" width="110" height="110" alt="" style="display:block;margin:0 auto 10px;border-radius:50%;">` : ''
  return `
      <tr><td align="center" style="background:#141022;padding:26px 20px 22px;">
        ${logo}
        <div style="font:800 13px/1.4 Arial,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#e7c27d;">${escapeHtml(EVENTO.organiza || EVENTO.ciudad)}</div>
        <div style="font:700 20px/1.3 Arial,sans-serif;color:#ffffff;margin-top:6px;">${escapeHtml(EVENTO.nombre)}</div>
        <div style="font:400 14px/1.5 Arial,sans-serif;color:#d9d3e8;margin-top:4px;">${escapeHtml(EVENTO.cuando)}</div>
      </td></tr>`
}
const adjuntoLogo = () => existsSync(LOGO_MAIL) ? [{ filename: 'logo.png', path: LOGO_MAIL, cid: 'logo' }] : []

// Mail para el que quedó a mitad de camino. Se manda UNA sola vez por persona.
async function enviarMailPendiente(orden) {
  const t = await getTransporter()
  const ayuda = EVENTO.ayudaWhatsapp ? `
        <div style="background:#f4f1f8;border-radius:12px;padding:16px;text-align:center;margin-top:18px;">
          <p style="margin:0 0 10px;font-size:14px;">¿Preferís que te demos una mano?</p>
          <a href="https://wa.me/${EVENTO.ayudaWhatsapp}?text=${encodeURIComponent(`Hola, quise comprar entradas para ${EVENTO.nombre} y no pude completar el pago.`)}"
             style="background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:11px 26px;border-radius:24px;display:inline-block;font-size:14px;">Escribinos por WhatsApp</a>
        </div>` : ''
  await t.sendMail({
    from: remitente(), to: orden.email,
    subject: `¿Tuviste problemas para pagar tus entradas de ${EVENTO.nombre}?`,
    attachments: adjuntoLogo(),
    html: `
  <div style="background:#f1eef5;padding:22px 12px;font-family:Arial,sans-serif;color:#1d1830;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      ${encabezadoMail()}
      <tr><td style="padding:26px;">
        <p style="font-size:16px;margin:0 0 12px;">Hola ${primerNombre(orden.nombre)}:</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">Empezaste a comprar <b>${cuantasEntradas(orden)}</b> y el pago quedó sin completar. <b>No se te cobró nada.</b></p>
        <p style="font-size:15px;line-height:1.6;margin:0;">Se paga por transferencia, desde la app de tu banco o de tu billetera. Importante: <b>transferí desde una cuenta a tu nombre</b>, con el DNI que pusiste en la compra.</p>
        <div style="text-align:center;margin:24px 0 4px;">
          <a href="${FRONTEND_URL}/comprar" style="background:#e7c27d;color:#1d1830;text-decoration:none;font-weight:800;padding:14px 32px;border-radius:30px;display:inline-block;">Retomar mi compra</a>
        </div>${ayuda}
        <p style="font-size:12px;color:#7d7590;margin:22px 0 0;text-align:center;">Si ya compraste, ignorá este mensaje.</p>
      </td></tr>
    </table>
  </div>`,
  })
  console.log(`✉️ Recordatorio enviado a ${orden.email} (${cuantasEntradas(orden)})`)
}

// Mail con las entradas. Los QR van adjuntos (cid): muchos correos bloquean imágenes externas.
async function enviarMailEntradas(orden, entradas) {
  const t = await getTransporter()
  const tipo = TIPOS[orden.tipo] || { nombre: orden.tipo }
  const attachments = []
  for (const [i, e] of entradas.entries()) {
    attachments.push({ filename: `entrada-${i + 1}.png`, content: await QRCode.toBuffer(e.codigo, { width: 480, margin: 2, color: QR_COLOR }), cid: `qr${i}` })
  }
  attachments.push(...adjuntoLogo())

  const qrsHtml = entradas.map((e, i) => `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
          <tr><td align="center" style="background:#ffffff;border:3px solid #1d1830;border-radius:14px;padding:18px 14px;">
            <div style="font:800 13px/1.3 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a6a2a;">${escapeHtml(tipo.nombre)} · ${i + 1} de ${orden.cantidad}</div>
            <img src="cid:qr${i}" width="240" height="240" alt="Código QR de la entrada ${i + 1}" style="display:block;margin:12px auto 8px;">
            <div style="font:400 10px/1.4 Consolas,monospace;color:#9a9a9a;word-break:break-all;max-width:320px;margin:auto;">${escapeHtml(e.codigo)}</div>
          </td></tr>
        </table>`).join('')
  const puertas = EVENTO.puertas ? `<br>Apertura de puertas: <b>${escapeHtml(EVENTO.puertas)}</b>` : ''

  const html = `
  <div style="background:#f1eef5;padding:22px 12px;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      ${encabezadoMail()}
      <tr><td style="padding:26px 26px 6px;">
        <div style="font:800 20px/1.3 Arial,sans-serif;color:#1d1830;">¡Listo, ${primerNombre(orden.nombre)}!</div>
        <p style="font:400 15px/1.6 Arial,sans-serif;color:#3a334d;margin:10px 0 0;">Tu compra se confirmó. Abajo ${orden.cantidad > 1 ? `están tus <b>${cuantasEntradas(orden)}</b>, cada una con su QR` : `está tu <b>entrada</b> con su QR`}. Cada QR sirve para entrar <b>una vez</b>.</p>
      </td></tr>
      <tr><td style="padding:16px 26px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f8;border-radius:12px;">
          <tr><td style="padding:14px 18px;font:400 14px/1.8 Arial,sans-serif;color:#3a334d;">
            <b>${escapeHtml(tipo.nombre)}</b> · ${escapeHtml(EVENTO.cuando)}<br>
            ${escapeHtml(EVENTO.lugar)}${EVENTO.direccion ? '<br>' + escapeHtml(EVENTO.direccion) : ''}${puertas}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px 26px 0;">${qrsHtml}</td></tr>
      <tr><td style="padding:4px 26px 0;">
        <div style="font:800 12px/1.2 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a6a2a;margin-bottom:8px;">Cómo entrar</div>
        <ul style="font:400 14px/1.7 Arial,sans-serif;color:#3a334d;margin:0;padding-left:20px;">
          <li>Mostrá el QR en la puerta, desde el celular o impreso. <b>Hacele una captura</b>: en el lugar puede no haber señal.</li>
          <li>Cada persona necesita su propio QR.</li>
          <li>Si se te pierde este mail, entrá a <b>Mis entradas</b> con tu email y tu DNI.</li>
        </ul>
      </td></tr>
      <tr><td align="center" style="padding:22px 26px 6px;">
        <a href="${FRONTEND_URL}/mis-entradas" style="display:inline-block;background:#e7c27d;color:#1d1830;text-decoration:none;font:800 15px/1 Arial,sans-serif;padding:14px 30px;border-radius:999px;">Ver mis entradas</a>
      </td></tr>
      <tr><td align="center" style="padding:18px 26px 26px;">
        <div style="font:400 12px/1.6 Arial,sans-serif;color:#7d7590;">${escapeHtml(EVENTO.nombre)}${EVENTO.organiza ? ' · ' + escapeHtml(EVENTO.organiza) : ''}<br>N° de compra: ${escapeHtml(orden.id)}</div>
      </td></tr>
    </table>
  </div>`

  const texto = `¡Listo, ${String(orden.nombre || '').split(' ')[0]}!

Tu compra se confirmó: ${cuantasEntradas(orden)} · ${tipo.nombre}.
${EVENTO.nombre} · ${EVENTO.cuando}
${EVENTO.lugar}${EVENTO.direccion ? ' · ' + EVENTO.direccion : ''}

Los QR van adjuntos a este mail. Mostralos en la puerta desde el celular o impresos. Cada QR sirve una sola vez.
Si no ves las imágenes, entrá a ${FRONTEND_URL}/mis-entradas con tu email y tu DNI.

N° de compra: ${orden.id}`

  const info = await t.sendMail({
    from: remitente(), to: orden.email,
    subject: orden.cantidad > 1 ? `Tus ${cuantasEntradas(orden)} para ${EVENTO.nombre}` : `Tu entrada para ${EVENTO.nombre}`,
    text: texto, html, attachments,
  })
  const vista = nodemailer.getTestMessageUrl(info)
  console.log(vista ? `📧 Mail (vista previa): ${vista}` : `📧 Mail enviado a ${orden.email}`)
  return vista || null
}

// ═══════════════════════════════════════════════════════════════
//  EMITIR LAS ENTRADAS de una orden ya pagada (un QR por entrada)
// ═══════════════════════════════════════════════════════════════
async function emitirEntradas(orden, { mandarMail = true } = {}) {
  const filas = []
  for (let i = 1; i <= orden.cantidad; i++) {
    const base = `${orden.id}::${i}`
    filas.push({ orden_id: orden.id, indice: i, tipo: orden.tipo, codigo: firmarQR(base), base })
  }
  await Entrada.bulkCreate(filas, { ignoreDuplicates: true })
  const entradas = await Entrada.findAll({ where: { orden_id: orden.id }, order: [['indice', 'ASC']] })
  let vista = null
  if (mandarMail) {
    try { vista = await enviarMailEntradas(orden, entradas) }
    catch (e) { console.error(`⚠️ Orden ${orden.id}: se emitió pero falló el mail:`, e?.message || e) }
  }
  return { entradas, vista }
}

// Idempotencia ATÓMICA: solo el primero que pasa la orden a "pagada" emite las entradas
// (si llegan el aviso y la consulta de la página juntos, no se emite dos veces).
async function confirmarYEmitir(orden, extra = {}) {
  const campos = { estado: 'pagada', pagadaEn: new Date(), medioPago: extra.medioPago || 'transferencia',
    ...(extra.pagador ? { pagador: String(extra.pagador).slice(0, 120) } : {}) }
  const [afectadas] = await Orden.update(campos, { where: { id: orden.id, estado: { [Op.in]: ['pendiente', 'abandonada'] } } })
  if (!afectadas) return false
  Object.assign(orden, campos)
  const { entradas } = await emitirEntradas(orden)
  console.log(`✅ Orden ${orden.id} PAGADA → ${entradas.length} QR (${orden.tipo}) + mail a ${orden.email}`)
  return true
}

// ═══════════════════════════════════════════════════════════════
//  1) COMPRA ONLINE: crear la orden y el cobro de checkout en Chytapay
// ═══════════════════════════════════════════════════════════════
// Compras sin pagar que todavía guardan lugar: como mucho MAX_PENDIENTES por DNI o email y
// MAX_PENDIENTES_IP por conexión (en los celulares muchos comparten IP: el tope por IP es más alto).
const MAX_PENDIENTES = numEnv('MAX_PENDIENTES', 2)
const MAX_PENDIENTES_IP = numEnv('MAX_PENDIENTES_IP', 8)
const pendientesPorIp = new Map()   // ip → [{ id, t }]
async function demasiadasPendientes(v, ip) {
  const corte = new Date(Date.now() - RESERVA_MINUTOS * 60 * 1000)
  const mias = await Orden.count({ where: { estado: 'pendiente', metodo: 'chytapay', createdAt: { [Op.gte]: corte },
    [Op.or]: [{ dni: v.dni }, { email: v.email }] } })
  if (mias >= MAX_PENDIENTES) return 'Ya tenés compras empezadas sin pagar. Terminá de pagar una o esperá unos minutos.'
  if (pendientesPorIp.size > 50000) pendientesPorIp.clear()   // nunca crece sin límite
  const lista = (pendientesPorIp.get(ip) || []).filter(x => x.t > corte.getTime())
  pendientesPorIp.set(ip, lista)
  if (lista.length >= MAX_PENDIENTES_IP) {
    const siguen = await Orden.count({ where: { id: lista.map(x => x.id), estado: 'pendiente' } })
    if (siguen >= MAX_PENDIENTES_IP) return 'Hay demasiadas compras sin terminar desde esta conexión. Probá de nuevo en unos minutos.'
  }
  return null
}

app.post('/api/orders', rateLimit({ windowMs: 60000, max: 30 }), async (req, res) => {
  try {
    if (!VENTA_ABIERTA) return res.status(403).json({ error: 'La venta online todavía no está abierta.' })
    if (!chytapayConfigurado()) return res.status(503).json({ error: 'El cobro online no está disponible en este momento.' })
    const v = validarCompra(req.body || {})
    if (v.error) return res.status(400).json({ error: v.error })
    const ip = ipDe(req)
    const freno = await demasiadasPendientes(v, ip)
    if (freno) return res.status(429).json({ error: freno })

    const id = 'orden_' + randomUUID()
    const subtotal = precioDe(v.tipo) * v.cantidad
    const cargo = Math.round(subtotal * CARGO_PCT / 100)
    const total = subtotal + cargo
    const r = await crearOrdenConCupo({ id, ...v, metodo: 'chytapay', subtotal, cargo, total, estado: 'pendiente' })
    if (r.error) return res.status(r.status).json({ error: r.error })
    pendientesPorIp.get(ip)?.push({ id, t: Date.now() }) ?? pendientesPorIp.set(ip, [{ id, t: Date.now() }])

    // Si Chytapay falla, la orden se borra: si no, guardaría lugar en el cupo sin poder pagarse.
    // El comprador ve un solo precio: una sola descripción con el total, sin el costo de servicio aparte.
    const etiqueta = `${v.cantidad} × ${TIPOS[v.tipo].nombre}`
    let cobro
    try {
      cobro = await crearCobroCheckout({ referenceId: id, amount: total, description: `${etiqueta} · ${EVENTO.nombre}`,
        expiresInMinutes: RESERVA_MINUTOS, metadata: { orden: id }, webhookUrl: `${PUBLIC_URL}/api/webhooks/chytapay` })
    } catch (e) {
      await Orden.destroy({ where: { id, estado: 'pendiente' } }).catch(() => {})
      throw e
    }
    await Orden.update({ paymentId: cobro.paymentRequestId }, { where: { id } })
    console.log(`🧾 Orden creada: ${id} · ${etiqueta} · ${pesos(total)}`)
    // El paymentRequestId es sensible (con la clave pública alcanza para leer el cobro): va solo a esta respuesta.
    res.json({ orderId: id, pago: { paymentId: cobro.paymentRequestId, pk: clavePublicable(), minutos: RESERVA_MINUTOS }, total })
  } catch (e) {
    console.error('❌ Error creando orden:', e?.message || e)
    res.status(500).json({ error: 'No se pudo iniciar la compra. Probá de nuevo en un momento.' })
  }
})

// ═══════════════════════════════════════════════════════════════
//  2) CHYTAPAY: avisos firmados + consulta del cobro
// ═══════════════════════════════════════════════════════════════
async function verificarYEmitir(orden) {
  if (orden.estado === 'pagada') return true
  if (orden.metodo !== 'chytapay') return false
  const r = await cobroPagado(orden.id, orden.total)
  if (!r.ok) return false
  await confirmarYEmitir(orden, { pagador: r.cobro?.reconciledPayerName })
  return true
}

const _avisosVistos = new Set()   // X-Chytapay-Webhook-Id ya procesados (los reintentos traen el mismo)
const limiteAvisos = rateLimit({ windowMs: 60000, max: 600 })
app.post('/api/webhooks/chytapay', limiteAvisos, async (req, res) => {
  // Prueba al registrar la URL en el Portal: responder 2xx y no procesar.
  if (String(req.headers['x-chytapay-webhook-test'] || '') === 'true') return res.sendStatus(200)
  if (!firmaValida(req.cuerpoCrudo, req.headers['x-chytapay-signature'])) {
    console.log('⚠️ Aviso de Chytapay con firma inválida o vencida: rechazado')
    return res.sendStatus(401)   // si fuera de verdad de Chytapay, lo reintenta
  }
  const avisoId = String(req.headers['x-chytapay-webhook-id'] || '')
  if (avisoId && _avisosVistos.has(avisoId)) return res.sendStatus(200)
  res.sendStatus(200)   // responder en menos de 5 s; procesar después
  if (avisoId) { _avisosVistos.add(avisoId); if (_avisosVistos.size > 20000) _avisosVistos.clear() }
  const d = req.body || {}
  try {
    if (d.event === 'payment_request.payment_received') {
      const orden = d.referenceId ? await Orden.findByPk(d.referenceId) : null
      if (!orden) return console.log(`⚠️ Aviso de pago sin orden (${d.referenceId})`)
      if (d.stateType !== 'total_payment') return console.log(`ℹ️ Orden ${orden.id}: pago parcial ${d.paidAmount} de ${orden.total}`)
      if (Number(d.paidAmount) + 1 < orden.total) return console.log(`⚠️ Orden ${orden.id}: dice pagada pero pagó ${d.paidAmount} de ${orden.total}`)
      await confirmarYEmitir(orden, { pagador: d.reconciledPayerName })
    } else if (d.event === 'payment_request.expired') {
      const [n] = await Orden.update({ estado: 'abandonada' }, { where: { id: String(d.referenceId || ''), estado: 'pendiente' } })
      if (n) console.log(`⌛ Orden ${d.referenceId}: venció sin pagar`)
    } else if (d.event === 'payment.unmatched') {
      // Plata que entró a la cuenta de la academia y no se pudo asignar a una compra (pagó otra
      // persona, pagó tarde o pagó dos veces). Se registra para que la academia la asigne a mano.
      await SinImputar.create({ avisoId: avisoId || null, motivo: d.reason, monto: d.amount, pagador: d.payerName,
        pagadorCuil: d.payerCuil != null ? String(d.payerCuil) : null, orden_id: d.paymentRequest?.referenceId || null,
        fecha: d.operationDate ? new Date(d.operationDate) : new Date() }).catch(e => { if (!/unique/i.test(e?.name || '')) throw e })
      console.log(`⚠️ Pago SIN IMPUTAR: ${pesos(d.amount)} de ${d.payerName || 'desconocido'} (${d.reason})`)
    } else if (d.event === 'refund.succeeded') {
      const ref = d.paymentRequest?.referenceId || d.referenceId
      const [n] = ref ? await Orden.update({ estado: 'reversada' }, { where: { id: ref, estado: 'pagada' } }) : [0]
      console.log(n ? `🚫 Orden ${ref} REVERSADA (devolución)` : `ℹ️ Devolución sin orden pagada asociada (${ref})`)
    } else {
      console.log(`ℹ️ Aviso de Chytapay sin manejar: ${d.event}`)
    }
  } catch (e) {
    console.error('❌ Error procesando aviso de Chytapay:', e?.message || e)
  }
})

// Simular el pago de una orden (solo pruebas locales; en producción no existe).
app.post('/api/dev/confirmar/:orden', async (req, res) => {
  if (IS_PROD) return res.sendStatus(404)
  try {
    const orden = await Orden.findByPk(req.params.orden)
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    await confirmarYEmitir(orden, { pagador: 'Pago simulado' })
    res.json({ ok: true, estado: orden.estado })
  } catch (e) {
    console.error('❌ Error confirmando:', e?.message || e)
    res.status(500).json({ error: 'No se pudo confirmar' })
  }
})

// Estado de una orden al terminar el pago. Es también la red de seguridad si el aviso no llegó.
const _ultimaConsulta = new Map()   // orden → momento de la última consulta a Chytapay (no más de una cada 4 s)
app.post('/api/orders/:id/confirmar', rateLimit({ windowMs: 60000, max: 120 }), async (req, res) => {
  try {
    const orden = await Orden.findByPk(req.params.id)
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    if (orden.estado !== 'pagada' && Date.now() - (_ultimaConsulta.get(orden.id) || 0) > 4000) {
      _ultimaConsulta.set(orden.id, Date.now())
      if (_ultimaConsulta.size > 20000) _ultimaConsulta.clear()
      await verificarYEmitir(orden).catch(e => console.error('❌ Verificando al terminar el pago:', e?.message || e))
    }
    const entradas = orden.estado === 'pagada' ? await Entrada.findAll({ where: { orden_id: orden.id }, order: [['indice', 'ASC']] }) : []
    res.json({
      id: orden.id, nombre: String(orden.nombre).split(' ')[0], email: orden.email,
      tipo: orden.tipo, tipoNombre: TIPOS[orden.tipo]?.nombre || orden.tipo, cantidad: orden.cantidad, estado: orden.estado,
      qrs: entradas.map(e => ({ url: urlQR(e.codigo), indice: e.indice })),
    })
  } catch (e) {
    console.error('❌ Error confirmando la orden:', e?.message || e)
    res.status(500).json({ error: 'No se pudo verificar el pago' })
  }
})

// "Mis entradas": recuperar las entradas pagadas con email + DNI.
app.post('/api/mis-entradas', rateLimit({ windowMs: 60000, max: 20, msg: 'Demasiados intentos. Esperá un minuto.' }), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const dni = String(req.body?.dni || '').replace(/\D/g, '')
  if (!email || !dni) return res.status(400).json({ error: 'Faltan el email y el DNI' })
  try {
    const ordenes = await Orden.findAll({
      where: { estado: 'pagada', email, dni },
      include: [{ model: Entrada, as: 'qrs' }],
      order: [['createdAt', 'DESC'], [{ model: Entrada, as: 'qrs' }, 'indice', 'ASC']],
    })
    res.json({
      ordenes: ordenes.map(o => ({
        id: o.id, fecha: o.createdAt, tipo: o.tipo, tipoNombre: TIPOS[o.tipo]?.nombre || o.tipo, cantidad: o.cantidad,
        qrs: o.qrs.map(q => ({ url: urlQR(q.codigo), indice: q.indice, usado: q.usado })),
      })),
    })
  } catch (e) {
    console.error('❌ Error en mis-entradas:', e?.message || e)
    res.status(500).json({ error: 'No se pudieron buscar las entradas' })
  }
})

// ═══════════════════════════════════════════════════════════════
//  3) PUERTA: validar un QR (firma + un solo ingreso)
//  Si la puerta eligió un tipo (por ejemplo la función de las 21 h), los otros no pasan.
// ═══════════════════════════════════════════════════════════════
app.post('/api/validar', rateLimit({ windowMs: 60000, max: 1500 }), async (req, res) => {
  const p = tokenDeReq(req)
  const okAuth = (p && ['control', 'admin', 'organizador'].includes(p.rol) && await sigueActivo(p)) || (SCAN_TOKEN && req.headers['x-scan-token'] === SCAN_TOKEN)
  if (!okAuth) return res.status(401).json({ ok: false, error: 'No autorizado' })
  const { codigo } = req.body || {}
  const filtro = TIPOS[req.body?.tipo] ? req.body.tipo : null
  if (!codigo) return res.status(400).json({ ok: false, error: 'Falta el código' })

  const base = verificarQR(codigo)
  if (!base) return res.json({ ok: false, estado: 'invalido', msg: 'QR inválido o adulterado' })
  try {
    const [ordenId] = base.split('::')
    const orden = await Orden.findByPk(ordenId)
    if (orden?.estado === 'reversada') return res.json({ ok: false, estado: 'reversada', nombre: orden.nombre, msg: 'PAGO DEVUELTO: entrada anulada' })
    if (!orden || orden.estado !== 'pagada') return res.json({ ok: false, estado: 'no_pagada', msg: 'Entrada no válida o no pagada' })
    const entrada = await Entrada.findOne({ where: { base } })
    if (!entrada) return res.json({ ok: false, estado: 'invalido', msg: 'El QR no corresponde a la compra' })
    const tipo = TIPOS[entrada.tipo] || { nombre: entrada.tipo, corto: entrada.tipo }
    if (filtro && entrada.tipo !== filtro) {
      return res.json({ ok: false, estado: 'otro_tipo', nombre: orden.nombre, tipo: tipo.nombre,
        msg: `Es una entrada de ${tipo.corto.toUpperCase()}: acá no vale` })
    }
    // Marcado ATÓMICO: solo pasa si todavía no había entrado.
    const [afectadas] = await Entrada.update({ usado: true, usadoEn: new Date() }, { where: { id: entrada.id, usado: false } })
    const ingresadas = await Entrada.count({ where: { orden_id: orden.id, usado: true } })
    const extra = { nombre: orden.nombre, tipo: tipo.nombre, cantidad: orden.cantidad, ingresadas, prueba: orden.metodo === 'prueba' }
    if (!afectadas) {
      const ya = await Entrada.findByPk(entrada.id)
      return res.json({ ok: false, estado: 'usado', msg: 'Ya ingresó', cuando: ya?.usadoEn, ...extra })
    }
    return res.json({ ok: true, estado: 'valido', msg: orden.metodo === 'prueba' ? 'PRUEBA · Ingreso OK' : 'Ingreso OK', ...extra })
  } catch (e) {
    console.error('❌ Error validando:', e?.message || e)
    return res.status(500).json({ ok: false, error: 'Error al validar' })
  }
})

// ═══════════════════════════════════════════════════════════════
//  4) PANEL
// ═══════════════════════════════════════════════════════════════
app.post('/api/admin/login', rateLimit({ windowMs: 60000, max: 10, msg: 'Demasiados intentos. Esperá un minuto.' }), async (req, res) => {
  try {
    const { usuario, password } = req.body || {}
    if (!usuario || !password) return res.status(400).json({ error: 'Faltan usuario y clave' })
    const u = await Usuario.findOne({ where: { usuario: String(usuario).trim().toLowerCase() } })
    if (!u || !verifyPassword(password, u.salt, u.hash)) return res.status(401).json({ error: 'Usuario o clave incorrectos' })
    if (Number(u.activo) === 0) return res.status(403).json({ error: 'Este acceso está deshabilitado' })
    res.json({ token: firmarToken({ usuario: u.usuario, rol: u.rol }), rol: u.rol, usuario: u.usuario, nombre: u.nombre })
  } catch (e) {
    console.error('❌ Error en login:', e?.message || e)
    res.status(500).json({ error: 'Error al iniciar sesión' })
  }
})

// Contador de visitas a la página (público; nunca rompe la carga)
const _visitas = new Map()
app.post('/api/visita', rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  const ip = ipDe(req), ahora = Date.now()
  if (_visitas.get(ip) > ahora - 6 * 3600 * 1000) return res.json({ ok: true })
  _visitas.set(ip, ahora)
  if (_visitas.size > 50000) _visitas.clear()
  try { await Visita.create({ ip }); res.json({ ok: true }) } catch { res.json({ ok: false }) }
})

const filaOrden = (o, ingresos = {}) => ({
  id: o.id, metodo: o.metodo, vendedor: o.vendedor, cobro: o.cobro, tipo: o.tipo,
  nombre: o.nombre, email: o.email, dni: o.dni, cantidad: o.cantidad,
  subtotal: o.subtotal, cargo: o.cargo, total: o.total, estado: o.estado,
  fecha: o.pagadaEn || o.createdAt, medioPago: o.medioPago, pagador: o.pagador,
  ingresadas: ingresos[o.id] || 0,
})
async function ingresosDe(ids) {
  const r = {}
  if (!ids.length) return r
  const filas = await Entrada.findAll({ where: { orden_id: ids, usado: true }, attributes: ['orden_id', [fn('COUNT', col('id')), 'n']], group: ['orden_id'], raw: true })
  for (const f of filas) r[f.orden_id] = Number(f.n)
  return r
}

// Resumen general (administración y academia)
app.get('/api/admin/resumen', requireAuth(ORGANIZACION), async (req, res) => {
  try {
    const oc = await ocupacion()
    const pagadas = { estado: 'pagada', metodo: { [Op.notIn]: NO_PLATA } }
    const totales = await Orden.findOne({ where: pagadas, raw: true,
      attributes: [[fn('COUNT', col('id')), 'ordenes'], [fn('SUM', col('cantidad')), 'entradas'], [fn('SUM', col('subtotal')), 'recaudado'], [fn('SUM', col('total')), 'cobrado']] })
    const online = await Orden.findOne({ where: { ...pagadas, metodo: 'chytapay' }, raw: true,
      attributes: [[fn('COUNT', col('id')), 'operaciones'], [fn('SUM', col('cantidad')), 'entradas'], [fn('SUM', col('total')), 'importe']] })
    const porPuntoFilas = await Orden.findAll({ where: { ...pagadas, metodo: 'punto' }, raw: true, group: ['vendedor'],
      attributes: ['vendedor', [fn('COUNT', col('id')), 'operaciones'], [fn('SUM', col('cantidad')), 'entradas'], [fn('SUM', col('subtotal')), 'subtotal'], [fn('SUM', col('cargo')), 'cargo'], [fn('SUM', col('total')), 'total']] })
    const cortesias = await Orden.sum('cantidad', { where: { estado: 'pagada', metodo: 'cortesia' } }) || 0
    const pendientes = await Orden.count({ where: { estado: 'pendiente', metodo: 'chytapay', createdAt: { [Op.gte]: new Date(Date.now() - RESERVA_MINUTOS * 60000) } } })
    const ingresosPorTipo = Object.fromEntries((await Entrada.findAll({ where: { usado: true }, attributes: ['tipo', [fn('COUNT', col('id')), 'n']], group: ['tipo'], raw: true })).map(f => [f.tipo, Number(f.n)]))
    const sinImputar = await SinImputar.count({ where: { resuelto: false } })
    const inicioHoy = comienzoDelDiaArgentino()
    const ultimas = await Orden.findAll({ where: { estado: { [Op.in]: ['pagada', 'reversada'] }, metodo: { [Op.notIn]: NO_VENTA } }, order: [['updatedAt', 'DESC']], limit: 200 })
    const ing = await ingresosDe(ultimas.map(o => o.id))
    res.json({
      tipos: Object.fromEntries(Object.entries(oc).map(([k, t]) => [k, { ...t, nombre: TIPOS[k].nombre, ingresaron: ingresosPorTipo[k] || 0 }])),
      cortesias, pendientes, sinImputar,
      ordenes: Number(totales?.ordenes || 0), entradas: Number(totales?.entradas || 0),
      recaudado: Number(totales?.recaudado || 0), cobrado: Number(totales?.cobrado || 0),
      online: { operaciones: Number(online?.operaciones || 0), entradas: Number(online?.entradas || 0), importe: Number(online?.importe || 0) },
      porPunto: porPuntoFilas.map(f => ({ vendedor: f.vendedor, operaciones: Number(f.operaciones), entradas: Number(f.entradas), subtotal: Number(f.subtotal), cargo: Number(f.cargo), total: Number(f.total) })),
      visitas: { total: await Visita.count(), hoy: await Visita.count({ where: { createdAt: { [Op.gte]: inicioHoy } } }) },
      ventaAbierta: VENTA_ABIERTA, sandbox: !chytapayEsProduccion(),
      ultimas: ultimas.map(o => filaOrden(o, ing)),
    })
  } catch (e) {
    console.error('❌ Error en resumen:', e?.message || e)
    res.status(500).json({ error: 'Error al armar el resumen' })
  }
})

// Buscar compradores (todo el staff): por DNI, email, nombre o número de compra
app.get('/api/admin/buscar', requireAuth(['admin', 'control', 'venta', 'organizador']), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    if (q.length < 3) return res.json({ ordenes: [] })
    const like = { [Op.like]: `%${q}%` }
    const donde = /^\d{6,9}$/.test(q) ? { dni: q } : { [Op.or]: [{ email: like }, { nombre: like }, { id: like }] }
    const ordenes = await Orden.findAll({ where: { ...donde, estado: { [Op.in]: ['pagada', 'reversada'] }, metodo: { [Op.notIn]: NO_VENTA } }, order: [['createdAt', 'DESC']], limit: 40 })
    const ing = await ingresosDe(ordenes.map(o => o.id))
    res.json({ ordenes: ordenes.map(o => filaOrden(o, ing)) })
  } catch (e) {
    console.error('❌ Error buscando:', e?.message || e)
    res.status(500).json({ error: 'No se pudo buscar' })
  }
})

// Planilla con todas las ventas
app.get('/api/admin/exportar', requireAuth(ORGANIZACION), async (_req, res) => {
  try {
    const ordenes = await Orden.findAll({ where: { estado: 'pagada', metodo: { [Op.notIn]: NO_VENTA } }, order: [['pagadaEn', 'ASC']] })
    const ing = await ingresosDe(ordenes.map(o => o.id))
    const cols = ['id', 'fecha', 'tipo', 'cantidad', 'nombre', 'email', 'dni', 'metodo', 'vendedor', 'cobro', 'pagador', 'subtotal', 'cargo', 'total', 'ingresadas']
    const celda = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const filas = ordenes.map(o => { const f = filaOrden(o, ing); f.fecha = new Date(f.fecha).toISOString(); return cols.map(c => celda(f[c])).join(';') })
    res.set('Content-Type', 'text/csv; charset=utf-8')
    res.set('Content-Disposition', 'attachment; filename="ventas.csv"')
    res.send('﻿' + [cols.join(';'), ...filas].join('\n'))
  } catch (e) {
    console.error('❌ Error exportando:', e?.message || e)
    res.status(500).json({ error: 'No se pudo exportar' })
  }
})

// Transferencias sin asignar a una compra (la academia las asigna desde su cuenta de Chytapay)
app.get('/api/admin/sin-imputar', requireAuth(ORGANIZACION), async (_req, res) => {
  try {
    const filas = await SinImputar.findAll({ order: [['createdAt', 'DESC']], limit: 100, raw: true })
    res.json({ pagos: filas.map(f => ({ id: f.id, motivo: f.motivo, monto: Number(f.monto), pagador: f.pagador, orden: f.orden_id, fecha: f.fecha, resuelto: Boolean(Number(f.resuelto)) })) })
  } catch (e) {
    console.error('❌ Error en sin-imputar:', e?.message || e)
    res.status(500).json({ error: 'No se pudo armar la lista' })
  }
})
app.post('/api/admin/sin-imputar/:id/resuelto', requireAuth(['admin']), async (req, res) => {
  const [n] = await SinImputar.update({ resuelto: true }, { where: { id: Number(req.params.id) || 0 } }).catch(() => [0])
  res.json({ ok: Boolean(n) })
})

// Entrada de PRUEBA: QR real para probar los escáneres; no cuenta en ventas ni ocupa lugar.
app.post('/api/admin/entrada-prueba', requireAuth(['admin']), async (req, res) => {
  try {
    const tipo = TIPOS[req.body?.tipo] ? req.body.tipo : Object.keys(TIPOS)[0]
    const cantidad = Math.min(Math.max(parseInt(req.body?.cantidad, 10) || 1, 1), 5)
    const orden = await Orden.create({ id: 'orden_' + randomUUID(), tipo, nombre: 'ENTRADA DE PRUEBA', email: 'prueba@evento.local', dni: '0',
      metodo: 'prueba', cantidad, subtotal: 0, cargo: 0, total: 0, estado: 'pagada', pagadaEn: new Date() })
    const { entradas } = await emitirEntradas(orden, { mandarMail: false })
    res.json({ ok: true, ordenId: orden.id, tipo, qrs: entradas.map(e => ({ indice: e.indice, url: urlQR(e.codigo) })) })
  } catch (e) {
    console.error('❌ Error en entrada de prueba:', e?.message || e)
    res.status(500).json({ error: 'No se pudo generar la prueba' })
  }
})

// CORTESÍA (solo admin): QR real que se manda por mail. Ocupa lugar pero no es venta.
app.post('/api/admin/entrada-cortesia', requireAuth(['admin']), async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim() || 'Invitación'
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!/^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]{2,}$/.test(email)) return res.status(400).json({ error: 'Falta el email de la persona invitada' })
    const tipo = TIPOS[req.body?.tipo] ? req.body.tipo : Object.keys(TIPOS)[0]
    const cantidad = Math.min(Math.max(parseInt(req.body?.cantidad, 10) || 1, 1), 20)
    const r = await crearOrdenConCupo({ id: 'orden_' + randomUUID(), tipo, nombre, email, dni: String(req.body?.dni || '').replace(/\D/g, '') || null,
      metodo: 'cortesia', vendedor: req.usuario.usuario, cantidad, subtotal: 0, cargo: 0, total: 0, estado: 'pagada', pagadaEn: new Date() })
    if (r.error) return res.status(r.status).json({ error: r.error })
    await emitirEntradas(r.orden)
    console.log(`🎫 Cortesía: ${cantidad} ${tipo} → ${email} (por ${req.usuario.usuario})`)
    res.json({ ok: true, ordenId: r.orden.id, cantidad, email })
  } catch (e) {
    console.error('❌ Error emitiendo cortesía:', e?.message || e)
    res.status(500).json({ error: 'No se pudo emitir la cortesía' })
  }
})

// VENTA EN UN PUNTO FÍSICO (vendedor o admin): el público paga en efectivo o por
// transferencia al vendedor, el QR sale en pantalla y se manda al mail.
app.post('/api/admin/venta-punto', requireAuth(['venta', 'admin']), async (req, res) => {
  try {
    const v = validarCompra(req.body || {}, { maximo: 20 })
    if (v.error) return res.status(400).json({ error: v.error })
    const cobro = req.body?.cobro === 'transferencia' ? 'transferencia' : 'efectivo'
    const subtotal = precioDe(v.tipo) * v.cantidad
    const cargo = Math.round(subtotal * CARGO_PUNTO_PCT / 100)
    const r = await crearOrdenConCupo({ id: 'orden_' + randomUUID(), ...v, metodo: 'punto', vendedor: req.usuario.usuario, cobro,
      subtotal, cargo, total: subtotal + cargo, estado: 'pagada', pagadaEn: new Date() })
    if (r.error) return res.status(r.status).json({ error: r.error })
    const { entradas } = await emitirEntradas(r.orden)
    console.log(`💵 Venta en punto (${req.usuario.usuario}, ${cobro}): ${v.cantidad} ${v.tipo} → ${v.email} · ${pesos(subtotal + cargo)}`)
    res.json({ ok: true, ordenId: r.orden.id, total: subtotal + cargo, qrs: entradas.map(e => ({ indice: e.indice, url: urlQR(e.codigo) })) })
  } catch (e) {
    console.error('❌ Error en venta en punto:', e?.message || e)
    res.status(500).json({ error: 'No se pudo registrar la venta' })
  }
})

// Liquidación del vendedor: lo que cobró y lo que tiene que rendir.
app.get('/api/admin/mis-ventas', requireAuth(['venta', 'admin']), async (req, res) => {
  try {
    const ordenes = await Orden.findAll({ where: { estado: 'pagada', metodo: 'punto', vendedor: req.usuario.usuario }, order: [['createdAt', 'DESC']] })
    const suma = k => ordenes.reduce((s, o) => s + Number(o[k]), 0)
    res.json({
      totales: { ventas: ordenes.length, entradas: suma('cantidad'), cobrado: suma('total'), paraOrganizador: suma('subtotal'), costoServicio: suma('cargo'),
        efectivo: ordenes.filter(o => o.cobro === 'efectivo').reduce((s, o) => s + o.total, 0),
        transferencia: ordenes.filter(o => o.cobro === 'transferencia').reduce((s, o) => s + o.total, 0) },
      ordenes: ordenes.map(o => filaOrden(o)),
    })
  } catch (e) {
    console.error('❌ Error en mis-ventas:', e?.message || e)
    res.status(500).json({ error: 'No se pudo armar la liquidación' })
  }
})

// QR de una orden en pantalla (staff)
app.get('/api/admin/orden/:id/qrs', requireAuth(['admin', 'control', 'venta', 'organizador']), async (req, res) => {
  try {
    const orden = await Orden.findByPk(req.params.id)
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    if (req.usuario.rol === 'venta' && orden.vendedor !== req.usuario.usuario) return res.status(403).json({ error: 'Sin permiso' })
    const entradas = await Entrada.findAll({ where: { orden_id: orden.id }, order: [['indice', 'ASC']] })
    res.json({ ok: true, nombre: orden.nombre, email: orden.email, dni: orden.dni, tipo: orden.tipo, tipoNombre: TIPOS[orden.tipo]?.nombre || orden.tipo, cantidad: orden.cantidad,
      qrs: entradas.map(e => ({ indice: e.indice, url: urlQR(e.codigo), usado: e.usado })) })
  } catch (e) {
    console.error('❌ Error trayendo los QR:', e?.message || e)
    res.status(500).json({ error: 'No se pudieron traer los QR' })
  }
})

// Reenviar las entradas a otro email (para quien escribió mal el suyo)
app.post('/api/admin/orden/:id/reenviar', requireAuth(['admin', 'venta']), async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (email.length > 120 || !/^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]{2,}$/.test(email)) return res.status(400).json({ error: 'Email inválido' })
    const orden = await Orden.findByPk(req.params.id)
    if (!orden || orden.estado !== 'pagada') return res.status(404).json({ error: 'Orden no encontrada o sin pagar' })
    if (req.usuario.rol === 'venta' && orden.vendedor !== req.usuario.usuario) return res.status(403).json({ error: 'Solo podés reenviar tus propias ventas' })
    const entradas = await Entrada.findAll({ where: { orden_id: orden.id }, order: [['indice', 'ASC']] })
    if (!entradas.length) return res.status(404).json({ error: 'La orden no tiene entradas emitidas' })
    await orden.update({ email })
    await enviarMailEntradas(orden, entradas)
    console.log(`📧 Reenvío: orden ${orden.id} → ${email} (por ${req.usuario.usuario})`)
    res.json({ ok: true, email, cantidad: entradas.length })
  } catch (e) {
    console.error('❌ Error reenviando:', e?.message || e)
    res.status(500).json({ error: 'No se pudo reenviar' })
  }
})

// Marcar el ingreso de toda una orden sin escanear (por ejemplo si el celular no prende)
app.post('/api/admin/orden/:id/ingresar', requireAuth(['admin', 'control', 'organizador']), async (req, res) => {
  try {
    const orden = await Orden.findByPk(req.params.id)
    if (!orden || orden.estado !== 'pagada') return res.status(400).json({ error: 'La orden no está pagada' })
    const [marcadas] = await Entrada.update({ usado: true, usadoEn: new Date() }, { where: { orden_id: orden.id, usado: false } })
    console.log(`🚪 Ingreso manual ${orden.id}: ${marcadas} (por ${req.usuario.usuario})`)
    res.json({ ok: true, marcadas, total: orden.cantidad, nombre: orden.nombre })
  } catch (e) {
    console.error('❌ Error en ingreso manual:', e?.message || e)
    res.status(500).json({ error: 'No se pudo marcar el ingreso' })
  }
})

// Repesca a pedido ("pagué y no me llegó")
app.post('/api/admin/repescar', requireAuth(['admin']), async (_req, res) => {
  try {
    const antes = await Orden.count({ where: { estado: { [Op.in]: ['pendiente', 'abandonada'] }, metodo: 'chytapay' } })
    const emitidas = await repescarPagos()
    res.json({ ok: true, revisadas: antes, emitidas })
  } catch (e) {
    console.error('❌ Error en la repesca manual:', e?.message || e)
    res.status(500).json({ error: 'No se pudo revisar' })
  }
})

// ── Conectar la cuenta de Chytapay de la academia (solo admin) ──
// El admin genera el enlace; lo abre la academia (en este celular o en el suyo), entra con su
// usuario de Chytapay, ve la comisión y autoriza. Chytapay la manda de vuelta a /chytapay/vuelta.
const _estados = new Map()   // state → vence (un solo uso, 15 minutos)
app.get('/api/admin/chytapay', requireAuth(['admin']), async (_req, res) => {
  try {
    const v = await vinculoActual()
    res.json({ configurado: chytapayConfigurado(), produccion: chytapayEsProduccion(),
      vinculo: v ? { nombre: v.nombre, fantasia: v.fantasia, cuit: v.cuit, email: v.email, conectadoEn: v.conectadoEn } : null })
  } catch (e) {
    res.status(500).json({ error: 'No se pudo consultar la conexión' })
  }
})
app.post('/api/admin/chytapay/conectar', requireAuth(['admin']), (_req, res) => {
  if (!process.env.CHYTAPAY_CLIENT_ID || !process.env.CHYTAPAY_CLIENT_SECRET) return res.status(400).json({ error: 'Faltan CHYTAPAY_CLIENT_ID y CHYTAPAY_CLIENT_SECRET en el servidor' })
  const state = randomBytes(24).toString('base64url')
  for (const [k, vence] of _estados) if (vence < Date.now()) _estados.delete(k)
  _estados.set(state, Date.now() + 15 * 60000)
  res.json({ url: urlAutorizar(state), minutos: 15 })
})
app.get('/chytapay/vuelta', rateLimit({ windowMs: 60000, max: 20 }), async (req, res) => {
  const state = String(req.query.state || ''), code = String(req.query.code || '')
  const vence = _estados.get(state)
  _estados.delete(state)
  if (!vence || vence < Date.now()) return res.redirect('/admin?chytapay=vencido')
  if (!code) return res.redirect('/admin?chytapay=cancelado')
  try {
    const tokens = await canjearCode(code)
    const v = await guardarVinculo(tokens)
    console.log(`🔗 Chytapay conectado: ${v.nombre} (${v.cuit})`)
    res.redirect('/admin?chytapay=ok')
  } catch (e) {
    console.error('❌ Error conectando Chytapay:', e?.message || e)
    res.redirect('/admin?chytapay=error')
  }
})

// ═══════════════════════════════════════════════════════════════
//  5) CONFIG PÚBLICA para la página y la compra
//  Los precios salen de acá y NO se escriben a mano en el HTML: si no, la página
//  muestra un total y el cobro es por otro.
// ═══════════════════════════════════════════════════════════════
let _ocCache = { t: 0, v: null }   // la página la pide en cada visita: 20 s de caché alcanzan
app.get('/api/config', async (_req, res) => {
  const estado = Object.fromEntries(Object.keys(TIPOS).map(k => [k, 'disponible']))
  try {
    if (Date.now() - _ocCache.t > 20000) _ocCache = { t: Date.now(), v: await ocupacion() }
    for (const [k, t] of Object.entries(_ocCache.v)) estado[k] = t.libres <= 0 ? 'agotado' : t.libres <= POCAS ? 'pocas' : 'disponible'
  } catch { /* sin base, se muestra disponible: la compra igual controla el cupo */ }
  res.set('Cache-Control', 'no-cache')
  res.json({
    ventaAbierta: VENTA_ABIERTA && chytapayConfigurado(),
    maxEntradas: MAX_ENTRADAS, cargoPuntoPct: CARGO_PUNTO_PCT, reservaMinutos: RESERVA_MINUTOS,
    tipos: Object.fromEntries(Object.entries(TIPOS).map(([k, t]) =>
      [k, { nombre: t.nombre, corto: t.corto, detalle: t.detalle, precio: t.precio, final: conCargo(t.precio, CARGO_PCT), estado: estado[k] }])),
    evento: { nombre: EVENTO.nombre, organiza: EVENTO.organiza, cuando: EVENTO.cuando, fecha: EVENTO.fecha, lugar: EVENTO.lugar,
      direccion: EVENTO.direccion, puertas: EVENTO.puertas, menores: EVENTO.menores, ayudaWhatsapp: EVENTO.ayudaWhatsapp },
    sandbox: !chytapayEsProduccion(),
  })
})

// Direcciones cortas (se dictan por teléfono sin decir "punto html")
for (const p of ['comprar', 'admin', 'mis-entradas', 'pago-exitoso', 'pago-pendiente', 'pago-fallido']) {
  app.get('/' + p, (_req, res) => res.sendFile(join(FRONT, p + '.html')))
}
app.get('/panel', (_req, res) => res.redirect('/admin'))
app.get('/puerta', (_req, res) => res.redirect('/admin'))
app.get('/entradas', (_req, res) => res.redirect('/mis-entradas'))
app.get('/health', (_req, res) => res.send(`Backend ${EVENTO.nombre} ✅`))

// Levantar el server YA, sin esperar la base (Render necesita que responda rápido)
app.listen(PORT, () => {
  console.log(`🚀 ${EVENTO.nombre}: puerto ${PORT}`)
  if (!chytapayConfigurado()) console.warn('⚠️ Faltan datos de Chytapay (CHYTAPAY_*): la venta online queda cerrada')
  console.log(`💳 Chytapay [${chytapayEsProduccion() ? 'PRODUCCIÓN' : 'sandbox'}] · cargo ${CARGO_PCT}% online, ${CARGO_PUNTO_PCT}% en puntos · reserva ${RESERVA_MINUTOS} min`)
  console.log(`🎟️ ${Object.values(TIPOS).map(t => `${t.corto} ${pesos(conCargo(t.precio, CARGO_PCT))} (cupo ${t.cupo})`).join(' · ')} · venta ${VENTA_ABIERTA ? 'ABIERTA' : 'cerrada'}`)
})

// ═══════════════════════════════════════════════════════════════
//  REPESCA DE PAGOS: pregunta a Chytapay por las órdenes pendientes
//  (el comprador cerró la pestaña o el aviso no llegó). Una compra vencida que la academia
//  después imputa a mano también se emite.
// ═══════════════════════════════════════════════════════════════
const REPESCA_MINUTOS = numEnv('REPESCA_MINUTOS', 2)
const REPESCA_HORAS = numEnv('REPESCA_HORAS', 24)
const REPESCA_MAX = numEnv('REPESCA_MAX', 30)
let repescaCorriendo = false
async function repescarPagos() {
  if (repescaCorriendo || !chytapayConfigurado()) return 0
  repescaCorriendo = true
  let emitidas = 0
  try {
    const pendientes = await Orden.findAll({
      where: { estado: { [Op.in]: ['pendiente', 'abandonada'] }, metodo: 'chytapay', createdAt: { [Op.gte]: new Date(Date.now() - REPESCA_HORAS * 3600 * 1000) } },
      order: [['updatedAt', 'ASC']], limit: REPESCA_MAX,
    })
    for (const orden of pendientes) {
      try { if (await verificarYEmitir(orden)) emitidas++ } catch (e) { console.error(`⚠️ Repesca ${orden.id}:`, e?.message || e) }
      // Se toca updatedAt para que la próxima pasada empiece por otras (rota entre todas las pendientes).
      if (orden.estado !== 'pagada') await Orden.update({ avisadoEn: orden.avisadoEn }, { where: { id: orden.id } }).catch(() => {})
    }
    if (emitidas) console.log(`✅ Repesca: ${emitidas} de ${pendientes.length} pendientes se emitieron.`)
  } catch (e) {
    console.error('⚠️ Error en la repesca:', e?.message || e)
  } finally {
    repescaCorriendo = false
  }
  return emitidas
}

// ═══════════════════════════════════════════════════════════════
//  RECUPERO DE COMPRAS A MEDIO CAMINO: un mail, una sola vez, ofreciendo ayuda.
// ═══════════════════════════════════════════════════════════════
const RECUPERO_MINUTOS = numEnv('RECUPERO_MINUTOS', 45)
const RECUPERO_HORAS = numEnv('RECUPERO_HORAS', 48)
let recuperoCorriendo = false
async function recuperarPendientes() {
  if (recuperoCorriendo) return
  recuperoCorriendo = true
  try {
    const ahora = Date.now()
    const candidatas = await Orden.findAll({
      where: { estado: { [Op.in]: ['pendiente', 'abandonada'] }, avisadoEn: null, metodo: 'chytapay',
        createdAt: { [Op.lte]: new Date(ahora - RECUPERO_MINUTOS * 60000), [Op.gte]: new Date(ahora - RECUPERO_HORAS * 3600000) } },
      order: [['createdAt', 'ASC']], limit: 20,
    })
    const yaEscritos = new Set()
    for (const orden of candidatas) {
      const mail = String(orden.email || '').toLowerCase()
      const compro = await Orden.count({ where: { email: orden.email, estado: 'pagada' } })
      if (!compro && mail.includes('@') && !yaEscritos.has(mail)) {
        try { await enviarMailPendiente(orden); yaEscritos.add(mail) } catch (e) { console.error(`⚠️ No se pudo escribir a ${orden.email}:`, e?.message || e) }
      }
      await orden.update({ avisadoEn: new Date() })   // se marca igual: nunca dos veces
    }
  } catch (e) {
    console.error('⚠️ Error en el recupero:', e?.message || e)
  } finally {
    recuperoCorriendo = false
  }
}

// Conectar la base en segundo plano y crear las tablas si no existen
sequelize.authenticate()
  .then(() => sequelize.sync())
  .then(() => {
    console.log('🗄️  Base MySQL conectada')
    if (REPESCA_MINUTOS > 0) { setInterval(repescarPagos, REPESCA_MINUTOS * 60000); setTimeout(repescarPagos, 20000) }
    if (RECUPERO_MINUTOS > 0) { setInterval(recuperarPendientes, 5 * 60000); setTimeout(recuperarPendientes, 90000) }
  })
  .catch(e => {
    console.error('❌ No se pudo conectar a la base:', e?.message || e)
    console.error('   Revisá DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME y la lista de IPs permitidas de Aiven')
  })

// Que un error async no tumbe el proceso
process.on('unhandledRejection', e => console.error('⚠️ unhandledRejection:', e?.message || e))
process.on('uncaughtException', e => console.error('⚠️ uncaughtException:', e?.message || e))
