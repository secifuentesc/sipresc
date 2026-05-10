/**
 * mis-planeaciones.js  —  SIPRESC
 * Vista docente: mis planeaciones por período y semana
 *
 * Acciones requeridas en el backend (Google Apps Script):
 *
 *   misPlaneacionesDocente
 *     Recibe:   { docenteId, correo, periodo }
 *     Devuelve: array de planeaciones del docente (ver estructura abajo)
 *     Seguridad: validar que docenteId + correo correspondan al mismo docente
 *
 *   reenviarPlaneacionDocente
 *     Recibe:   { planeacionId, docenteId, correo, datosCorregidos }
 *     Devuelve: { ok: true } o { ok: false, mensaje: '...' }
 *     Seguridad: validar que la planeación pertenezca al docente
 */

'use strict';

/* ══════════════════════════════════════
   CONSTANTES
══════════════════════════════════════ */
const API = '/api/planeaciones';
const RUTA_HOME  = '/';

/**
 * CALENDARIO DE PERÍODOS
 * Cada período tiene 10 semanas.
 * Referencia: Período 2, Semana 6 inicia sábado 2026-05-09 (Colombia UTC-5).
 * Las semanas cambian cada sábado.
 *
 * Para ajustar el calendario real, editar PERIODOS_CONFIG.
 * La clave periodoActivo y semanaBase deben actualizarse cada período.
 */
const INICIO_P2_S6 = new Date('2026-05-09T00:00:00-05:00'); // sábado 9 mayo 2026

/**
 * Calcula el inicio de una semana dada en el período 2.
 * semana 6 = índice 0 (semana base de referencia).
 * Cada semana son 7 días.
 */
function inicioSemanaP2(numSemana) {
  const offset = (numSemana - 6) * 7;
  const d = new Date(INICIO_P2_S6);
  d.setDate(d.getDate() + offset);
  return d;
}

/**
 * Retorna el inicio de cada período como la semana 1 del mismo.
 * Período 1: antes de P2. Período 3: después de P2.
 * Para el MVP, el cálculo exacto de P1, P3, P4 puede completarse
 * con las fechas reales del calendario institucional.
 */
function inicioSemana(periodo, numSemana) {
  // Período 2 tiene lógica exacta; los demás usan estimaciones.
  if (periodo === 2) return inicioSemanaP2(numSemana);
  // Período 1: ~16 semanas antes del inicio de P2 (referencia aprox.)
  if (periodo === 1) {
    const base = new Date(INICIO_P2_S6);
    base.setDate(base.getDate() - (5 - 1) * 7 - (10 * 7));
    base.setDate(base.getDate() + (numSemana - 1) * 7);
    return base;
  }
  // Período 3: inicia la semana después de que termina P2 semana 10
  if (periodo === 3) {
    const baseP3 = inicioSemanaP2(10);
    baseP3.setDate(baseP3.getDate() + 7 + (numSemana - 1) * 7);
    return baseP3;
  }
  // Período 4: después de P3
  if (periodo === 4) {
    const baseP3 = inicioSemanaP2(10);
    baseP3.setDate(baseP3.getDate() + 7 + 10 * 7 + (numSemana - 1) * 7);
    return baseP3;
  }
  return new Date();
}

/** Calcula período y semana activos según la fecha actual */
function calcularActivos() {
  const ahora = new Date();

  // Buscar en qué semana del período 2 estamos
  for (let s = 1; s <= 10; s++) {
    const inicio = inicioSemana(2, s);
    const fin    = new Date(inicio);
    fin.setDate(fin.getDate() + 7);
    if (ahora >= inicio && ahora < fin) {
      return { periodoActivo: 2, semanaActiva: s };
    }
  }
  // Antes de P2?
  if (ahora < inicioSemana(2, 1)) {
    for (let s = 1; s <= 10; s++) {
      const inicio = inicioSemana(1, s);
      const fin    = new Date(inicio); fin.setDate(fin.getDate() + 7);
      if (ahora >= inicio && ahora < fin) return { periodoActivo: 1, semanaActiva: s };
    }
    return { periodoActivo: 1, semanaActiva: 1 };
  }
  // Después de P2?
  const finP2 = new Date(inicioSemana(2, 10));
  finP2.setDate(finP2.getDate() + 7);
  if (ahora >= finP2) {
    for (let s = 1; s <= 10; s++) {
      const inicio = inicioSemana(3, s);
      const fin    = new Date(inicio); fin.setDate(fin.getDate() + 7);
      if (ahora >= inicio && ahora < fin) return { periodoActivo: 3, semanaActiva: s };
    }
    return { periodoActivo: 3, semanaActiva: 1 };
  }
  return { periodoActivo: 2, semanaActiva: 1 };
}

