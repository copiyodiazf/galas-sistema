# Skills de diseño y efectos de GitHub para rediseñar la página de la gala

Investigación del 13/11/2026, antes de rediseñar la venta de entradas de la gala de Santiago Rítmica (Paraninfo de la UNSE, domingo 13/12/2026; funciones de las 16 h "Divas del Pop" y de las 18 y 21 h "El Origen de Ser").

**Cómo se hizo:**
- Todo en modo lectura: no se instaló, clonó ni ejecutó nada de esos repos.
- Se leyeron los `SKILL.md` y los scripts de cada skill con `gh api`, no solo los README.
- Estrellas y fechas: API de GitHub del 13/11/2026.
- Pesos: los archivos de distribución se bajaron de jsDelivr y se midieron con `gzip -9`. Lo que viaja con brotli pesa un poco menos.
- No repite lo que ya cubre `C:\fernandez-festival\investigacion\tendencias-web-2026.md` (CSS moderno, GSAP/Motion/Lenis, three.js, WebGPU, rendimiento y accesibilidad). Las referencias a esa investigación dicen "invest. anterior §N".

---

## 1. Lo esencial en 10 renglones

1. Lo de los reels existe. Son **Agent Skills**: una carpeta con un `SKILL.md` (texto) y, a veces, scripts. Claude Code la carga sola cuando el pedido coincide con su descripción. Las más compartidas en 2026 son frontend-design (Anthropic), taste-skill, Impeccable, UI/UX Pro Max y web-design-guidelines (Vercel).
2. Ninguna "diseña sola". Lo que cambia el resultado es que **obligan a planificar** (paleta, tipografía, un solo momento de movimiento) **y a revisar** (capturas, accesibilidad). Las estrellas (100.000 o más en pocos meses) miden viralidad, no calidad para este caso.
3. La oficial, **frontend-design**, es texto puro: Apache-2.0, 1.134.112 instalaciones y revisada por Anthropic. Ya está en el catálogo oficial guardado en esta PC, pero no está instalada.
4. Casi todas las virales están pensadas para sitios de empresa o apps en React y Tailwind. Para HTML plano y celulares de gama baja sirven pocas.
5. **Riesgos encontrados:**
   - **taste-skill**: deja un hook que corre Node y Chrome headless (hasta 600 s) cada vez que Claude termina. Además ordena reemplazar los contactos reales por `.example`.
   - **Impeccable**: instala hooks para todas las sesiones y proyectos, baja un binario y manda telemetría por defecto.
   - **web-design-guidelines**: baja sus instrucciones de internet en cada uso.
6. **Recomendación:**
   - frontend-design;
   - dos skills de Emil Kowalski: `animation-performance` y `mobile-native`;
   - web-design-guidelines, con sus reglas fijadas en un archivo local;
   - Impeccable, solo como opcional: copiada a mano, sin hooks y sin telemetría.
7. **Efectos:**
   - Casi todo sale con CSS (0 KB): reflectores, dorado con brillo, cortina, piso espejado y corazón que late.
   - Para las partículas (glitter, plumas y brasas) alcanza una sola librería: **Sparticles**, 5,3 KB gzip.
8. Para la compra confirmada: **canvas-confetti**, 4,5 KB, que respeta "reducir movimiento".
9. **No usar:**
   - Vanta/three.js: 150 KB o más.
   - react-bits: es de React y su licencia tiene Commons Clause.
   - pokemon-cards-css: GPL-3.0.
   - shadergradient: no declara licencia.
   - tsParticles slim: 47 KB para lo que Sparticles hace con 5.
10. En esta PC **no hay ninguna skill de diseño instalada** (ver §2.4).

---

## 2. Skills de diseño en GitHub

### 2.1 Las que vale la pena mirar

**Datos de cada repo** (13/11/2026)

| Skill (repo) | Estrellas | Último commit | Licencia |
|---|---|---|---|
| **frontend-design** (`anthropics/claude-plugins-official` y `anthropics/skills`) · Anthropic | 47.068 / 193.752 | 26/10/2026 (plugin v1.1.1) | Apache-2.0 |
| **UI/UX Pro Max** (`nextlevelbuilder/ui-ux-pro-max-skill`) | 148.732 | 10/11/2026 (v2.15.0) | MIT |
| **taste-skill** (`Leonxlnx/taste-skill`, instala `design-taste-frontend`) | 114.405, en un repo creado el 19/02/2026 | 07/11/2026 (v2.5.1) | MIT |
| **Impeccable** (`pbakaus/impeccable`) | 109.078 | 10/11/2026 (v4.8.2) | Apache-2.0 |
| **web-design-guidelines** (`vercel-labs/agent-skills`) | 33.968 | skill: 16/01/2026; reglas (`web-interface-guidelines`, MIT): 05/10/2026 | el repo no declara licencia |
| **Skills de Emil Kowalski** (`emilkowalski/skills`) | 56.460 | 12/11/2026 | MIT |
| **GSAP oficial** (`greensock/gsap-skills`) | 18.368 | 21/04/2026 | MIT |
| **ui-skills** (`ibelick/ui-skills`) | 11.009 | 12/11/2026 | MIT |

