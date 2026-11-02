# Molde de galas: venta de entradas con Chytapay

Sistema base para las galas de fin de año (y cualquier evento de una sola fecha). Sale del sistema del
Festival del Agricultor (`C:\fernandez-sistema`): mismo QR firmado, mail, panel y puerta, con el cobro
cambiado a **Chytapay** (transferencia). Cada gala es una **copia** de esta carpeta con su ficha, su logo,
sus colores y su servicio en Render (José eligió tres sistemas separados, 28/10/2026).

## Qué hace
- **Página** (`/`): la arma sola con `evento.json`. El servidor pone nombre y descripción en el HTML
  para que la vista previa de WhatsApp salga bien.
- **Compra** (`/comprar`): tipos de entrada de `evento.json` (funciones o sectores), de 1 a 10 por compra.
  El comprador ve **un solo precio** (precio + `CARGO_PCT` 10 %). Paga con el **widget de Chytapay**:
  pone su DNI, recibe un CVU, transfiere (o toca "Abrir en Mercado Pago"). Concilia por el CUIL de quien
  transfiere: **tiene que pagar desde una cuenta a su nombre** (la compra lo avisa en grande).
- **Cupo por tipo**, con bloqueo en MySQL (`GET_LOCK('cupo_<DB_NAME>')`: varias galas pueden compartir el
  mismo servidor de Aiven). Una compra sin pagar guarda lugar `RESERVA_MINUTOS` (30); el cobro de Chytapay
  vence a la misma hora.
- **Emisión**: SOLO por el aviso firmado de Chytapay (`payment_request.payment_received` con
  `total_payment` y el monto completo) o por la consulta del cobro (`GET /payment-request/{orden}`), que
  hace la página de resultado y la repesca cada 2 minutos. Firma HMAC-SHA256 de `{t}.{cuerpo crudo}`,
  ±5 minutos de tolerancia, y se descartan los avisos repetidos.
- **Transferencias sin asignar** (`payment.unmatched`): pagó otra persona, pagó tarde o dos veces. Quedan en
  el panel; la academia las asigna desde su cuenta de Chytapay y ahí llega el aviso y se emite sola.
- **Comisión de José**: NO se calcula acá. Chytapay la transfiere en cada pago (Portal → Distribución).
  Con 10 % de cargo, la comisión va en **9,09 %** del total para que sea el 10 % del precio.
- **Puerta** (`/admin`, rol control): cámara; si hay más de un tipo, se elige cuál se controla.
  Cada QR entra una vez.
- **Panel**: admin (José) todo, incluida la conexión de Chytapay; organizador (la academia) resumen, ventas,
  puerta, planilla y transferencias sin asignar; venta (boletería) al mismo precio final; control (puerta).

## Archivos
- `backend/server.js` todo el servidor · `backend/chytapay.js` la integración · `backend/evento.json` la ficha.
- `backend/models/`: Orden, Entrada (usado/usadoEn), Usuario, Visita, Vinculo (la cuenta de Chytapay de la
  academia, con el refreshToken **cifrado** con AES-256-GCM), SinImputar.
- `frontend/`: `index.html` (portada), `comprar`, `admin`, `mis-entradas`, `pago-*`, `cabeza.js`
  (completa la cabecera con el evento), `sistema.css` (**los colores de cada gala van en sus variables**),
  `assets/logo.webp`, `assets/mail-logo.png`, `assets/compartir.jpg` (1200×630) y, si hay, `assets/portada.webp`.

## Probar en esta PC (sin Chytapay)
1. `backend/.env` usa el MySQL local (base `gala_molde`) y `CHYTAPAY_SIMULADO=true`: en vez del widget
   aparece "Simular que pagó". Nunca funciona en producción.
2. `cd backend && EVENTO_ARCHIVO=../herramientas/evento-prueba.json PORT=3031 node server.js`
3. `node herramientas/prueba-gala.mjs 3031` → **39 pruebas** (compra, avisos firmados falsos/viejos/repetidos,
   pago parcial, vencido, sin asignar, pago tardío, cupo, topes, puerta, boletería, roles, mis entradas).
   Borra la base `gala_molde` al empezar.
4. Usuarios locales: `node crear-usuarios.mjs admin:jose "organizador:academia:Academia Prueba" control:puerta1 venta:boleteria`.

