/* ═══════════════════════════════════════════════════════════════════
   SIPRESC DASHBOARD ADMINISTRADOR — JavaScript principal
   Vanilla JS puro, retrocompatible con core.js existente

   Módulos:
   01. Estado global y constantes
   02. Inicialización y sesión
   03. Sistema de auditoría frontend
   04. Navegación y routing de módulos
   05. Centro de control (inicio)
   06. Panel en vivo
   07. Planeaciones
   08. Publicaciones
   09. Citas
   10. Docentes
   11. Horarios
   12. Estadísticas
   13. Configuración
   14. Alertas
   15. Auditoría
   16. Logs
   17. UI helpers (toast, modal, tabs)
   18. PWA y service worker
═══════════════════════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════════════════════════════
// 01. ESTADO GLOBAL Y CONSTANTES
// ══════════════════════════════════════════════════════════════════

const ADMIN = {
  CORREO_ADMIN: 'secifuentes@lapresentaciongirardota.edu.co',
  API:          window.API     || '/api/proxy',
  API_PLN:      window.API_PLN || '/api/planeaciones',
  sesion:       null,
  moduloActual: 'inicio',
  heartbeatTimer: null,
  liveTimer:    null,
  cache: {
    kpis: null, docentes: null, planeaciones: null,
    calendario: null, citas: null, config: null,
    sesiones: null, auditoria: null, alertas: null,
  },
  charts: {},
  pendingRequests: new Map(),
  sessionId: null,
  planeacionActual: null,
};

// ══════════════════════════════════════════════════════════════════
// 02. INICIALIZACIÓN Y SESIÓN
// ══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => { inicializar(); });

async function inicializar() {
  const sesion = leerSesionAdmin();
  if (!sesion) { window.location.href = '/'; return; }
  try {
    const login = await apiCitasPost({
      action: 'loginGoogle',
      correo: sesion.correo
    });

    if (!login || !login.ok || login.rol !== 'admin') {
      localStorage.removeItem('lp_user');
      window.location.href = '/';
      return;
    }

    ADMIN.sesion = {
      ...sesion,
      ...login,
      correo: login.correo || sesion.correo,
      rol: login.rol || 'admin',
      nombre: login.nombre || sesion.nombre || sesion.correo.split('@')[0],
      loginTime: Date.now()
    };

    localStorage.setItem('lp_user', JSON.stringify(ADMIN.sesion));

  } catch (error) {
    localStorage.removeItem('lp_user');
    window.location.href = '/';
    return;
  }

  ADMIN.sessionId = generarSessionId();
  await new Promise(r => setTimeout(r, 2000));
  iniciarApp();
}

function leerSesionAdmin() {
  try {
    const raw = localStorage.getItem('lp_user');
    if (!raw) return null;

    const s = JSON.parse(raw);
    if (!s || !s.correo) return null;

    if (s.loginTime) {
      const dias = (Date.now() - s.loginTime) / (1000 * 60 * 60 * 24);
      if (dias > 14) {
        localStorage.removeItem('lp_user');
        return null;
      }
    }

    return s;
  } catch {
    return null;
  }
}

function generarSessionId() {
  return `adm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function iniciarApp() {
  const splash = document.getElementById('splash');
  splash.classList.add('fade-out');
  setTimeout(() => splash.classList.add('hidden'), 600);
  document.getElementById('app').classList.remove('hidden');

  const nombre = ADMIN.sesion.nombre || ADMIN.sesion.correo.split('@')[0];
  document.getElementById('sidebarUserName').textContent = nombre;
  document.getElementById('sidebarAvatar').textContent   = iniciales(nombre);

  configurarNavegacion();
  configurarSidebar();
  configurarCommandPalette();
  configurarEstadoConexion();

  document.getElementById('logoutBtn').addEventListener('click', () => {
    confirmar('¿Cerrar sesión?', '¿Deseas cerrar tu sesión de administrador?', () => {
      auditoria.registrar('sistema', 'logout', 'OK', 'Cierre de sesión manual');
      localStorage.removeItem('lp_user');
      window.location.href = '/';
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', () => cargarModuloActual(true));

  auditoria.registrar('dashboard', 'entradaDashboard', 'OK', 'Acceso al panel de administración');
  auditoria.iniciarHeartbeat();

  // ── TIMER GLOBAL DE LIVE ─────────────────────────────────────────
  // Corre permanentemente cada 20 s desde el arranque.
  // Si el módulo Live está activo → actualiza tabla completa.
  // Si está en otro módulo → actualiza solo el KPI y el badge.
  if (ADMIN.liveTimer) clearInterval(ADMIN.liveTimer);
  ADMIN.liveTimer = setInterval(() => {
    if (ADMIN.moduloActual === 'live') {
      actualizarLive();
    } else {
      cargarConteoLive();
    }
  }, 20000);

  navegarA('inicio');
  actualizarGreeting();
  registrarServiceWorker();
}

function actualizarGreeting() {
  const hora   = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = ADMIN.sesion.nombre || ADMIN.sesion.correo.split('@')[0];
  setEl('greetingText', saludo);
  setEl('greetingName', nombre);
  const el = document.getElementById('greetingDate');
  if (el) el.textContent = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ══════════════════════════════════════════════════════════════════
// 03. SISTEMA DE AUDITORÍA FRONTEND
// ══════════════════════════════════════════════════════════════════

const auditoria = {
  registrar(modulo, accion, resultado = 'OK', detalle = '') {
    const payload = {
      action:        'registrarEventoAuditoria',
      correo:        ADMIN.sesion?.correo    || '',
      nombre:        ADMIN.sesion?.nombre    || '',
      rol:           ADMIN.sesion?.rol       || 'admin',
      modulo,
      accion_evento: accion,
      detalle,
      resultado,
      user_agent:    navigator.userAgent,
      session_id:    ADMIN.sessionId,
      timestamp:     new Date().toISOString(),
    };
    fetch(ADMIN.API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      const cola = JSON.parse(localStorage.getItem('audit_queue') || '[]');
      cola.push(payload);
      if (cola.length > 50) cola.shift();
      localStorage.setItem('audit_queue', JSON.stringify(cola));
    });
  },

  iniciarHeartbeat() {
    const enviar = () => {
      fetch(ADMIN.API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:     'heartbeat',
          correo:     ADMIN.sesion?.correo || '',
          nombre:     ADMIN.sesion?.nombre || '',
          rol:        ADMIN.sesion?.rol    || 'admin',
          modulo:     ADMIN.moduloActual,
          session_id: ADMIN.sessionId,
          user_agent: navigator.userAgent,
          timestamp:  new Date().toISOString(),
        }),
      }).catch(() => {});
    };
    enviar();
    ADMIN.heartbeatTimer = setInterval(enviar, 30000);
  },

  detenerHeartbeat() {
    if (ADMIN.heartbeatTimer) clearInterval(ADMIN.heartbeatTimer);
  },
};

window.auditoria = auditoria;

// ══════════════════════════════════════════════════════════════════
// 04. NAVEGACIÓN Y ROUTING DE MÓDULOS
// ══════════════════════════════════════════════════════════════════

const MODULOS = {
  inicio:        { titulo: 'Centro de control',  loader: cargarInicio        },
  live:          { titulo: 'Panel en vivo',       loader: cargarLive          },
  planeaciones:  { titulo: 'Planeaciones',        loader: cargarPlaneaciones  },
  publicaciones: { titulo: 'Publicaciones',       loader: cargarPublicaciones },
  citas:         { titulo: 'Citas',               loader: cargarCitas         },
  docentes:      { titulo: 'Docentes',            loader: cargarDocentes      },
  horarios:      { titulo: 'Horarios',            loader: cargarHorarios      },
  estadisticas:  { titulo: 'Estadísticas',        loader: cargarEstadisticas  },
  alertas:       { titulo: 'Alertas',             loader: cargarAlertas       },
  auditoria:     { titulo: 'Auditoría',           loader: cargarAuditoria     },
  logs:          { titulo: 'Logs',                loader: cargarLogs          },
  configuracion: { titulo: 'Configuración',       loader: cargarConfiguracion },
};

function configurarNavegacion() {
  document.querySelectorAll('[data-module]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mod = btn.dataset.module;
      if (!MODULOS[mod]) return;
      navegarA(mod);
      if (window.innerWidth <= 768) cerrarSidebarMobile();
    });
  });
}

function configurarCommandPalette() {
  const trigger = document.getElementById('commandTrigger');
  const backdrop = document.getElementById('commandBackdrop');
  const input = document.getElementById('commandSearch');
  const results = document.getElementById('commandResults');
  if (!trigger || !backdrop || !input || !results) return;

  const descripciones = {
    inicio: 'Resumen institucional y accesos rápidos', live: 'Usuarios conectados ahora',
    planeaciones: 'Entregas, revisión y seguimiento', publicaciones: 'Calendario y publicaciones',
    citas: 'Agenda, cierres y solicitudes', docentes: 'Directorio y carga académica',
    horarios: 'Permisos y solicitudes de horario', estadisticas: 'Indicadores consolidados',
    alertas: 'Pendientes que requieren atención', auditoria: 'Historial de operaciones',
    logs: 'Registro técnico del sistema', configuracion: 'Parámetros institucionales'
  };
  const icono = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const items = Object.entries(MODULOS).filter(([id, m]) =>
      !q || `${m.titulo} ${descripciones[id] || ''}`.toLowerCase().includes(q));
    results.innerHTML = items.length ? items.map(([id, m], i) => `
      <button class="command-result${i === 0 ? ' is-active' : ''}" type="button" data-command-module="${id}">
        ${icono}<span><strong>${esc(m.titulo)}</strong><small>${esc(descripciones[id] || '')}</small></span>
      </button>`).join('') : '<div class="command-empty">No encontramos ese módulo.</div>';
    results.querySelectorAll('[data-command-module]').forEach(btn => btn.addEventListener('click', () => {
      navegarA(btn.dataset.commandModule); cerrar();
    }));
  };
  const abrir = () => { backdrop.classList.remove('hidden'); backdrop.setAttribute('aria-hidden', 'false'); input.value = ''; render(); requestAnimationFrame(() => input.focus()); };
  const cerrar = () => { backdrop.classList.add('hidden'); backdrop.setAttribute('aria-hidden', 'true'); trigger.focus(); };

  trigger.addEventListener('click', abrir);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) cerrar(); });
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') results.querySelector('.command-result')?.click();
    if (e.key === 'Escape') cerrar();
  });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); backdrop.classList.contains('hidden') ? abrir() : cerrar(); }
    else if (e.key === 'Escape' && !backdrop.classList.contains('hidden')) cerrar();
  });
}

function configurarEstadoConexion() {
  const pintar = () => {
    const el = document.getElementById('topbarStatus');
    if (!el) return;
    const online = navigator.onLine;
    el.classList.toggle('is-offline', !online);
    el.querySelector('.status-dot')?.classList.toggle('online', online);
    const label = el.querySelector('.status-label');
    if (label) label.textContent = online ? 'Sistema activo' : 'Sin conexión';
    if (!online) toast('Sin conexión. Los cambios no se enviarán hasta recuperar Internet.', 'warning', 5000);
  };
  window.addEventListener('online', pintar);
  window.addEventListener('offline', pintar);
  pintar();
}

function navegarA(modulo, filtro = null) {
  if (!MODULOS[modulo]) return;
  ADMIN.moduloActual = modulo;
  if (filtro) ADMIN.filtroActivo = filtro;

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === modulo);
  });
  document.querySelectorAll('.module').forEach(m => m.classList.add('hidden'));
  const mod = document.getElementById(`mod-${modulo}`);
  if (mod) mod.classList.remove('hidden');

  document.getElementById('topbarTitle').textContent = MODULOS[modulo].titulo;
  auditoria.registrar(modulo, 'cambioModulo', 'OK', MODULOS[modulo].titulo);
  MODULOS[modulo].loader(filtro);
}

function cargarModuloActual(forzar = false) {
  const mod = ADMIN.moduloActual;
  if (MODULOS[mod]) {
    if (forzar) {
      ADMIN.cache[mod] = null;
      if (mod === 'inicio') ADMIN.cache.kpis = null;
    }
    const refresh = document.getElementById('refreshBtn');
    refresh?.classList.add('is-loading');
    Promise.resolve(MODULOS[mod].loader()).finally(() => refresh?.classList.remove('is-loading'));
  }
}

function configurarSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const main      = document.getElementById('mainContent');
  const btn       = document.getElementById('sidebarCollapseBtn');
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const overlay   = document.getElementById('sidebarOverlay');

  if (!sidebar) return;

  if (btn) {
    const aplicarEstadoSidebar = (collapsed) => {
      sidebar.classList.toggle('collapsed', collapsed);
      if (main) main.classList.toggle('sidebar-collapsed', collapsed);
      localStorage.setItem('sidebar_collapsed', collapsed ? 'true' : 'false');
      btn.setAttribute('title', collapsed ? 'Expandir menú' : 'Colapsar menú');
      btn.setAttribute('aria-label', collapsed ? 'Expandir menú' : 'Colapsar menú');
    };

    const estadoGuardado = localStorage.getItem('sidebar_collapsed') === 'true';
    aplicarEstadoSidebar(estadoGuardado);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collapsed = !sidebar.classList.contains('collapsed');
      aplicarEstadoSidebar(collapsed);
    });
  }

  if (mobileBtn && overlay) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('hidden');
    });
    overlay.addEventListener('click', cerrarSidebarMobile);
  }
}

function cerrarSidebarMobile() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════════
// 05. CENTRO DE CONTROL (INICIO)
// ══════════════════════════════════════════════════════════════════

async function cargarInicio() {
  await Promise.allSettled([
    cargarKPIs(),
    cargarActividadReciente(),
    cargarAlertasMini(),
  ]);
  await cargarConteoLive();
  await cargarMiniChartPlaneaciones();
}

async function cargarKPIs(forzar = false) {
  if (ADMIN.cache.kpis && !forzar) { renderKPIs(ADMIN.cache.kpis); return; }

  document.querySelectorAll('.kpi-card').forEach(c => c.classList.add('skeleton'));

  try {
    const [resP, resC] = await Promise.allSettled([
      apiPlaneacionesGet('adminResumenPlaneaciones', { correo: ADMIN.sesion.correo }),
      apiCitasPost({ action: 'estadisticas', correo: ADMIN.sesion.correo }),
    ]);

    const pln  = resP.status === 'fulfilled' ? resP.value : null;
    const cits = resC.status === 'fulfilled' ? resC.value : null;
    actualizarEstadoServicios_(resP.status === 'fulfilled', resC.status === 'fulfilled');

    const kpis = {
      plnRecibidas:   pln?.resumen?.recibidas          ?? '—',
      plnAprobadas:   pln?.resumen?.aprobadas          ?? '—',
      plnAjustes:     pln?.resumen?.ajustes            ?? '—',
      plnRevisar:     pln?.resumen?.por_revisar        ?? '—',
      plnNoEnviadas:  pln?.resumen?.no_enviadas        ?? '—',
      citasHoy:       cits?.hoy                        ?? '—',
      citasConfirmadas: cits?.confirmadas              ?? '—',
      citasCierres:   cits?.cierres_pendientes         ?? '—',
      docActivos:     pln?.docentes?.activos           ?? '—',
      docIncompletos: pln?.docentes?.sin_planeacion    ?? '—',
      liveUsers:      '—',
      pubPendientes:  pln?.publicaciones?.pendientes   ?? '—',
      periodo:        pln?.periodo_actual              || 'Sin configurar',
      semana:         pln?.semana_actual               || 'Sin configurar',
    };

    ADMIN.cache.kpis = resP.status === 'fulfilled' && resC.status === 'fulfilled' ? kpis : null;
    renderKPIs(kpis);
    setEl('greetingPeriodo', `Periodo ${kpis.periodo}`);
    setEl('greetingSemana', kpis.semana);

  } catch (err) {
    console.error('[SIPRESC] Error cargando KPIs:', err);
    toast('No se pudieron cargar los indicadores', 'error');
    auditoria.registrar('inicio', 'cargarKPIs', 'ERROR', err.message);
  } finally {
    document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('skeleton'));
    setEl('kpiUpdated', `Actualizado ${formatHace(new Date())}`);
  }
}

function renderKPIs(kpis) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('kv-pln-recibidas',   kpis.plnRecibidas);
  set('kv-pln-aprobadas',   kpis.plnAprobadas);
  set('kv-pln-ajustes',     kpis.plnAjustes);
  set('kv-pln-revisar',     kpis.plnRevisar);
  set('kv-pln-noenviadas',  kpis.plnNoEnviadas);
  set('kv-citas-hoy',       kpis.citasHoy);
  set('kv-citas-confirmadas', kpis.citasConfirmadas);
  set('kv-citas-cierres',   kpis.citasCierres);
  set('kv-doc-activos',     kpis.docActivos);
  set('kv-doc-incompletos', kpis.docIncompletos);
  set('kv-live',            kpis.liveUsers);
  set('kv-pub-pendientes',  kpis.pubPendientes);

  document.querySelectorAll('.kpi-card[data-module]').forEach(card => {
    card.onclick = () => navegarA(card.dataset.module, card.dataset.filter || null);
  });

  const ajustes = parseInt(kpis.plnAjustes)   || 0;
  const cierres = parseInt(kpis.citasCierres) || 0;
  const total   = ajustes + cierres;

  const badgeInicio  = document.getElementById('badge-inicio');
  const badgeAlertas = document.getElementById('badge-alertas');
  const bottomBadge  = document.getElementById('bottomAlertBadge');
  if (badgeInicio)  { badgeInicio.textContent  = total || ''; badgeInicio.style.display  = total > 0 ? '' : 'none'; }
  if (badgeAlertas) { badgeAlertas.textContent = total || ''; badgeAlertas.style.display = total > 0 ? '' : 'none'; }
  if (bottomBadge)  { bottomBadge.textContent  = total || ''; bottomBadge.classList.toggle('hidden', total === 0); }
}

function actualizarEstadoServicios_(planeacionesOk, citasOk) {
  const indicator = document.getElementById('statusIndicator');
  if (indicator) {
    indicator.classList.remove('online', 'warning', 'offline');
    indicator.classList.add(planeacionesOk && citasOk ? 'online' : planeacionesOk || citasOk ? 'warning' : 'offline');
  }
  if (planeacionesOk && citasOk) {
    setEl('statusTitle', 'Sistema operativo');
    setEl('statusSub', 'Todos los servicios activos');
  } else if (planeacionesOk || citasOk) {
    setEl('statusTitle', 'Conexión parcial');
    setEl('statusSub', planeacionesOk ? 'Citas no respondió' : 'Planeaciones no respondió');
  } else {
    setEl('statusTitle', 'Servicios no disponibles');
    setEl('statusSub', 'Intenta actualizar en unos minutos');
  }
}

async function cargarActividadReciente() {
  const lista = document.getElementById('activityList');
  if (!lista) return;
  try {
    const res  = await apiCitasPost({ action: 'obtenerLog', correo: ADMIN.sesion.correo, limite: 8 });
    const logs = res?.logs || res?.log || res?.data || [];
    if (!logs.length) {
      lista.innerHTML = '<li style="padding:12px;color:var(--text-tertiary);font-size:.78rem;">Sin actividad reciente</li>';
      return;
    }
    lista.innerHTML = logs.slice(0, 8).map(log => {
      const tipo  = (log.Tipo || log.tipo || 'info').toLowerCase();
      const dotCl = tipo === 'error' ? 'error' : tipo === 'warn' ? 'warn' : tipo === 'ok' ? 'ok' : 'info';
      return `<li class="activity-item">
        <div class="activity-dot ${dotCl}"></div>
        <span class="activity-text">${esc(log.Descripcion || log.descripcion || '')}</span>
        <span class="activity-time">${formatHace(new Date(log.Timestamp || log.timestamp))}</span>
      </li>`;
    }).join('');
  } catch {
    lista.innerHTML = '<li class="activity-skeleton"></li>'.repeat(4);
  }
}

async function cargarAlertasMini() {
  const lista = document.getElementById('alertsMiniList');
  if (!lista) return;
  try {
    const alertas = await construirAlertas();
    const criticas = alertas.filter(a => a.nivel === 'critica').slice(0, 3);
    if (!criticas.length) {
      lista.innerHTML = '<li style="padding:12px;color:var(--text-tertiary);font-size:.78rem;">Sin alertas críticas activas</li>';
      return;
    }
    lista.innerHTML = criticas.map(a => `
      <li class="alert-mini-item ${a.nivel}" onclick="navegarA('alertas')">
        <svg class="alert-icon ${a.nivel}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 9v4M12 17h.01"/>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <span class="alert-mini-text"><strong>${esc(a.titulo)}</strong><br>${esc(a.desc)}</span>
      </li>`).join('');
  } catch { lista.innerHTML = ''; }
}

async function cargarMiniChartPlaneaciones() {
  const canvas = document.getElementById('chartPlaneacionesMini');
  if (!canvas || !window.Chart) return;
  if (ADMIN.charts.planeacionesMini) { ADMIN.charts.planeacionesMini.destroy(); ADMIN.charts.planeacionesMini = null; }
  const kpis = ADMIN.cache.kpis;
  if (!kpis) return;
  const data = [
    parseInt(kpis.plnAprobadas)  || 0,
    parseInt(kpis.plnRevisar)    || 0,
    parseInt(kpis.plnAjustes)    || 0,
    parseInt(kpis.plnNoEnviadas) || 0,
  ];
  ADMIN.charts.planeacionesMini = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Aprobadas', 'Por revisar', 'Con ajustes', 'No enviadas'],
      datasets: [{
        data,
        backgroundColor: ['#22c55e', '#a855f7', '#FFCC00', '#ef4444'],
        borderColor: '#141416', borderWidth: 3, hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#a1a1aa', font: { family: 'Sora', size: 11 }, padding: 12 } },
        tooltip: { titleFont: { family: 'Sora' }, bodyFont: { family: 'Sora' } }
      },
      cutout: '65%',
      animation: { animateScale: true, duration: 800 },
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// 06. PANEL EN VIVO
// ══════════════════════════════════════════════════════════════════

async function cargarLive() {
  // Carga inmediata al entrar al módulo (tabla completa)
  await actualizarLive();
  // El timer global ya corre desde iniciarApp().
  // Cuando el módulo Live está activo, el timer llama actualizarLive().
  // No se crea un timer nuevo aquí para evitar duplicados.
}

/**
 * Consulta sesiones activas y actualiza solo el KPI y el badge.
 * Se llama desde el timer global cuando el módulo Live NO está abierto.
 */