**Qué trae cada una de verdad y si sirve para HTML plano**

| Skill | Qué trae de verdad (leído) | ¿Sirve en HTML plano? |
|---|---|---|
| **frontend-design** | Un solo `SKILL.md` de 72 líneas (los dos repos tienen el mismo texto, comparado). Pide trabajar en dos pasadas: un plan (4–6 colores en hex, tipografías, layout con wireframe ASCII, principios) que se revisa antes de escribir código. Trae una lista de los "tics" de las páginas hechas por IA: fondo crema con acento terracota, eyebrows en mayúsculas, tarjetas iguales, "→" en los botones. Pide **un solo momento de movimiento** orquestado y un piso de calidad: responsive, foco visible, reducir movimiento. Suma pautas para los textos. No ejecuta nada. | **Sí**: no depende de ningún stack. |
| **UI/UX Pro Max** | Un `SKILL.md`, una base en CSV y un buscador en Python (`search.py --design-system`) que arma un "sistema de diseño" y lo puede guardar en `design-system/<proyecto>/MASTER.md`. La base tiene 80 estilos, 192 paletas, 74 pares de fuentes, 120 pautas de UX, 17 presets de GSAP y el catálogo de Google Fonts (747 KB). El plugin instala **7 skills**: además de esta, `banner-design`, `brand`, `design` (logos e íconos con IA), `design-system`, `slides` y `ui-styling` (Tailwind/shadcn). | **Parcial**: el único stack web sin framework es `html-tailwind`. |
| **taste-skill** | Un `SKILL.md` de 31 KB y **1.631 archivos**. El kit tiene starter, héroes, "moments", 25 efectos de shader WebGL, objetos 3D, íconos de marcas y fotos. Trae 10 scripts de Node: el verificador en Chrome headless, `photos.mjs` (busca fotos en Wikimedia Commons) e `icons.mjs` (baja íconos de jsDelivr). Un "gate" no deja terminar hasta que todo pase. Su meta: "sitios de empresa al nivel de figma.com y x.ai". | **Sí** (arranca de `starter.html`), pero pensada para empresas. |
| **Impeccable** | Una skill con 24 comandos (`critique`, `audit`, `polish`, `animate`, `quieter`, `bolder`…), 45 referencias en Markdown y 4 subagentes. Incluye un detector de "slop" que es un binario en Rust. Se acomoda al tipo de página ("Persuade" para una página de venta). | **Sí**. |
| **web-design-guidelines** | Un `SKILL.md` de 40 líneas que manda **bajar de GitHub** `command.md`: 191 líneas de reglas sobre accesibilidad, foco, formularios, animación, tipografía, imágenes y rendimiento. Con eso revisa los archivos y devuelve `archivo:línea`. Solo revisa: no diseña. | **Sí**: pocas reglas son de React. |
| **Emil Kowalski** | 19 skills, todas de texto y sin scripts. Las útiles acá: `animation-performance` (transform/opacity, blur caro, 120 Hz, "probar en un celular de gama media") y `mobile-native` (hover que queda pegado, el destello al tocar, el bug de 100vh, inputs que hacen zoom, zonas seguras). También `animate` (cuándo NO animar, curvas y duraciones) y `review-animations`. | **Sí**: las menciones a React/Motion son opcionales. |
| **GSAP oficial** | 8 skills de texto: core, timeline, scrolltrigger, plugins, performance, react, frameworks y utils. | Sí, pero GSAP no hace falta acá (invest. anterior §3). |
| **ui-skills** | `baseline-ui` (obliga Tailwind, `motion/react` y Radix), `fixing-accessibility`, `fixing-motion-performance` (no depende del stack y es buena) y `fixing-metadata`. | **Parcial**. |

**Cómo se instala cada una y qué riesgos tiene**