/** Formatea un rango de fechas: "9 may. – 15 may." */
function fmtRango(inicioDate) {
  const fin = new Date(inicioDate);
  fin.setDate(fin.getDate() + 6);
  const opts = { day: 'numeric', month: 'short' };
  const loc  = 'es-CO';
  return `${inicioDate.toLocaleDateString(loc, opts)} – ${fin.toLocaleDateString(loc, opts)}`;
}

/** Formatea una fecha ISO como "10/05/2026" */
function fmtFecha(raw) {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return raw; }
}

/* ══════════════════════════════════════
   NORMALIZACIÓN DE ESTADOS
══════════════════════════════════════ */
function normEstado(raw) {
  if (!raw) return 'revision';
  const v = String(raw).toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\s_]+/g,'_');
  if (v === 'aprobada')                                       return 'aprobada';
  if (v === 'ajustes' || v === 'con_ajustes')                 return 'ajustes';
  if (v === 'reenviada')                                      return 'reenviada';
  return 'revision'; // recibida, enviada, en_revision, pendiente, vacío
}

const LABEL = {
  aprobada:  'Aprobada',
  ajustes:   'Con ajustes',
  reenviada: 'Reenviada',
  revision:  'En revisión'
};

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ══════════════════════════════════════
   ESTADO GLOBAL DEL MÓDULO
══════════════════════════════════════ */
const ST = { correo: null, docenteId: null, rol: null, nombre: null };

const estado = {
  periodoSel:  2,
  semanaSel:   null,
  semanaActiva: null,
  periodoActivo: null,
  planeaciones: [],    // todas las cargadas para el período actual
  filtradas:    [],    // filtradas por semana + búsqueda
  busqueda:     '',
  planActual:   null   // planeación abierta en el panel
};

