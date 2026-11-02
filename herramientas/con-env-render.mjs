// Corre un script del backend contra la base de RENDER (Aiven), con las variables de un render-env-*.txt
// (por defecto render-env-sandbox.txt; cada gala tiene el suyo). No muestra ningún valor.
//   node herramientas/con-env-render.mjs crear-usuarios.mjs admin:jose control:puerta1
//   ENV_RENDER=render-env-quinto.txt USUARIOS_ARCHIVO=usuarios-panel-render-quinto.txt node herramientas/con-env-render.mjs crear-usuarios.mjs ...
import { readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const aqui = dirname(fileURLToPath(import.meta.url))
const env = { ...process.env, USUARIOS_ARCHIVO: process.env.USUARIOS_ARCHIVO || 'usuarios-panel-render.txt' }
for (const l of readFileSync(join(aqui, '..', process.env.ENV_RENDER || 'render-env-sandbox.txt'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const [script, ...args] = process.argv.slice(2)
const r = spawnSync(process.execPath, [script, ...args], { cwd: join(aqui, '..', 'backend'), env, stdio: 'inherit' })
process.exit(r.status ?? 1)
