// Completa la cabecera y el título de las pantallas con los datos del evento (de /api/config),
// así ninguna pantalla tiene el nombre de la gala escrito a mano.
fetch('/api/config').then(r => r.json()).then(c => {
  const e = c.evento || {};
  document.querySelectorAll('[data-evento]').forEach(el => {
    const campo = el.dataset.evento;
    el.textContent = campo === 'organiza' ? (e.organiza || e.cuando || '') : (e[campo] || el.textContent);
  });
  if (e.nombre && !document.title.includes(e.nombre)) document.title += ' · ' + e.nombre;
}).catch(() => {});