/* ══════════════════════════════════════
   MÓDULO PRINCIPAL — MP
══════════════════════════════════════ */
const MP = (() => {

  /* ─── INIT ─── */
  function init() {
    const raw = localStorage.getItem('lp_user');
    if (!raw) { _sinSesion(); return; }

    let user;
    try { user = JSON.parse(raw); } catch { _sinSesion(); return; }
    if (!user || !user.correo) { _sinSesion(); return; }

    ST.correo    = user.correo;
    ST.docenteId = user.docenteId || '';
    ST.rol       = user.rol       || 'docente';
    ST.nombre    = user.nombre    || '';

    // Rol en topbar
    const tpRol = document.getElementById('tpRol');
    if (tpRol) tpRol.textContent = (ST.rol || 'DOCENTE').toUpperCase();

    // Calcular período y semana activos
    const { periodoActivo, semanaActiva } = calcularActivos();
    estado.periodoActivo = periodoActivo;
    estado.semanaActiva  = semanaActiva;
    estado.periodoSel    = periodoActivo; // por defecto el activo

    document.getElementById('panelSinSesion').style.display = 'none';
    document.getElementById('mainContent').style.display    = '';

    _renderPeriodos();
    _renderSemanas();
    // Precargar planeaciones del período activo en background
    _cargarPeriodo(estado.periodoSel);
  }

  function _sinSesion() {
    document.getElementById('panelSinSesion').style.display = '';
    document.getElementById('mainContent').style.display    = 'none';
  }

  /* ─── PERÍODOS ─── */
  function _renderPeriodos() {
    const chips = document.querySelectorAll('.periodo-chip');
    chips.forEach(c => {
      const p = parseInt(c.dataset.p);
      c.classList.toggle('activo', p === estado.periodoSel);
    });
  }

  function selPeriodo(p, btn) {
    if (estado.periodoSel === p) return;
    estado.periodoSel  = p;
    estado.planeaciones = [];
    _renderPeriodos();
    _renderSemanas();
    _cargarPeriodo(p);
  }

  /* ─── SEMANAS ─── */
  function _renderSemanas() {
    const grid = document.getElementById('semanasGrid');
    grid.innerHTML = '';

    for (let s = 1; s <= 10; s++) {
      const inicio = inicioSemana(estado.periodoSel, s);
      const esActiva = estado.periodoSel === estado.periodoActivo &&
                       s === estado.semanaActiva;
      const rango  = fmtRango(inicio);

      const card = document.createElement('div');
      card.className = 'semana-card' + (esActiva ? ' es-actual' : '');
      card.innerHTML = `
        <div class="sem-num">Semana ${s}</div>
        <div class="sem-rango">${rango}</div>
        <div class="sem-ver">Ver planeaciones</div>
        ${esActiva ? '<div class="sem-badge-actual">Actual</div>' : ''}
      `;
      card.addEventListener('click', () => abrirSemana(s));
      grid.appendChild(card);
    }
  }

  /* ─── CARGA DE PLANEACIONES DEL PERÍODO ─── */
  async function _cargarPeriodo(periodo) {
    try {
      /*
       * ACCIÓN BACKEND: misPlaneacionesDocente
       * El backend filtra por DOCENTE_ID + CORREO_DOCENTE + PERIODO.
       * Devuelve array de planeaciones (ver estructura en comentario al inicio).
       */
      const res = await _api('misPlaneacionesDocente', {
  correo:  ST.correo,
  periodo: String(periodo)
});

console.log('RESPUESTA MIS PLANEACIONES:', res);

      let lista = [];
      if (Array.isArray(res))                  lista = res;
      else if (res && Array.isArray(res.data)) lista = res.data;

      estado.planeaciones = lista.map(p => ({
        ...p,
        _estado: normEstado(p.estadoRevision)
      }));

      // Si había una semana abierta, refrescar su lista
      if (estado.semanaSel !== null) _filtrarPorSemana();

    } catch (err) {
  console.error('[MIS PLN] Error cargando período', err);
  toast('No fue posible cargar tus planeaciones. Revisa consola.', 'er');
}
  }

  /* ─── ABRIR SEMANA ─── */
  function abrirSemana(numSemana) {
    estado.semanaSel = numSemana;
    estado.busqueda  = '';

    const busInput = document.getElementById('busqueda');
    if (busInput) busInput.value = '';

    // Título y subtítulo
    const inicio = inicioSemana(estado.periodoSel, numSemana);
    document.getElementById('semTitulo').textContent = `Semana ${numSemana}`;
    document.getElementById('semSub').textContent    = `Período ${estado.periodoSel} · ${fmtRango(inicio)}`;

    document.getElementById('vistaInicio').style.display = 'none';
    document.getElementById('vistaSemana').style.display = '';

    _filtrarPorSemana();
  }

  function volverSemanas() {
    estado.semanaSel = null;
    document.getElementById('vistaSemana').style.display = 'none';
    document.getElementById('vistaInicio').style.display = '';
  }

  /* ─── FILTRO POR SEMANA ─── */
  function _filtrarPorSemana() {
    if (estado.semanaSel === null) return;

    // Número de semana como string con distintas variantes
    const numStr = String(estado.semanaSel);

    let result = estado.planeaciones.filter(p => {
      const semRaw = String(p.semana || p.semanaLabel || '').toLowerCase();
      // Acepta: "SEMANA 6", "semana6", "6", semanaNumero===6
      const matchTexto  = semRaw.replace(/\D/g,'') === numStr ||
                          semRaw.includes(`semana ${numStr}`) ||
                          semRaw.includes(`semana${numStr}`);
      const matchNumero =
  (p.semanaNumero && String(p.semanaNumero) === numStr) ||
  (p.semanaNum && String(p.semanaNum) === numStr);
      return matchTexto || matchNumero;
    });

    if (estado.busqueda) {
      const q = estado.busqueda.toLowerCase();
      result = result.filter(p =>
        (p.asignatura || '').toLowerCase().includes(q) ||
        (p.grado      || '').toLowerCase().includes(q)
      );
    }

    estado.filtradas = result;
    _renderPlaneaciones();
  }

  /* ─── RENDER DE PLANEACIONES ─── */
  function _renderPlaneaciones() {
    const listEl    = document.getElementById('plnList');
    const vaciEl    = document.getElementById('semVacio');
    const cargEl    = document.getElementById('semCargando');
    const errEl     = document.getElementById('semError');

    cargEl.style.display = 'none';
    errEl.style.display  = 'none';

    if (!estado.filtradas.length) {
      listEl.style.display = 'none';
      vaciEl.style.display = '';
      return;
    }

    vaciEl.style.display  = 'none';
    listEl.style.display  = '';
    listEl.innerHTML      = '';

    estado.filtradas.forEach(p => {
      const card = _crearCard(p);
      listEl.appendChild(card);
    });
  }

  function _crearCard(p) {
    const est    = p._estado;
    const label  = LABEL[est] || est;
    const fecha  = p.fechaReenvio
      ? `Reenviada: ${fmtFecha(p.fechaReenvio)}`
      : p.fechaEnvio
        ? `Enviada: ${fmtFecha(p.fechaEnvio)}`
        : '';

    const div = document.createElement('div');
    div.className = `pln-card e-${est}`;
    div.innerHTML = `
      <div class="pln-info">
        <div class="pln-asig">${esc(p.asignatura || '—')}</div>
        <div class="pln-grado">Grado ${esc(p.grado || '—')}</div>
        ${fecha ? `<div class="pln-fecha">${esc(fecha)}</div>` : ''}
      </div>
      <div class="pln-right">
        <span class="badge badge-${est}">${esc(label)}</span>
        <span class="pln-arrow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </div>
    `;
    div.addEventListener('click', () => abrirPanel(p.planeacionId));
    return div;
  }

  /* ─── BÚSQUEDA ─── */
  function buscar(val) {
    estado.busqueda = (val || '').trim().toLowerCase();
    _filtrarPorSemana();
  }

  /* ─── CARGA AL ABRIR SEMANA (refresca si no hay datos) ─── */
  async function cargarSemana() {
    const listEl  = document.getElementById('plnList');
    const cargEl  = document.getElementById('semCargando');
    const errEl   = document.getElementById('semError');
    const vaciEl  = document.getElementById('semVacio');

    listEl.style.display = 'none';
    vaciEl.style.display = 'none';
    errEl.style.display  = 'none';
    cargEl.style.display = '';

    try {
      await _cargarPeriodo(estado.periodoSel);
      cargEl.style.display = 'none';
      _filtrarPorSemana();
    } catch {
      cargEl.style.display = 'none';
      errEl.style.display  = '';
    }
  }

  /* ─── PANEL DE DETALLE ─── */
  function abrirPanel(planeacionId) {
    const p = estado.planeaciones.find(x => x.planeacionId === planeacionId);
    if (!p) return;
    estado.planActual = p;

    // Ocultar formulario
    _toggleForm(false);

    // Kicker
    _setText('pkicker', `Semana ${esc(p.semanaLabel || p.semana || '')} · Período ${esc(p.periodo || '')}`);

    // Título = Asignatura
    _setText('pTitulo', p.asignatura || '—');

    // Badge de estado
    const badge = document.getElementById('pBadge');
    if (badge) {
      badge.className   = `badge badge-${p._estado}`;
      badge.textContent = LABEL[p._estado] || p._estado;
    }

    // Metadatos
    _setText('pGrado',      p.grado      || '—');
    _setText('pAsignatura', p.asignatura || '—');
    _setText('pPeriodo',    `Período ${p.periodo || '—'}`);
    const fechaMeta = p.fechaReenvio
      ? `Reenviada ${fmtFecha(p.fechaReenvio)}`
      : fmtFecha(p.fechaEnvio) || '—';
    _setText('pFecha', fechaMeta);

    // Indicador
    _setText('pIndicador', p.indicadorSemanal || 'No registrado.');

    // Clases
    const clasesWrap = document.getElementById('pClases');
    clasesWrap.innerHTML = '';
    [
      { num: '1', tema: p.d1Tema, act: p.d1Actividades },
      { num: '2', tema: p.d2Tema, act: p.d2Actividades },
      { num: '3', tema: p.d3Tema, act: p.d3Actividades }
    ].forEach(c => {
      if (!c.tema && !c.act) return;
      const bl = document.createElement('div');
      bl.className = 'psec';
      bl.innerHTML = `
        <div class="clase-bloque">
          <div class="clase-num">Clase ${c.num}</div>
          ${c.tema ? `<div class="clase-tema">${esc(c.tema)}</div>` : ''}
          ${c.act  ? `<div class="clase-act">${esc(c.act)}</div>`   : ''}
        </div>
      `;
      clasesWrap.appendChild(bl);
    });

    // Observaciones generales
    const obsSec = document.getElementById('pObsSec');
    if (p.observaciones) {
      _setText('pObs', p.observaciones);
      obsSec.style.display = '';
    } else {
      obsSec.style.display = 'none';
    }

    // Retroalimentación coordinación
    const revBox = document.getElementById('pRevBox');
    revBox.className = 'rev-box';
    revBox.innerHTML = '';

    if (p._estado === 'aprobada') {
      revBox.classList.add('aprobada');
      revBox.textContent = 'Tu planeación fue aprobada. Puedes consultarla como apoyo para el desarrollo de tus clases.';
    } else if (p._estado === 'revision') {
      revBox.classList.add('revision');
      revBox.textContent = 'Tu planeación fue recibida y está pendiente de revisión. Recibirás respuesta pronto.';
    } else if (p._estado === 'reenviada') {
      revBox.classList.add('reenviada');
      revBox.textContent = 'Tu planeación fue reenviada y está pendiente de nueva revisión.';
    } else if (p._estado === 'ajustes') {
      revBox.classList.add('ajustes');
      let html = 'Coordinación ha solicitado ajustes en tu planeación.';
      if (p.retroalimentacionCoord || p.obsCoordinacion) {
        html += `<div class="rev-obs">${esc(p.retroalimentacionCoord || p.obsCoordinacion)}</div>`;
      }
      if (p.motivoAjuste) {
        html += `<div class="rev-motivo"><strong>Motivo:</strong> ${esc(p.motivoAjuste)}</div>`;
      }
      revBox.innerHTML = html;
    }

    // Botón "Corregir y reenviar" solo para ajustes
    const btnCorr = document.getElementById('btnCorregir');
    if (btnCorr) btnCorr.style.display = p._estado === 'ajustes' ? '' : 'none';

    // Abrir panel
    document.getElementById('overlay').classList.add('open');
    document.getElementById('panelDetalle').classList.add('open');
    document.getElementById('panelDetalle').setAttribute('aria-hidden', 'false');
    document.getElementById('panelBody').scrollTop = 0;
  }

  function cerrarPanel(event) {
    // Si se llama desde el overlay, solo cerrar si el clic fue en el overlay mismo
    if (event && event.target !== document.getElementById('overlay')) return;
    _cerrar();
  }

  function _cerrar() {
    document.getElementById('overlay').classList.remove('open');
    document.getElementById('panelDetalle').classList.remove('open');
    document.getElementById('panelDetalle').setAttribute('aria-hidden', 'true');
    estado.planActual = null;
    _toggleForm(false);
  }

  /* ─── FORMULARIO DE CORRECCIÓN ─── */
  function abrirForm() {
    const p = estado.planActual;
    if (!p || p._estado !== 'ajustes') return;

    // Prellenar
    _setVal('fIndicador', p.indicadorSemanal    || '');
    _setVal('fD1Tema',    p.d1Tema              || '');
    _setVal('fD1Act',     p.d1Actividades       || '');
    _setVal('fD2Tema',    p.d2Tema              || '');
    _setVal('fD2Act',     p.d2Actividades       || '');
    _setVal('fD3Tema',    p.d3Tema              || '');
    _setVal('fD3Act',     p.d3Actividades       || '');
    _setVal('fObs',       p.observaciones       || '');

    _toggleForm(true);

    // Scroll al formulario
    const formEl = document.getElementById('panelForm');
    setTimeout(() => {
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function _toggleForm(mostrar) {
    const el = document.getElementById('panelForm');
    if (el) el.style.display = mostrar ? '' : 'none';
  }

  /* ─── REENVIAR ─── */
  async function reenviar() {
    if (!estado.planActual) return;

    const btn = document.getElementById('btnReenviar');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

    const datos = {
      indicadorSemanal: _getVal('fIndicador'),
      d1Tema:           _getVal('fD1Tema'),
      d1Actividades:    _getVal('fD1Act'),
      d2Tema:           _getVal('fD2Tema'),
      d2Actividades:    _getVal('fD2Act'),
      d3Tema:           _getVal('fD3Tema'),
      d3Actividades:    _getVal('fD3Act'),
      observaciones:    _getVal('fObs')
    };

    try {
      /*
       * ACCIÓN BACKEND: reenviarPlaneacionDocente
       * Validar que planeacionId pertenezca al docente.
       * Actualizar hoja PLANEACIONES.
       * Cambiar ESTADO_REVISION → "reenviada".
       * Registrar FECHA_REENVIO.
       * Devolver { ok: true }.
       */
      const res = await _api('reenviarPlaneacionDocente', {
        planeacionId:    estado.planActual.planeacionId,
        docenteId:       ST.docenteId,
        correo:          ST.correo,
        datosCorregidos: datos
      });

      if (res && res.ok) {
        // Actualizar estado local
        const p = estado.planActual;
        Object.assign(p, datos, { _estado: 'reenviada', estadoRevision: 'reenviada' });

        // Actualizar en el array global
        const idx = estado.planeaciones.findIndex(x => x.planeacionId === p.planeacionId);
        if (idx !== -1) estado.planeaciones[idx] = { ...p };

        toast('Planeación reenviada correctamente.', 'ok');
        _toggleForm(false);
        _cerrar();
        _filtrarPorSemana(); // refrescar lista

      } else {
        throw new Error((res && res.mensaje) || 'Respuesta inesperada.');
      }

    } catch (err) {
      console.error('[REENVIAR]', err);
      toast('No fue posible reenviar. Intenta nuevamente.', 'er');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Reenviar planeación`;
      }
    }
  }

/* ─── API ─── */
async function _api(action, payload = {}) {
  const finalPayload = {
    ...(payload || {}),
    accion: action
  };

  if (ST.correo) {
    finalPayload.correo = ST.correo;
  }

  console.log('[MIS PLANEACIONES] PAYLOAD REAL:', JSON.stringify(finalPayload, null, 2));

  // ─────────────────────────────────────
  // GET para consultar mis planeaciones
  // ─────────────────────────────────────
  if (action === 'misPlaneacionesDocente') {
    const query = new URLSearchParams(finalPayload).toString();
    const url = `${API}?${query}`;

    console.log('[MIS PLANEACIONES] GET URL:', url);

    const r = await fetch(url, {
      method: 'GET',
      cache: 'no-store'
    });

    const txt = await r.text();

    console.log('[MIS PLANEACIONES] GET RESPUESTA RAW:', txt);

    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }

    return JSON.parse(txt);
  }

  // ─────────────────────────────────────
  // POST para reenviar planeaciones
  // ─────────────────────────────────────
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(finalPayload)
  });

  const txt = await r.text();

  console.log('[MIS PLANEACIONES] POST RESPUESTA RAW:', txt);

  if (!r.ok) {
    throw new Error(`HTTP ${r.status}`);
  }

  return JSON.parse(txt);
}
  /* ─── DOM HELPERS ─── */
  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  }
  function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }
  function _getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /* API pública */
  return { init, selPeriodo, abrirSemana, volverSemanas, buscar, cargarSemana, abrirPanel, cerrarPanel, abrirForm, reenviar };

})();

/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
function toast(msg, tipo) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className   = `toast ${tipo || ''} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3400);
}

/* ══════════════════════════════════════
   NAVEGACIÓN
══════════════════════════════════════ */
function volverPanel()  { window.location.href = RUTA_HOME; }
function doLogout()     { localStorage.removeItem('lp_user'); window.location.href = RUTA_HOME; }

/* ══════════════════════════════════════
   ARRANQUE
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => MP.init());