async function cargarConteoLive() {
  try {
    const res      = await apiCitasPost({ action: 'sesionesActivasExtendidas', correo: ADMIN.sesion.correo });
    const sesiones = res?.sesiones || [];
    const total    = sesiones.length;

    setEl('kv-live', total);

    const badge = document.getElementById('badge-live');
    if (badge) badge.textContent = total;

    // Actualizar contadores del panel live aunque no esté visible
    setEl('liveTotal',    total);
    setEl('liveAdmins',   sesiones.filter(s => (s.ROL||s.rol||'').toLowerCase() === 'admin').length);
    setEl('liveCoords',   sesiones.filter(s => (s.ROL||s.rol||'').toLowerCase() === 'coordinador').length);
    setEl('liveDocentes', sesiones.filter(s => (s.ROL||s.rol||'').toLowerCase() === 'docente').length);
  } catch { /* silenciar: es solo un KPI secundario */ }
}

async function actualizarLive() {
  const tbody = document.getElementById('liveTableBody');
  if (!tbody) return;
  try {
    const res      = await apiCitasPost({ action: 'sesionesActivasExtendidas', correo: ADMIN.sesion.correo });
    const sesiones = res?.sesiones || res?.data || [];

    setEl('liveTotal',    sesiones.length);
    setEl('liveAdmins',   sesiones.filter(s => (s.ROL||s.rol||'').toLowerCase() === 'admin').length);
    setEl('liveCoords',   sesiones.filter(s => (s.ROL||s.rol||'').toLowerCase() === 'coordinador').length);
    setEl('liveDocentes', sesiones.filter(s => (s.ROL||s.rol||'').toLowerCase() === 'docente').length);
    setEl('kv-live', sesiones.length);

    const badge = document.getElementById('badge-live');
    if (badge) badge.textContent = sesiones.length;

    if (!sesiones.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-tertiary)">Sin sesiones activas</td></tr>`;
      return;
    }
    tbody.innerHTML = sesiones.map(s => {
      const activo = esActivo(s.ULTIMA_ACTIVIDAD || s.ultima_actividad);
      const inicio = s.INICIO || s.inicio;
      const ultima = s.ULTIMA_ACTIVIDAD || s.ultima_actividad;
      return `<tr>
        <td>
          <strong>${esc(s.NOMBRE || s.nombre || s.CORREO || s.correo)}</strong>
          <div style="font-size:.68rem;color:var(--text-tertiary)">${esc(s.CORREO || s.correo)}</div>
        </td>
        <td><span class="badge ${badgeRol(s.ROL || s.rol)}">${esc(s.ROL || s.rol)}</span></td>
        <td>${esc(formatearModuloLive(s.MODULO_ACTUAL || s.modulo || '—'))}</td>
        <td style="font-size:.76rem">${formatFechaHora(inicio)}</td>
        <td style="font-size:.76rem">${formatFechaHora(ultima)}</td>
        <td style="font-size:.76rem">${calcularTiempoActivo(inicio)}</td>
        <td><span class="badge ${activo ? 'badge-green' : 'badge-gray'}">${activo ? 'Activo' : 'Inactivo'}</span></td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--color-red)">Error al cargar sesiones</td></tr>`;
    auditoria.registrar('live', 'cargarLive', 'ERROR', err.message);
  }
}

function esActivo(tsStr) {
  if (!tsStr) return false;
  // 35 min — coincide con INACTIVIDAD_MIN_ (30) + margen de 5 min.
  // registrarAcceso() se llama una sola vez al cargar el dashboard,
  // no cada 30 s, por eso se necesita un umbral más amplio.
  return (Date.now() - new Date(tsStr).getTime()) < 35 * 60 * 1000;
}

function calcularTiempoActivo(inicioStr) {
  if (!inicioStr) return '—';
  const diff = Math.floor((Date.now() - new Date(inicioStr).getTime()) / 1000);
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function formatearModuloLive(modulo) {
  const m = String(modulo || '').trim();

  if (!m || m === '—') return '—';

  if (m === '/') return 'Docente · Inicio';
  if (m === '/?modo=docente') return 'Docente · Inicio';

  if (m.includes('planeaciones')) return 'Docente · Planeaciones';
  if (m.includes('citas')) return 'Docente · Citas';
  if (m.includes('horarios')) return 'Docente · Horarios';
  if (m.includes('evaluaciones')) return 'Docente · Evaluaciones';
  if (m.includes('prompts')) return 'Docente · Prompts IA';
  if (m.includes('dashboardcoord')) return 'Coordinación · Panel principal';
  if (m.includes('dashboardadmin')) return 'Administración · Panel principal';

  return m;
}

// ══════════════════════════════════════════════════════════════════
// 07. PLANEACIONES
// ══════════════════════════════════════════════════════════════════

const plnEstado = {
  docentes: [], docenteActivo: null,
  planeacionActiva: null, sortedPlaneaciones: [],
};

async function cargarPlaneaciones(filtro) {
  auditoria.registrar('planeaciones', 'abrirPlaneaciones', 'OK');
  await cargarPeriodosYSemanas();

  ['plnPeriodo', 'plnSemana', 'plnEstado'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._bound) { el.addEventListener('change', refrescarDocentes); el._bound = true; }
  });
  const buscar = document.getElementById('plnBuscar');
  if (buscar && !buscar._bound) {
    buscar.addEventListener('input', debounce(filtrarDocentesUI, 300));
    buscar._bound = true;
  }

  await refrescarDocentes();

  if (filtro) {
    const mapa = {
      'ajustes':   'Con ajustes', 'aprobadas': 'Aprobada',
      'por-revisar':'Por revisar', 'recibidas': 'Recibida',
      'no-enviadas':'No enviada',
    };
    const sel = document.getElementById('plnEstado');
    if (sel && mapa[filtro]) { sel.value = mapa[filtro]; refrescarDocentes(); }
  }
}

