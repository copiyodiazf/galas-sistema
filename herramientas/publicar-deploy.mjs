// Copia PÚBLICA para Render (la cuenta de los eventos no puede conectarse al GitHub de este repo).
// Lleva solo backend, frontend y temas del último commit, SIN historia, sin SISTEMA.md ni herramientas, y sin
// las notas "_..." de cada sitio.json. Render la toma como "Public Git Repository".
//   node herramientas/publicar-deploy.mjs        → arma C:\galas-deploy, hace commit y push a copiyodiazf/galas-web
//   node herramientas/publicar-deploy.mjs --revisar   → solo la arma, para mirarla antes de subir
// El código se edita SIEMPRE acá (repo privado): la copia pública se pisa entera en cada publicación.
import { execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const ORIGEN = 'C:/galas-sistema', DESTINO = 'C:/galas-deploy'
const REMOTO = 'https://copidiaz17@github.com/copiyodiazf/galas-web.git'   // copidiaz17 sube como colaborador
const sh = (c, cwd = ORIGEN) => execSync(c, { cwd, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, GCM_INTERACTIVE: 'never' } }).toString().trim()

if (sh('git status --porcelain')) throw new Error('Hay cambios sin commit en galas-sistema: commitealos antes de publicar')
const version = sh('git rev-parse --short HEAD')
if (!existsSync(join(DESTINO, '.git'))) { mkdirSync(DESTINO, { recursive: true }); sh('git init -q -b main', DESTINO); sh(`git remote add origin ${REMOTO}`, DESTINO) }
for (const f of readdirSync(DESTINO)) if (f !== '.git') rmSync(join(DESTINO, f), { recursive: true, force: true })

// Los archivos del último commit (solo lo que git sigue: nada de .env ni usuarios), con un índice aparte
// para no tocar el del repo. Sin tar: el de Git Bash no entiende rutas "C:/...".
const indice = join(tmpdir(), `galas-indice-${version}`)
execSync(`git --work-tree="${DESTINO}" checkout HEAD -- backend frontend temas`, { cwd: ORIGEN, stdio: 'inherit', env: { ...process.env, GIT_INDEX_FILE: indice } })
rmSync(indice, { force: true })

// Las notas internas de cada ficha (claves que empiezan con "_") no se publican.
const sinNotas = x => Array.isArray(x) ? x.map(sinNotas)
  : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, sinNotas(v)])) : x
for (const tema of readdirSync(join(DESTINO, 'temas'))) {
  const f = join(DESTINO, 'temas', tema, 'sitio.json')
  if (existsSync(f)) writeFileSync(f, JSON.stringify(sinNotas(JSON.parse(readFileSync(f, 'utf8'))), null, 2) + '\n')
}
writeFileSync(join(DESTINO, '.gitignore'), 'node_modules/\n.env\n*.env\n')
writeFileSync(join(DESTINO, 'README.md'), '# Venta de entradas de galas\n\nCopia para desplegar en Render (Root Directory `backend`, build `npm ci`, start `node server.js`, una variable `TEMA` por gala).\n')

if (process.argv.includes('--revisar')) { console.log(`Armada en ${DESTINO} (versión ${version}), sin subir: revisala y corré sin --revisar`); process.exit(0) }
sh('git add -A', DESTINO)
if (!sh('git status --porcelain', DESTINO)) { console.log(`Sin cambios: la copia pública ya tiene ${version}`); process.exit(0) }
sh(`git commit -q -m "galas-sistema ${version}"`, DESTINO)
sh('git push -q -u origin main', DESTINO)
console.log(`Publicada la versión ${version} en ${REMOTO.replace('copidiaz17@', '')}`)
