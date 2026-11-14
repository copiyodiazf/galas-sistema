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
- **Cupo por tipo (y butacas), una compra a la vez por función:** la fila del evento se traba con `SELECT … FOR UPDATE`
  y la traba dura hasta el commit (`conCupo(eventoId, …)`). Hasta el 13/11/2026 era `GET_LOCK` y se soltaba ANTES
  del commit: la prueba de carga (`herramientas/prueba-carga.mjs`) encontró 2 butacas vendidas dos veces con 300
  compras a la vez. Corregido: 0 repetidas. Cuando dos eligen la misma butaca, gana la primera y la otra recibe
  "ya no está libre" con el plano entero actualizado (`sala` en la respuesta 409) para elegir otra.
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

- **Enlace para conectar la cuenta del organizador** (Panel → Herramientas, solo admin): dura **72 h** y
  sobrevive a los deploys (el `state` va firmado con `QR_SECRET`, no en memoria; igual que canchas, 02/11/2026).
  Se manda por WhatsApp; antes duraba 15 minutos.

## Chytapay: sedes (multitenant)
- Chytapay habilitó las **sedes** (Portal → Tenants) para la integración de José: una sede por gala, cada una
  con su `key` y su URL de avisos (`<PUBLIC_URL>/api/webhooks/chytapay`).
- En Render: **`CHYTAPAY_SEDE=<key de la sede>`**. Al conectar la cuenta de la academia, el sistema la asigna
  a esa sede (`PUT /my-integration/tenant`); si la sede se creó después, Panel → Herramientas → "volver a
  asignar". Así los `payment.unmatched` de cada academia llegan solo a su gala (y si llega uno con otra
  `tenantKey`, se ignora).
- **Dominios autorizados** del Portal: vacío, o TODAS las galas (si se carga una sola, el widget no anda en las demás).

## Pantalla de pago: cuando no abre (09/11/2026)
Motivo: en El Quinto Elemento, 3 de 8 compradores no pudieron pagar. La pantalla de Chytapay se les quedaba
"pensando", y al reintentar los frenaba el tope de compras sin pagar. Vanesa, por ejemplo, intentó 3 veces.
- **El SDK lo servimos nosotros:** `frontend/vendor/chytapay-sdk-1.7.0.js` es una copia de npm
  `@chytapay/integration-widget`, `dist/sdk.iife.js`, con licencia MIT al lado. Ya no se pide a unpkg.
  - **Para actualizarlo:** `npm pack @chytapay/integration-widget@X`, copiar el archivo y cambiar `SDK` en `comprar.html`.
  - Antes de actualizar, leer su CHANGELOG: dice qué cambia en el SDK y qué en el iframe, que hostean ellos.
- **Retomar en lugar de frenar:** si vuelve la misma compra con el mismo DNI, mail, fecha, tipo y cantidad, y le
  quedan al menos 5 minutos al cobro, `/api/orders` devuelve EL MISMO cobro con `retomada: true`.
  - El tope `MAX_PENDIENTES` (2) solo frena compras distintas, y su mensaje explica cómo retomar.
- **Esperas:**
  - Si el SDK no carga en 15 s, la página avisa.
  - Si la pantalla de Chytapay no manda `chytapay:ready` en 25 s, se cierra. El comprador ve qué hacer:
    tocar «Ir a pagar» de nuevo (se retoma), probar Chrome o Safari, otra conexión o una computadora.
- **Navegador interno de Instagram, Facebook o TikTok:** la compra muestra un aviso para abrirla en el navegador.
- **Traza** (`ordenes.traza`, `POST /api/orders/:id/traza`): `comprar.html` anota, sin datos personales:
  - el navegador;
  - los pasos (compra creada o retomada, SDK cargado, mensajes `chytapay:*` de la pantalla);
  - cada pedido del SDK a `integration-api` con su estado y su demora;
  - cómo terminó (pagó, cerró, error o "no abrió").

  Así, cuando alguien no paga, se ve dónde se trabó. Se lee con un script contra la base de la gala (columna `traza`).
  - Desde el 10/11 lo que se repite seguido (la pantalla pregunta cada 5 s si llegó la plata) va resumido:
    la primera vez entera y después `↻ … ×12`. Anota también "salió de la página" / "volvió" (ir a la app del banco).
    Tope: 120 pasos por intento y ~12.000 letras por compra.

