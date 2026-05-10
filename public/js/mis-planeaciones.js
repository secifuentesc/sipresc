/**
 * mis-planeaciones.js
 * SIPRESC — Módulo Mis Planeaciones (vista docente)
 *
 * Acciones backend requeridas (Google Apps Script):
 *   misPlaneacionesDocente   → lista de planeaciones del docente autenticado
 *   reenviarPlaneacionDocente → reenvío de planeación corregida
 *
 * Sesión leída desde: localStorage.getItem("lp_user")
 * API proxy:          /api/proxy
 */

/* ══════════════════════════════════════
   CONFIG Y ESTADO GLOBAL
══════════════════════════════════════ */
const API        = '/api/proxy';
const RUTA_PANEL = '/';

/** Sesión del docente activo */
const ST = {
  correo:     null,
  nombre:     null,
  docenteId:  null,
  rol:        null
};

/** Estado del módulo */
const MIS = (() => {

  /* Estado interno */
  let _todas         = [];  // todas las planeaciones cargadas
  let _filtradas     = [];  // resultado de filtros
  let _filtroEstado  = 'todas';
  let _filtroPeriodo = 'todos';
  let _busqueda      = '';
  let _planActual    = null; // planeación abierta en el panel

  /* ─────────────────────────────
     NORMALIZACIÓN DE ESTADOS
  ───────────────────────────── */
  function normalizarEstado(raw) {
    if (!raw) return 'revision';
    const v = String(raw).toLowerCase().trim()
      .replace(/\s+/g, '_')
      .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u');
    if (v === 'aprobada')                             return 'aprobada';
    if (v === 'ajustes' || v === 'con_ajustes')       return 'ajustes';
    if (v === 'reenviada')                            return 'reenviada';
    // en_revision, enviada, pendiente, recibida → revision
    return 'revision';
  }

  const LABEL_ESTADO = {
    aprobada:  'Aprobada',
    ajustes:   'Con ajustes',
    reenviada: 'Reenviada',
    revision:  'En revisión'
  };

  /* ─────────────────────────────
     INICIALIZACIÓN
  ───────────────────────────── */
  function init() {
    const raw = localStorage.getItem('lp_user');
    if (!raw) {
      _mostrarSinSesion();
      return;
    }

    let user;
    try { user = JSON.parse(raw); } catch { _mostrarSinSesion(); return; }

    if (!user || !user.correo) { _mostrarSinSesion(); return; }

    /* Cargar sesión */
    ST.correo    = user.correo;
    ST.nombre    = user.nombre    || user.correo;
    ST.docenteId = user.docenteId || '';
    ST.rol       = user.rol       || 'docente';

    /* Actualizar topbar */
    const rolEl = document.getElementById('tp-rol');
    if (rolEl) rolEl.textContent = (ST.rol || 'DOCENTE').toUpperCase();

    /* Tarjeta de docente */
    const avatar = document.getElementById('docenteAvatar');
    if (avatar) {
      const iniciales = _iniciales(ST.nombre);
      avatar.textContent = iniciales;
    }
    const nomEl = document.getElementById('docenteNombre');
    const corEl = document.getElementById('docenteCorreo');
    if (nomEl) nomEl.textContent = _titleCase(ST.nombre);
    if (corEl) corEl.textContent = ST.correo;

    /* Mostrar contenido */
    document.getElementById('panelSinSesion').style.display = 'none';
    document.getElementById('mainContent').style.display    = '';

    cargar();
  }

  function _mostrarSinSesion() {
    document.getElementById('panelSinSesion').style.display = '';
    document.getElementById('mainContent').style.display    = 'none';
  }

  /* ─────────────────────────────
     CARGA DE PLANEACIONES
  ───────────────────────────── */
  async function cargar() {
    _estadoCargando(true);
    _limpiarGrid();

    try {
      /*
       * ACCIÓN BACKEND: misPlaneacionesDocente
       * El backend debe validar que docenteId y correo
       * pertenezcan al mismo docente antes de devolver datos.
       *
       * Respuesta esperada: Array de objetos (ver docs).
       */
      const res = await _api('misPlaneacionesDocente', {
        docenteId: ST.docenteId,
        correo:    ST.correo
      });

      /* Aceptar array directo o { ok, data } */
      let lista = [];
      if (Array.isArray(res))                  lista = res;
      else if (res && Array.isArray(res.data)) lista = res.data;
      else if (res && res.ok === false)        throw new Error(res.mensaje || 'Error del servidor');

      /* Normalizar estados */
      _todas = lista.map(p => ({
        ...p,
        _estado: normalizarEstado(p.estadoRevision)
      }));

      _calcularKPIs();
      _aplicarFiltros();

    } catch (err) {
      console.error('[MIS PLANEACIONES]', err);
      _estadoCargando(false, 'error');
    }
  }

  /* ─────────────────────────────
     KPIs
  ───────────────────────────── */
  function _calcularKPIs() {
    const total     = _todas.length;
    const aprobadas = _todas.filter(p => p._estado === 'aprobada').length;
    const ajustes   = _todas.filter(p => p._estado === 'ajustes').length;
    const revision  = _todas.filter(p => p._estado === 'revision' || p._estado === 'reenviada').length;

    _set('kpiTotal',     total     || '0');
    _set('kpiAprobadas', aprobadas || '0');
    _set('kpiAjustes',   ajustes   || '0');
    _set('kpiRevision',  revision  || '0');
  }

  /* ─────────────────────────────
     FILTROS
  ───────────────────────────── */
  function setEstado(val, btn) {
    _filtroEstado = val;
    document.querySelectorAll('#chipsEstado .chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    _aplicarFiltros();
  }

  function setPeriodo(val) {
    _filtroPeriodo = val;
    _aplicarFiltros();
  }

  function buscar(val) {
    _busqueda = (val || '').toLowerCase().trim();
    _aplicarFiltros();
  }

  function _aplicarFiltros() {
    _filtradas = _todas.filter(p => {
      /* Filtro estado */
      if (_filtroEstado !== 'todas' && p._estado !== _filtroEstado) return false;

      /* Filtro periodo */
      if (_filtroPeriodo !== 'todos') {
        const rawPer = String(p.periodo || '').replace(/\D/g, '');
        if (rawPer !== String(_filtroPeriodo)) return false;
      }

      /* Búsqueda libre */
      if (_busqueda) {
        const haystack = [p.semana, p.grado, p.asignatura, p.indicadorSemanal]
          .map(s => (s || '').toLowerCase()).join(' ');
        if (!haystack.includes(_busqueda)) return false;
      }

      return true;
    });

    _renderGrid();
  }

  /* ─────────────────────────────
     RENDER DE TARJETAS
  ───────────────────────────── */
  function _renderGrid() {
    const grid = document.getElementById('cardsGrid');
    const vacio = document.getElementById('estadoVacio');
    _estadoCargando(false);

    if (!_filtradas.length) {
      grid.style.display = 'none';
      vacio.style.display = '';
      return;
    }

    vacio.style.display = 'none';
    grid.style.display  = '';
    grid.innerHTML      = '';

    _filtradas.forEach(p => {
      const card = _crearTarjeta(p);
      grid.appendChild(card);
    });
  }

  function _crearTarjeta(p) {
    const estado = p._estado;
    const label  = LABEL_ESTADO[estado] || estado;

    /* Fecha formateada */
    const fecha = _formatFecha(p.fechaEnvio || p.fechaPublicacion || '');

    /* Badge HTML */
    const badgeHTML = `<div class="badge-estado badge-${estado}">${label}</div>`;

    /* Aviso de ajuste */
    const avisoHTML = (estado === 'ajustes' && p.motivoAjuste)
      ? `<div class="card-ajuste-aviso">
           <div class="aviso-titulo">Requiere ajustes</div>
           <div class="aviso-motivo">${_esc(p.motivoAjuste)}</div>
         </div>`
      : '';

    /* Botón adicional si hay ajustes */
    const btnCorregirHTML = (estado === 'ajustes')
      ? `<button class="btn-corregir-card" onclick="event.stopPropagation(); MIS.abrirDetalleConEdicion('${_esc(p.planeacionId)}')">Corregir planeación</button>`
      : '';

    const div = document.createElement('div');
    div.className = `pln-card estado-${estado}`;
    div.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-semana">${_esc(p.semana || '')} · ${_esc(p.periodo || '')}</div>
          <div class="card-asignatura">${_esc(p.asignatura || '—')}</div>
          <div class="card-grado">${_esc(p.grado || '')}</div>
        </div>
        ${badgeHTML}
      </div>
      ${p.indicadorSemanal ? `<div class="card-indicador">${_esc(p.indicadorSemanal)}</div>` : ''}
      <div class="card-fecha">Enviada: ${fecha}</div>
      ${avisoHTML}
      <div class="card-actions">
        <button class="btn-ver" onclick="event.stopPropagation(); MIS.abrirDetalle('${_esc(p.planeacionId)}')">Ver planeación</button>
        ${btnCorregirHTML}
      </div>
    `;

    /* Clic en la tarjeta también abre detalle */
    div.addEventListener('click', () => abrirDetalle(p.planeacionId));
    return div;
  }

  /* ─────────────────────────────
     PANEL DE DETALLE
  ───────────────────────────── */
  function abrirDetalle(planeacionId) {
    const p = _todas.find(x => x.planeacionId === planeacionId);
    if (!p) return;
    _planActual = p;

    /* Ocultar formulario edición */
    _toggleEdicion(false);

    /* Rellenar cabecera del panel */
    _set('pdTitulo', `${p.semana || '—'}`);

    const badge = document.getElementById('pdBadge');
    if (badge) {
      badge.className  = `badge-estado badge-${p._estado}`;
      badge.textContent = LABEL_ESTADO[p._estado] || p._estado;
    }

    /* Metadatos */
    _set('pdGrado',      p.grado      || '—');
    _set('pdAsignatura', p.asignatura || '—');
    _set('pdPeriodo',    _limpiarPeriodo(p.periodo));
    _set('pdFecha',      _formatFecha(p.fechaEnvio || p.fechaPublicacion || ''));

    /* Indicador */
    _set('pdIndicador', p.indicadorSemanal || 'No registrado.');

    /* Clases */
    const clasesWrap = document.getElementById('pdClasesWrap');
    clasesWrap.innerHTML = '';
    const clases = [
      { num: '1', tema: p.d1Tema, act: p.d1Actividades },
      { num: '2', tema: p.d2Tema, act: p.d2Actividades },
      { num: '3', tema: p.d3Tema, act: p.d3Actividades }
    ];
    clases.forEach(c => {
      if (!c.tema && !c.act) return;
      const bloque = document.createElement('div');
      bloque.className = 'panel-section';
      bloque.innerHTML = `
        <div class="clase-bloque">
          <div class="clase-num">Clase ${c.num}</div>
          ${c.tema ? `<div class="clase-tema">${_esc(c.tema)}</div>` : ''}
          ${c.act  ? `<div class="clase-actividades">${_esc(c.act)}</div>` : ''}
        </div>
      `;
      clasesWrap.appendChild(bloque);
    });

    /* Actividad complementaria */
    const actCompSec = document.getElementById('pdActCompSec');
    if (p.actCompDescripcion) {
      _set('pdActComp', p.actCompDescripcion);
      actCompSec.style.display = '';
    } else {
      actCompSec.style.display = 'none';
    }

    /* Observaciones familias */
    const obsFamSec = document.getElementById('pdObsFamSec');
    if (p.obsFamilias) {
      _set('pdObsFam', p.obsFamilias);
      obsFamSec.style.display = '';
    } else {
      obsFamSec.style.display = 'none';
    }

    /* Revisión de coordinación */
    const revBox = document.getElementById('pdRevisionBox');
    revBox.className = 'revision-box';
    revBox.innerHTML  = '';

    if (p._estado === 'aprobada') {
      revBox.classList.add('aprobada');
      revBox.textContent = 'Tu planeación fue aprobada. Puedes consultarla como apoyo para el desarrollo de tus clases.';
    } else if (p._estado === 'revision') {
      revBox.classList.add('revision');
      revBox.textContent = 'Tu planeación fue enviada y se encuentra en revisión. Recibirás respuesta pronto.';
    } else if (p._estado === 'reenviada') {
      revBox.classList.add('reenviada');
      revBox.textContent = 'Tu planeación fue reenviada y está pendiente de nueva revisión.';
    } else if (p._estado === 'ajustes') {
      revBox.classList.add('ajustes');
      let html = 'Coordinación ha solicitado ajustes en tu planeación.';
      if (p.motivoAjuste) {
        html += `<div class="rev-motivo"><strong>Motivo:</strong> ${_esc(p.motivoAjuste)}</div>`;
      }
      if (p.observacionCoordinacion || p.obsCoordinacion) {
        html += `<div class="rev-obs">${_esc(p.observacionCoordinacion || p.obsCoordinacion)}</div>`;
      }
      revBox.innerHTML = html;
    }

    /* Mostrar botón corregir solo si hay ajustes */
    const btnCorr = document.getElementById('btnCorregir');
    if (btnCorr) {
      btnCorr.style.display = (p._estado === 'ajustes') ? '' : 'none';
    }

    /* Hacer visible el panel */
    document.getElementById('panelOverlay').classList.add('visible');
    document.getElementById('panelDetalle').classList.add('visible');
    document.getElementById('panelDetalle').setAttribute('aria-hidden', 'false');

    /* Ir al top del panel */
    const body = document.getElementById('panelBody');
    if (body) body.scrollTop = 0;
  }

  /* Abrir detalle y directamente mostrar edición */
  function abrirDetalleConEdicion(planeacionId) {
    abrirDetalle(planeacionId);
    setTimeout(() => abrirEdicion(), 80);
  }

  function cerrarDetalle(event) {
    if (event && event.target !== document.getElementById('panelOverlay')) return;
    _cerrarPanel();
  }

  function _cerrarPanel() {
    document.getElementById('panelOverlay').classList.remove('visible');
    document.getElementById('panelDetalle').classList.remove('visible');
    document.getElementById('panelDetalle').setAttribute('aria-hidden', 'true');
    _planActual = null;
  }

  /* ─────────────────────────────
     MODO EDICIÓN / CORRECCIÓN
  ───────────────────────────── */
  function abrirEdicion() {
    if (!_planActual || _planActual._estado !== 'ajustes') return;
    const p = _planActual;

    /* Prellenar campos */
    _val('editIndicador', p.indicadorSemanal    || '');
    _val('editD1Tema',    p.d1Tema              || '');
    _val('editD1Act',     p.d1Actividades       || '');
    _val('editD2Tema',    p.d2Tema              || '');
    _val('editD2Act',     p.d2Actividades       || '');
    _val('editD3Tema',    p.d3Tema              || '');
    _val('editD3Act',     p.d3Actividades       || '');
    _val('editActComp',   p.actCompDescripcion  || '');
    _val('editObsFam',    p.obsFamilias         || '');

    _toggleEdicion(true);

    /* Scroll hasta el formulario */
    const panelEdicion = document.getElementById('panelEdicion');
    setTimeout(() => {
      if (panelEdicion) panelEdicion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function _toggleEdicion(mostrar) {
    const el = document.getElementById('panelEdicion');
    if (el) el.style.display = mostrar ? '' : 'none';
  }

  /* ─────────────────────────────
     REENVIAR PLANEACIÓN
  ───────────────────────────── */
  async function reenviar() {
    if (!_planActual) return;

    const btn = document.getElementById('btnReenviar');
    if (btn) { btn.disabled = true; btn.textContent = 'Reenviando…'; }

    const datos = {
      indicadorSemanal:   _getVal('editIndicador'),
      d1Tema:             _getVal('editD1Tema'),
      d1Actividades:      _getVal('editD1Act'),
      d2Tema:             _getVal('editD2Tema'),
      d2Actividades:      _getVal('editD2Act'),
      d3Tema:             _getVal('editD3Tema'),
      d3Actividades:      _getVal('editD3Act'),
      actCompDescripcion: _getVal('editActComp'),
      obsFamilias:        _getVal('editObsFam')
    };

    try {
      /*
       * ACCIÓN BACKEND: reenviarPlaneacionDocente
       * El backend debe:
       *   1. Validar que planeacionId pertenezca al docenteId/correo.
       *   2. Actualizar los campos en la hoja PLANEACIONES.
       *   3. Cambiar ESTADO_REVISION a "reenviada".
       *   4. Registrar FECHA_REENVIO.
       *   5. Notificar a coordinación si aplica.
       * Respuesta esperada: { ok: true, mensaje: "Planeación reenviada correctamente" }
       */
      const res = await _api('reenviarPlaneacionDocente', {
        planeacionId:     _planActual.planeacionId,
        docenteId:        ST.docenteId,
        correo:           ST.correo,
        datosCorregidos:  datos
      });

      if (res && res.ok) {
        /* Actualizar estado local */
        _planActual._estado         = 'reenviada';
        _planActual.estadoRevision  = 'reenviada';
        Object.assign(_planActual, datos);

        const idx = _todas.findIndex(x => x.planeacionId === _planActual.planeacionId);
        if (idx !== -1) _todas[idx] = { ..._planActual };

        toast('Planeación reenviada correctamente.', 'ok');

        _toggleEdicion(false);
        _calcularKPIs();
        _aplicarFiltros();
        _cerrarPanel();
      } else {
        throw new Error((res && res.mensaje) || 'Respuesta inesperada del servidor.');
      }

    } catch (err) {
      console.error('[REENVIAR]', err);
      toast('No fue posible reenviar. Intenta nuevamente.', 'er');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Reenviar planeación`;
      }
    }
  }

  /* ─────────────────────────────
     API — función central
  ───────────────────────────── */
  function _api(action, payload) {
    const body = { action, ...(payload || {}) };
    if (ST.correo) body.correo = ST.correo;

    return fetch(API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      cache:   'no-store',
      body:    JSON.stringify(body)
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }

  /* ─────────────────────────────
     UTILIDADES DOM / FORMAT
  ───────────────────────────── */
  function _set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  }
  function _val(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }
  function _getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function _esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function _iniciales(nombre) {
    if (!nombre) return '?';
    const partes = nombre.trim().split(/\s+/);
    return partes.slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }
  function _titleCase(s) {
    return (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  function _limpiarPeriodo(s) {
    const match = String(s || '').match(/\d+/);
    return match ? `Periodo ${match[0]}` : (s || '—');
  }
  function _formatFecha(raw) {
    if (!raw) return '—';
    try {
      const d = new Date(raw);
      if (isNaN(d)) return raw;
      return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return raw; }
  }

  /* ─────────────────────────────
     ESTADOS DE CARGA
  ───────────────────────────── */
  function _estadoCargando(activo, tipo) {
    const cargando = document.getElementById('estadoCargando');
    const error    = document.getElementById('estadoError');
    const vacio    = document.getElementById('estadoVacio');
    const grid     = document.getElementById('cardsGrid');

    if (activo) {
      if (cargando) cargando.style.display = '';
      if (error)    error.style.display    = 'none';
      if (vacio)    vacio.style.display    = 'none';
      if (grid)     grid.style.display     = 'none';
    } else {
      if (cargando) cargando.style.display = 'none';
      if (tipo === 'error') {
        if (error) error.style.display = '';
      }
    }
  }

  function _limpiarGrid() {
    const grid = document.getElementById('cardsGrid');
    if (grid) { grid.innerHTML = ''; grid.style.display = 'none'; }
  }

  /* API pública del módulo */
  return {
    init,
    cargar,
    setEstado,
    setPeriodo,
    buscar,
    abrirDetalle,
    abrirDetalleConEdicion,
    cerrarDetalle,
    abrirEdicion,
    reenviar
  };

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
  el._t = setTimeout(() => { el.classList.remove('show'); }, 3200);
}

/* ══════════════════════════════════════
   NAVEGACIÓN
══════════════════════════════════════ */
function volverPanelPrincipal() {
  window.location.href = RUTA_PANEL;
}

function doLogout() {
  localStorage.removeItem('lp_user');
  window.location.href = RUTA_PANEL;
}

/* ══════════════════════════════════════
   ARRANQUE
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => MIS.init());
