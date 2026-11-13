// Prueba de CARGA de la venta con butacas (Rítmica, 13/11/2026): la apertura de la venta, con cientos de familias a la
// vez queriendo las primeras filas. Mide cuánto tarda cada compra, cuántas chocan por la misma butaca y, sobre todo,
// que ninguna butaca quede vendida dos veces. Simula también a los que comparten IP (los celulares detrás de CGNAT).
// Servidor local:   (en backend) TEMA=santiago-ritmica DB_NAME=gala_ritmica PORT=3047 node server.js
// Prueba:           (en backend) DB_NAME=gala_ritmica node ../herramientas/prueba-carga.mjs 3047 [familias] [por IP compartida]
// Borra las compras de la base LOCAL gala_ritmica.
import { sequelize, Orden, Entrada, SinImputar, Evento } from '../backend/models/index.js'

if (process.env.DB_NAME !== 'gala_ritmica') { console.log('Solo contra la base local gala_ritmica (DB_NAME=gala_ritmica)'); process.exit(1) }
const BASE = `http://localhost:${process.argv[2] || 3047}`
const FAMILIAS = Number(process.argv[3] || 300)
const COMPARTEN = Number(process.argv[4] || 40)   // familias detrás de una misma IP (otra tanda)
const MODELO = Number(process.argv[5] || 40)      // entre cuántas de las mejores opciones libres elige cada familia al reintentar
const EV = 'el-origen-de-ser-18'
const ms = t => Math.round(t)
// El nombre solo acepta letras: el número de familia en letras (0 → a, 1 → b…)
const letras = n => String(n).split('').map(c => 'abcdefghij'[c]).join('')
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0

const ev = await Evento.findByPk(EV)
if (!ev?.publicado) { console.log('La función de las 18 h tiene que estar publicada (corré la muestra antes)'); process.exit(1) }
await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} }); await SinImputar.destroy({ where: {} })
ev.bloqueadas = []; await ev.save()

const cfg = await fetch(BASE + '/api/config').then(r => r.json())
const sala = cfg.sitio.sala
// Las filas de platea, de adelante para atrás, con sus números de butaca
const filas = sala.filas.filter(f => f.tipo !== 'zona-verde').map(f => ({ fila: f.fila, nums: f.bloques.filter(b => !b.hueco).flatMap(b => Array.from({ length: b.hasta - b.desde + 1 }, (_, i) => b.desde + i)) }))

async function comprar(butacas, n, ip) {
  const t0 = performance.now()
  const r = await fetch(BASE + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ evento: EV, butacas, nombre: 'Familia ' + letras(n), email: `familia${n}@ejemplo.com`, dni: String(40000000 + n) }) })
  const d = await r.json().catch(() => ({}))
  return { status: r.status, d, ms: performance.now() - t0 }
}
// Lo que haría una persona: mirar el plano y tomar las mejores k butacas juntas que queden (lo más adelante y al centro)
async function mejoresLibres(k, ip, sala) {
  // Como la compra: si el choque trajo el plano entero (sala), usa ese; si no, lo pide.
  const oc = new Set(sala || (await fetch(`${BASE}/api/sala?evento=${EV}`, { headers: { 'CF-Connecting-IP': ip } }).then(r => r.json())).ocupadas || [])
  // Quiere estar adelante, pero no todas eligen lo mismo: junta los tramos libres de k butacas de todas las filas,
  // ordenados de adelante para atrás y del centro a los costados, y toma uno al azar entre los MODELO primeros.
  const opciones = []
  filas.forEach((f, nf) => {
    const libres = f.nums.filter(x => !oc.has(`${f.fila}-${x}`)), medio = (f.nums[0] + f.nums[f.nums.length - 1]) / 2
    for (let i = 0; i + k <= libres.length; i++) if (libres[i + k - 1] - libres[i] === k - 1)
      opciones.push({ peso: nf * 100 + Math.abs(libres[i] + k / 2 - medio), butacas: libres.slice(i, i + k).map(x => `${f.fila}-${x}`) })
  })
  if (!opciones.length) return null
  opciones.sort((a, b) => a.peso - b.peso)
  return opciones[Math.floor(Math.random() * Math.min(MODELO, opciones.length))].butacas
  return null
}

