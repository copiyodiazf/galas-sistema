# Skills de diseño de este proyecto (13/11/2026)

Se cargan solas en las sesiones de Claude Code abiertas en `C:\galas-sistema` (no en costos-mdf).
Elegidas en `investigacion/skills-diseno-github.md`. Todas son texto: sin scripts, sin hooks, sin red.

| Carpeta | De dónde | Licencia |
|---|---|---|
| `frontend-design` | Anthropic, `anthropics/claude-plugins-official` (copia local del catálogo, idéntica a GitHub) | Apache-2.0 |
| `animation-performance` | `emilkowalski/skills`, commit f7ce8c0 (12/11/2026) | MIT |
| `mobile-native` | `emilkowalski/skills`, commit f7ce8c0 (12/11/2026) | MIT |
| `web-design-guidelines` | `vercel-labs/agent-skills` (commit 1a2c79d) + reglas de `vercel-labs/web-interface-guidelines` (commit 434b7f9, 05/10/2026) fijadas en `reglas.md` | MIT |

Cambio propio: `web-design-guidelines` lee `reglas.md` en vez de bajar las reglas de internet en cada uso.
Para actualizar una: bajar el archivo nuevo, leerlo entero y reemplazarlo.
No instalar taste-skill ni Impeccable como plugin (hooks y telemetría): ver la investigación.
