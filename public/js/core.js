/* ══════════════════════════════════════════════════════
   SIPRESC — core.js
   Funciones compartidas por todas las páginas
   Cargar ANTES de cualquier script específico de página
   ══════════════════════════════════════════════════════ */

// ── Endpoints ──
const API     = '/api/proxy';
const API_PLN = '/api/planeaciones';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// ── Estado global de sesión ──
const ST = {
  rol: null,
  correo: null,
  nombre: null,
  docenteId: null,
};

// ── Selector corto ──
const $ = id => document.getElementById(id);

// ══ API ══════════════════════════════════════════════

/**
 * Llama al proxy de Citas (GAS Citas)
 * @param {string} action
 * @param {object} payload
 */
function api(action, payload = {}) {
  const body = { action, ...payload };
  if (ST.correo) body.correo = ST.correo;
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

/**
 * Llama al proxy de Planeaciones (GAS Planeaciones) — GET
 * @param {string} accion
 * @param {object} params
 */
function apiPlaneaciones(accion, params = {}) {
  const qs = new URLSearchParams({ accion, correo: ST.correo || '', ...params });
  return fetch(`${API_PLN}?${qs}`).then(r => r.json());
}

/**
 * Llama al proxy de Planeaciones — POST
 * @param {object} payload
 */
function apiPlaneacionesPost(payload = {}) {
  if (ST.correo) payload.correo = ST.correo;
  return fetch(API_PLN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json());
}

// ══ SESIÓN ═══════════════════════════════════════════

/**
 * Lee la sesión del localStorage y valida que no haya expirado (14 días)
 * Retorna { correo } o null
 */
function leerSesion() {
  try {
    const data = localStorage.getItem('lp_user');
    if (!data) return null;
    const obj = JSON.parse(data);
    const loginTime = Number(obj && obj.loginTime);
    const ahora = Date.now();
    if (!obj || !obj.correo || !Number.isFinite(loginTime) ||
        loginTime > ahora || ahora >= loginTime + SESSION_TTL_MS) {
      localStorage.removeItem('lp_user');
      return null;
    }
    obj.loginTime = loginTime;
    return obj;
  } catch {
    localStorage.removeItem('lp_user');
    return null;
  }
}

/**
 * Cierra sesión y redirige al login
 */
function doLogout() {
  localStorage.removeItem('lp_user');
  ST.rol = null;
  ST.correo = null;
  ST.nombre = null;
  window.location.href = '/';
}

/**
 * Verifica sesión y carga datos del usuario desde el GAS.
 * Si no hay sesión o el rol no está permitido, redirige al login.
 * @param {string[]} rolesPermitidos — ej: ['admin','coordinador']
 * @returns {Promise<object>} — datos del usuario (rol, nombre, etc.)
 */
function verificarAcceso(rolesPermitidos = []) {
  return new Promise((resolve, reject) => {
    const sesion = leerSesion();
    if (!sesion) { window.location.href = '/'; return; }
    ST.correo = sesion.correo;
    api('loginGoogle', { correo: sesion.correo })
      .then(r => {
        if (!r.ok) { window.location.href = '/'; return; }
        ST.rol       = r.rol;
        ST.nombre    = r.nombre;
        ST.docenteId = r.docenteId;
        if (rolesPermitidos.length && !rolesPermitidos.includes(r.rol)) {
          window.location.href = '/';
          return;
        }
        // ── Registrar presencia en SESIONES para el panel en vivo ──
        // Se llama sin await para no bloquear la carga de la página.
        // Si falla silenciosamente, no afecta nada.
        // ── Registrar presencia en vivo ──
// ── Registrar presencia en vivo ──
iniciarPresenciaEnVivo({
  correo: r.correo || sesion.correo,
  nombre: r.nombre || '',
  rol: r.rol || '',
  modulo: obtenerModuloActual()
});

        resolve(r);
      })
      .catch(() => { window.location.href = '/'; reject(); });
  });
}
// ══ PLANEACIONES — normalización ═════════════════════

/**
 * Traduce la respuesta del GAS planeaciones al formato del dashboard/app
 * GAS: { periodos: { "1": { "SEMANA 15": { "Docente": [...] } } } }
 * Salida: [ { nombreDocente, asignatura, grado, estadoRevision, ... } ]
 */
function normalizarPlaneaciones(raw, semanaFiltro) {
  const resultado = [];
  if (!raw || !raw.periodos) return resultado;
  const ESTADO = {
    'Aprobada':    'aprobada',
    'Con ajustes': 'ajustes',
    'Pendiente':   'pendiente',
    'Recibida':    'enviada',
  };
  Object.values(raw.periodos).forEach(semanas => {
    Object.entries(semanas).forEach(([semana, docentes]) => {
      if (semanaFiltro && semana.toUpperCase() !== semanaFiltro.toUpperCase()) return;
      Object.entries(docentes).forEach(([nombreDoc, planes]) => {
        planes.forEach(p => {
          resultado.push({
            planeacionId:   p.id || '',
            nombreDocente:  p.NOMBRE_DOCENTE || nombreDoc || '—',
            asignatura:     p.ASIGNATURA || '—',
            grado:          p.GRADO || '—',
            semana:         p.SEMANA || semana,
            estadoRevision: ESTADO[p.REVISION_COORD] || 'pendiente',
            estadoPub:      p.ESTADO_PUBLICACION || '',
            indicador:      p.INDICADOR_SEMANAL || '',
            d1Tema:         p.D1_TEMA || '',
            d1Act:          p.D1_ACTIVIDADES || '',
            d2Tema:         p.D2_TEMA || '',
            d2Act:          p.D2_ACTIVIDADES || '',
            d3Tema:         p.D3_TEMA || '',
            d3Act:          p.D3_ACTIVIDADES || '',
            d4Tema:         p.D4_TEMA || '',
            d4Act:          p.D4_ACTIVIDADES || '',
            d5Tema:         p.D5_TEMA || '',
            d5Act:          p.D5_ACTIVIDADES || '',
            obsFamilias:    p.OBS_FAMILIAS || '',
            actComp:        p.ACT_COMP_DESCRIPCION || '',
            grupos:         p.GRUPOS_DESTINO || '',
            diasIntensidad: p.DIAS_INTENSIDAD || 2,
          });
        });
      });
    });
  });
  return resultado;
}

/**
 * Calcula la etiqueta de semana activa para el GAS de planeaciones
 * GAS usa "SEMANA 15", no "2026-S15"
 */
function getSemanaActualLabel() {
  const base = new Date('2026-04-25T12:00:00-05:00');
  const diff = Math.floor((Date.now() - base.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const n = ((5 + diff - 1) % 10 + 10) % 10 + 1;
  return `SEMANA ${n}`;
}

// ══ HELPERS ══════════════════════════════════════════

/** Formatea Date a "YYYY-MM-DD" */
function fmtISO(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** Formatea "YYYY-MM-DD" a "DD/MM/YYYY" */
function fmtFecha(f) {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

/** Pad numérico */
function pad(n) { return String(n).padStart(2, '0'); }

/** Hash simple de string (para colores consistentes) */
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

/** Iniciales de un nombre completo (máx 2) */
function iniciales(nombre) {
  return (nombre || '').split(' ')
    .filter(p => p.length > 1)
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '??';
}

/** Animación de barra de progreso */
function setBar(lblId, fillId, val, total) {
  const lbl = $(lblId), fill = $(fillId);
  if (!lbl || !fill) return;
  lbl.textContent = val + '/' + total;
  setTimeout(() => {
    fill.style.width = (total > 0 ? Math.round(val / total * 100) : 0) + '%';
  }, 120);
}

/** Formatea segundos a "hace Xs / Xmin / Xh" */
function formatHace(seg) {
  if (seg < 60) return `hace ${seg}s`;
  if (seg < 3600) return `hace ${Math.floor(seg / 60)}min`;
  return `hace ${Math.floor(seg / 3600)}h`;
}

// ══ TOAST ════════════════════════════════════════════

function toast(msg, tipo) {
  let t = $('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast on ' + (tipo || '');
  clearTimeout(t._to);
  t._to = setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ══ PRESENCIA EN VIVO ═════════════════════════════════

// ══ PRESENCIA EN VIVO ═════════════════════════════════

let PRESENCIA_TIMER = null;

function obtenerSessionIdPresencia() {
  let id = sessionStorage.getItem('sipresc_session_id');

  if (!id) {
    id = `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('sipresc_session_id', id);
  }

  return id;
}

function obtenerModuloActual(moduloForzado = '') {
  if (moduloForzado && moduloForzado !== '/') return moduloForzado;

  if (window.SIPRESC_MODULO && window.SIPRESC_MODULO !== '/') {
    return window.SIPRESC_MODULO;
  }

  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);

  if (path === '/' || path === '') {
    if (params.get('modo') === 'docente') return 'Docente · Inicio';
    return 'Inicio';
  }

  if (path.includes('planeaciones')) return 'Docente · Planeaciones';
  if (path.includes('citas')) return 'Docente · Citas';
  if (path.includes('horarios')) return 'Docente · Horarios';
  if (path.includes('evaluaciones')) return 'Docente · Evaluaciones';
  if (path.includes('prompts')) return 'Docente · Prompts IA';
  if (path.includes('dashboardcoord')) return 'Coordinación · Panel principal';
  if (path.includes('dashboardadmin')) return 'Administración · Panel principal';

  return document.title || 'SIPRESC';
}

function iniciarPresenciaEnVivo(datos = {}) {
  if (!datos.correo) return;

  const enviar = () => {
    const moduloActual = obtenerModuloActual(datos.modulo);

    api('heartbeat', {
      correo: datos.correo,
      nombre: datos.nombre || '',
      rol: datos.rol || '',
      modulo: moduloActual,
      session_id: obtenerSessionIdPresencia(),
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString()
    }).catch(() => {});
  };

  enviar();

  if (PRESENCIA_TIMER) clearInterval(PRESENCIA_TIMER);
  PRESENCIA_TIMER = setInterval(enviar, 30000);
}

function actualizarModuloEnVivo(modulo) {
  if (modulo) {
    window.SIPRESC_MODULO = modulo;
  }

  const sesion = leerSesion();
  if (!sesion) return;

  const correo = ST.correo || sesion.correo;
  if (!correo) return;

  api('heartbeat', {
    correo: correo,
    nombre: ST.nombre || sesion.nombre || '',
    rol: ST.rol || sesion.rol || '',
    modulo: obtenerModuloActual(modulo),
    session_id: obtenerSessionIdPresencia(),
    user_agent: navigator.userAgent,
    timestamp: new Date().toISOString()
  }).catch(() => {});
}

// ══ SIDEBAR HELPERS ══════════════════════════════════

function toggleSB() {
  const sb = $('sidebar'), ov = $('sb-ov') || $('sb-overlay');
  if (sb) sb.classList.toggle('open');
  if (ov) ov.classList.toggle('on');
}

function closeSB() {
  const sb = $('sidebar'), ov = $('sb-ov') || $('sb-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('on');
}

// ══ EXPORT CSV ═══════════════════════════════════════

function exportarCSV() {
  api('exportarCSV', { filtros: {} }).then(r => {
    if (r.ok) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = 'citas_lapresentacion.csv';
      a.click();
      toast('CSV descargado', 'ok');
    } else {
      toast(r.mensaje || 'Error al exportar', 'er');
    }
  }).catch(() => toast('Error de conexión', 'er'));
}