async function familia(n, ip) {
  const k = 2 + Math.floor(Math.random() * 3)                // 2 a 4 entradas
  // Primer intento: todas apuntan a las filas 1 a 4, al centro (lo que haría cada papá)
  const f = filas[Math.floor(Math.random() * 4)]
  const centro = Math.floor(f.nums.length / 2) + Math.floor(Math.random() * 9) - 4
  let butacas = f.nums.slice(Math.max(0, centro - Math.floor(k / 2)), Math.max(0, centro - Math.floor(k / 2)) + k).map(x => `${f.fila}-${x}`)
  const intentos = []
  for (let i = 0; i < 10; i++) {
    const r = await comprar(butacas, n, ip)
    intentos.push(r)
    if (r.status === 200) return { ok: true, intentos, butacas, fila: Number(butacas[0].split('-')[0]) }
    if (r.status !== 409) return { ok: false, intentos, motivo: `${r.status} ${r.d.error || ''}`.slice(0, 90) }
    await new Promise(z => setTimeout(z, 1500 + Math.random() * 3500))   // una persona tarda en volver a elegir
    butacas = await mejoresLibres(k, ip, r.d.sala)            // chocó: mira el plano (el que trajo el choque) y elige otras
    if (!butacas) return { ok: false, intentos, motivo: 'no quedan butacas juntas' }
  }
  return { ok: false, intentos, motivo: 'se cansó (10 intentos)' }
}

function informe(titulo, res, total) {
  const todas = res.flatMap(r => r.intentos), primeras = res.map(r => r.intentos[0])
  const ok = res.filter(r => r.ok), mal = res.filter(r => !r.ok)
  const motivos = {}; for (const r of mal) motivos[r.motivo] = (motivos[r.motivo] || 0) + 1
  console.log(`\n── ${titulo} ──`)
  console.log(`${res.length} familias a la vez · todo resuelto en ${ms(total)} ms`)
  console.log(`compraron: ${ok.length} · sin comprar: ${mal.length}${mal.length ? ' → ' + JSON.stringify(motivos) : ''}`)
  console.log(`primer intento: ${primeras.filter(x => x.status === 200).length} consiguieron lo que eligieron, ${primeras.filter(x => x.status === 409).length} chocaron con otra familia`)
  console.log(`intentos hasta comprar: ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => `${i}→${ok.filter(r => r.intentos.length === i).length}`).join('  ')}`)
  console.log(`respuesta del servidor por intento: mediana ${ms(pct(todas.map(x => x.ms), .5))} ms · 95 % ${ms(pct(todas.map(x => x.ms), .95))} ms · peor ${ms(Math.max(...todas.map(x => x.ms)))} ms`)
  const porFila = {}; for (const r of ok) porFila[r.fila] = (porFila[r.fila] || 0) + 1
  console.log(`dónde quedaron (fila → familias): ${Object.entries(porFila).sort((a, b) => a[0] - b[0]).map(([f, c]) => `${f}→${c}`).join('  ')}`)
}

async function sinDobles() {
  const vivas = await Orden.findAll({ where: { evento: EV, estado: ['pendiente', 'pagada'] }, attributes: ['id', 'butacas'] })
  const vistas = new Map(); let dobles = 0
  for (const o of vivas) for (const b of String(o.butacas || '').split(',').filter(Boolean)) { if (vistas.has(b)) dobles++; vistas.set(b, o.id) }
  return { compras: vivas.length, butacas: vistas.size, dobles }
}

// 1) Apertura de la venta: cada familia con su propia conexión
let t0 = performance.now()
const res1 = await Promise.all(Array.from({ length: FAMILIAS }, (_, i) => familia(i, `10.${Math.floor(i / 250)}.${i % 250}.7`)))
informe(`Apertura: ${FAMILIAS} familias, cada una con su conexión`, res1, performance.now() - t0)
let d = await sinDobles()
console.log(`BASE: ${d.compras} compras apartando ${d.butacas} butacas · butacas repetidas: ${d.dobles} ${d.dobles ? '✗ MAL' : '✓'}`)

// 2) Familias que comparten la IP (datos móviles con CGNAT): COMPARTEN familias detrás de una sola dirección
t0 = performance.now()
const ipCompartida = `100.64.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
const res2 = await Promise.all(Array.from({ length: COMPARTEN }, (_, i) => familia(5000 + i, ipCompartida)))
informe(`${COMPARTEN} familias detrás de la MISMA IP (datos móviles)`, res2, performance.now() - t0)
d = await sinDobles()
console.log(`BASE: ${d.compras} compras · butacas repetidas: ${d.dobles} ${d.dobles ? '✗ MAL' : '✓'}`)

await Entrada.destroy({ where: {} }); await Orden.destroy({ where: {} }); await SinImputar.destroy({ where: {} })
await sequelize.close()