| Skill | Cómo se instala | Riesgos y rarezas (una skill es texto que el modelo obedece) |
|---|---|---|
| **frontend-design** | `/plugin install frontend-design@claude-plugins-official` (el catálogo ya está en la PC), o copiar el `SKILL.md` a una carpeta de skills. | Ninguno. Es la única revisada por Anthropic en su directorio. Va a querer "confirmar con el cliente" el tema y el público. |
| **UI/UX Pro Max** | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` y después `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`. Otra opción: copiar solo `.claude/skills/ui-ux-pro-max/`. Necesita Python 3 (la PC tiene 3.13). | El buscador **no usa la red**: revisados `core.py`, `search.py` y `design_system.py`, sin imports de red. Pero la skill `design` del mismo plugin pide `GEMINI_API_KEY`/`MUAPI_API_KEY` y `pip install google-genai`, y `fetch-background.py` baja fotos de Pexels. Con `--motion` empuja a GSAP. |
| **taste-skill** | `/plugin marketplace add Leonxlnx/taste-skill` y después `/plugin install taste-skill@taste-skill`. Necesita Node 22 o más y Chrome. | **Hook `Stop` en el frontmatter**: corre `node gate.mjs --hook claude` con un tope de 600 s. Según la doc de Claude Code, los hooks de una skill quedan activos **el resto de la sesión**. **Reglas que chocan con una página real:**<br>• "contactos en `.example`" y "ningún teléfono en formato real": rompe el WhatsApp de ayuda;<br>• "sin número de calle";<br>• "efectos solo en sitios de tecnología": para un evento, solo fotos y tipografía;<br>• "nada de tilt";<br>• "una sección por pantalla a 1440×900".<br>Su descripción es amplia (cualquier "rediseño", también en Vue), así que se puede disparar en otro proyecto. Crea `.taste-skill/` en el proyecto. |
| **Impeccable** | `/plugin marketplace add pbakaus/impeccable` y después instalarla desde `/plugin`. Otra opción: `npx impeccable install`. Una copia a mano queda **sin hooks**. | **El plugin registra hooks** en el inicio de sesión, en **cada Edit/Write** y al terminar. Valen para todas las sesiones, también las de costos-mdf. La primera vez baja un binario de GitHub Releases (verifica sha256) a `~/.impeccable/bin/`. **Telemetría prendida por defecto**: registra qué dirección visual mostró y cuál se eligió, y pide un catálogo a impeccable.style. Se apaga con `DO_NOT_TRACK=1`. Su README avisa que los hooks corren aunque se nieguen los comandos del modelo. Desaconseja el "texto con degradé" salvo que el brief lo pida: el dorado del flyer hay que decirlo en el brief. |
| **web-design-guidelines** | `npx skills add vercel-labs/agent-skills`, que instala 9 skills, casi todas de React o Vercel. Mejor copiar la carpeta. | **Baja instrucciones de internet en cada uso y las obedece**: si alguien cambia ese archivo, cambia lo que hace Claude. Solución: fijarlas en una copia local (§4.1). |
| **Emil Kowalski** | `npx skills@latest add emilkowalski/skills` (instala las 19) o copiar solo las carpetas que sirven. | Ninguno técnico. Si se la invoca sin una pregunta concreta, contesta una frase fija que promociona al autor. |
| **GSAP oficial** | `/plugin marketplace add greensock/gsap-skills` o copiar las carpetas. | **Sesgo comercial**: le dice al modelo que, si se pide animación sin nombrar una librería, recomiende GSAP. |
| **ui-skills** | `npx skills add ibelick/ui-skills` o copiar. | `baseline-ui` mete Tailwind y React donde no los hay. |

### 2.2 Las que circulan pero no aplican

| Repo | Estrellas · último commit · licencia | Qué es en realidad | Por qué no |
|---|---|---|---|
| `anthropics/skills`: **canvas-design**, **theme-factory**, **web-artifacts-builder** | 193.752 · 20/04/2026 · Apache-2.0 por skill | canvas-design hace pósters en PNG/PDF con 54 archivos de fuentes TTF incluidos. theme-factory trae 10 temas genéricos de color y fuente pensados para diapositivas: muestra un PDF y espera a que se elija. web-artifacts-builder tiene scripts bash que arman un proyecto React 18 + Vite + Tailwind + shadcn (con `npm install`) y lo empaquetan en un HTML. | No son para una web en HTML plano. web-artifacts **ejecuta scripts e instala paquetes**. |
| `VoltAgent/awesome-design-md` | 127.279 · 28/10/2026 · MIT | No es una skill: son 84 `DESIGN.md` con el estilo de marcas (Apple, Nike, Ferrari, PlayStation, Spotify…). Los detalles se mudaron a getdesign.md. | Copiar la identidad de una marca real no aporta a una gala y se parece a imitarla. |
| `superdesigndev/superdesign-skill` (y la extensión `superdesign`, AGPL con partes comerciales, sin mantenimiento) | 991 · 21/08/2026 · MIT | Maneja un servicio en la nube por consola: `npx --yes @superdesign/cli@latest`, **sin versión fija**. Sube contexto del proyecto a superdesign.dev, con cuenta y modelos pagos. | Manda el proyecto afuera y su consola se actualiza sola. Tiene la revisión "partner" en el directorio de Anthropic. |
| `21st-dev/magic-mcp` (21st MCP) | 6.478 · 09/09/2026 · ISC | Un MCP que busca y genera componentes React/Tailwind. Pide una API key de 21st.dev (las claves viejas se resetearon). Recuperar código es pago. | Solo React, con clave y sin revisión en el directorio. |
| `alchaincyf/huashu-design` | 29.369 · 10/11/2026 · MIT desde el 14/05/2026 (antes, uso comercial con permiso) | Está en chino: prototipos, PPTX, video e infografías, con scripts de voz y revisión en la nube. | Es otro objetivo y trae dependencias en la nube. |
| `meta/astryx` | 26.729 · 13/11/2026 · MIT | Sistema de diseño de Meta (React + StyleX). | Es de React. |
| `Dammyjay93/interface-design` | 5.966 · 20/06/2026 · MIT | Una skill para apps y dashboards. | Es otro objetivo. |
| `Leonxlnx/taste-skill-classics` (la "taste-skill v1" de los reels de comienzos de año) | 40 · 19/10/2026 · MIT | Solo texto. Por defecto usa React/Next, Tailwind y `@phosphor-icons/react`. | Pensada para React. |
| `nexu-io/open-design` | 107.401 · Apache-2.0 | Una aplicación de diseño ("workspace") que redistribuye otras skills. | No es una skill. |

**Listas "awesome"**

Sirven para descubrir, no para elegir:
- `ComposioHQ/awesome-claude-skills` (79.364, último cambio el 18/09/2026): casi nada de diseño web y mucha promoción de Composio.
- `travisvn/awesome-claude-skills` (15.797): sin cambios desde el 28/04/2026.
- `hesreallyhim/awesome-claude-code` (57.886): al día.

### 2.3 Qué se comparte en reels, y qué es hype

**Lo que circula**
- No se pudo buscar dentro de Instagram ni de TikTok: **qué reel vio José no está confirmado**.
- La lista que más se repite sale de un artículo viral de X (@nett0eth, 13/07/2026, en portugués) que nombra cinco: frontend-design, Impeccable, UI/UX Pro Max, Web Design Guidelines y Astryx.
- Las guías "las 18/20 mejores skills" (pasqualepillitteri.it, bitdoze, skillselion) suman taste-skill y huashu-design.

**Las cifras no son confiables**
- Las guías no coinciden entre sí. A taste-skill le dan 37.400, 59.400 o 83.300 estrellas según la guía; GitHub hoy dice 114.405.
- taste-skill e Impeccable pasaron las 100.000 estrellas en menos de un año.

**Lo que cambia el resultado** (lo que hacen las buenas skills):
- un plan corto antes del código;
- prohibir los tics genéricos;
- **un** momento de movimiento, no efectos sueltos;
- revisar con capturas al ancho de un celular;
- que el brief tenga el material real: los dos flyers, el público, el presupuesto de peso y "sin build".

**Lo que es hype**
- "Con esta skill Claude diseña como Apple."
- Bases de datos de "161 paletas" para un evento que ya tiene sus colores en el flyer.
- Componentes de React para un sitio que no usa React.

### 2.4 En esta PC (solo lectura)

**`C:\Users\Usuario\.claude\skills\`**
- `synced\…` tiene las skills sincronizadas de claude.ai: built-in-browser, chrome-browser, computer-use, deep-research, docs, docx, google-workspace, import-memory, morning, pdf, pptx, skill-creator y xlsx.
- `.trash\` no tiene skills propias.
- **Ninguna es de diseño web.**

**`C:\Users\Usuario\.claude\plugins\`**
- Solo hay un catálogo registrado: `claude-plugins-official` (anthropics/claude-plugins-official, actualizado el 12/11/2026).
- En ese catálogo están `frontend-design` y `playground`, disponibles pero **no instalados**.
- No hay `installed_plugins.json` y `settings.json` no tiene `enabledPlugins`.
- `plugin-directory-cache-v2.json` es el directorio de Anthropic (3.691 entradas), con su estado de revisión:
  - frontend-design: revisada por Anthropic;
  - Superdesign: revisada por un "partner";
  - 21st: sin revisión;
  - taste-skill, Impeccable, UI/UX Pro Max, GSAP y Emil Kowalski: no figuran.

**`C:\galas-sistema\`**
- No tiene `.claude\` (ni skills de proyecto).

Node 24.19 y Python 3.13 están instalados.

---

## 3. Repos de efectos sin build

**Criterios**
- Que se pueda cargar con `<script>` o copiar al repo.
- Que la licencia permita uso comercial. galas-sistema es un **molde** que se copia para cada gala (lo-de-oli, patin-fa, santiago-ritmica), así que conviene MIT, ISC, Apache o Unlicense.
- Pesos medidos con gzip -9.

### 3.1 Librerías JS

**Partículas, confeti y fuegos artificiales**

| Para qué | Librería (repo) | Licencia | Peso gzip | Celulares | Último release | Demo |
|---|---|---|---|---|---|---|
| **Glitter, plumas (con imagen), brasas hacia arriba** | **Sparticles** 2.2.0 (`simeydotme/sparticles`, 290 estrellas) | MPL-2.0: usar el archivo sin tocarlo es libre, también comercial; si se modifica ese archivo, hay que publicar esos cambios | **5,3 KB** | Hecha para gama baja (el autor pide 100 partículas o menos en celular). Trae `start()`/`stop()`, `shape: star/diamond/image`, `imageUrl`, `drift`, `twinkle` y `glow`. **No** trae reducción de movimiento ni pausa fuera de pantalla: hay que sumarlas (unas líneas con IntersectionObserver) | 25/04/2026 | sparticlesjs.dev |
| Partículas con presets (fuego, nieve, estrellas) | **tsParticles** 4.5.4 (`tsparticles/tsparticles`, 9.087) | MIT | slim 46,8 KB · basic 29,7 KB · cada preset (fire, snow, stars) con su motor: 27–30 KB | `pauseOnOutsideViewport`, `fpsLimit` y `detectRetina`, confirmados en el código. Que respete "reducir movimiento" en la v4: no confirmado | 11/11/2026 | particles.js.org |
| Confeti al confirmar la compra | **canvas-confetti** 1.9.4 (`catdad/canvas-confetti`, 12.859) | ISC | **4,5 KB** | `disableForReducedMotion`, confirmado en el código | 25/10/2025 | catdad.github.io/canvas-confetti |
| Fuegos artificiales | fireworks-js 2.10.8 | MIT | 3,7 KB | Canvas 2D | 13/07/2024 | fireworks.js.org |
| Chispas o confeti que salen de un botón | party-js 3.0.0 | MIT | 10,7 KB | Menciona "reduced" en el código | 04/11/2026 | party.js.org |
| Copos de nieve (no plumas) | magic-snowflakes 7.1.0 (`hcodes/snowflakes`) | MIT | 3,9 KB la versión "light" · 10,2 KB la completa | CSS | 12/09/2026 | hcodes.github.io/snowflakes |

**Shaders, 3D y hover 3D**

| Para qué | Librería (repo) | Licencia | Peso gzip | Celulares | Último release | Demo |
|---|---|---|---|---|---|---|
| Haces de luz en WebGL ("god rays"), metal líquido plateado | **Paper Shaders** 0.0.82 (`paper-design/shaders`, 3.964) | Apache-2.0 | Paquete entero: 64,5 KB. **Solo `god-rays` más el montaje: unos 7 KB** (1,8 + 5,2). `liquid-metal` más el montaje: unos 11 KB | Un shader a pantalla completa cuesta en cada píxel de cada cuadro (invest. anterior §4.3). Es una versión 0.0.x: fijar el número de versión | 21/10/2026 | shaders.paper.design |
| WebGL mínimo para un shader propio | OGL 1.0.11 (`oframe/ogl`) | Unlicense | 39,4 KB la librería entera | Bien con un shader simple | 27/01/2025 | oframe.github.io/ogl/examples |
| Fondos 3D animados (nubes, niebla) | Vanta 0.5.24 (`tengbao/vanta`) | MIT | 4–5 KB el efecto **más three r134: 151,5 KB** | Pesado. Sin release desde 09/2022 | 16/09/2022 | vantajs.com |
| Inclinación 3D al pasar el mouse | vanilla-tilt 1.8.1 | MIT | 2,5 KB | Tiene `glare` y `gyroscope`. Que el giroscopio pida permiso en iOS: no confirmado | 15/08/2023 | micku7zu.github.io/vanilla-tilt.js |
| Parallax 3D al pasar el mouse o tocar | Atropos 2.0.2 | MIT | 2,6 KB + 0,7 KB de CSS | Pensado para pantallas táctiles | 04/07/2023 | atroposjs.com |

### 3.2 Colecciones y demos

| Repo | Licencia | Qué sirve | Ojo |
|---|---|---|---|
| **Uiverse** (`uiverse-io/galaxy`, 14.994) | MIT; pide atribución pero no la exige | Botones, loaders y tarjetas en HTML y CSS sueltos | La calidad y el costo varían: muchos animan `blur`, `box-shadow` o filtros |
| **Codrops** (`codrops/*`, demos en tympanus.net) | Desde 2024, MIT. Las anteriores tienen la "licencia Codrops": se pueden usar en proyectos comerciales, pero no redistribuir tal cual | **SeamTransitions** (MIT, 30/10/2026): 11 transiciones entre el héroe y la página. **ReflectionScroll** (MIT, 2024): página reflejada. **SeatPreview** (licencia Codrops, CSS 3D): la vista desde la butaca. **CinemaSeatPreview** (MIT, 15/10/2026): un cine 3D | Las nuevas dependen de GSAP + ScrollTrigger (+ ScrollSmoother o Lenis): unos 120–140 KB sin comprimir. CinemaSeatPreview trae **3,7 MB sin comprimir** de three.js WebGPU. Los repos traen ahora un `AGENTS.md` con notas para agentes: leído, inofensivo |
| `gl-transitions/gl-transitions` (2.247) | MIT | Transiciones GLSL entre dos imágenes (sirve para cielo ↔ infierno) | Necesita un motor WebGL alrededor |
| `DavidHDev/react-bits` (51.831): Light Rays, Shiny Text, Glare Hover… | **MIT + Commons Clause**: prohíbe redistribuir los componentes "solos, en un paquete o como versión portada" | Ideas visuales | Solo React, Vue o Svelte; **no hay versión sin framework**. Llevarlo a un molde que se copia para cada gala es zona gris |
| `simeydotme/pokemon-cards-css` (8.372): brillo holográfico de cartas | **GPL-3.0** | El efecto holográfico para las entradas | La GPL obliga a abrir el código de la página: no usar |
| `ruucm/shadergradient` (3.152) | **No declara licencia** | Degradés 3D | Necesita React y three; sin licencia, no se puede usar |
| `VincentGarreau/particles.js` (30.185) | MIT | — | Abandonado: el último release es de 2015 |

### 3.3 Lo que no necesita librería (0 KB, CSS)

**Ya se pueden usar en todos los navegadores**
- **Haces de reflector**: 2 o 3 pseudo-elementos con `linear-gradient` que giran o barren con `transform` y `opacity`. Sin `filter: blur` animado.
- **Texto dorado con brillo que recorre**: `background-clip: text` con un degradé dorado que se desplaza. Una o dos pasadas, no en bucle.
- **Cortina que se abre**: dos mitades con `translate`/`scale`.
- **Corazón luminoso**: `radial-gradient` con `opacity` o `scale`.
- **Mitad cielo / mitad infierno**: dos capas con `clip-path` o `mask-image`.

**Con soporte parcial**
- **Piso espejado**: `-webkit-box-reflect: below … linear-gradient(...)` anda en Chrome y Safari, no en Firefox (0,3 % en celulares en Argentina, invest. anterior §0). La alternativa para todos es una copia invertida (`scaleY(-1)`) con `mask-image`.
- **Pasar de una función a otra**: View Transitions en el mismo documento (invest. anterior §8, propuesta 11).

---

## 4. Recomendación para este rediseño

### 4.1 Qué skills instalar y cómo

**Dónde instalarlas: a nivel proyecto**, en `C:\galas-sistema\.claude\skills\`. Así no se disparan en costos-mdf, que también tiene pantallas (Vue) y donde una skill de "rediseño" no tiene nada que hacer. Antes de copiar, leer cada `SKILL.md`.

**1. frontend-design (Anthropic): la base.**
- Copiar `C:\Users\Usuario\.claude\plugins\marketplaces\claude-plugins-official\plugins\frontend-design\skills\frontend-design\SKILL.md` a `C:\galas-sistema\.claude\skills\frontend-design\SKILL.md`. Ya está en disco y es idéntico al de GitHub.
- Si se la quiere en todos los proyectos: `/plugin install frontend-design@claude-plugins-official`.

**2. Emil Kowalski: `animation-performance` y `mobile-native`.**
- Son las que cuidan al público real: Android de gama media o baja y pantallas de 120 Hz.
- Hay que bajar `skills/animation-performance/SKILL.md` y `skills/mobile-native/SKILL.md` de `emilkowalski/skills` a sus carpetas.
- Opcional: `animate` (con su `RECIPES.md`) para decidir qué no animar.
- No usar `npx skills add`: instala las 19, también Swift y Expo.

**3. web-design-guidelines (Vercel), fijada.**
- Crear `.claude/skills/web-design-guidelines/` con su `SKILL.md`.
- Poner al lado `reglas.md`, una copia de `vercel-labs/web-interface-guidelines/command.md` del 05/10/2026.
- Cambiar la línea "Fetch fresh guidelines…" por "Leé `reglas.md` de esta carpeta".
- Se usa al final: `/web-design-guidelines frontend/index.html frontend/comprar.html`.

**4. Impeccable: opcional, solo para una segunda opinión** (`/impeccable critique`, `/impeccable audit`).
- Copiar a mano `plugin/skills/impeccable/` al proyecto, **sin** el plugin, para que no queden hooks.
- Apagar la telemetría con `DO_NOT_TRACK=1`.
- La primera vez va a querer bajar su binario; si se le niega, la skill sigue leyendo los archivos.
- Si no se quiere nada que baje binarios, saltearla: las tres primeras alcanzan.

**No instalar:**
- **taste-skill**: apunta a sitios de empresa y deja un hook de 600 s con Chrome. Su regla de contactos `.example` arruinaría el WhatsApp de ayuda. Además prohíbe efectos fuera de la tecnología y prohíbe el tilt.
- **UI/UX Pro Max**: la paleta y las fuentes ya las dan los flyers. Empuja a GSAP y Tailwind, y el plugin trae skills que piden claves de Gemini.
- **Superdesign** y **21st**: en la nube, con cuenta o clave, y de React.
- **web-artifacts-builder**: React, con npm.
- **awesome-design-md**: imitar marcas.
- **GSAP skills**: GSAP no hace falta.
- **baseline-ui**: Tailwind y React.

**Lo que más cambia el resultado (más que cualquier skill)** es el brief. Al pedir el rediseño, darle a Claude:
- los dos flyers como imágenes;
- qué función va con cada flyer;
- el público: celulares de gama media o baja, con datos móviles;
- "HTML/CSS/JS plano, sin build";
- un presupuesto: **30 KB de JS de efectos como máximo** y la imagen del héroe como LCP;
- que el plano de butacas tiene que seguir siendo rápido y claro;
- que arme el plan de frontend-design (paleta, tipos, layout, un solo momento) antes del código, y que revise con capturas a 360–390 px.

### 4.2 Efectos para cada flyer

**Común a las dos (presupuesto: unos 10 KB de JS nuevo)**
- Todo con `prefers-reduced-motion`, pausa fuera de pantalla, el canvas con un tope de densidad de píxeles de 1,5 y un botón "Pausar animaciones" (WCAG 2.2.2), como en la invest. anterior §6.6.
- **Sparticles** (5,3 KB) una sola vez para las dos estéticas.
- **canvas-confetti** (4,5 KB) **solo en `pago-exitoso.html`**, con los colores de la función comprada: rosa, plata y dorado para Divas; dorado y blanco para el Origen.
- **El plano de butacas sin efectos.** A lo sumo, un pulso en la butaca elegida.
- Para "cómo se ve desde mi lugar", una foto real del Paraninfo por sector rinde más que el 3D de Codrops.

**"Divas del Pop" (16 h)**
1. **Héroe**: el flyer (`flyer-divas-del-pop.webp`, 128 KB) como imagen principal. Encima, 2 o 3 **haces de reflector en CSS** que barren lento.
   - Paper Shaders `god-rays` (unos 7 KB, Apache-2.0) solo si se quiere probar en computadoras, con la imagen fija de respaldo. No hace falta.
2. **Glitter**: Sparticles con `shape: ["star","diamond"]`, `twinkle: true` y colores plata, dorado y rosa.
   - 30–40 partículas en celular y unas 80 en computadora, solo sobre el héroe.
3. **Título como texto real**, con fuentes en el propio sitio: "Divas" en script rosa y "Pop" en serif blanca.
   - Una pasada de brillo al cargar.
   - El **reflejo en el piso**, quieto, con `-webkit-box-reflect` o una copia invertida con máscara.
4. **El único momento orquestado**: los 6 paneles de vestuario entran escalonados una sola vez, con `transform` y `opacity`.
5. **La tarjeta de la entrada**:
   - un brillo que la recorre al tocarla (pseudo-elemento);
   - un tilt leve **solo con mouse** (`@media (hover:hover) and (pointer:fine)`), con unas 20 líneas propias o vanilla-tilt (2,5 KB) con `gyroscope: false`;
   - en el celular, la respuesta al presionar.

**"El Origen de Ser" (18 y 21 h)**
1. **Título dorado serif** con el degradé y una pasada de brillo. Los ornamentos en SVG en línea.
2. **La cortina de luz que se abre al cargar**: dos mitades que se separan con `translate` y dejan ver la figura. Es el único momento orquestado.
   - El **corazón** late suave con `opacity` y `scale`, y se detiene a los pocos segundos o con el botón de pausa.
   - El lema "El corazón sabe dónde volver" aparece después.
3. **Cielo e infierno, cada uno en su contenedor:**
   - **Plumas** del lado del cielo: Sparticles con `shape: "image"` y `imageUrl` de una pluma en SVG propia, cayendo con `drift`. Entre 12 y 20 en celular.
   - **Brasas** del lado del infierno: Sparticles con `direction: 0` (hacia arriba), círculos naranja y rojo con `glow` chico y `twinkle`. Entre 25 y 40.
   - Es la misma librería: no suma peso.
4. Opcional, solo en computadoras: un **divisor arrastrable cielo ↔ infierno** con `clip-path`.
   - En el celular no: compite con el scroll.
5. Al **cambiar de función** (16 h ↔ 18/21 h): un fundido de un flyer al otro con View Transitions, que no pesa nada. Sin soporte, cambia sin animación.

### 4.3 Qué NO usar y por qué

**Por peso**
- **Vanta, three.js o el demo de cine 3D de Codrops**: entre 150 KB y varios MB, calientan el celular. Vanta no tiene release desde 2022.
- **tsParticles completo o slim (47 KB)**: Sparticles hace lo mismo con 5. Los presets de tsParticles (27–30 KB) quedan como plan B si el fuego de Sparticles no convence.
- **Paper Shaders entero (64,5 KB)**: si se usa, que sea un solo shader (unos 7 KB) y solo en computadoras.
- **GSAP + ScrollTrigger + Lenis**, que traen las demos nuevas de Codrops: unos 120–140 KB sin comprimir para efectos que CSS ya resuelve (invest. anterior §3). Lenis no hace nada en una pantalla táctil.

**Por la experiencia en el celular**
- **Tilt con giroscopio en el celular** (vanilla-tilt o Atropos): marea al hacer scroll y en iOS pide permiso. Solo con mouse.
- **Partículas sobre el plano de butacas o el formulario de compra**: tapan, distraen y gastan batería justo donde hay que tocar con precisión.

**Por licencia**
- **pokemon-cards-css**: GPL-3.0.
- **react-bits**: React y Commons Clause; además es un molde que se copia para cada gala.
- **shadergradient**: sin licencia.
- **demos viejas de Codrops** con su licencia propia, en un molde que se reutiliza: preferir las MIT.

**Por mantenimiento**
- **particles.js**: abandonado desde 2015.

**Por riesgo**
- Skills con hooks globales, binarios que se bajan solos, telemetría por defecto o instrucciones que se bajan de internet sin fijar (§2.1).

---

## 5. Fuentes (consultadas el 13/11/2026)

**Skills (repos y archivos leídos con `gh api`)**
- github.com/anthropics/skills: `skills/frontend-design`, `canvas-design`, `theme-factory`, `web-artifacts-builder` y `.claude-plugin/marketplace.json`
- github.com/anthropics/claude-plugins-official, `plugins/frontend-design` (también la copia local en `C:\Users\Usuario\.claude\plugins\marketplaces\claude-plugins-official`)
- claude.com/plugins/frontend-design: "1,134,112" instalaciones, "Anthropic verified"
- github.com/nextlevelbuilder/ui-ux-pro-max-skill: `SKILL.md`, `scripts/*.py`, `.claude-plugin/*`, README
- github.com/Leonxlnx/taste-skill: `skills/taste-skill/SKILL.md` (hook `Stop`), `scripts/gate.mjs`, `photos.mjs`, `icons.mjs`, `install.sh`, README
- github.com/Leonxlnx/taste-skill-classics
- github.com/pbakaus/impeccable: `plugin/skills/impeccable/SKILL.md`, `plugin/hooks/hooks.json`, `scripts/impeccable`, `engine-checksums.txt`, `reference/craft-floor.md`, README (instalación, hooks, telemetría)
- github.com/vercel-labs/agent-skills (`skills/web-design-guidelines`) y github.com/vercel-labs/web-interface-guidelines (`command.md`)
- github.com/emilkowalski/skills: README, `animate`, `animation-performance`, `mobile-native`, `emil-design-eng`
- github.com/greensock/gsap-skills · github.com/ibelick/ui-skills · github.com/Dammyjay93/interface-design
- github.com/VoltAgent/awesome-design-md
- github.com/superdesigndev/superdesign (LICENSE, README) · github.com/superdesigndev/superdesign-skill
- github.com/21st-dev/magic-mcp
- github.com/alchaincyf/huashu-design · github.com/meta/astryx · github.com/nexu-io/open-design
- github.com/ComposioHQ/awesome-claude-skills · github.com/travisvn/awesome-claude-skills · github.com/hesreallyhim/awesome-claude-code
- code.claude.com/docs/en/skills: carpetas de skills, frontmatter, "Hooks that Claude Code registers when the skill is invoked and keeps running for the rest of the session"

**Qué circula (agregadores y guías: cifras no confiables)**
- youmind.com/es-419/landing/x-viral-articles/claude-web-design-skills-tutorial: resumen del artículo de X de @nett0eth, 13/07/2026
- pasqualepillitteri.it/es/news/578/claude-code-skills-design-uiux-guia
- bitdoze.com/es/mejores-skills-ia-diseno-web/
- skillselion.com/guides/frontend-design-skill-claude-code-guide

**Efectos (metadatos con `gh api`, versiones en registry.npmjs.org, pesos de cdn.jsdelivr.net medidos con gzip -9)**
- github.com/simeydotme/sparticles (README y `src/sparticles.js`) · sparticlesjs.dev
- github.com/tsparticles/tsparticles · particles.js.org
- github.com/catdad/canvas-confetti · github.com/crashmax-dev/fireworks-js · github.com/yiliansource/party-js · github.com/hcodes/snowflakes
- github.com/paper-design/shaders · shaders.paper.design
- github.com/oframe/ogl · github.com/tengbao/vanta
- github.com/micku7zu/vanilla-tilt.js · github.com/nolimits4web/atropos
- github.com/uiverse-io/galaxy
- github.com/codrops: SeamTransitions, ReflectionScroll, SeatPreview, CinemaSeatPreview (con su `AGENTS.md`) · tympanus.net/codrops/licensing
- github.com/gl-transitions/gl-transitions
- github.com/DavidHDev/react-bits (`LICENSE.md`) · github.com/simeydotme/pokemon-cards-css · github.com/ruucm/shadergradient · github.com/VincentGarreau/particles.js

**Locales**
- `C:\fernandez-festival\investigacion\tendencias-web-2026.md` (§0, §3, §4 y §8)
- `C:\galas-sistema\SISTEMA.md` y los flyers en `temas\santiago-ritmica\assets\`

**No confirmado**
- Qué reel exacto vio José.
- Si tsParticles 4 respeta solo "reducir movimiento".
- Si el giroscopio de vanilla-tilt pide permiso en iOS en la versión 1.8.1.
- Cuánto se acerca la telemetría de Impeccable a lo que dice su página de privacidad (no se leyó la página, solo el README).
