// Corre un script del backend contra la base de RENDER (Aiven), con las variables de
// render-env-sandbox.txt. No muestra ningún valor.
//   node herramientas/con-env-render.mjs crear-usuarios.mjs admin:jose control:puerta1
import { readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const aqui = dirname(fileURLToPath(import.meta.url))
const env = { ...process.env, USUARIOS_ARCHIVO: 'usuarios-panel-render.txt' }
for (const l of readFileSync(join(aqui, '..', 'render-env-sandbox.txt'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const [script, ...args] = process.argv.slice(2)
const r = spawnSync(process.execPath, [script, ...args], { cwd: join(aqui, '..', 'backend'), env, stdio: 'inherit' })
process.exit(r.status ?? 1)