async function cargarPeriodosYSemanas() {
  try {
    const res     = await apiPlaneacionesGet('adminDashboardPlaneaciones', { correo: ADMIN.sesion.correo });
    const periodos = res?.periodos || [];
    const semanas  = res?.semanas  || [];

    const selP = document.getElementById('plnPeriodo');
    if (selP && periodos.length) {
      selP.innerHTML = '<option value="">Todos los periodos</option>' +
        periodos.map(p => `<option value="${esc(p)}" ${p === res?.periodo_actual ? 'selected' : ''}>${esc(p)}</option>`).join('');
    }
    const selS = document.getElementById('plnSemana');
    if (selS && semanas.length) {
      selS.innerHTML = '<option value="">Todas las semanas</option>' +
        semanas.map(s => `<option value="${esc(s)}" ${s === res?.semana_actual ? 'selected' : ''}>${esc(s)}</option>`).join('');
    }
    if (res?.periodo_actual) {
      setEl('greetingPeriodo', `Periodo ${res.periodo_actual}`);
      setEl('greetingSemana', res.semana_actual || '');
    }
  } catch (err) { console.warn('[SIPRESC] No se pudieron cargar periodos:', err.message); }
}

async function refrescarDocentes() {
  const periodo = document.getElementById('plnPeriodo')?.value || '';
  const semana  = document.getElementById('plnSemana')?.value  || '';
  const estado  = document.getElementById('plnEstado')?.value  || '';
  const lista   = document.getElementById('plnDocenteList');

  lista.innerHTML = '<div class="activity-skeleton" style="margin:8px;border-radius:8px;height:48px"></div>'.repeat(6);

  try {
    const res = await apiPlaneacionesGet('dashboardCoordinacion', {
      correo: ADMIN.sesion.correo,
      periodo,
      semana
    });

    const docentesRaw = res?.data?.docentes || [];

    if (!Array.isArray(docentesRaw)) {
      console.warn('La respuesta no trae docentes como arreglo:', docentesRaw);
      renderDocentesList([]);
      return;
    }

    let docentes = docentesRaw.map(d => {
      const asignaciones = Array.isArray(d.asignaciones) ? d.asignaciones : [];

      const planeaciones = asignaciones.map(a => {
        const p = a.planeacion || {};

        return {
          ...p,

          // Datos base de la asignación
          DOCENTE_ID: d.docenteId || p.DOCENTE_ID || '',
          NOMBRE_DOCENTE: d.nombreDocente || p.NOMBRE_DOCENTE || '',
          CORREO_DOCENTE: d.correo || p.CORREO_DOCENTE || '',

          ASIGNATURA: a.asignatura || p.ASIGNATURA || '',
          GRADO: a.grado || p.GRADO || '',
          GRUPOS_DESTINO: a.gruposDestino || p.GRUPOS_DESTINO || '',
          GRADO_TEXTO: a.gradoTexto || '',

          DIAS_INTENSIDAD: a.diasIntensidad || p.DIAS_INTENSIDAD || '',

          // Estado
          ENTREGADA: a.entregada === true,
          PLANEACION_ID: a.planeacionId || p.PLANEACION_ID || '',
          ESTADO_REVISION:
            a.estadoRevision ||
            p.REVISION_COORD ||
            p.ESTADO_REVISION ||
            (a.entregada ? 'Recibida' : 'No enviada'),

          // Guardamos la asignación original por si se necesita luego
          _asignacion: a
        };
      });

      return {
        correo: d.correo || '',
        id: d.docenteId || d.correo || '',
        nombre: d.nombreDocente || d.correo || 'Sin nombre',
        planeaciones
      };
    });

    if (estado) {
      docentes = docentes.filter(d =>
        d.planeaciones.some(p =>
          normalizarEstadoRevision(p.ESTADO_REVISION || 'No enviada') === estado
        )
      );
    }

    const ordenEstado = ['Con ajustes', 'Por revisar', 'No enviada', 'Recibida', 'Aprobada', 'Publicada'];

    docentes.sort((a, b) =>
      ordenEstado.indexOf(estadoPrincipal(a.planeaciones)) -
      ordenEstado.indexOf(estadoPrincipal(b.planeaciones))
    );

    plnEstado.docentes = docentes;
    renderDocentesList(docentes);

  } catch (err) {
    console.error('[ERROR PLANEACIONES ADMIN]', err);
    lista.innerHTML = `<div style="padding:16px;color:var(--color-red);font-size:.78rem">Error: ${err.message}</div>`;
    auditoria.registrar('planeaciones', 'cargarDocentes', 'ERROR', err.message);
  }
}

function normalizarEstadoRevision(estado) {
  const e = String(estado || '').trim();

  if (!e) return 'No enviada';

  const mapa = {
    'con ajustes': 'Con ajustes',
    'por revisar': 'Por revisar',
    'no enviada': 'No enviada',
    'no enviado': 'No enviada',
    'recibida': 'Recibida',
    'recibido': 'Recibida',
    'aprobada': 'Aprobada',
    'aprobado': 'Aprobada',
    'publicada': 'Publicada',
    'publicado': 'Publicada'
  };

  return mapa[e.toLowerCase()] || e;
}

function estadoPrincipal(pls) {
  const orden = ['Con ajustes', 'Por revisar', 'No enviada', 'Recibida', 'Aprobada', 'Publicada'];

  for (const e of orden) {
    if (pls.some(p => normalizarEstadoRevision(p.ESTADO_REVISION || p.estado_revision || 'No enviada') === e)) {
      return e;
    }
  }

  return 'No enviada';
}

function renderDocentesList(docentes) {
  const lista = document.getElementById('plnDocenteList');
  if (!docentes.length) {
    lista.innerHTML = '<div style="padding:20px;color:var(--text-tertiary);font-size:.78rem;text-align:center">Sin docentes para este filtro</div>';
    return;
  }
  lista.innerHTML = docentes.map((d, i) => {
    const estado    = estadoPrincipal(d.planeaciones);
    const dotColor  = colorEstado(estado);
    const pendientes = d.planeaciones.filter(p =>
  !['Aprobada', 'Publicada'].includes(
    normalizarEstadoRevision(p.ESTADO_REVISION || p.estado_revision || 'No enviada')
  )
).length;
    return `<div class="pln-docente-item" data-idx="${i}" onclick="seleccionarDocente(${i})">
      <div class="pln-docente-avatar">${esc(iniciales(d.nombre))}</div>
      <div class="pln-docente-info">
        <div class="pln-docente-name">${esc(d.nombre)}</div>
        <div class="pln-docente-sub">${d.planeaciones.length} asig.${pendientes ? ` · ${pendientes} pend.` : ''}</div>
      </div>
      <div class="pln-docente-badge" style="background:${dotColor}"></div>
    </div>`;
  }).join('');
}

window.seleccionarDocente = function (idx) {
  const docente = plnEstado.docentes[idx];
  if (!docente) return;
  plnEstado.docenteActivo  = docente;
  plnEstado.planeacionActiva = null;

  document.querySelectorAll('.pln-docente-item').forEach((el, i) => el.classList.toggle('active', i === idx));
  setEl('plnDocenteSelected', docente.nombre);

  const ordenEstado = ['Con ajustes', 'Por revisar', 'No enviada', 'Recibida', 'Aprobada', 'Publicada'];
  const sorted = [...docente.planeaciones].sort((a, b) =>
  ordenEstado.indexOf(normalizarEstadoRevision(a.ESTADO_REVISION || a.estado_revision || 'No enviada')) -
  ordenEstado.indexOf(normalizarEstadoRevision(b.ESTADO_REVISION || b.estado_revision || 'No enviada'))
);
  plnEstado.sortedPlaneaciones = sorted;

  document.getElementById('plnAsignacionList').innerHTML = sorted.map((p, i) => {
    const estado = normalizarEstadoRevision(p.ESTADO_REVISION || p.estado_revision || 'No enviada');
    const grado   = p.GRADO   || p.grado   || '';
    const grupos  = p.GRUPOS_DESTINO || p.grupos_destino || '';
    const asig    = p.ASIGNATURA || p.asignatura || '';
    return `<div class="pln-mat-item" data-pln-idx="${i}" onclick="seleccionarPlaneacion(${i})">
      <div class="pln-mat-name">${esc(asig)}</div>
      <div class="pln-mat-grupos">${esc(grado)}${grupos ? ` · ${esc(grupos)}` : ''}</div>
      <span class="pln-mat-estado ${claseEstado(estado)}">${esc(estado)}</span>
    </div>`;
  }).join('');

  setEl('plnMatSelected', 'Detalle');
  document.getElementById('plnDetailActions')?.classList.add('hidden');
  document.getElementById('plnDetalleBody').innerHTML = `
    <div class="pln-empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
      <p>Selecciona una planeación para ver el detalle</p>
    </div>`;
};