## Transferencias que llegan tarde (10/11/2026)
Motivo: Alan recibió el CVU a las 11:38 y la plata le llegó a Chytapay a las 12:12. El cobro vencía a los 30
minutos, así que quedó "sin asignar" (`expired`) y hubo que darle una cortesía a mano. Cuando el pago anda, se
acredita en 30-70 s, pero hay bancos que demoran la transferencia.
- **El cobro dura 60 minutos**, el máximo que acepta Chytapay para un checkout (3 a 60). `RESERVA_MINUTOS`
  ahora vale 60 por defecto: es también el lugar guardado, el tope de compras sin pagar y el "pagando ahora" del panel.
- **El mail de recupero** sale a `RESERVA_MINUTOS + 15` (75 min), nunca antes de que venza el cobro. Ya no dice
  "No se te cobró nada": dice "¿Ya transferiste? No lo hagas de nuevo… apenas se acredite te mandamos las entradas".
- **Se emite sola** (`emitirTardia`) si llega un `payment.unmatched` con `reason: expired` y:
  - `paymentRequest.referenceId` es una compra online nuestra sin pagar;
  - el CUIL de quien transfirió lleva adentro el DNI de la compra (dígitos 3 a 10);
  - el monto alcanza el total;
  - todavía hay lugar en ese tipo de entrada.

  Si falta algo, queda en "Transferencias sin asignar" para que decida la academia. La fila emitida queda marcada
  (`sin_imputar.emitida`) y el panel dice que las entradas ya salieron. Igual conviene que la academia la asigne en
  Chytapay, así se registra y se distribuye la comisión. Ese aviso no emite dos veces (la compra ya está pagada) y
  marca la fila como resuelta.
- **Aviso en la compra:** si Chytapay ya le dio el CVU (`POST /v1/payments/:id/payer` → 200) y cierra la pantalla
  o se le vence, ve "¿Ya hiciste la transferencia? No la hagas de nuevo…", con su mail y WhatsApp.

## Panel del organizador (02/11/2026)
- **Cortesías (03/11/2026):** el organizador también las emite (pestaña "Cortesías y planilla"). Pide confirmación,
  acepta un DNI opcional (para "Mis entradas") y el mail dice "Tu invitación… te invita" en vez de "tu compra".
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

## Butacas numeradas (11/11/2026, gala de Santiago Rítmica en el Paraninfo de la UNSE)
Una gala con `sala` en su `sitio.json` vende **butacas**: el público las elige en un plano y cada QR lleva la suya.
Sin `sala`, todo sigue por cantidad, como en las otras galas (sus 33 pruebas pasan igual).
- **El plano** (`sitio.json → sala`, lo lee `sitio.js`): cada fila con `asientos`, o con `bloques` si tiene huecos
  (`[9, { "hueco": "Cabina", "ancho": 8 }, 9]`). Los números corren de corrido por la fila, saltando los huecos.
  `asiento1`: de qué lado del plano (escenario arriba) está el asiento 1. Una fila con `zona` sale rotulada y con
  `tipo` pasa a ese tipo de entrada si el evento lo tiene (otro precio); si no, es del primer tipo del evento.
  El id de cada butaca es `fila-número` ("13-10").
- **Las cuentas** sin base van en `backend/butacas.js`; en `server.js`, `butacasTomadas` (pagadas, cortesías,
  boletería y compras a tiempo de pagarse) y `apartarButacas`, siempre con el bloqueo del cupo tomado.
  - Con sala, la capacidad de cada tipo son sus butacas (sin las guardadas): el cupo cargado no cuenta.
  - Una compra es de **un solo tipo**: butacas de zonas con distinto precio se compran por separado.
  - **Apartadas solo 10 minutos** (`RESERVA_BUTACAS_MINUTOS`, de 5 a 30; José, 11/11/2026: nada de butacas
    reservadas sin la plata acreditada). Con sala, `RESERVA_MINUTOS` pasa a ser ese valor: el cobro de Chytapay
    vence a la vez, el panel muestra "pagando" ese tiempo y retomar pide 3 minutos de margen. No se apartan cero
    minutos: dos personas pagarían la misma butaca y a una le tocaría otra que no eligió.
  - La misma persona (DNI y email) que vuelve a elegir **libera** sus compras sin pagar de esa fecha. Con las mismas
    butacas, retoma el mismo cobro.
  - El navegador guarda su compra sin pagar (`sessionStorage`) y el plano le muestra esas butacas como suyas
    (`/api/sala?orden=`): si cerró la pantalla de pago, puede volver a pagarlas.
  - **Pago que llega tarde** y sus butacas ya no están libres: se emite con las mejores que queden juntas
    (`elegirMejores`) y el mail lo explica. Si no queda ninguna de su zona, no se emite: queda en "Transferencias
    sin asignar" (`sin_butacas`) y la próxima repesca o aviso la emite si se libera una.