## Armar una gala nueva
1. Copiar la carpeta (sin `node_modules`, `.env` ni `usuarios-panel*.txt`).
2. `backend/evento.json`: nombre, organiza, cuando, fecha (AAAA-MM-DD), lugar, dirección, puertas, menores,
   WhatsApp de ayuda y los tipos (id, nombre, corto, detalle, **precio para la academia**, **cupo**).
3. `frontend/assets/`: logo, logo del mail, imagen para compartir y foto de portada. Colores en `sistema.css`.
4. Base: una DATABASE nueva en el Aiven (no hace falta servicio nuevo). Si el Aiven es otro proyecto,
   reemplazar `backend/aiven-ca.crt` por el certificado de ese proyecto.
5. Render: servicio nuevo (Node, raíz `backend`, `npm ci`, `node server.js`). Variables:
   `NODE_ENV=production`, `PUBLIC_URL`, `DB_*`, `QR_SECRET` (largo), `EMAIL_USER`/`EMAIL_PASS`,
   `CHYTAPAY_ENV=prod`, `CHYTAPAY_CLIENT_ID`, `CHYTAPAY_CLIENT_SECRET`, `CHYTAPAY_PK` (pk_live),
   `CHYTAPAY_WEBHOOK_SECRET` (whsec_), `VENTA_ABIERTA`. **Las claves las carga José, nunca por chat.**
6. Usuarios del panel con `crear-usuarios.mjs` contra esa base.

## Chytapay: configuración (una integración para todas las galas)
- **Portal** (chytapay.com.ar/portal, José como admin de la integración):
  - Credenciales: clientId, clientSecret (se ve una vez), clave publicable `pk_test`/`pk_live`.
  - Configuración: **redirect_uri** = `<PUBLIC_URL>/chytapay/vuelta` y la **URL de webhook**.
    Hay UNA URL de webhook por integración. Los avisos de pago llegan igual a cada gala porque cada cobro
    se crea con su propio `webhookUrl` (`<PUBLIC_URL>/api/webhooks/chytapay`). Los `payment.unmatched` NO
    lo respetan: van a la URL de la integración (o a la de la sede de la academia, si se piden **sedes**).
    **A confirmar con Chytapay:** si se puede registrar más de una redirect_uri (una por gala).
  - Webhooks: activar `payment.unmatched` (viene apagado).
  - Distribución: comisión **9,09 %** e invitar a la cuenta **recaudadora** de José (no puede ser la del admin).
  - Pedir Producción en Credenciales cuando esté probado.
- **Conectar la academia**: Panel → Herramientas → "Generar enlace". La academia (con cuenta Chytapay
  ya validada) entra con su usuario, ve la comisión y autoriza. Vence en 15 min, un solo uso.
- IP de los avisos: `18.231.238.36` (si algún día hay Cloudflare con anti-bots, permitirla).
- Sandbox: el Portal da tokens de un comercio de prueba (`CHYTAPAY_ID_TOKEN_PRUEBA`, dura 1 h) y un
  simulador de pagos con el CVU del cobro.

## Temas: una web por gala con el mismo código (31/10/2026)
- Cada cliente es una carpeta `temas/<tema>/` y cada servicio de Render lleva su `TEMA` (y su `DB_NAME`).
  Ahí van `sitio.json` (la ficha), `tema.css` (colores y tipografía de compra/panel/mails) y `assets/`.
- **Portada propia:** si el tema trae `index.html`, esa es la portada (diseño exclusivo de la gala); si no, va
  la del molde. Usa las mismas marcas `%%NOMBRE%%`, `%%DESCRIPCION%%`, `%%URL%%` y pide los precios a
  `/api/config` (nunca escritos en el HTML). Compra, panel, puerta y mails siguen siendo los del molde.
- Temas hechos: `lo-de-oli` (cartelera de peñas) y `patin-fa` ("El Quinto Elemento", gala de Florencia).

## Precios: etapas, precio final y cierre de la venta online
- **Etapas** por tipo de entrada: `"etapas": [{ "hasta": "2026-11-30", "precio": 20000, "nombre": "Noviembre" }, …]`,
  en orden. Cada una rige hasta el final de su día "hasta" (hora argentina); después vale `precio`.
  El panel no las edita pero tampoco las borra (si un tipo vuelve sin `etapas`, conserva las que tenía).