window.seleccionarPlaneacion = function (idx) {
  const p = plnEstado.sortedPlaneaciones?.[idx];
  if (!p) return;
  plnEstado.planeacionActiva = p;

  document.querySelectorAll('.pln-mat-item').forEach((el, i) => el.classList.toggle('active', i === idx));

  const estado = normalizarEstadoRevision(p.ESTADO_REVISION || p.estado_revision || 'No enviada');
  const asig    = p.ASIGNATURA  || p.asignatura  || '—';
  const grado   = p.GRADO       || p.grado       || '—';
  setEl('plnMatSelected', `${asig} · ${grado}`);

  const actions      = document.getElementById('plnDetailActions');
  const puedeRevisar = ['Recibida','Por revisar','Con ajustes'].includes(estado);
  if (actions) {
    actions.classList.toggle('hidden', !puedeRevisar);
    document.getElementById('btnAprobar').onclick = () => aprobarPlaneacion(p);
    document.getElementById('btnAjustes').onclick = () => abrirModalAjustes(p);
  }

  document.getElementById('plnDetalleBody').innerHTML = `
    <div class="pln-detail-section">
      <div class="pln-detail-label">Estado</div>
      <span class="pln-mat-estado ${claseEstado(estado)}">${esc(estado)}</span>
      ${p.FECHA_REVISION ? `<span style="font-size:.68rem;color:var(--text-tertiary);margin-left:8px">Revisado ${formatFechaHora(p.FECHA_REVISION)}</span>` : ''}
    </div>
    <div class="pln-detail-section">
      <div class="pln-detail-label">Indicador semanal</div>
      <div class="pln-detail-value">${esc(p.INDICADOR_SEMANAL || p.indicador_semanal || 'Sin indicador')}</div>
    </div>
    ${(p.OBSERVACIONES_SEMANA_ANTERIOR || p.observaciones_semana_anterior) ? `
    <div class="pln-detail-section">
      <div class="pln-detail-label">Observaciones semana anterior</div>
      <div class="pln-detail-value">${esc(p.OBSERVACIONES_SEMANA_ANTERIOR || p.observaciones_semana_anterior)}</div>
    </div>` : ''}
    <div class="pln-detail-section">
      <div class="pln-detail-label">Clases planificadas</div>
      <div class="pln-class-grid">
        ${[1,2,3,4,5].map(n => {
          const tema = p[`D${n}_TEMA`] || p[`d${n}_tema`] || '';
          const act  = p[`D${n}_ACTIVIDADES`] || p[`d${n}_actividades`] || '';
          if (!tema && !act) return '';
          return `<div class="pln-class-card">
            <div class="pln-class-day">Día ${n}</div>
            <div class="pln-class-tema">${esc(tema)}</div>
            <div class="pln-class-act">${esc(act)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    ${(p.ACT_COMP_DESCRIPCION || p.act_comp_descripcion) ? `
    <div class="pln-detail-section">
      <div class="pln-detail-label">Actividad complementaria</div>
      <div class="pln-detail-value">${esc(p.ACT_COMP_DESCRIPCION || p.act_comp_descripcion)}</div>
      ${(p.ACT_COMP_ANEXO_URL || p.act_comp_anexo_url) ? `<a href="${esc(p.ACT_COMP_ANEXO_URL||p.act_comp_anexo_url)}" target="_blank" class="btn btn-ghost btn-sm" style="margin-top:6px;display:inline-flex">Ver anexo</a>` : ''}
    </div>` : ''}
    ${(p.OBS_FAMILIAS || p.obs_familias) ? `
    <div class="pln-detail-section">
      <div class="pln-detail-label">Comunicación a familias</div>
      <div class="pln-detail-value">${esc(p.OBS_FAMILIAS || p.obs_familias)}</div>
    </div>` : ''}
    ${(p.CLASSROOM_LINK || p.classroom_link) ? `
    <div class="pln-detail-section">
      <div class="pln-detail-label">Link Classroom</div>
      <a href="${esc(p.CLASSROOM_LINK||p.classroom_link)}" target="_blank" class="btn btn-ghost btn-sm" style="display:inline-flex">Abrir en Classroom</a>
    </div>` : ''}
    ${(p.OBS_COORDINACION || p.obs_coordinacion) ? `
    <div class="pln-detail-section">
      <div class="pln-detail-label">Observación de revisión</div>
      <div class="pln-detail-value" style="color:var(--color-yellow)">${esc(p.OBS_COORDINACION||p.obs_coordinacion)}</div>
    </div>` : ''}
    <div class="pln-detail-section">
      <div class="pln-detail-label">Metadatos</div>
      <div class="pln-detail-value mono" style="font-size:.7rem;line-height:1.8;color:var(--text-tertiary)">
        ID: ${esc(p.PLANEACION_ID||p.planeacion_id||'—')}<br>
        Semana: ${esc(p.SEMANA||p.semana||'—')}<br>
        Enviada: ${formatFechaHora(p.TIMESTAMP_FORM||p.timestamp_form)}<br>
        Grupos: ${esc(p.GRUPOS_DESTINO||p.grupos_destino||'—')}
      </div>
    </div>`;

  auditoria.registrar('planeaciones', 'verDetallePlaneacion', 'OK', `${asig} · ${grado}`);
};

function filtrarDocentesUI() {
  const q = document.getElementById('plnBuscar')?.value?.toLowerCase() || '';
  document.querySelectorAll('.pln-docente-item').forEach((el, i) => {
    const d = plnEstado.docentes[i];
    el.style.display = (!q || (d.nombre||'').toLowerCase().includes(q)) ? '' : 'none';
  });
}

async function aprobarPlaneacion(p) {
  const id = p.PLANEACION_ID || p.planeacion_id;
  if (!id) { toast('ID de planeación no encontrado', 'error'); return; }
  confirmar('Aprobar planeación',
    `¿Confirmas que deseas <strong>aprobar</strong> la planeación de ${esc(p.NOMBRE_DOCENTE||'')} — ${esc(p.ASIGNATURA||'')}?`,
    async () => {
      const btn = document.getElementById('btnAprobar');
      btn?.classList.add('loading');
      try {
        await apiPlaneacionesPost({
          accion: 'revisarPlaneacion', planeacionId: id,
          correo: ADMIN.sesion.correo, accion_revision: 'aprobar',
          estado: 'Aprobada', obs: '', motivo: '', notificar: true,
        });
        toast('Planeación aprobada', 'success');
        auditoria.registrar('planeaciones', 'aprobarPlaneacion', 'OK', id);
        await refrescarDocentes();
      } catch (err) {
        toast('Error al aprobar: ' + err.message, 'error');
        auditoria.registrar('planeaciones', 'aprobarPlaneacion', 'ERROR', err.message);
      } finally { btn?.classList.remove('loading'); }
    });
}

function abrirModalAjustes(p) {
  const modal = document.getElementById('modalAjustesBackdrop');
  modal.classList.remove('hidden');
  document.querySelectorAll('#ajustesMotivos input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  document.getElementById('ajustesObs').value = '';

  document.getElementById('modalAjustesClose').onclick   = () => modal.classList.add('hidden');
  document.getElementById('modalAjustesCancel').onclick  = () => modal.classList.add('hidden');
  document.getElementById('modalAjustesConfirm').onclick = async () => {
    const motivos = [...document.querySelectorAll('#ajustesMotivos input:checked')].map(cb => cb.value);
    const obs     = document.getElementById('ajustesObs')?.value || '';
    if (!motivos.length) { toast('Selecciona al menos un motivo', 'warning'); return; }
    const btn = document.getElementById('modalAjustesConfirm');
    btn.classList.add('loading');
    try {
      await apiPlaneacionesPost({
        accion: 'revisarPlaneacion', planeacionId: p.PLANEACION_ID || p.planeacion_id,
        correo: ADMIN.sesion.correo, accion_revision: 'ajustes',
        estado: 'Con ajustes', motivo: motivos.join(', '), obs, notificar: true,
      });
      toast('Ajustes solicitados y docente notificado', 'success');
      auditoria.registrar('planeaciones', 'solicitarAjustes', 'OK', motivos.join(', '));
      modal.classList.add('hidden');
      await refrescarDocentes();
    } catch (err) { toast('Error: ' + err.message, 'error'); }
    finally { btn.classList.remove('loading'); }
  };
}

// ══════════════════════════════════════════════════════════════════
// 08. PUBLICACIONES
// ══════════════════════════════════════════════════════════════════

async function cargarPublicaciones() {
  auditoria.registrar('publicaciones', 'abrirPublicaciones', 'OK');
  const selP = document.getElementById('pubPeriodo');
  if (selP && !selP._bound) { selP.addEventListener('change', cargarCalendarioPublicaciones); selP._bound = true; }
  const btnCfg = document.getElementById('btnGuardarConfigPub');
  if (btnCfg && !btnCfg._bound) { btnCfg.addEventListener('click', guardarConfigPublicacion); btnCfg._bound = true; }
  await cargarCalendarioPublicaciones();
}

async function cargarCalendarioPublicaciones() {
  const periodo  = document.getElementById('pubPeriodo')?.value || '';
  const calendar = document.getElementById('pubCalendar');
  calendar.innerHTML = '<div class="activity-skeleton" style="height:120px;border-radius:12px"></div>'.repeat(4);

  try {
    const [resCal, resCfg] = await Promise.allSettled([
      apiPlaneacionesGet('calendarioPublicaciones', { correo: ADMIN.sesion.correo, periodo }),
      apiPlaneacionesGet('adminConfigPublicacion',  { correo: ADMIN.sesion.correo }),
    ]);
    const semanas = resCal.status === 'fulfilled' ? (resCal.value?.semanas || []) : [];
    const cfg     = resCfg.status === 'fulfilled' ? (resCfg.value?.config  || {}) : {};

    if (resCal.status === 'fulfilled') {
      const periodos = resCal.value?.periodos || [];
      const selP = document.getElementById('pubPeriodo');
      if (selP && periodos.length) {
        const val = selP.value;
        selP.innerHTML = '<option value="">Todos los periodos</option>' +
          periodos.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
        if (val) selP.value = val;
      }
    }
    const selRegla = document.getElementById('pubRegla');
    if (selRegla && cfg.regla_publicacion) selRegla.value = cfg.regla_publicacion;

    if (!semanas.length) {
      calendar.innerHTML = '<div style="padding:32px;color:var(--text-tertiary);text-align:center;font-size:.82rem">Sin semanas configuradas</div>';
      return;
    }
    calendar.innerHTML = semanas.map(s => renderTarjetaSemana(s)).join('');
    adjuntarEventosSemanas();
  } catch (err) {
    calendar.innerHTML = `<div style="padding:24px;color:var(--color-red);font-size:.78rem">Error: ${err.message}</div>`;
    auditoria.registrar('publicaciones', 'cargarCalendario', 'ERROR', err.message);
  }
}

function renderTarjetaSemana(s) {
  const publicada = s.PUBLICADA === 'SI' || s.publicada === 'SI';
  const semana    = s.SEMANA  || s.semana  || '';
  const periodo   = s.PERIODO || s.periodo || '';
  const fechaProg = s.FECHA_PUBLICACION || s.fecha_publicacion || '';
  const horaProg  = s.HORA_PUBLICACION  || s.hora_publicacion  || '';
  const fechaReal = s.FECHA_PUBLICADA   || s.fecha_publicada   || '';
  return `<div class="pub-week-card ${publicada ? 'published' : 'pending'}" data-semana="${esc(semana)}" data-periodo="${esc(periodo)}">
    <div class="pub-week-header">
      <div>
        <div class="pub-week-name">${esc(semana)}</div>
        <div class="pub-week-periodo">Periodo ${esc(periodo)}</div>
      </div>
      <span class="pub-week-estado ${publicada ? 'badge-green' : 'badge-yellow'} badge">${publicada ? 'Publicada' : 'Pendiente'}</span>
    </div>
    <div class="pub-week-fields">
      <div class="pub-week-field">
        <span class="pub-week-field-label">Fecha prog.</span>
        <input type="date" class="pub-fecha" value="${esc(fechaProg)}" ${publicada ? 'disabled' : ''} />
      </div>
      <div class="pub-week-field">
        <span class="pub-week-field-label">Hora prog.</span>
        <input type="time" class="pub-hora" value="${esc(horaProg)}" ${publicada ? 'disabled' : ''} />
      </div>
      ${publicada && fechaReal ? `<div class="pub-week-field"><span class="pub-week-field-label">Publicada el</span><span style="font-size:.72rem;color:var(--color-green)">${esc(fechaReal)}</span></div>` : ''}
    </div>
    <div class="pub-week-actions">
      <button class="btn btn-ghost btn-sm btn-guardar-prog">Guardar</button>
      <button class="btn btn-ghost btn-sm btn-simular">Simular</button>
      <button class="btn btn-ghost btn-sm btn-faltantes">Faltantes</button>
      ${!publicada
        ? `<button class="btn btn-primary btn-sm btn-publicar">Publicar ahora</button>`
        : `<button class="btn btn-warning btn-sm btn-republicar">Republicar</button>`}
    </div>
  </div>`;
}

function adjuntarEventosSemanas() {
  document.querySelectorAll('.pub-week-card').forEach(card => {
    const semana  = card.dataset.semana;
    const periodo = card.dataset.periodo;
    card.querySelector('.btn-guardar-prog')?.addEventListener('click', () => guardarProgramacionSemana(card, semana, periodo));
    card.querySelector('.btn-simular')?.addEventListener('click',      () => simularSemana(semana, periodo));
    card.querySelector('.btn-faltantes')?.addEventListener('click',    () => verFaltantesSemana(semana, periodo));
    card.querySelector('.btn-publicar')?.addEventListener('click',     () => confirmarPublicacion(semana, periodo, false));
    card.querySelector('.btn-republicar')?.addEventListener('click',   () => confirmarPublicacion(semana, periodo, true));
  });
}

async function guardarProgramacionSemana(card, semana, periodo) {
  const fecha = card.querySelector('.pub-fecha')?.value;
  const hora  = card.querySelector('.pub-hora')?.value;
  const btn   = card.querySelector('.btn-guardar-prog');
  btn.classList.add('loading');
  try {
    await apiPlaneacionesPost({ accion: 'guardarCalendarioPublicacion', correo: ADMIN.sesion.correo, semana, periodo, fecha_publicacion: fecha, hora_publicacion: hora });
    toast('Programación guardada', 'success');
    auditoria.registrar('publicaciones', 'guardarProgramacion', 'OK', `${semana}/${periodo}`);
  } catch (err) { toast('Error: ' + err.message, 'error'); }
  finally { btn.classList.remove('loading'); }
}

async function simularSemana(semana, periodo) {
  toast('Simulando publicación...', 'info');
  try {
    const res       = await apiPlaneacionesPost({ accion: 'simularPublicacionSemana', correo: ADMIN.sesion.correo, semana, periodo });
    const datos     = res?.simulacion || {};
    const faltantes = datos.faltantes  || [];
    const aPublicar = datos.a_publicar || [];
    abrirModal(`Simulación — ${semana}`, `
      <div style="margin-bottom:12px"><strong style="color:var(--color-green)">${aPublicar.length}</strong> planeaciones se publicarían</div>
      ${faltantes.length
        ? `<div style="margin-bottom:8px;font-size:.78rem;color:var(--text-secondary)">Docentes faltantes (${faltantes.length}):</div>
           <ul class="faltantes-list">${faltantes.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`
        : '<div style="color:var(--color-green);font-size:.78rem">Sin docentes faltantes</div>'}
    `, null, null, false);
    auditoria.registrar('publicaciones', 'simularPublicacion', 'OK', semana);
  } catch (err) { toast('Error en simulación: ' + err.message, 'error'); }
}

async function verFaltantesSemana(semana, periodo) {
  toast('Buscando faltantes...', 'info');
  try {
    const res       = await apiPlaneacionesGet('obtenerFaltantesSemana', { correo: ADMIN.sesion.correo, semana, periodo });
    const faltantes = res?.faltantes || [];
    abrirModal(`Faltantes — ${semana}`,
      faltantes.length
        ? `<ul class="faltantes-list">${faltantes.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`
        : '<p style="color:var(--color-green);font-size:.82rem">Todos los docentes activos han entregado su planeación.</p>',
      null, null, false);
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function confirmarPublicacion(semana, periodo, republicar) {
  const titulo = republicar ? `Republicar ${semana}` : `Publicar ${semana}`;
  const warn   = republicar
    ? `<div class="alerta-item advertencia" style="margin-bottom:12px;padding:10px 14px;border-radius:8px">
         <strong>Advertencia:</strong> Esta semana ya fue publicada. Republicar puede duplicar publicaciones en Classroom si no se controla desde el Apps Script.
       </div>` : '';
  setEl('modalPublicarTitle', titulo);
  document.getElementById('modalPublicarBody').innerHTML = `
    ${warn}
    <p style="font-size:.82rem;color:var(--text-secondary)">¿Confirmas que deseas ${republicar?'republicar':'publicar'} la <strong style="color:var(--text-primary)">${esc(semana)}</strong> del periodo <strong style="color:var(--text-primary)">${esc(periodo)}</strong>?</p>
    <p style="font-size:.76rem;color:var(--text-tertiary);margin-top:8px">Esta acción publicará las planeaciones en Google Classroom.</p>`;
  const modal = document.getElementById('modalPublicarBackdrop');
  modal.classList.remove('hidden');
  document.getElementById('modalPublicarClose').onclick  = () => modal.classList.add('hidden');
  document.getElementById('modalPublicarCancel').onclick = () => modal.classList.add('hidden');
  document.getElementById('modalPublicarConfirm').onclick = async () => {
    const btn = document.getElementById('modalPublicarConfirm');
    btn.classList.add('loading');
    try {
      await apiPlaneacionesPost({ accion: republicar ? 'republicarSemana' : 'publicarSemanaAhora', correo: ADMIN.sesion.correo, semana, periodo });
      toast(republicar ? 'Semana republicada' : 'Semana publicada', 'success');
      auditoria.registrar('publicaciones', republicar ? 'republicarSemana' : 'publicarSemana', 'OK', semana);
      modal.classList.add('hidden');
      cargarCalendarioPublicaciones();
    } catch (err) {
      toast('Error al publicar: ' + err.message, 'error');
      auditoria.registrar('publicaciones', 'publicarSemana', 'ERROR', err.message);
    } finally { btn.classList.remove('loading'); }
  };
}

async function guardarConfigPublicacion() {
  const regla  = document.getElementById('pubRegla')?.value  || 'aprobadas';
  const umbral = document.getElementById('pubUmbral')?.value || '3';
  const btn    = document.getElementById('btnGuardarConfigPub');
  btn.classList.add('loading');
  try {
    await apiPlaneacionesPost({ accion: 'guardarConfigPublicacion', correo: ADMIN.sesion.correo, regla_publicacion: regla, umbral_faltantes: umbral });
    toast('Configuración guardada', 'success');
    auditoria.registrar('publicaciones', 'guardarConfig', 'OK');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
  finally { btn.classList.remove('loading'); }
}

// ══════════════════════════════════════════════════════════════════
// 09. CITAS
// ══════════════════════════════════════════════════════════════════

async function cargarCitas(filtro) {
  auditoria.registrar('citas', 'abrirCitas', 'OK');
  configurarTabs('citasTabs', tab => cargarCitasTab(tab));

  const bindBtn = (id, fn) => {
    const el = document.getElementById(id);
    if (el && !el._bound) { el.addEventListener('click', fn); el._bound = true; }
  };

  bindBtn('btnCerrarAgenda', () => confirmar('Cerrar agenda', '¿Cerrar la agenda global?', async () => {
    try {
      await apiCitasPost({ action: 'cerrarAgenda', correo: ADMIN.sesion.correo, motivo: 'Cierre desde panel admin' });
      toast('Agenda cerrada', 'warning');
      auditoria.registrar('citas', 'cerrarAgenda', 'OK');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }));

  bindBtn('btnAbrirAgenda', () => confirmar('Abrir agenda', '¿Abrir la agenda global?', async () => {
    try {
      await apiCitasPost({ action: 'abrirAgenda', correo: ADMIN.sesion.correo });
      toast('Agenda abierta', 'success');
      auditoria.registrar('citas', 'abrirAgenda', 'OK');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }));

  bindBtn('btnExportarCitas', async () => {
    toast('Exportando...', 'info');
    try {
      const res = await apiCitasPost({ action: 'exportarCSV', correo: ADMIN.sesion.correo });
      if (res?.url) window.open(res.url, '_blank');
      else toast('CSV exportado', 'success');
      auditoria.registrar('citas', 'exportarCSV', 'OK');
    } catch { toast('Error al exportar', 'error'); }
  });

  await cargarKPIsCitas();
  await cargarCitasTab('hoy');
}

async function cargarKPIsCitas() {
  const container = document.getElementById('citasKpis');
  if (!container) return;
  try {
    const res   = await apiCitasPost({ action: 'estadisticas', correo: ADMIN.sesion.correo });
    const stats = res || {};
    container.innerHTML = [
      { label: 'Total citas',        val: stats.total                || '0' },
      { label: 'Hoy',                val: stats.hoy                  || '0' },
      { label: 'Esta semana',        val: stats.semana               || '0' },
      { label: 'Confirmadas',        val: stats.confirmadas          || '0' },
      { label: 'Canceladas',         val: stats.canceladas           || '0' },
      { label: 'Cierres pendientes', val: stats.cierres_pendientes   || '0' },
    ].map(k => `<div class="citas-kpi-card">
      <div class="citas-kpi-value">${esc(k.val)}</div>
      <div class="citas-kpi-label">${esc(k.label)}</div>
    </div>`).join('');
  } catch { container.innerHTML = ''; }
}

async function cargarCitasTab(tab) {
  const tbody = document.getElementById('citasTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="skeleton-row"><td colspan="8"></td></tr>';
  try {
    if (tab === 'cierres') {
      const res = await apiCitasPost({ action: 'cierresPendientes', correo: ADMIN.sesion.correo });
      renderTablaCierres(Array.isArray(res) ? res : (res?.cierres || res?.data || []));
      return;
    }
    const res   = await apiCitasPost({ action: 'todasCitas', correo: ADMIN.sesion.correo, filtro: tab });
    const citas = Array.isArray(res) ? res : (res?.citas || res?.data || []);
    tbody.innerHTML = citas.length
      ? citas.map(c => renderFilaCita(c)).join('')
      : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-tertiary)">Sin citas</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--color-red);padding:16px">Error: ${err.message}</td></tr>`;
  }
}

function renderFilaCita(c) {
  const estado = c.Estado || c.estado || 'Pendiente';
  const badge  = estado === 'Confirmada' ? 'badge-green' : estado === 'Cancelada' ? 'badge-red' : 'badge-yellow';
  return `<tr>
    <td><strong>${esc(c.DocenteNombre || c.docente_nombre || '—')}</strong></td>
    <td>${esc((c.PadreNombre||'') + ' ' + (c.PadreApellido||''))}</td>
    <td>${esc(c.EstudianteNombre || '—')}</td>
    <td>${esc(c.Grado || '—')}</td>
    <td>${esc(c.Fecha || '—')}</td>
    <td>${esc(c.HoraInicio || '—')}</td>
    <td><span class="badge ${badge}">${esc(estado)}</span></td>
    <td>${estado !== 'Cancelada' ? `<button class="btn btn-danger btn-sm" onclick="cancelarCita('${esc(c.ID||c.id||'')}')">Cancelar</button>` : ''}</td>
  </tr>`;
}

function renderTablaCierres(cierres) {
  const tbody = document.getElementById('citasTableBody');
  tbody.innerHTML = cierres.length
    ? cierres.map(c => `<tr>
        <td><strong>${esc(c.DocenteID || c.docente_id || '—')}</strong></td>
        <td colspan="2">${esc(c.Motivo || '—')}</td>
        <td>${esc(c.FechaInicio || '—')}</td>
        <td>${esc(c.FechaFin   || '—')}</td>
        <td><span class="badge badge-yellow">Pendiente</span></td>
        <td>
          <button class="btn btn-success btn-sm" onclick="revisarCierre('${esc(c.ID||'')}', true)">Aprobar</button>
          <button class="btn btn-danger btn-sm"  onclick="revisarCierre('${esc(c.ID||'')}', false)">Rechazar</button>
        </td>
        <td></td>
      </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-tertiary)">Sin cierres pendientes</td></tr>';
}

window.cancelarCita = function (id) {
  confirmar('Cancelar cita', '¿Confirmas que deseas cancelar esta cita?', async () => {
    try {
      await apiCitasPost({ action: 'cancelarCita', correo: ADMIN.sesion.correo, citaId: id });
      toast('Cita cancelada', 'warning');
      cargarCitasTab('hoy');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  });
};

window.revisarCierre = function (id, aprobado) {
  confirmar(aprobado ? 'Aprobar cierre' : 'Rechazar cierre',
    `¿Confirmas que deseas ${aprobado ? 'aprobar' : 'rechazar'} esta solicitud de cierre?`,
    async () => {
      try {
        await apiCitasPost({ action: 'revisarCierre', correo: ADMIN.sesion.correo, cierreId: id, aprobado });
        toast(aprobado ? 'Cierre aprobado' : 'Cierre rechazado', aprobado ? 'success' : 'warning');
        auditoria.registrar('citas', 'revisarCierre', 'OK', id);
        cargarCitasTab('cierres');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
};

// ══════════════════════════════════════════════════════════════════
// 10. DOCENTES
// ══════════════════════════════════════════════════════════════════

async function cargarDocentes(filtro) {
  auditoria.registrar('docentes', 'abrirDocentes', 'OK');
  const buscar = document.getElementById('docBuscar');
  if (buscar && !buscar._bound) { buscar.addEventListener('input', debounce(filtrarDocentesGrid, 300)); buscar._bound = true; }
  const filtroEst = document.getElementById('docFiltroEstado');
  if (filtroEst && !filtroEst._bound) { filtroEst.addEventListener('change', filtrarDocentesGrid); filtroEst._bound = true; }
  const btnNuevo = document.getElementById('btnNuevoDocente');
  if (btnNuevo && !btnNuevo._bound) { btnNuevo.addEventListener('click', () => abrirModalDocente()); btnNuevo._bound = true; }
  await cargarListaDocentes();
}

async function cargarListaDocentes() {
  const grid = document.getElementById('docentesGrid');
  grid.innerHTML = '<div class="activity-skeleton" style="height:120px;border-radius:12px"></div>'.repeat(6);
  try {
    const res = await apiCitasPost({ action: 'docentes', correo: ADMIN.sesion.correo });
    ADMIN.cache.docentes = Array.isArray(res) ? res : (res?.docentes || res?.data || []);
    renderDocentesGrid(ADMIN.cache.docentes);
  } catch (err) {
    grid.innerHTML = `<div style="color:var(--color-red);padding:16px;font-size:.78rem">Error: ${err.message}</div>`;
    auditoria.registrar('docentes', 'cargarDocentes', 'ERROR', err.message);
  }
}

function renderDocentesGrid(docentes) {
  const grid = document.getElementById('docentesGrid');
  if (!docentes.length) {
    grid.innerHTML = '<div style="padding:32px;color:var(--text-tertiary);text-align:center">Sin docentes registrados</div>';
    return;
  }
  grid.innerHTML = docentes.map((d, i) => {
    const nombre     = `${d.Nombre||d.nombre||''} ${d.Apellido||d.apellido||''}`.trim();
    const correo     = d.Correo  || d.correo  || '';
    const rol        = d.Rol     || d.rol     || 'docente';
    const activo     = d.Activo === true || d.Activo === 1 || d.Activo === 'TRUE' || d.activo === true;
    const suspendido = d.Suspendido === true || d.Suspendido === 'TRUE';
    const tagEst  = suspendido ? 'tag-suspendido' : activo ? 'tag-activo' : 'tag-inactivo';
    const textoEst= suspendido ? 'Suspendido'     : activo ? 'Activo'     : 'Inactivo';
    return `<div class="docente-card" data-idx="${i}" data-nombre="${esc(nombre.toLowerCase())}" data-estado="${esc(textoEst.toLowerCase())}">
      <div class="docente-card-header">
        <div class="docente-avatar">${esc(iniciales(nombre||correo))}</div>
        <div>
          <div class="docente-name">${esc(nombre||correo)}</div>
          <div class="docente-email">${esc(correo)}</div>
        </div>
      </div>
      <div class="docente-tags">
        <span class="docente-tag ${tagEst}">${textoEst}</span>
        <span class="docente-tag tag-rol">${esc(rol)}</span>
      </div>
      <div class="docente-footer">
        <button class="btn btn-ghost btn-sm" onclick="editarDocente(${i})">Editar</button>
        ${activo && !suspendido
          ? `<button class="btn btn-warning btn-sm" onclick="cambiarEstadoDocente(${i},'suspender')">Suspender</button>`
          : `<button class="btn btn-success btn-sm" onclick="cambiarEstadoDocente(${i},'activar')">Activar</button>`}
        <button class="btn btn-ghost btn-sm" onclick="navegarA('auditoria')">Auditoría</button>
      </div>
    </div>`;
  }).join('');
}

function filtrarDocentesGrid() {
  const q = document.getElementById('docBuscar')?.value?.toLowerCase() || '';
  const e = document.getElementById('docFiltroEstado')?.value?.toLowerCase() || '';
  document.querySelectorAll('.docente-card').forEach(card => {
    card.style.display = ((!q || card.dataset.nombre.includes(q)) && (!e || card.dataset.estado === e)) ? '' : 'none';
  });
}

window.editarDocente = function (idx) {
  const d = ADMIN.cache.docentes?.[idx];
  if (d) abrirModalDocente(d, idx);
};

window.cambiarEstadoDocente = function (idx, accion) {
  const d = ADMIN.cache.docentes?.[idx];
  if (!d) return;
  const nombre = `${d.Nombre||''} ${d.Apellido||''}`.trim();
  confirmar(`${accion === 'suspender' ? 'Suspender' : 'Activar'} docente`,
    `¿Confirmas que deseas ${accion === 'suspender' ? 'suspender' : 'activar'} a <strong>${esc(nombre)}</strong>?`,
    async () => {
      try {
        await apiCitasPost({ action: 'adminCambiarEstadoDocente', correo: ADMIN.sesion.correo, docenteId: d.ID||d.id||d.DOCENTE_ID, accion });
        toast(`Docente ${accion === 'suspender' ? 'suspendido' : 'activado'}`, accion === 'suspender' ? 'warning' : 'success');
        auditoria.registrar('docentes', `${accion}Docente`, 'OK', nombre);
        await cargarListaDocentes();
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
};

function abrirModalDocente(d = null, idx = null) {
  const modal    = document.getElementById('modalDocenteBackdrop');
  const isEdicion = !!d;
  setEl('modalDocenteTitle', isEdicion ? 'Editar docente' : 'Nuevo docente');
  document.getElementById('docNombre').value   = d?.Nombre   || d?.nombre   || '';
  document.getElementById('docApellido').value = d?.Apellido || d?.apellido || '';
  document.getElementById('docCorreo').value   = d?.Correo   || d?.correo   || '';
  document.getElementById('docRol').value      = d?.Rol      || d?.rol      || 'docente';
  document.getElementById('docEstado').value   = (d?.Activo===true||d?.Activo===1||d?.Activo==='TRUE') ? '1' : '0';
  document.getElementById('docObsAdmin').value = d?.ObservacionAdmin || d?.obs_admin || '';
  const cargaSection = document.getElementById('cargaSection');
  if (cargaSection) cargaSection.style.display = isEdicion ? '' : 'none';
  modal.classList.remove('hidden');

  document.getElementById('modalDocenteClose').onclick  = () => modal.classList.add('hidden');
  document.getElementById('modalDocenteCancel').onclick = () => modal.classList.add('hidden');
  document.getElementById('modalDocenteSave').onclick   = async () => {
    const btn = document.getElementById('modalDocenteSave');
    btn.classList.add('loading');
    try {
      const payload = {
        action:    isEdicion ? 'adminActualizarDocente' : 'adminGuardarDocente',
        correo:    ADMIN.sesion.correo,
        nombre:    document.getElementById('docNombre').value.trim(),
        apellido:  document.getElementById('docApellido').value.trim(),
        correoDoc: document.getElementById('docCorreo').value.trim(),
        rol:       document.getElementById('docRol').value,
        activo:    document.getElementById('docEstado').value === '1',
        obsAdmin:  document.getElementById('docObsAdmin').value.trim(),
      };
      if (isEdicion) payload.docenteId = d?.ID||d?.id||d?.DOCENTE_ID;
      await apiCitasPost(payload);
      toast(isEdicion ? 'Docente actualizado' : 'Docente creado', 'success');
      auditoria.registrar('docentes', isEdicion ? 'editarDocente' : 'crearDocente', 'OK', payload.nombre);
      modal.classList.add('hidden');
      await cargarListaDocentes();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
      auditoria.registrar('docentes', 'guardarDocente', 'ERROR', e.message);
    } finally { btn.classList.remove('loading'); }
  };
}

// ══════════════════════════════════════════════════════════════════
// 11. HORARIOS
// ══════════════════════════════════════════════════════════════════

async function cargarHorarios() {
  auditoria.registrar('horarios', 'abrirHorarios', 'OK');
  const btnAbrir   = document.getElementById('btnAbrirHorarios');
  const btnCerrar  = document.getElementById('btnCerrarHorarios');
  const btnGuardar = document.getElementById('btnGuardarHorariosGlobal');

  if (btnAbrir && !btnAbrir._bound) {
    btnAbrir.addEventListener('click', () => document.getElementById('horariosGlobalForm')?.classList.remove('hidden'));
    btnAbrir._bound = true;
  }
  if (btnCerrar && !btnCerrar._bound) {
    btnCerrar.addEventListener('click', cerrarHorariosGlobal);
    btnCerrar._bound = true;
  }
  if (btnGuardar && !btnGuardar._bound) {
    btnGuardar.addEventListener('click', guardarHorariosGlobal);
    btnGuardar._bound = true;
  }

  await cargarEstadoHorarios();
  await cargarSolicitudesHorarios();
  await cargarDocentesHorarios();
}

async function cargarEstadoHorarios() {
  try {
    const res     = await apiCitasPost({ action: 'estadoPermisoHorarios', correo: ADMIN.sesion.correo });
    const estado  = res?.estado || {};
    const abierto = estado.abierto_global === true || estado.abierto_global === 'TRUE';
    const dot     = document.getElementById('horariosStatusDot');
    if (dot) dot.className = `status-dot ${abierto ? 'online' : 'offline'}`;
    setEl('horariosStatusLabel', abierto ? 'Edición global abierta' : 'Edición global cerrada');
    if (estado.fecha_inicio || estado.fecha_fin) {
      setEl('horariosGlobalMeta', `Desde: ${estado.fecha_inicio||'—'} · Hasta: ${estado.fecha_fin||'—'}${estado.motivo ? ' · '+estado.motivo : ''}`);
    }
  } catch { setEl('horariosStatusLabel', 'No se pudo obtener el estado'); }
}

async function cargarSolicitudesHorarios() {
  const tbody = document.getElementById('solicitudesHorariosBody');
  if (!tbody) return;
  try {
    const res         = await apiCitasPost({ action: 'listarSolicitudesHorario', correo: ADMIN.sesion.correo });
    const solicitudes = res?.solicitudes || [];
    tbody.innerHTML = solicitudes.length
      ? solicitudes.map(s => `<tr>
          <td><strong>${esc(s.NOMBRE||s.nombre||s.CORREO||s.correo||'—')}</strong></td>
          <td>${esc(s.CORREO||s.correo||'—')}</td>
          <td>${formatFechaHora(s.FECHA_SOLICITUD||s.fecha_solicitud)}</td>
          <td>${esc(s.MOTIVO||s.motivo||'—')}</td>
          <td><span class="badge ${badgeSolicitud(s.ESTADO||s.estado)}">${esc(s.ESTADO||s.estado||'Pendiente')}</span></td>
          <td>${(s.ESTADO||s.estado||'Pendiente')==='Pendiente' ? `
            <button class="btn btn-success btn-sm" onclick="revisarSolicitudHorario('${esc(s.ID||s.id||'')}',true)">Aprobar</button>
            <button class="btn btn-danger btn-sm"  onclick="revisarSolicitudHorario('${esc(s.ID||s.id||'')}',false)">Rechazar</button>
          ` : '—'}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-tertiary)">Sin solicitudes pendientes</td></tr>';
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:12px;color:var(--color-red);font-size:.76rem">Error al cargar solicitudes</td></tr>';
  }
}

