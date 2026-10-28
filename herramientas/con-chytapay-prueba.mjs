// Arranca el servidor contra el SANDBOX real de Chytapay con las credenciales de backend/chytapay-prueba.env
// (no se muestran). PUBLIC_URL tiene que ser la dirección https del túnel (ngrok) para la vuelta del OAuth y los avisos.
//   node herramientas/con-chytapay-prueba.mjs https://<tunel>.ngrok-free.dev
import { readFileSync } from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const aqui = dirname(fileURLToPath(import.meta.url))
const publica = (process.argv[2] || '').replace(/\/$/, '')
if (!/^https:\/\//.test(publica)) { console.log('Uso: node herramientas/con-chytapay-prueba.mjs https://<tunel>'); process.exit(1) }
const env = { ...process.env, CHYTAPAY_SIMULADO: 'false', CHYTAPAY_ENV: 'test', PUBLIC_URL: publica, PORT: process.env.PORT || '3030' }
for (const l of readFileSync(join(aqui, '..', 'backend', 'chytapay-prueba.env'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^(CHYTAPAY_[A-Z_]+)=(.*)$/)
  if (m && m[2].trim()) env[m[1]] = m[2].trim()
}
console.log(`Sandbox de Chytapay · ${publica} → puerto ${env.PORT} · cargadas: ${Object.keys(env).filter(k => k.startsWith('CHYTAPAY_') && env[k]).join(', ')}`)
const hijo = spawn(process.execPath, ['server.js'], { cwd: join(aqui, '..', 'backend'), env, stdio: 'inherit' })
hijo.on('exit', c => process.exit(c ?? 0))
