// Arma una VISTA PREVIA estática de la portada de un tema (para mostrársela al cliente en GitHub Pages
// antes de que exista el sistema en Render). No vende: los precios van como copia de /api/config y la
// portada los muestra con el cartel "Vista previa" (ver window.VISTA_PREVIA en temas/<tema>/index.html).
// Necesita el servidor local andando con ese tema, para sacar la copia de los precios:
//   node herramientas/vista-previa.mjs <tema> <url pública de la copia> <carpeta salida> [url del servidor local]
//   node herramientas/vista-previa.mjs patin-fa https://copidiaz17.github.io/el-quinto-elemento C:/patin-fa/gala-2026/publicar http://localhost:3045
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const [tema, urlPublica, salida, local = 'http://localhost:3045'] = process.argv.slice(2)
if (!tema || !/^https:\/\//.test(urlPublica || '') || !salida) { console.log('Uso: node vista-previa.mjs <tema> <url pública> <carpeta salida> [servidor local]'); process.exit(1) }
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'temas', tema)
const portada = join(raiz, 'index.html')
if (!existsSync(portada)) { console.log(`El tema "${tema}" no tiene portada propia (index.html)`); process.exit(1) }

const cfg = await fetch(local + '/api/config').then(r => r.json())
const s = cfg.sitio
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const descripcion = [s.lema || s.organiza, s.direccion || s.lugar].filter(Boolean).join(' · ') + '. Entradas online con QR al instante.'
const copia = { sitio: s, eventos: cfg.eventos, vistaPrevia: true }

let html = readFileSync(portada, 'utf8')
  .replaceAll('%%NOMBRE%%', esc(s.nombre)).replaceAll('%%DESCRIPCION%%', esc(descripcion)).replaceAll('%%URL%%', esc(urlPublica.replace(/\/$/, '')))
  .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">')
  .replace(/<script type="speculationrules">[\s\S]*?<\/script>\n?/, '')   // en la copia no hay /comprar
html = html.replace(/<script>(?![\s\S]*<script>)/, `<script>window.VISTA_PREVIA = ${JSON.stringify(copia).replace(/</g, '\\u003c')};</script>\n<script>`)
if (html.includes('%%')) { console.log('Quedaron marcas %% sin reemplazar'); process.exit(1) }

// La carpeta de salida es un repo aparte: se renuevan el index y los assets, sin tocar .git
mkdirSync(salida, { recursive: true })
for (const f of readdirSync(salida)) if (f !== '.git') rmSync(join(salida, f), { recursive: true, force: true })
writeFileSync(join(salida, 'index.html'), html)
cpSync(join(raiz, 'assets'), join(salida, 'assets'), { recursive: true, filter: f => !/mail-logo\.png$/.test(f) })
writeFileSync(join(salida, '.nojekyll'), '')
writeFileSync(join(salida, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
console.log(`Vista previa de "${tema}" lista en ${salida} (${cfg.eventos.length} evento/s, precios del ${new Date().toLocaleDateString('es-AR')})`)