- **Panel → Sala** (admin, organizador y puerta): el plano con lo vendido, pagándose, cortesías y guardadas, quién
  está en cada butaca y si ya entró. La organización **guarda** butacas (no salen a la venta: familia, cámaras,
  invitados; `eventos.bloqueadas`) y da **cortesías** marcando butacas en el plano (pueden ser guardadas).
  La boletería vende tocando el plano y ve lo ocupado, no de quién. En la puerta, al escanear, sale la butaca en grande.
- **Varias funciones con la misma sala:** cada evento de la ficha tiene sus propias butacas (lo vendido, guardado
  y pagándose es de ese evento). En la puerta, una entrada de otra función del mismo día dice "Es para … de las
  21:00 h: no es esta función" (antes, "hoy no vale", que confundía si las funciones son el mismo día).
- **Prueba:** `herramientas/prueba-butacas.mjs` (71 pruebas) con el servidor
  `TEMA=santiago-ritmica DB_NAME=gala_ritmica PORT=3047 node server.js` y
  `DB_NAME=gala_ritmica node ../herramientas/prueba-butacas.mjs 3047` (desde `backend`, base LOCAL).
- **Santiago Rítmica** (tema `santiago-ritmica`): Paraninfo, Av. Belgrano (S) 1912. 337 butacas: filas 1 (22),
  2 (21), 3 a 12 (26), 13 (9 + cabina de musicalización + 9) y 14, zona verde, detrás de la cabina (8 + 8).
  José: "la numeración comienza mirando desde el escenario, de izquierda a derecha" → en el plano, el 1 a la
  derecha. Sin servicio en Render todavía.
  - **13/11/2026, datos de José:** domingo 13/12, tres funciones: **16 h "Divas del Pop"** (la muestra, evento
    `divas-del-pop`), **18 h y 21 h "El Origen de Ser · entre ángeles y demonios"** (`el-origen-de-ser-18` y `-21`).
    Platea (filas 1 a 13, 321 butacas) **$20.000** y zona verde (fila 14, 16) **$10.000**, **más el 10 % de
    servicio encima** (`precioIncluyeCargo: false`, `desgloseServicio: true`, `CARGO_PCT=10`). El servicio se
    muestra **en pesos, no en porcentaje** (José, 13/11): "$20.000 más $2.000 de servicio" en la portada y
    "+ $2.000 de servicio" en la compra (`SERV(t)` en `comprar.html`, por entrada: vale para toda página con
    `desgloseServicio`). En la compra, en el celular el precio va abajo del nombre de la función (antes la tarjeta
    se salía 22 px a 320).
    **Distribución de Chytapay: 8,12 %** (José, 13/11: a Rítmica le tienen que llegar los $20.000 LIMPIOS y la comisión
    de Chytapay, 0,8 % + IVA = 0,968 % del total, sale de la parte de José, como en El Quinto Elemento):
    d = (servicio − 0,968 % × total) / total = (2.000 − 212,96) / 22.000 = 8,12 % → José $1.786,40, la escuela $20.213,60
    − $212,96 = $20.000,64. Zona verde: José $893,20, la escuela $10.000. Cargarla ANTES de que Eugenia conecte su
    cuenta (cada comercio conserva la Distribución que había al conectarse).
    Verificado el 13/11 en chytapay.com.ar: cobros por integraciones 0,8 % + IVA (directo 1 % + IVA; con factura
    automática en ARCA 1,75 % + IVA, según llms.txt); la comisión de la integración se calcula "sobre el bruto" y la paga
    el comercio (Chytapay la pasa de su cuenta al recaudador en el momento). No dice si el 0,968 % va sobre el total o
    sobre lo que le queda al comercio: con 8,12 % la escuela recibe $20.000,64 o $20.017,93, nunca menos de $20.000.
    Si la cuenta de la escuela factura sola en ARCA: Distribución ≈ 6,97 %. Confirmar con una venta real de El Quinto
    Elemento ($24.000 → a José le tendrían que haber llegado $1.766,40).
    Los flyers están en `assets/flyer-*.webp`. Al de El Origen de Ser se le sacó la marca "CapCut AI" de arriba a
    la izquierda: se rellenó con el cielo de alrededor (OpenCV, inpaint).
  - **Segunda versión de la portada** (13/11/2026, pedido de José: "más contenido", logo más grande, el rosa de
    Rítmica, el mapa, WhatsApp e Instagram). La portada es **rosa Rítmica** (`#CE086D`, la tinta del logo): el logo
    grande en blanco (`assets/logo-blanco.webp`; `logo-rosa.webp` para el pie), **seis clips de las gimnastas teñidos
    de rosa** (`assets/video/clip-*.mp4`, 900 KB entre los seis, 432x768, ffmpeg con filtro `curves`): en la compu,
    tres recuadros que alternan dos clips cada uno; en el celular, uno solo que pasa por los seis (dos `<video>` por
    recuadro que se pasan la posta con un fundido). Botón de pausa; con "reducir movimiento" o "ahorro de datos" no
    se cargan (queda el cuadro `.webp`). Una cinta que se dibuja sola, la cuenta regresiva y el **WhatsApp de José**
    (`ayudaWhatsapp`, el mismo de El Quinto Elemento). Después: las funciones como **entradas de teatro**; los dos
    mundos; **Somos Santiago Rítmica** (datos y la **pasarela**: 30 fotos en dos filas que corren solas, se frenan
    con el mouse encima, con el botón o con el visor abierto, y se agrandan con anterior/siguiente); el plano; cómo
    se compra; **preguntas frecuentes**; **cómo llegar con el mapa de Google** y el pie. A pedido de José se sacaron la
    tarjeta de Eugenia (Premio Gaviota), "Orgullos de la escuela" y la sección de videos.
  - **Divas del Pop es la gala de las más pequeñas** (José, 13/11): así se llama el evento de las 16 h
    ("Divas del Pop · Gala de las más pequeñas") y así lo presenta la portada.
  - **Más movimiento en los flyers** (13/11): en Divas, candilejas del borde del escenario que se prenden en cadena,
    destellos en las lentejuelas, la corona y el corsé, y un reflejo que recorre el piso; en El Origen, las palomas
    vuelan, la pluma grande se mece, el demonio respira y bate las alas (copias del arte recortadas con máscaras
    suaves que se mueven unos píxeles), el fuego titila, la luz del centro respira y hay más plumas y brasas.
    Todo con transform/opacity, frenado fuera de pantalla, con la pausa y sin nada con "reducir movimiento".
  - **Divas animada con IA** (13/11, José pidió que la gimnasta y la pelota se muevan): Kling 2.5 Turbo Pro por fal.ai,
    imagen a video de 5 s (US$ 0,35; la cuenta de fal es de José, clave FAL_KEY en sus variables de Windows). La
    gimnasta mueve el brazo y lleva la pelota, el boa vuela. Loop con fundido entre el final y el principio:
    `assets/divas-ia.mp4` (457 KB, 720x728) y su cuadro `.webp`; el original en `C:\ritmica-gala\material\ia\`.
    Se pide al acercarse, corre solo visible, se frena con la pausa; con "reducir movimiento" o "ahorro de datos"
    queda el arte quieto. Sobre el video siguen las luces, los reflectores, el brillo y las candilejas.
    **Segunda versión** (José pidió más movimiento, otros US$ 0,35): lanza la pelota al aire, la sigue con los brazos
    arriba y la atrapa, la pasa de mano y se arquea. `assets/divas-ia-2.mp4`: cada versión va con OTRO nombre, porque el
    navegador guarda videos e imágenes un día y con el mismo nombre se seguía viendo el viejo. Loop de IDA Y VUELTA (adelante y en reversa, 10 s, 574 KB): las
    poses del principio y del final son distintas y un fundido mostraba dos gimnastas superpuestas. La primera versión
    quedó en `C:\ritmica-gala\material\ia\divas-ia-loop-v1.mp4`.
  - **El Origen de Ser animado con IA** (13/11, mismo método, otros US$ 0,35): vuelan las palomas, caen plumas, el
    demonio se mueve, arde el fuego y la mujer queda de espaldas. `assets/origen-ia.mp4` (442 KB, 820x716, loop con
    fundido de 1 s). Con el video andando se apagan las copias que movía el CSS (`.capa`); siguen el telón que se abre,
    el rayo, el corazón, el brillo del fuego y las partículas. Saldo de fal de José después de los dos: unos US$ 1,04.
  - **Material del Instagram** (@santiago.ritmica, público): bajado con **Instaloader** (sin sesión) a
    `C:\ritmica-gala\material\instagram\santiago.ritmica\` (fuera del repo; 454 publicaciones desde 2022). Lo elegido
    se pasó a `assets/instagram/` (fotos `-600`/`-1200.webp`) y los clips a `assets/video/`. No se usaron gimnastas que
    no son de la escuela (selección nacional, el video de stock de 2022).
  - Primera versión (misma fecha), diseñada con las skills de `.claude/skills` (ver abajo): cada mundo se
    enciende una vez al verse (Divas: las luces de los paneles y dos reflectores; El Origen: el rayo, el telón que se
    abre, el corazón, plumas y brasas); el plano de la sala con lo libre de cada función (lee `/api/sala`, la
    misma de la compra); cómo se compra y cómo llegar. El arte es el de los flyers recortado sin sus textos
    (`assets/arte-*.webp`); los títulos son texto. Fuentes propias en `assets/fuentes` (Cormorant y Jost, OFL).
    Partículas con **Sparticles 2.2.0** (`assets/vendor`, MPL-2.0: no modificar el archivo) cargada solo al llegar a
    un mundo, frenada fuera de pantalla, con botón de pausa, y nada con "reducir movimiento" o "ahorro de datos".
    `tema.css` pasa la compra, el panel y los mails a los mismos colores y letras.
- **Confeti al confirmarse la compra** (`festejo` en sitio.json: colores por id de evento y `"*"`): en
  `pago-exitoso` (`resultado.js`), una sola vez por compra, con **canvas-confetti 1.9.4** (`frontend/vendor`, ISC),
  que se carga recién ahí. Sin `festejo` (las otras galas) no cambia nada.
- **Skills de diseño del proyecto** (`.claude/skills/`, 13/11/2026): frontend-design (Anthropic), animation-performance
  y mobile-native (Emil Kowalski) y web-design-guidelines (Vercel, con las reglas fijadas en un archivo local). Se
  cargan solas en las sesiones de Claude Code abiertas en esta carpeta. Cuáles y por qué, y cuáles NO instalar
  (taste-skill, Impeccable como plugin: hooks y telemetría): `investigacion/skills-diseno-github.md`.

## Vista previa para el cliente (sin sistema)
- `node herramientas/vista-previa.mjs <tema> <url pública> <carpeta> [servidor local]` arma una copia estática de la
  portada propia del tema (con el servidor local andando, para copiar los precios de `/api/config`): marcas
  reemplazadas, `noindex`, cartel "VISTA PREVIA" y botones de compra que avisan que la venta abre pronto.
- La carpeta es un repo aparte publicado en GitHub Pages. Patín FA: `C:\patin-fa\gala-2026\publicar` →
  https://copidiaz17.github.io/el-quinto-elemento/ (actualizar = correr el script, commit y push).
- Santiago Rítmica (13/11/2026, para mostrarle a Eugenia): `C:\ritmica-gala\vista-previa` (repo
  copiyodiazf/gala-santiago-ritmica: se creó en copidiaz17 y se transfirió a copiyodiazf, a pedido de José) →
  https://copiyodiazf.github.io/gala-santiago-ritmica/ . Se arma con el servidor local
  de Rítmica andando (`... vista-previa.mjs santiago-ritmica https://copiyodiazf.github.io/gala-santiago-ritmica
  C:/ritmica-gala/vista-previa http://localhost:3047`). En la copia, cualquier enlace a una página del sistema
  (/comprar, /mis-entradas) abre el aviso "Vista previa" y el plano se ve todo libre.