- **`"precioIncluyeCargo": true`** en `sitio.json`: los precios son los que PAGA el público, con el 10 % adentro
  (la academia recibe total ÷ 1,10; el total de una compra es exacto: precio × cantidad). Sin eso, como
  siempre: el precio es de la academia y el cargo va encima. En los dos casos la Distribución es 9,09 %.
- **`"ventaHasta": "AAAA-MM-DD"`** en el evento: último día de venta online (incluido). Después la página
  muestra "venta online cerrada · en puerta $X" y la compra lo dice; la boletería del panel sigue vendiendo.
- `/api/config` manda por tipo `final` (lo de hoy), `etapas` (finales, con `vigente`/`paso`) y `finalDespues`.

## Chytapay: sedes (multitenant)
- Chytapay habilitó las **sedes** (Portal → Tenants) para la integración de José: una sede por gala, cada una
  con su `key` y su URL de avisos (`<PUBLIC_URL>/api/webhooks/chytapay`).
- En Render: **`CHYTAPAY_SEDE=<key de la sede>`**. Al conectar la cuenta de la academia, el sistema la asigna
  a esa sede (`PUT /my-integration/tenant`); si la sede se creó después, Panel → Herramientas → "volver a
  asignar". Así los `payment.unmatched` de cada academia llegan solo a su gala (y si llega uno con otra
  `tenantKey`, se ignora).
- **Dominios autorizados** del Portal: vacío, o TODAS las galas (si se carga una sola, el widget no anda en las demás).

## Panel del organizador (02/11/2026)
Todo se cobra por transferencia (Chytapay): el panel no desglosa por medio de pago.
- **Resumen:**
  - Cifras: entradas, compras, cobrado (lo que pagó el público) y "Para vos" (sin el servicio).
    Sin "neto estimado" después de Chytapay: José lo sacó el 02/11.
  - Compras pagando ahora y compras que no se pagaron.
  - Tablas **por etapa de precio** y **por día** (hora argentina), para cruzar con los movimientos de la cuenta de Chytapay.
  - Con cupo ≥ 100000 ("sin tope") no hay barra ni "libres".
  - La tabla de puntos de venta solo aparece si hubo ventas en puntos.
- **Operaciones** (`/api/admin/operaciones?estado=`): todas las compras de la fecha, con filtros y la cantidad de cada uno.
  - Filtros: pagadas, pagando ahora (dentro de la reserva), no pagaron, devueltas, cortesías y todas.
  - "Pagó desde" muestra quién transfirió, según Chytapay. La planilla CSV lleva el número de operación de Chytapay.
  - Una compra sin pagar muestra el mail para escribirle.
- El organizador puede **reenviar el QR** a otro mail.
- En modo `gala` no ve la pestaña Cartelera, y sin varias fechas no aparece el selector de fecha.

## Vista previa para el cliente (sin sistema)
- `node herramientas/vista-previa.mjs <tema> <url pública> <carpeta> [servidor local]` arma una copia estática de la
  portada propia del tema (con el servidor local andando, para copiar los precios de `/api/config`): marcas
  reemplazadas, `noindex`, cartel "VISTA PREVIA" y botones de compra que avisan que la venta abre pronto.
- La carpeta es un repo aparte publicado en GitHub Pages. Patín FA: `C:\patin-fa\gala-2026\publicar` →
  https://copidiaz17.github.io/el-quinto-elemento/ (actualizar = correr el script, commit y push).

## Pruebas
- `herramientas/prueba-etapas.mjs` (20 pruebas): etapas, precio final, ventaHasta, panel, boletería y sedes.
  `DB_NAME=gala_quinto node herramientas/prueba-etapas.mjs 3045 usuarios-panel-quinto.txt` con el servidor
  `TEMA=patin-fa DB_NAME=gala_quinto PORT=3045 CHYTAPAY_SEDE=patin-fa node server.js` (base LOCAL).
- ⚠️ `prueba-gala.mjs` (las 39) quedó de antes de la cartelera: usa `EVENTO_ARCHIVO` y compra sin `evento`.
  Hay que adaptarla.

## Pendiente
- Adaptar `prueba-gala.mjs` a la cartelera.
- Datos, logos y fotos de las otras galas del 13/12/2026.
