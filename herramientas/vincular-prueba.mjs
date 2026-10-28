// Conecta el comercio de PRUEBA del sandbox de Chytapay como si hubiera hecho el OAuth: guarda su refreshToken
// cifrado en la base (lo mismo que hace /chytapay/vuelta con una academia real). Lee los tokens de
// backend/chytapay-prueba.env (CHYTAPAY_ID_TOKEN_PRUEBA y CHYTAPAY_REFRESH_TOKEN_PRUEBA) sin mostrarlos.
//   node herramientas/vincular-prueba.mjs
import { readFileSync } from 'fs'

for (const l of readFileSync(new URL('../backend/chytapay-prueba.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^(CHYTAPAY_[A-Z_]+)=(.*)$/)
  if (m && m[2].trim()) process.env[m[1]] = m[2].trim()
}
process.env.CHYTAPAY_SIMULADO = 'false'
process.env.CHYTAPAY_ENV = 'test'
const { idToken, refreshToken } = { idToken: process.env.CHYTAPAY_ID_TOKEN_PRUEBA, refreshToken: process.env.CHYTAPAY_REFRESH_TOKEN_PRUEBA }
if (!idToken || !refreshToken) { console.log('Faltan CHYTAPAY_ID_TOKEN_PRUEBA y CHYTAPAY_REFRESH_TOKEN_PRUEBA en backend/chytapay-prueba.env'); process.exit(1) }

const { sequelize } = await import('../backend/models/index.js')
const { guardarVinculo } = await import('../backend/chytapay.js')
await sequelize.sync()
try {
  const v = await guardarVinculo({ idToken, refreshToken, expiresIn: 3600 })
  console.log(`✓ Comercio de prueba conectado: ${v.nombre || v.fantasia} (CUIT ${v.cuit}, ${v.email})`)
} catch (e) {
  console.log('✗ No se pudo conectar:', e.message)
  process.exitCode = 1
}
await sequelize.close()