async function cargarDocentesHorarios() {
  const lista = document.getElementById('docentesHorariosList');
  if (!lista) return;
  try {
    const res     = await apiCitasPost({ action: 'docentes', correo: ADMIN.sesion.correo });
    const docsRaw = Array.isArray(res) ? res : (res?.docentes || res?.data || []);
    const docs    = docsRaw.filter(d => d.Activo === true || d.Activo === 1 || d.Activo === 'TRUE' || d.activo === true);
    lista.innerHTML = docs.map(d => {
      const nombre = `${d.Nombre||''} ${d.Apellido||''}`.trim();
      const correo = d.Correo || d.correo || '';
      const id     = d.ID     || d.id     || '';
      return `<div class="docente-horario-row">
        <div style="flex:1">
          <div class="docente-horario-name">${esc(nombre)}</div>
          <div class="docente-horario-email">${esc(correo)}</div>
        </div>
        <button class="btn btn-success btn-sm" onclick="habilitarDocente('${esc(id)}','${esc(nombre)}')">Habilitar</button>
        <button class="btn btn-danger btn-sm"  onclick="bloquearDocente('${esc(id)}','${esc(nombre)}')">Bloquear</button>
      </div>`;
    }).join('') || '<div style="padding:16px;color:var(--text-tertiary);font-size:.78rem">Sin docentes activos</div>';
  } catch {
    lista.innerHTML = '<div style="padding:12px;color:var(--color-red);font-size:.76rem">Error al cargar docentes</div>';
  }
}