## Pruebas
- `herramientas/prueba-carga.mjs` (13/11/2026): la apertura de una venta con butacas, con cientos de familias a la vez
  (`DB_NAME=gala_ritmica node ../herramientas/prueba-carga.mjs 3047 <familias> <por IP compartida> <variedad>`).
  Resultado con el arreglo: 300 familias, 296 de 321 butacas vendidas en 26 s, 0 repetidas, mediana 23 ms, peor 1,2 s.
  Con 40 familias detrás de una misma IP (datos móviles) los límites por conexión frenan a la mitad: se suben con
  `MAX_COMPRAS_IP_MINUTO` (30), `MAX_PENDIENTES_IP` (8) y `MAX_SALA_IP_MINUTO` (120).
- `herramientas/prueba-etapas.mjs` (33 pruebas): etapas, precio final, ventaHasta, panel, boletería, retomar la
  compra, traza, sedes y transferencias tardías.
  `DB_NAME=gala_quinto node herramientas/prueba-etapas.mjs 3045 usuarios-panel-quinto.txt` con el servidor
  `TEMA=patin-fa DB_NAME=gala_quinto PORT=3045 CHYTAPAY_SEDE=patin-fa node server.js` (base LOCAL).
- ⚠️ `prueba-gala.mjs` (las 39) quedó de antes de la cartelera: usa `EVENTO_ARCHIVO` y compra sin `evento`.
  Hay que adaptarla.

## Cuenta de eventos en Render: se despliega desde una COPIA PÚBLICA (03/11/2026)
- El repo privado pasó a **github.com/copiyodiazf/galas-sistema** (copidiaz17 tiene push). La cuenta 2 de Render
  (la de los eventos) no pudo conectarse a GitHub: Render vincula cada usuario de GitHub a una sola cuenta.
- Render toma **github.com/copiyodiazf/galas-web** (PÚBLICO, "Public Git Repository"; copidiaz17 sube como colaborador): solo backend, frontend y
  temas, sin historia, sin este archivo ni herramientas, y sin las notas `_ayuda` de cada sitio.json.
- **Para publicar un cambio:** commit acá → `node herramientas/publicar-deploy.mjs` → Manual Deploy en Render.
  NUNCA editar galas-web a mano (se pisa entera en cada publicación).

## En producción (repo privado github.com/copiyodiazf/galas-sistema, rama main)
Un servicio de Render por gala, todos del mismo código (en la cuenta de eventos, desde galas-web): Root Directory `backend`, build `npm ci`, start
`node server.js`, región **Singapore** (la del Aiven de Rítmica), Auto-Deploy **apagado** (Manual Deploy).
- **El Quinto Elemento** (tema `patin-fa`): servicio `el-quinto-elemento` → https://el-quinto-elemento.onrender.com
  - Base `gala_quinto_elemento` en el Aiven de Rítmica (02/11/2026).
  - Variables en `render-env-quinto.txt` (git lo ignora): Chytapay de PRODUCCIÓN, `CHYTAPAY_SEDE=patin-fa`,
    `VENTA_ABIERTA=false` hasta que Flor conecte su cuenta.
  - **Comisión de José: 7,36 % del precio final** (no 9,09 %): Distribución de Chytapay 7.36 y
    `CARGO_PCT=CARGO_PUNTO_PCT=7.9447` (= 7,36 / 92,64 × 100, porque `CARGO_PCT` es el recargo SOBRE la parte
    del organizador). Diciembre $24.000 → José $1.766, Flor $22.234 − 0,968 % de Chytapay ≈ $22.000 limpios.
    Para otra gala: `CARGO_PCT = 100 × d / (100 − d)` con `d` = el % de la Distribución.
  - Usuarios (jose admin, florencia organizador, puerta1 y puerta2 control) en `backend/usuarios-panel-render-quinto.txt`.
  - Scripts contra esa base: `ENV_RENDER=render-env-quinto.txt USUARIOS_ARCHIVO=usuarios-panel-render-quinto.txt node herramientas/con-env-render.mjs <script>`.

## Pendiente
- Santiago Rítmica: que José confirme la numeración (el 1 a la derecha mirando al escenario), que la muestra sea
  al mismo precio que las funciones, la hora de apertura de puertas, pasillos si hay, butacas a guardar y los textos
  de la portada ("La muestra de la tarde, con la música de las grandes divas del pop" es una suposición). Probar la
  portada en un celular de verdad (gama media). Después: base, servicio en Render, usuarios y la cuenta de Chytapay
  de la escuela.
- Adaptar `prueba-gala.mjs` a la cartelera.
- Datos, logos y fotos de las otras galas del 13/12/2026.