async function guardarHorariosGlobal() {
  const desde  = document.getElementById('horariosDesde')?.value;
  const hasta  = document.getElementById('horariosHasta')?.value;
  const motivo = document.getElementById('horariosMotivo')?.value;
  const btn    = document.getElementById('btnGuardarHorariosGlobal');
  btn.classList.add('loading');
  try {
    await apiCitasPost({ action: 'actualizarPermisoHorariosGlobal', correo: ADMIN.sesion.correo, abierto: true, fecha_inicio: desde, fecha_fin: hasta, motivo });
    toast('Apertura global de horarios configurada', 'success');
    auditoria.registrar('horarios', 'abrirHorariosGlobal', 'OK');
    document.getElementById('horariosGlobalForm')?.classList.add('hidden');
    await cargarEstadoHorarios();
  } catch (e) { toast('Error: ' + e.message, 'error'); }
  finally { btn.classList.remove('loading'); }
}

async function cerrarHorariosGlobal() {
  confirmar('Cerrar edición de horarios', '¿Cerrar la edición global de horarios para todos los docentes?', async () => {
    try {
      await apiCitasPost({ action: 'actualizarPermisoHorariosGlobal', correo: ADMIN.sesion.correo, abierto: false });
      toast('Edición de horarios cerrada', 'warning');
      auditoria.registrar('horarios', 'cerrarHorariosGlobal', 'OK');
      await cargarEstadoHorarios();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  });
}

window.habilitarDocente = function (id, nombre) {
  confirmar('Habilitar horarios', `¿Habilitar edición de horarios para <strong>${esc(nombre)}</strong>?`, async () => {
    try {
      await apiCitasPost({ action: 'habilitarHorarioDocente', correo: ADMIN.sesion.correo, docenteId: id });
      toast(`Horarios habilitados para ${nombre}`, 'success');
      auditoria.registrar('horarios', 'habilitarDocente', 'OK', nombre);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  });
};

window.bloquearDocente = function (id, nombre) {
  confirmar('Bloquear horarios', `¿Bloquear edición de horarios para <strong>${esc(nombre)}</strong>?`, async () => {
    try {
      await apiCitasPost({ action: 'bloquearHorarioDocente', correo: ADMIN.sesion.correo, docenteId: id });
      toast(`Horarios bloqueados para ${nombre}`, 'warning');
      auditoria.registrar('horarios', 'bloquearDocente', 'OK', nombre);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  });
};

window.revisarSolicitudHorario = function (id, aprobado) {
  confirmar(aprobado ? 'Aprobar solicitud' : 'Rechazar solicitud',
    `¿Confirmas que deseas ${aprobado ? 'aprobar' : 'rechazar'} esta solicitud de cambio de horario?`,
    async () => {
      try {
        await apiCitasPost({ action: 'revisarSolicitudCambioHorario', correo: ADMIN.sesion.correo, solicitudId: id, aprobado });
        toast(aprobado ? 'Solicitud aprobada' : 'Solicitud rechazada', aprobado ? 'success' : 'warning');
        auditoria.registrar('horarios', 'revisarSolicitud', 'OK', id);
        cargarSolicitudesHorarios();
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
};

// ══════════════════════════════════════════════════════════════════
// 12. ESTADÍSTICAS
// ══════════════════════════════════════════════════════════════════

async function cargarEstadisticas() {
  auditoria.registrar('estadisticas', 'abrirEstadisticas', 'OK');
  if (!window.Chart) { toast('Chart.js no disponible', 'error'); return; }

  Object.keys(ADMIN.charts).forEach(k => {
    if (k !== 'planeacionesMini' && ADMIN.charts[k]) {
      ADMIN.charts[k].destroy();
      delete ADMIN.charts[k];
    }
  });

  const selP = document.getElementById('statsPeriodo');
  if (selP && !selP._bound) { selP.addEventListener('change', cargarEstadisticas); selP._bound = true; }

  try {
    const [resP, resC] = await Promise.allSettled([
      apiPlaneacionesGet('adminStatsPlaneaciones', { correo: ADMIN.sesion.correo, periodo: selP?.value || '' }),
      apiCitasPost({ action: 'adminStatsCitas', correo: ADMIN.sesion.correo }),
    ]);

    const statsP = resP.status === 'fulfilled' ? resP.value : null;
    const statsC = resC.status === 'fulfilled' ? resC.value : null;

    if (statsP?.periodos?.length && selP) {
      const val = selP.value;
      selP.innerHTML = '<option value="">Todo el periodo</option>' +
        statsP.periodos.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
      if (val) selP.value = val;
    }

    const estados    = statsP?.por_estado    || { Aprobada: 0, 'Por revisar': 0, 'Con ajustes': 0, 'No enviada': 0, Publicada: 0 };
    const docPct     = statsP?.por_docente   || [];
    const gradoPct   = statsP?.por_grado     || [];
    const citasMes   = statsC?.por_mes       || [];
    const citasDia   = statsC?.por_dia       || [];
    const rankAjustes= statsP?.ranking_ajustes || [];

    const ctxEst = document.getElementById('chartEstados');
    if (ctxEst) {
      ADMIN.charts.estados = new Chart(ctxEst, {
        type: 'doughnut',
        data: {
          labels: Object.keys(estados),
          datasets: [{
            data: Object.values(estados),
            backgroundColor: ['#22c55e','#a855f7','#FFCC00','#ef4444','#3b82f6'],
            borderColor: '#141416', borderWidth: 3, hoverOffset: 8,
          }]
        },
        options: {
          responsive: true, cutout: '62%',
          animation: { animateScale: true, duration: 900 },
          plugins: {
            legend: { position: 'bottom', labels: { color: '#a1a1aa', font: { family: 'Sora', size: 11 }, padding: 10 } },
            tooltip: { titleFont: { family: 'Sora' }, bodyFont: { family: 'Sora' } },
          },
        }
      });
    }

    const ctxDoc = document.getElementById('chartDocentes');
    if (ctxDoc && docPct.length) {
      const top = docPct.slice(0, 12);
      ADMIN.charts.docentes = new Chart(ctxDoc, {
        type: 'bar',
        data: {
          labels: top.map(d => d.nombre),
          datasets: [{
            label: '% Cumplimiento',
            data: top.map(d => d.pct),
            backgroundColor: top.map(d => d.pct >= 80 ? 'rgba(34,197,94,0.7)' : d.pct >= 50 ? 'rgba(255,204,0,0.7)' : 'rgba(239,68,68,0.7)'),
            borderRadius: 6, borderSkipped: false,
          }]
        },
        options: {
          indexAxis: 'y', responsive: true,
          animation: { duration: 900 },
          plugins: { legend: { display: false }, tooltip: { titleFont: { family: 'Sora' }, bodyFont: { family: 'Sora' } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa', font: { family: 'Sora', size: 11 } }, max: 100 },
            y: { grid: { display: false }, ticks: { color: '#f5f5f7', font: { family: 'Sora', size: 11 } } },
          },
        }
      });
    }

    const ctxMes = document.getElementById('chartCitasMes');
    if (ctxMes && citasMes.length) {
      ADMIN.charts.citasMes = new Chart(ctxMes, {
        type: 'line',
        data: {
          labels: citasMes.map(m => m.mes),
          datasets: [{
            label: 'Citas', data: citasMes.map(m => m.total),
            borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)',
            borderWidth: 2, pointBackgroundColor: '#3b82f6', pointRadius: 4, tension: 0.4, fill: true,
          }]
        },
        options: {
          responsive: true, animation: { duration: 900 },
          plugins: { legend: { display: false }, tooltip: { titleFont: { family: 'Sora' }, bodyFont: { family: 'Sora' } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa', font: { family: 'Sora', size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa', font: { family: 'Sora', size: 11 } } },
          },
        }
      });
    }

    const ctxDia = document.getElementById('chartCitasDia');
    if (ctxDia && citasDia.length) {
      ADMIN.charts.citasDia = new Chart(ctxDia, {
        type: 'bar',
        data: {
          labels: citasDia.map(d => d.dia),
          datasets: [{ label: 'Citas', data: citasDia.map(d => d.total), backgroundColor: 'rgba(168,85,247,0.7)', borderRadius: 6, borderSkipped: false }]
        },
        options: {
          responsive: true, animation: { duration: 900 },
          plugins: { legend: { display: false }, tooltip: { titleFont: { family: 'Sora' }, bodyFont: { family: 'Sora' } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#a1a1aa', font: { family: 'Sora', size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa', font: { family: 'Sora', size: 11 } } },
          },
        }
      });
    }

    const ctxGrad = document.getElementById('chartGrados');
    if (ctxGrad && gradoPct.length) {
      ADMIN.charts.grados = new Chart(ctxGrad, {
        type: 'bar',
        data: {
          labels: gradoPct.map(g => g.grado),
          datasets: [{ label: '% Cumplimiento', data: gradoPct.map(g => g.pct), backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 6, borderSkipped: false }]
        },
        options: {
          responsive: true, animation: { duration: 900 },
          plugins: { legend: { display: false }, tooltip: { titleFont: { family: 'Sora' }, bodyFont: { family: 'Sora' } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#a1a1aa', font: { family: 'Sora', size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa', font: { family: 'Sora', size: 11 } }, max: 100 },
          },
        }
      });
    }

    const ranking = document.getElementById('rankingAjustes');
    if (ranking) {
      ranking.innerHTML = rankAjustes.slice(0, 8).map((r, i) => `
        <div class="ranking-item">
          <span class="ranking-pos">${i + 1}</span>
          <span class="ranking-name">${esc(r.nombre)}</span>
          <span class="ranking-value">${esc(r.total)}</span>
        </div>`).join('') || '<div style="color:var(--text-tertiary);font-size:.78rem;padding:12px">Sin datos</div>';
    }

  } catch (err) {
    toast('Error al cargar estadísticas', 'error');
    auditoria.registrar('estadisticas', 'cargarEstadisticas', 'ERROR', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// 13. CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════

async function cargarConfiguracion() {
  auditoria.registrar('configuracion', 'abrirConfiguracion', 'OK');
  const btnGuardar = document.getElementById('btnGuardarConfig');
  if (btnGuardar && !btnGuardar._bound) {
    btnGuardar.addEventListener('click', guardarConfiguracionCompleta);
    btnGuardar._bound = true;
  }

  [
    ['cfgAgendaAbierta',   'cfgAgendaLabel',           'Abierta',  'Cerrada'],
    ['cfgAutoPublicacion', 'cfgAutoPublicacionLabel',   'Activa',   'Inactiva'],
    ['cfgNotifAprobacion', 'cfgNotifAprobacionLabel',   'Activa',   'Inactiva'],
    ['cfgNotifAjustes',    'cfgNotifAjustesLabel',      'Activa',   'Inactiva'],
    ['cfgMantenimiento',   'cfgMantenimientoLabel',     'Activo',   'Inactivo'],
    ['cfgAuditoria',       'cfgAuditoriaLabel',         'Activa',   'Inactiva'],
  ].forEach(([inputId, labelId, onText, offText]) => {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (input && label && !input._bound) {
      input.addEventListener('change', () => { label.textContent = input.checked ? onText : offText; });
      input._bound = true;
    }
  });

  await cargarDatosConfiguracion();
}

async function cargarDatosConfiguracion() {
  try {
    const [resC, resP] = await Promise.allSettled([
      apiCitasPost({ action: 'config', correo: ADMIN.sesion.correo }),
      apiPlaneacionesGet('adminConfigPublicacion', { correo: ADMIN.sesion.correo }),
    ]);

    const cfgC = resC.status === 'fulfilled' ? (resC.value?.config || resC.value || {}) : {};
    const cfgP = resP.status === 'fulfilled' ? (resP.value?.config || {}) : {};

    setInput('cfgDuracion',    cfgC.duracionCita       || cfgC.DURACION_CITA       || '');
    setInput('cfgMinHoras',    cfgC.horasAntes         || cfgC.HORAS_ANTES         || '');
    setInput('cfgMaxDias',     cfgC.diasAdelanto       || cfgC.DIAS_ADELANTO       || '');
    setInput('cfgCorreoCoord', cfgC.correoCoordinacion || cfgC.CORREO_COORDINACION || '');

    const agendaAbierta = cfgC.agendaAbierta === 'TRUE' || cfgC.agendaAbierta === true || cfgC.AGENDA_ABIERTA === 'TRUE';
    setCheckbox('cfgAgendaAbierta', agendaAbierta);
    setEl('cfgAgendaLabel', agendaAbierta ? 'Abierta' : 'Cerrada');

    setInput('cfgPeriodo',         cfgP.periodo_actual   || '');
    setInput('cfgSemana',          cfgP.semana_actual    || '');
    setInput('cfgUmbralFaltantes', cfgP.umbral_faltantes || '3');
    setInput('cfgCorreosAlertas',  cfgP.correos_alertas  || '');

    const autoPublic = cfgP.auto_publicacion === 'TRUE' || cfgP.auto_publicacion === true;
    setCheckbox('cfgAutoPublicacion', autoPublic);
    setEl('cfgAutoPublicacionLabel', autoPublic ? 'Activa' : 'Inactiva');

    const notifAprob = cfgP.notificar_aprobacion === 'TRUE' || cfgP.notificar_aprobacion === true;
    setCheckbox('cfgNotifAprobacion', notifAprob);
    setEl('cfgNotifAprobacionLabel', notifAprob ? 'Activa' : 'Inactiva');

    const notifAjust = cfgP.notificar_ajustes === 'TRUE' || cfgP.notificar_ajustes === true;
    setCheckbox('cfgNotifAjustes', notifAjust);
    setEl('cfgNotifAjustesLabel', notifAjust ? 'Activa' : 'Inactiva');

    const mantenim = cfgC.ADMIN_MODO_MANTENIMIENTO === 'TRUE' || cfgC.admin_modo_mantenimiento === true;
    setCheckbox('cfgMantenimiento', mantenim);
    setEl('cfgMantenimientoLabel', mantenim ? 'Activo' : 'Inactivo');
    setInput('cfgMsgMantenimiento', cfgC.ADMIN_MENSAJE_MANTENIMIENTO || cfgC.admin_mensaje_mantenimiento || '');

    const auditExt = cfgC.ADMIN_AUDITORIA_EXTENDIDA === 'TRUE' || cfgC.admin_auditoria_extendida === true;
    setCheckbox('cfgAuditoria', auditExt);
    setEl('cfgAuditoriaLabel', auditExt ? 'Activa' : 'Inactiva');

    setInput('cfgExpiracion', cfgC.ADMIN_TIEMPO_EXPIRACION_SESION || cfgC.admin_tiempo_expiracion_sesion || '14');

    ADMIN.cache.config = { cfgC, cfgP };
  } catch (err) {
    toast('Error al cargar configuración', 'error');
    auditoria.registrar('configuracion', 'cargarConfig', 'ERROR', err.message);
  }
}

async function guardarConfiguracionCompleta() {
  const btn = document.getElementById('btnGuardarConfig');
  btn.classList.add('loading');
  try {
    const cfgCitas = {
      action: 'actualizarConfig',
      correo: ADMIN.sesion.correo,
      duracionCita:                   getInput('cfgDuracion'),
      horasAntes:                     getInput('cfgMinHoras'),
      diasAdelanto:                   getInput('cfgMaxDias'),
      correoCoordinacion:             getInput('cfgCorreoCoord'),
      agendaAbierta:                  getCheckbox('cfgAgendaAbierta') ? 'TRUE' : 'FALSE',
      ADMIN_MODO_MANTENIMIENTO:       getCheckbox('cfgMantenimiento') ? 'TRUE' : 'FALSE',
      ADMIN_MENSAJE_MANTENIMIENTO:    getInput('cfgMsgMantenimiento'),
      ADMIN_AUDITORIA_EXTENDIDA:      getCheckbox('cfgAuditoria') ? 'TRUE' : 'FALSE',
      ADMIN_TIEMPO_EXPIRACION_SESION: getInput('cfgExpiracion'),
    };

    const cfgPln = {
      accion: 'guardarConfigPublicacion',
      correo: ADMIN.sesion.correo,
      periodo_actual:       getInput('cfgPeriodo'),
      semana_actual:        getInput('cfgSemana'),
      auto_publicacion:     getCheckbox('cfgAutoPublicacion') ? 'TRUE' : 'FALSE',
      umbral_faltantes:     getInput('cfgUmbralFaltantes'),
      correos_alertas:      getInput('cfgCorreosAlertas'),
      notificar_aprobacion: getCheckbox('cfgNotifAprobacion') ? 'TRUE' : 'FALSE',
      notificar_ajustes:    getCheckbox('cfgNotifAjustes')    ? 'TRUE' : 'FALSE',
    };

    await Promise.all([ apiCitasPost(cfgCitas), apiPlaneacionesPost(cfgPln) ]);
    toast('Configuración guardada correctamente', 'success');
    auditoria.registrar('configuracion', 'guardarConfig', 'OK');
    ADMIN.cache.config = null;
  } catch (err) {
    toast('Error al guardar configuración: ' + err.message, 'error');
    auditoria.registrar('configuracion', 'guardarConfig', 'ERROR', err.message);
  } finally { btn.classList.remove('loading'); }
}

// ══════════════════════════════════════════════════════════════════
// 14. ALERTAS
// ══════════════════════════════════════════════════════════════════

async function cargarAlertas() {
  auditoria.registrar('alertas', 'abrirAlertas', 'OK');

  const filtro = document.getElementById('alertasFiltro');
  if (filtro && !filtro._bound) { filtro.addEventListener('change', renderAlertasFiltradas); filtro._bound = true; }

  const btnMarcar = document.getElementById('btnMarcarTodasVistas');
  if (btnMarcar && !btnMarcar._bound) {
    btnMarcar.addEventListener('click', () => {
      document.querySelectorAll('.alerta-item').forEach(el => el.classList.add('vista'));
      ADMIN.cache.alertas?.forEach(a => { a._vista = true; });
      toast('Todas las alertas marcadas como vistas', 'info');
    });
    btnMarcar._bound = true;
  }

  const lista = document.getElementById('alertasList');
  lista.innerHTML = '<div class="activity-skeleton" style="height:60px;border-radius:12px;margin-bottom:8px"></div>'.repeat(5);

  const alertas = await construirAlertas();
  ADMIN.cache.alertas = alertas;
  renderAlertasLista(alertas);
}

async function construirAlertas() {
  const alertas = [];
  try {
    const kpis = ADMIN.cache.kpis;
    if (kpis) {
      const ajustes    = parseInt(kpis.plnAjustes)    || 0;
      const revisar    = parseInt(kpis.plnRevisar)    || 0;
      const noEnviadas = parseInt(kpis.plnNoEnviadas) || 0;
      const cierres    = parseInt(kpis.citasCierres)  || 0;
      const incompl    = parseInt(kpis.docIncompletos)|| 0;

      if (ajustes)    alertas.push({ nivel:'advertencia', titulo:`${ajustes} planeaciones con ajustes`, desc:'Docentes pendientes de corregir', modulo:'planeaciones', filtro:'ajustes', ts: new Date() });
      if (revisar)    alertas.push({ nivel:'advertencia', titulo:`${revisar} planeaciones por revisar`, desc:'Requieren revisión del coordinador', modulo:'planeaciones', filtro:'por-revisar', ts: new Date() });
      if (noEnviadas) alertas.push({ nivel:'critica',     titulo:`${noEnviadas} planeaciones no enviadas`, desc:'Docentes sin entregar planeación', modulo:'planeaciones', filtro:'no-enviadas', ts: new Date() });
      if (cierres)    alertas.push({ nivel:'advertencia', titulo:`${cierres} solicitudes de cierre pendientes`, desc:'Revisar en módulo de citas', modulo:'citas', filtro:'cierres', ts: new Date() });
      if (incompl)    alertas.push({ nivel:'critica',     titulo:`${incompl} docentes sin planeación`, desc:'Incumplimiento de entrega', modulo:'docentes', ts: new Date() });
    }
    try {
      const resLog = await apiCitasPost({ action: 'obtenerLog', correo: ADMIN.sesion.correo, limite: 20 });
      const logs   = resLog?.logs || [];
      const errores = logs.filter(l => (l.Tipo||l.tipo||'').toLowerCase() === 'error');
      if (errores.length) {
        alertas.push({ nivel:'critica', titulo:`${errores.length} error${errores.length!==1?'es':''} recientes en el sistema`, desc: esc(errores[0].Descripcion||errores[0].descripcion||'Ver logs'), modulo:'logs', ts: new Date(errores[0].Timestamp||errores[0].timestamp) });
      }
    } catch { /* silenciar */ }
  } catch (err) { console.warn('[SIPRESC] Error construyendo alertas:', err.message); }

  return alertas.sort((a, b) => ({ critica: 0, advertencia: 1, info: 2 }[a.nivel]??2) - ({ critica: 0, advertencia: 1, info: 2 }[b.nivel]??2));
}

function renderAlertasLista(alertas) {
  const lista = document.getElementById('alertasList');
  if (!alertas.length) {
    lista.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-tertiary)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;margin:0 auto 12px;opacity:.3"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <p style="font-size:.82rem">Sin alertas activas</p>
    </div>`;
    return;
  }
  const iconos = {
    critica:     `<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>`,
    advertencia: `<path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/>`,
    info:        `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>`,
  };
  lista.innerHTML = alertas.map((a, i) => {
    const colorIcon = a.nivel === 'critica' ? 'var(--color-red)' : a.nivel === 'advertencia' ? 'var(--color-yellow)' : 'var(--color-blue)';
    return `<div class="alerta-item ${a.nivel}${a._vista?' vista':''}" data-idx="${i}">
      <svg class="alerta-icon" viewBox="0 0 24 24" fill="none" stroke="${colorIcon}" stroke-width="2">${iconos[a.nivel]||iconos.info}</svg>
      <div class="alerta-content">
        <div class="alerta-titulo">${esc(a.titulo)}</div>
        <div class="alerta-desc">${esc(a.desc)}</div>
        <div class="alerta-time">${formatHace(a.ts)}</div>
      </div>
      <div class="alerta-actions">
        ${a.modulo ? `<button class="btn btn-ghost btn-sm" onclick="navegarA('${a.modulo}'${a.filtro?`,'${a.filtro}'`:''})" style="white-space:nowrap">Ver módulo</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="this.closest('.alerta-item').classList.add('vista')">Marcar vista</button>
      </div>
    </div>`;
  }).join('');
}

function renderAlertasFiltradas() {
  const filtro   = document.getElementById('alertasFiltro')?.value || '';
  const alertas  = ADMIN.cache.alertas || [];
  renderAlertasLista(filtro ? alertas.filter(a => a.nivel === filtro) : alertas);
}

// ══════════════════════════════════════════════════════════════════
// 15. AUDITORÍA
// ══════════════════════════════════════════════════════════════════

async function cargarAuditoria() {
  auditoria.registrar('auditoria', 'abrirAuditoria', 'OK');

  configurarTabs('auditTabs', tab => {
    document.getElementById('auditTimeline').classList.toggle('hidden', tab !== 'timeline');
    document.getElementById('auditTabla').classList.toggle('hidden', tab !== 'tabla');
  });

  const btnBuscar = document.getElementById('btnBuscarAudit');
  if (btnBuscar && !btnBuscar._bound) {
    btnBuscar.addEventListener('click', ejecutarBusquedaAuditoria);
    btnBuscar._bound = true;
  }

  await ejecutarBusquedaAuditoria();
}

async function ejecutarBusquedaAuditoria() {
  const params = {
    correo:    ADMIN.sesion.correo,
    buscar:    document.getElementById('auditBuscar')?.value    || '',
    rol:       document.getElementById('auditRol')?.value       || '',
    resultado: document.getElementById('auditResultado')?.value || '',
    fecha_ini: document.getElementById('auditDesde')?.value     || '',
    fecha_fin: document.getElementById('auditHasta')?.value     || '',
  };

  const timelineEl = document.getElementById('auditTimeline');
  timelineEl.innerHTML = '<div class="activity-skeleton" style="height:80px;border-radius:12px;margin-bottom:12px"></div>'.repeat(4);

  try {
    const res     = await apiCitasPost({ action: 'obtenerAuditoria', ...params });
    const eventos = res?.eventos || [];
    ADMIN.cache.auditoria = eventos;

    if (!eventos.length) {
      timelineEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-tertiary);font-size:.82rem">Sin eventos para los filtros seleccionados</div>';
      document.getElementById('auditTableBody').innerHTML = '';
      return;
    }

    const porUsuario = {};
    eventos.forEach(e => {
      const key = e.CORREO || e.correo || 'desconocido';
      if (!porUsuario[key]) porUsuario[key] = { nombre: e.NOMBRE||e.nombre||key, correo: key, eventos: [] };
      porUsuario[key].eventos.push(e);
    });

    timelineEl.innerHTML = Object.values(porUsuario).map(u => `
      <div class="audit-user-group">
        <div class="audit-user-header">
          <div class="pln-docente-avatar" style="width:28px;height:28px;font-size:.62rem">${esc(iniciales(u.nombre))}</div>
          <div class="audit-user-name">${esc(u.nombre)}</div>
          <div class="audit-user-email">${esc(u.correo)}</div>
          <span class="audit-user-count">${u.eventos.length} evento${u.eventos.length!==1?'s':''}</span>
        </div>
        <div class="audit-events">
          ${u.eventos.map(e => {
            const res = (e.RESULTADO||e.resultado||'OK').toUpperCase();
            const cls = res === 'OK' ? 'ok' : res === 'WARN' ? 'warn' : 'error';
            return `<div class="audit-event ${cls}">
              <span class="audit-event-time">${formatHora(e.TIMESTAMP||e.timestamp)}</span>
              <span class="audit-event-modulo">${esc(e.MODULO||e.modulo||'—')}</span>
              <span class="audit-event-accion">${esc(e.ACCION||e.accion_evento||e.accion||'—')}${e.DETALLE||e.detalle ? ` — <em style="color:var(--text-tertiary)">${esc(e.DETALLE||e.detalle)}</em>` : ''}</span>
              <span class="audit-event-result ${cls}">${res}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`).join('');

    document.getElementById('auditTableBody').innerHTML = eventos.map(e => {
      const res = (e.RESULTADO||e.resultado||'OK').toUpperCase();
      const cls = res === 'OK' ? 'badge-green' : res === 'WARN' ? 'badge-yellow' : 'badge-red';
      return `<tr>
        <td style="font-size:.72rem;font-family:'JetBrains Mono',monospace">${formatFechaHora(e.TIMESTAMP||e.timestamp)}</td>
        <td><strong>${esc(e.NOMBRE||e.nombre||e.CORREO||e.correo||'—')}</strong><div style="font-size:.66rem;color:var(--text-tertiary)">${esc(e.CORREO||e.correo||'')}</div></td>
        <td><span class="badge ${badgeRol(e.ROL||e.rol)}">${esc(e.ROL||e.rol||'—')}</span></td>
        <td>${esc(e.MODULO||e.modulo||'—')}</td>
        <td>${esc(e.ACCION||e.accion_evento||e.accion||'—')}</td>
        <td><span class="badge ${cls}">${res}</span></td>
        <td style="font-size:.72rem;color:var(--text-tertiary);max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(e.DETALLE||e.detalle||'')}</td>
      </tr>`;
    }).join('');

  } catch (err) {
    timelineEl.innerHTML = `<div style="padding:16px;color:var(--color-red);font-size:.78rem">Error: ${err.message}</div>`;
    auditoria.registrar('auditoria', 'buscarAuditoria', 'ERROR', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// 16. LOGS
// ══════════════════════════════════════════════════════════════════

async function cargarLogs() {
  auditoria.registrar('logs', 'abrirLogs', 'OK');

  const fuente = document.getElementById('logsFuente');
  const btnRef = document.getElementById('btnRefreshLogs');
  const buscar = document.getElementById('logsBuscar');

  if (fuente && !fuente._bound) { fuente.addEventListener('change', actualizarLogs); fuente._bound = true; }
  if (btnRef && !btnRef._bound) { btnRef.addEventListener('click', actualizarLogs);  btnRef._bound = true; }
  if (buscar && !buscar._bound) { buscar.addEventListener('input', debounce(filtrarLogsUI, 300)); buscar._bound = true; }

  await actualizarLogs();
}

async function actualizarLogs() {
  const terminal = document.getElementById('logsTerminal');
  const fuente   = document.getElementById('logsFuente')?.value || 'citas';
  terminal.innerHTML = '<div class="logs-loading">Cargando logs...</div>';

  try {
    let logs = [];
    if (fuente === 'citas') {
      const res = await apiCitasPost({ action: 'obtenerLog', correo: ADMIN.sesion.correo });
      logs = res?.logs || res?.log || res?.data || [];
    } else {
      const res = await apiPlaneacionesGet('obtenerLog', { correo: ADMIN.sesion.correo });
      logs = res?.logs || res?.log || res?.data || [];
    }

    if (!logs.length) { terminal.innerHTML = '<div class="logs-loading">Sin logs disponibles</div>'; return; }

    terminal.innerHTML = logs.map(l => {
      const tipo = (l.Tipo||l.tipo||'info').toLowerCase();
      const ts   = l.Timestamp || l.timestamp || '';
      const desc = l.Descripcion || l.descripcion || l.mensaje || '';
      const usr  = l.Usuario || l.usuario || '';
      return `<div class="log-line ${tipo}" data-text="${esc((desc+usr).toLowerCase())}">
        <span class="log-time">${formatFechaHora(ts)}</span>
        <span class="log-type">[${tipo.toUpperCase()}]</span>
        ${esc(desc)}${usr ? ` <span style="color:var(--text-tertiary)">— ${esc(usr)}</span>` : ''}
      </div>`;
    }).join('');
    terminal.scrollTop = terminal.scrollHeight;

  } catch (err) {
    terminal.innerHTML = `<div class="logs-loading" style="color:var(--color-red)">Error: ${err.message}</div>`;
  }
}

function filtrarLogsUI() {
  const q = document.getElementById('logsBuscar')?.value?.toLowerCase() || '';
  document.querySelectorAll('#logsTerminal .log-line').forEach(el => {
    el.style.display = (!q || (el.dataset.text||'').includes(q)) ? '' : 'none';
  });
}

// ══════════════════════════════════════════════════════════════════
// 17. UI HELPERS — TOAST, MODAL, TABS, CONFIRM
// ══════════════════════════════════════════════════════════════════

function toast(msg, tipo = 'info', ms = 3500) {
  if (window.toast && window.toast !== toast) { window.toast(msg, tipo); return; }
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const iconos = {
    success: `<polyline points="20 6 9 17 4 12"/>`,
    error:   `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
    warning: `<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>`,
    info:    `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>`,
  };
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconos[tipo]||iconos.info}</svg><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('exit'); setTimeout(() => el.remove(), 300); }, ms);
}

function confirmar(titulo, htmlBody, onConfirm, labelConfirm = 'Confirmar', peligroso = true) {
  const backdrop   = document.getElementById('modalBackdrop');
  setEl('modalTitle', titulo);
  document.getElementById('modalBody').innerHTML = htmlBody;
  const btnConfirm = document.getElementById('modalConfirm');
  btnConfirm.textContent = labelConfirm;
  btnConfirm.className   = `btn ${peligroso ? 'btn-danger' : 'btn-primary'}`;
  backdrop.classList.remove('hidden');
  const cerrar = () => backdrop.classList.add('hidden');
  document.getElementById('modalClose').onclick  = cerrar;
  document.getElementById('modalCancel').onclick = cerrar;
  btnConfirm.onclick = () => { cerrar(); if (onConfirm) onConfirm(); };
}

function abrirModal(titulo, htmlBody, onConfirm = null, labelConfirm = 'Aceptar', mostrarConfirm = true) {
  const backdrop   = document.getElementById('modalBackdrop');
  setEl('modalTitle', titulo);
  document.getElementById('modalBody').innerHTML = htmlBody;
  const btnConfirm = document.getElementById('modalConfirm');
  const btnCancel  = document.getElementById('modalCancel');
  btnConfirm.textContent       = labelConfirm;
  btnConfirm.className         = 'btn btn-primary';
  btnConfirm.style.display     = mostrarConfirm ? '' : 'none';
  btnCancel.textContent        = mostrarConfirm ? 'Cancelar' : 'Cerrar';
  backdrop.classList.remove('hidden');
  const cerrar = () => backdrop.classList.add('hidden');
  document.getElementById('modalClose').onclick  = cerrar;
  document.getElementById('modalCancel').onclick = cerrar;
  btnConfirm.onclick = () => { cerrar(); if (onConfirm) onConfirm(); };
}

function configurarTabs(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container || container._tabsBound) return;
  container._tabsBound = true;
  const tabs = container.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (onChange) onChange(tab.dataset.tab);
    });
  });
  const activo = container.querySelector('.tab.active');
  if (activo && onChange) onChange(activo.dataset.tab);
}

// ══════════════════════════════════════════════════════════════════
// 18. HELPERS DE API (retrocompatibles con core.js)
// ══════════════════════════════════════════════════════════════════

async function apiCitasPost(payload) {
  const lecturas = new Set(['estadisticas','obtenerLog','sesionesActivasExtendidas','todasCitas','cierresPendientes','docentes','estadoPermisoHorarios','listarSolicitudesHorario','adminStatsCitas','config','obtenerAuditoria']);
  const ejecutar = async () => {
    if (window.api && typeof window.api === 'function') {
      const { action, ...rest } = payload;
      const data = await window.api(action, rest);
      if (data?.ok === false || data?.error) throw new Error(data.error || data.mensaje || 'La API rechazó la solicitud');
      return data;
    }
    const res = await fetch(ADMIN.API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };
  return lecturas.has(payload.action) ? peticionUnica_(`citas:${JSON.stringify(payload)}`, ejecutar) : ejecutar();
}

async function apiPlaneacionesGet(accion, params = {}) {
  const qs = new URLSearchParams({ accion, ...params }).toString();
  const url = `${ADMIN.API_PLN}?${qs}`;

  return peticionUnica_(`planeaciones:get:${url}`, async () => {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });

    const text = await res.text();

    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('La API de planeaciones no devolvió JSON válido.'); }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (data.ok === false) throw new Error(data.error || data.mensaje || 'La API respondió ok:false');

    if (data.error) throw new Error(data.error);
    return data;
  });
}

async function apiPlaneacionesPost(payload) {
  const res = await fetch(ADMIN.API_PLN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('La API de planeaciones no devolvió JSON válido.');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  if (data.ok === false) {
    throw new Error(data.error || data.mensaje || 'La API respondió ok:false');
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

function peticionUnica_(clave, ejecutar) {
  if (ADMIN.pendingRequests.has(clave)) return ADMIN.pendingRequests.get(clave);
  const promesa = Promise.resolve().then(ejecutar).finally(() => ADMIN.pendingRequests.delete(clave));
  ADMIN.pendingRequests.set(clave, promesa);
  return promesa;
}
// ══════════════════════════════════════════════════════════════════
// 19. HELPERS DE UI Y FORMATO
// ══════════════════════════════════════════════════════════════════

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function iniciales(nombre) {
  if (!nombre) return '?';
  return nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function formatHace(fecha) {
  if (!fecha) return '—';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return '—';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)    return 'ahora';
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

function formatFechaHora(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d)) return String(ts);
  return d.toLocaleString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function formatHora(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function colorEstado(estado) {
  estado = normalizarEstadoRevision(estado);

  const mapa = {
    'Con ajustes': 'var(--color-yellow)',
    'Por revisar': 'var(--color-purple)',
    'No enviada':  'var(--color-red)',
    'Recibida':    'var(--color-blue)',
    'Aprobada':    'var(--color-green)',
    'Publicada':   '#16a34a',
  };

  return mapa[estado] || 'var(--text-tertiary)';
}

function claseEstado(estado) {
  estado = normalizarEstadoRevision(estado);

  const mapa = {
    'Con ajustes': 'estado-ajustes',
    'Por revisar': 'estado-revisar',
    'No enviada':  'estado-noenviada',
    'Recibida':    'estado-recibida',
    'Aprobada':    'estado-aprobada',
    'Publicada':   'estado-publicada',
  };

  return mapa[estado] || 'estado-noenviada';
}

function badgeRol(rol) {
  return { admin: 'badge-purple', coordinador: 'badge-blue', docente: 'badge-gray' }[(rol||'').toLowerCase()] || 'badge-gray';
}

function badgeSolicitud(estado) {
  return { Pendiente: 'badge-yellow', Aprobada: 'badge-green', Rechazada: 'badge-red' }[estado] || 'badge-gray';
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}

function getInput(id)        { return document.getElementById(id)?.value?.trim() || ''; }
function setInput(id, val)   { const el = document.getElementById(id); if (el) el.value = val ?? ''; }
function getCheckbox(id)     { return document.getElementById(id)?.checked || false; }
function setCheckbox(id, val){ const el = document.getElementById(id); if (el) el.checked = !!val; }

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ══════════════════════════════════════════════════════════════════
// 20. PWA — SERVICE WORKER
// ══════════════════════════════════════════════════════════════════

function registrarServiceWorker() {
  const pwaHabilitada = Boolean(document.querySelector('link[rel="manifest"]'));
  if (pwaHabilitada && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.admin.js').catch(() => {});
  }
}

// ══════════════════════════════════════════════════════════════════
// FIN DE dashboardadmin.js
// ══════════════════════════════════════════════════════════════════
