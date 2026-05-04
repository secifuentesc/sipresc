/* =========================================================
   SIPRESC · Panel de Coordinación
   /js/dashboardcoord.js
   ========================================================= */
(function () {
  "use strict";

  /* ------------------------------------------------------
     ENDPOINTS & CONST
  ------------------------------------------------------ */
  const API     = "/api/proxy";          // citas, login, todasCitas, etc.
  const API_PLN = "/api/planeaciones";   // planeaciones

  const ROLES_PERMITIDOS = ["coordinador", "admin", "coordinacion"];

  const PERIODOS = [1, 2, 3, 4];
  const SEMANAS  = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const DEFAULT_PERIODO = 2;
  const DEFAULT_SEMANA  = 5;

  const MOTIVOS_AJUSTE = [
    "El indicador de desempeño no cumple la estructura institucional.",
    "Falta coherencia entre indicador, temas y actividades.",
    "Las actividades no están enumeradas.",
    "Las actividades requieren mayor claridad.",
    "La planeación está incompleta.",
    "Falta información relevante para las familias.",
    "La redacción requiere corrección.",
    "Los temas no corresponden con el indicador.",
    "Otro."
  ];

  /* ------------------------------------------------------
     STATE
  ------------------------------------------------------ */
  const state = {
    user: null,
    periodo: DEFAULT_PERIODO,
    semana:  DEFAULT_SEMANA,
    view: "inicio",
    cache: {
      coord: new Map(),    // key: `${periodo}-${semana}` → payload
      citas: null,
      cierres: null,
      docentes: null
    },
    pln: {
      docentes: [],
      filterEstado: "todos",
      query: "",
      docenteSel: null,
      asignacionSel: null
    },
    citas: {
      query: "",
      estado: "",
      rango: "semana"
    },
    docs: {
      query: ""
    }
  };

  /* ------------------------------------------------------
     SHORTCUTS
  ------------------------------------------------------ */
  const $  = (s, ctx) => (ctx || document).querySelector(s);
  const $$ = (s, ctx) => Array.from((ctx || document).querySelectorAll(s));
  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]);
      else if (k === "data") for (const dk in attrs[k]) n.dataset[dk] = attrs[k][dk];
      else n.setAttribute(k, attrs[k]);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(k => {
      if (k == null) return;
      n.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    });
    return n;
  };
  const escHTML = (str) => String(str || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  /* ------------------------------------------------------
     UTILS
  ------------------------------------------------------ */
  const initials = (name) => {
    if (!name) return "··";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "··";
    const a = parts[0]?.[0] || "";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] || "");
    return (a + b).toUpperCase();
  };

  const greet = () => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  };

  const firstName = (full) => {
    if (!full) return "";
    const p = String(full).trim().split(/\s+/);
    return p.slice(0, 2).join(" ");
  };

  const normEstado = (raw) => {
    const s = String(raw || "").toLowerCase().trim();
    if (!s) return "no_enviada";
    if (/^aprob/.test(s))            return "aprobada";
if (/ajust/.test(s))             return "ajustes";
if (/reenvi/.test(s))            return "por_revisar";
if (/recib/.test(s) || /revis/.test(s) || /pend/.test(s)) return "por_revisar";
    if (/^complet/.test(s))          return "completa";
    if (/^incomplet/.test(s))        return "incompleta";
    return s.replace(/\s+/g, "_");
  };

  const estadoLabel = (e) => ({
    aprobada:    "Aprobada",
    ajustes:     "Con ajustes",
    por_revisar: "Por revisar",
    completa:    "Completa",
    incompleta:  "Incompleta",
    no_enviada:  "No enviada",
    pendiente:   "Pendiente",
    recibida:    "Recibida"
  }[e] || "—");

  const getPlaneacionId = (p, asig) => {
  return p?.PLANEACION_ID || p?.planeacionId || p?.ID || asig?.planeacionId || "";
};

  // Orden para que “lo que requiere acción” aparezca primero
  const ESTADO_PRIORIDAD = {
    ajustes: 1,
    por_revisar: 2,
    incompleta: 3,
    pendiente: 4,
    completa: 5,
    aprobada: 6,
    recibida: 5,
    no_enviada: 3
  };

  const fmtDateTime = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d)) return String(iso);
      return d.toLocaleString("es-CO", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false
      });
    } catch (_) { return String(iso); }
  };

  const fmtTime = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d)) return String(iso);
      return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch (_) { return String(iso); }
  };

  const sameDay = (a, b) =>
    a && b && a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const startOfWeek = (d) => {
    // Lunes como primer día
    const x = new Date(d);
    const day = x.getDay(); // 0..6 (dom..sab)
    const diff = (day === 0 ? -6 : 1 - day);
    x.setDate(x.getDate() + diff);
    x.setHours(0,0,0,0);
    return x;
  };

  /* ------------------------------------------------------
     FETCH HELPERS
  ------------------------------------------------------ */
  async function apiGet(url, params) {
    const qs = new URLSearchParams(params || {}).toString();
    const full = qs ? `${url}?${qs}` : url;
    const res = await fetch(full, { method: "GET", credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ------------------------------------------------------
     SESIÓN
  ------------------------------------------------------ */
  function readSession() {
    try {
      const raw = localStorage.getItem("lp_user");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  }

  async function validarSesion() {
    const u = readSession();
    if (!u || !u.correo) {
      redirectLogin();
      return null;
    }

    try {
      const resp = await apiPost(API, { action: "loginGoogle", correo: u.correo });
      const data = resp?.data || resp;
      if (!resp?.ok && !data?.ok) throw new Error("Sesión inválida");

      const usuario = data?.usuario || data?.user || data || u;
      const rol = String(usuario.rol || u.rol || "").toLowerCase().trim();

      if (!ROLES_PERMITIDOS.includes(rol)) {
        toast("Acceso restringido a coordinación.", "error");
        setTimeout(redirectLogin, 800);
        return null;
      }
      // unificar
      return {
        correo: usuario.correo || u.correo,
        nombre: usuario.nombre || u.nombre || "",
        rol
      };
    } catch (err) {
      console.warn("loginGoogle fallback (offline):", err);
      const rol = String(u.rol || "").toLowerCase();
      if (!ROLES_PERMITIDOS.includes(rol)) {
        redirectLogin(); return null;
      }
      return { correo: u.correo, nombre: u.nombre || "", rol };
    }
  }

  function redirectLogin() {
    location.href = "/";
  }

  function logout() {
    try { localStorage.removeItem("lp_user"); } catch(_) {}
    location.href = "/";
  }

  /* ------------------------------------------------------
     TOASTS
  ------------------------------------------------------ */
  function toast(msg, type = "info", ttl = 3200) {
    const wrap = $("#coordToasts");
    if (!wrap) return;
    const icons = {
      success: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      error:   '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
      info:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      warn:    '<svg viewBox="0 0 24 24"><path d="M12 4l10 17H2z M12 10v5M12 18h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>'
    };
    const t = el("div", { class: `coord-toast coord-toast--${type}` , role: "status"});
    t.innerHTML = `<span class="coord-toast__icon">${icons[type] || icons.info}</span><span>${escHTML(msg)}</span>`;
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add("is-leaving");
      setTimeout(() => t.remove(), 260);
    }, ttl);
  }

  /* ------------------------------------------------------
     SHEETS
  ------------------------------------------------------ */
  function openSheet(id) {
    const sh = document.getElementById(id);
    if (!sh) return;
    sh.classList.add("is-open");
    sh.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeSheet(id) {
    const sh = id ? document.getElementById(id) : document.querySelector(".coord-sheet.is-open");
    if (!sh) return;
    sh.classList.remove("is-open");
    sh.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  /* ------------------------------------------------------
     SALUDO + USER + WEEK SELECT
  ------------------------------------------------------ */
  function paintHeaderUser() {
    const u = state.user;
    if (!u) return;
    const nombre = u.nombre || u.correo || "Usuario";
    $("#coordGreeting").textContent  = greet() + ",";
    $("#coordGreetingName").textContent = firstName(nombre);
    $("#coordUserName").textContent  = nombre;
    $("#coordUserRole").textContent  = (u.rol || "").charAt(0).toUpperCase() + (u.rol || "").slice(1);
    $("#coordUserAvatar").textContent = initials(nombre);
  }

  function paintPeriodLabel() {
    $("#coordPeriodoLabel").textContent = `Periodo ${state.periodo} · Semana ${state.semana}`;
  }

  function buildWeekSelect() {
    const wrap = $("#coordWeekSelect");
    wrap.innerHTML = "";
    SEMANAS.forEach(n => {
      const b = el("button", {
        type: "button",
        "data-semana": n,
        class: n === state.semana ? "is-active" : "",
        "aria-label": `Semana ${n}`
      }, String(n));
      b.addEventListener("click", () => setSemana(n));
      wrap.appendChild(b);
    });
  }

  function setPeriodo(p) {
    state.periodo = Number(p);
    $$('.coord-segmented__btn').forEach(b => b.classList.toggle("is-active", Number(b.dataset.periodo) === state.periodo));
    paintPeriodLabel();
    refreshDataForPeriodWeek();
  }
  function setSemana(s) {
    state.semana = Number(s);
    $$('#coordWeekSelect button').forEach(b => b.classList.toggle("is-active", Number(b.dataset.semana) === state.semana));
    paintPeriodLabel();
    refreshDataForPeriodWeek();
  }

  /* ------------------------------------------------------
     NAV
  ------------------------------------------------------ */
  function setView(v) {
    state.view = v;
    $$('.coord-view').forEach(s => s.classList.toggle("is-active", s.dataset.view === v));
    $$('.coord-nav__item').forEach(b => b.classList.toggle("is-active", b.dataset.view === v));
    $$('.coord-bottomnav__item').forEach(b => b.classList.toggle("is-active", b.dataset.view === v));

    // Cargas perezosas
    if (v === "citas")        ensureCitas();
    if (v === "solicitudes")  ensureSolicitudes();
    if (v === "docentes")     renderDocentes();
    if (v === "planeaciones") renderPlnRoot();

    // scroll top
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch(_) {}
  }

  /* ------------------------------------------------------
     CALENDARIO SEMANAL (Inicio)
  ------------------------------------------------------ */
  function renderSemana() {
    const grid = $("#coordWeekGrid");
    if (!grid) return;
    const today = new Date();
    const monday = startOfWeek(today);
    const days = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

    grid.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const isToday = sameDay(d, today);
      const cell = el("button", {
        type: "button",
        class: "coord-week__day" + (isToday ? " is-today" : ""),
        "data-date": d.toISOString().slice(0,10)
      });
      cell.innerHTML = `
        <div class="coord-week__day-name">${days[i]}</div>
        <div class="coord-week__day-num">${d.getDate()}</div>
        <div class="coord-week__day-meta">${d.toLocaleString("es-CO",{month:"short"})}</div>
      `;
      cell.addEventListener("click", () => openFullCalendar());
      grid.appendChild(cell);
    }

    // Rango
    const firstD = new Date(monday);
    const lastD  = new Date(monday); lastD.setDate(monday.getDate()+6);
    const opts = { day:"numeric", month:"short" };
    $("#coordWeekRange").textContent =
      `${firstD.toLocaleDateString("es-CO",opts)} – ${lastD.toLocaleDateString("es-CO",opts)} · Periodo ${state.periodo} · Semana ${state.semana}`;
  }

  function openFullCalendar() {
    const body = $("#fullCalBody");
    $("#fullCalSub").textContent = `Periodo ${state.periodo} · Semana ${state.semana}`;
    body.innerHTML = "";

    // Render calendario simple del mes actual con la semana activa resaltada
    const today = new Date();
    const month = today.getMonth(), year = today.getFullYear();
    const monthName = today.toLocaleString("es-CO",{month:"long", year:"numeric"});
    const first = new Date(year, month, 1);
    const last  = new Date(year, month+1, 0);
    const startWday = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const totalDays = last.getDate();
    const wkStart = startOfWeek(today);
    const wkEnd   = new Date(wkStart); wkEnd.setDate(wkStart.getDate()+6);

    let html = `
      <div style="margin-bottom:14px;font-weight:600;font-size:15px;text-transform:capitalize;color:var(--c-text);">
        ${monthName}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;text-align:center;">
        ${["L","M","M","J","V","S","D"].map(d=>`<div style="font-size:11px;color:var(--c-text-2);font-weight:600;letter-spacing:.6px;padding:4px 0;">${d}</div>`).join("")}
    `;
    for (let i = 0; i < startWday; i++) html += `<div></div>`;
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      const inWeek = d >= wkStart && d <= wkEnd;
      const isToday = sameDay(d, today);
      const bg = isToday ? "var(--c-azul-oscuro)" : (inWeek ? "var(--c-amarillo)" : "var(--c-bg)");
      const fg = isToday ? "#fff" : (inWeek ? "var(--c-azul-oscuro)" : "var(--c-text)");
      html += `<div style="padding:10px 0;border-radius:10px;background:${bg};color:${fg};font-size:13px;font-weight:${isToday||inWeek?700:500};">${day}</div>`;
    }
    html += `</div>
      <p style="margin-top:14px;font-size:12.5px;color:var(--c-text-2);">
        En amarillo, la semana activa. La fecha de hoy resaltada en azul.
      </p>`;
    body.innerHTML = html;
    openSheet("sheetFullCal");
  }

  /* ------------------------------------------------------
     KPIs + INICIO
  ------------------------------------------------------ */
  function renderInicio(coordData) {
    const r = coordData?.resumen || {};
    const kpis = [
      { lbl: "Planeaciones recibidas", num: r.planeacionesRecibidas ?? 0, tone: "info",   target: "planeaciones",
        icon: '<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>' },
      { lbl: "Por revisar",            num: r.porRevisar ?? 0,            tone: "info",   target: "planeaciones", filter:"por_revisar",
        icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
      { lbl: "Aprobadas",              num: r.aprobadas ?? 0,             tone: "ok",     target: "planeaciones", filter:"aprobada",
        icon: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
      { lbl: "Con ajustes",            num: r.conAjustes ?? 0,            tone: "warn",   target: "planeaciones", filter:"ajustes",
        icon: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M21 7v4h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
      { lbl: "Entrega incompleta",     num: r.docentesIncompletos ?? 0,   tone: "danger", target: "planeaciones", filter:"incompleta",
        icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v6M12 16h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
      { lbl: "Citas de hoy",           num: state.cache.citas?.hoy ?? "—", tone: "amarillo", target: "citas",
        icon: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' }
    ];

    const wrap = $("#coordKpis");
    wrap.innerHTML = "";
    kpis.forEach((k, idx) => {
      const card = el("button", {
        type: "button",
        class: "coord-kpi",
        "data-tone": k.tone,
        "aria-label": `${k.lbl}: ${k.num}`
      });
      card.innerHTML = `
        <div class="coord-kpi__head">
          <span class="coord-kpi__icon">${k.icon}</span>
        </div>
        <div class="coord-kpi__num">${k.num}</div>
        <div class="coord-kpi__lbl">${escHTML(k.lbl)}</div>
      `;
      card.style.animationDelay = `${idx * 40}ms`;
      card.addEventListener("click", () => {
        if (k.filter) {
          state.pln.filterEstado = k.filter;
          $$('#coordPlnFilters .coord-chip').forEach(c => c.classList.toggle("is-active", c.dataset.filter === k.filter));
        }
        if (k.target) setView(k.target);
      });
      wrap.appendChild(card);
    });

    // Pendientes
    const pendList = $("#coordPendingList");
    pendList.innerHTML = "";
    const pendientes = (coordData?.docentes || [])
      .filter(d => ["por_revisar","ajustes","incompleta"].includes(normEstado(d.estadoGlobal)))
      .slice(0, 5);

    if (!pendientes.length) {
      pendList.innerHTML = `
        <div class="coord-empty coord-empty--soft">
          <div class="coord-empty__icon">
            <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </div>
          <h4>Todo al día</h4>
          <p>No hay planeaciones pendientes por revisar esta semana.</p>
        </div>`;
    } else {
      pendientes.forEach(d => {
        const est = normEstado(d.estadoGlobal);
        const item = el("button", { class: "coord-action-item", type: "button" });
        item.innerHTML = `
          <span class="coord-action-item__avatar">${escHTML(initials(d.nombreDocente))}</span>
          <div class="coord-action-item__body">
            <div class="coord-action-item__title">${escHTML(d.nombreDocente || "—")}</div>
            <div class="coord-action-item__sub">
              <span class="coord-status" data-estado="${est}">${escHTML(estadoLabel(est))}</span>
            </div>
          </div>
          <span class="coord-action-item__chev">
            <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </span>
        `;
        item.addEventListener("click", () => {
          state.pln.docenteSel = d.docenteId || d.correo;
          state.pln.asignacionSel = null;
          setView("planeaciones");
        });
        pendList.appendChild(item);
      });
    }

    // Citas hoy (resumen)
    renderCitasHoyResumen();
  }

  function renderCitasHoyResumen() {
    const wrap = $("#coordCitasHoyList");
    const cnt  = $("#coordCitasHoyCount");
    if (!wrap) return;

    const citas = state.cache.citas?.lista || [];
    const today = new Date();
    const hoy = citas.filter(c => {
      const d = c._date instanceof Date ? c._date : (c.fecha || c.fechaInicio || c.start) ? new Date(c.fecha || c.fechaInicio || c.start) : null;
      return d && sameDay(d, today);
    });
    cnt.textContent = `${hoy.length} cita${hoy.length === 1 ? "" : "s"} programada${hoy.length === 1 ? "" : "s"}`;

    wrap.innerHTML = "";
    if (!hoy.length) {
      wrap.innerHTML = `
        <div class="coord-empty coord-empty--soft">
          <div class="coord-empty__icon">
            <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
          </div>
          <h4>Sin citas hoy</h4>
          <p>No hay citas agendadas para el día de hoy.</p>
        </div>`;
      return;
    }
    hoy.slice(0, 6).forEach(c => {
      const d = c._date || new Date(c.fecha || c.fechaInicio || c.start);
      const item = el("button", { class: "coord-cita-item", type: "button" });
      item.innerHTML = `
        <div class="coord-cita-item__time">${fmtTime(d)}</div>
        <div class="coord-cita-item__body">
          <div class="coord-cita-item__title">${escHTML(c.acudiente || c.nombreAcudiente || "Acudiente")}</div>
          <div class="coord-cita-item__sub">${escHTML((c.estudiante || c.nombreEstudiante || "")+" · "+(c.docente || c.nombreDocente || ""))}</div>
        </div>
      `;
      item.addEventListener("click", () => openCitaSheet(c));
      wrap.appendChild(item);
    });
  }

  /* ------------------------------------------------------
     PLANEACIONES (carga)
  ------------------------------------------------------ */
  async function cargarPlaneacionesCoordinacion() {
    const cacheKey = `${state.periodo}-${state.semana}`;
    if (state.cache.coord.has(cacheKey)) {
      const d = state.cache.coord.get(cacheKey);
      state.pln.docentes = d?.docentes || [];
      return d;
    }

    showSkeletonsPlaneaciones();
    showSkeletonKpis();

    try {
      const resp = await apiGet(API_PLN, {
        accion: "dashboardCoordinacion",
        correo: state.user.correo,
        periodo: state.periodo,
        semana: `SEMANA ${state.semana}`
      });
      const ok = resp?.ok ?? resp?.data?.ok;
      if (!ok && !resp?.data) throw new Error(resp?.mensaje || resp?.message || "No se pudo cargar el panel.");

      const data = resp.data || resp;
      state.cache.coord.set(cacheKey, data);
      state.pln.docentes = data?.docentes || [];
      return data;
    } catch (err) {
      console.error("dashboardCoordinacion error:", err);
      toast("No se pudieron cargar las planeaciones.", "error");
      const fallback = { resumen: {}, docentes: [] };
      state.pln.docentes = [];
      return fallback;
    }
  }

  function showSkeletonKpis() {
    const wrap = $("#coordKpis");
    wrap.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const sk = el("div", { class: "coord-kpi" });
      sk.innerHTML = `
        <div class="coord-kpi__head"><span class="coord-skel" style="width:32px;height:32px;border-radius:10px;"></span></div>
        <div class="coord-skel" style="height:28px;width:60%;margin-bottom:6px;"></div>
        <div class="coord-skel" style="height:12px;width:80%;"></div>`;
      wrap.appendChild(sk);
    }
  }

  function showSkeletonsPlaneaciones() {
    const list = $("#coordPlnDocentesList");
    if (!list) return;
    list.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const sk = el("div", { class: "coord-doc-row" });
      sk.innerHTML = `
        <div class="coord-skel" style="width:36px;height:36px;border-radius:50%;"></div>
        <div style="flex:1;">
          <div class="coord-skel" style="height:13px;width:70%;margin-bottom:6px;"></div>
          <div class="coord-skel" style="height:11px;width:40%;"></div>
        </div>`;
      list.appendChild(sk);
    }
  }

  /* ------------------------------------------------------
     PLANEACIONES · render
  ------------------------------------------------------ */
  function renderPlnRoot() {
    renderDocentesPln();
  }

  function renderDocentesPln() {
  const list = $("#coordPlnDocentesList");
  list.innerHTML = "";

  const docs = state.pln.docentes.slice();

  docs.sort((a, b) => {
    const ea = ESTADO_PRIORIDAD[normEstado(a.estadoGlobal)] || 99;
    const eb = ESTADO_PRIORIDAD[normEstado(b.estadoGlobal)] || 99;
    if (ea !== eb) return ea - eb;
    return (a.nombreDocente || "").localeCompare(b.nombreDocente || "", "es");
  });

  const q = state.pln.query.toLowerCase().trim();

  const filtered = docs.filter(d => {
    const est = normEstado(d.estadoGlobal);

    if (state.pln.filterEstado !== "todos") {
      if (state.pln.filterEstado === "incompleta" && !["incompleta", "no_enviada"].includes(est)) return false;
      if (state.pln.filterEstado !== "incompleta" && est !== state.pln.filterEstado) return false;
    }

    if (q) {
      const hay = (d.nombreDocente || "") + " " + (d.correo || "");
      if (!hay.toLowerCase().includes(q)) return false;
    }

    return true;
  });

  $("#coordPlnDocentesCount").textContent =
    `${filtered.length} docente${filtered.length === 1 ? "" : "s"} · Periodo ${state.periodo} · Semana ${state.semana}`;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="coord-empty coord-empty--soft">
        <div class="coord-empty__icon">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </div>
        <h4>Sin resultados</h4>
        <p>Ajusta el filtro o la búsqueda para ver más docentes.</p>
      </div>`;

    renderMateriasDocente(null);
    return;
  }

  filtered.forEach(d => {
    const id = d.docenteId || d.correo;
    const est = normEstado(d.estadoGlobal);

    const sub = (d.asignaciones && d.asignaciones[0]?.asignatura)
      ? `${d.asignaciones.length} asignacion${d.asignaciones.length === 1 ? "" : "es"}`
      : (d.correo || "");

    const row = el("button", {
      type: "button",
      class: "coord-doc-row" + (id === state.pln.docenteSel ? " is-selected" : ""),
      "data-id": id
    });

    row.innerHTML = `
      <span class="coord-doc-row__avatar">${escHTML(initials(d.nombreDocente))}</span>
      <div class="coord-doc-row__body">
        <div class="coord-doc-row__name">${escHTML(d.nombreDocente || "—")}</div>
        <div class="coord-doc-row__sub">${escHTML(sub)}</div>
      </div>
      <span class="coord-status" data-estado="${est}">${escHTML(estadoLabel(est))}</span>
    `;

    row.addEventListener("click", () => {
      state.pln.docenteSel = id;
      state.pln.asignacionSel = null;

      $$('#coordPlnDocentesList .coord-doc-row').forEach(r =>
        r.classList.toggle("is-selected", r.dataset.id === id)
      );

      renderMateriasDocente(d);

      const wrap = $("#coordPln");
      if (wrap) {
        wrap.classList.add("has-docente");
        wrap.classList.remove("has-detalle");

        if (wrap.dataset) {
          wrap.dataset.mobileStep = "materias";
        }
      }
    });

    list.appendChild(row);
  });

  if (state.pln.docenteSel) {
    const sel = filtered.find(d => (d.docenteId || d.correo) === state.pln.docenteSel);
    if (sel) renderMateriasDocente(sel);
    else renderMateriasDocente(null);
  } else {
    renderMateriasDocente(null);
  }
}

  function renderMateriasDocente(doc) {
    const list = $("#coordPlnMateriasList");
    list.innerHTML = "";

    if (!doc) {
      $("#coordPlnMateriasTitle").textContent = "Asignaciones";
      $("#coordPlnMateriasSub").textContent = "Selecciona un docente";
      list.innerHTML = `
        <div class="coord-empty coord-empty--soft">
          <div class="coord-empty__icon">
            <svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z M5 9h14" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
          </div>
          <p>Selecciona un docente para ver sus asignaciones de la semana.</p>
        </div>`;
      renderDetallePlaneacion(null);
      return;
    }

    $("#coordPlnMateriasTitle").textContent = doc.nombreDocente || "Docente";
    const totalEntregadas = (doc.asignaciones || []).filter(a => a.entregada).length;
    const total = (doc.asignaciones || []).length;
    $("#coordPlnMateriasSub").textContent =
      `${totalEntregadas}/${total} entregadas · ${escHTML(doc.correo || "")}`;

    if (!doc.asignaciones || !doc.asignaciones.length) {
      list.innerHTML = `
        <div class="coord-empty coord-empty--soft">
          <div class="coord-empty__icon">
            <svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
          </div>
          <h4>Sin asignaciones</h4>
          <p>Este docente no tiene asignaciones registradas para la semana actual.</p>
        </div>`;
      renderDetallePlaneacion(null);
      return;
    }

    doc.asignaciones.forEach(a => {
      let est = "no_enviada";
      if (a.entregada) {
        est = normEstado(a.estadoRevision || a.planeacion?.REVISION_COORD || "recibida");
        if (!["aprobada","ajustes","por_revisar","recibida","pendiente"].includes(est)) est = "recibida";
      }
      const iconSvg = a.entregada
        ? '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

      const grados = a.gradoTexto || a.grado || a.gruposDestino || "";

      const row = el("button", {
        type: "button",
        class: "coord-mat-row" + (a.key === state.pln.asignacionSel ? " is-selected" : ""),
        "data-estado": est,
        "data-key": a.key || ""
      });
      row.innerHTML = `
        <span class="coord-mat-row__icon">${iconSvg}</span>
        <div class="coord-mat-row__body">
          <div class="coord-mat-row__name">${escHTML(a.asignatura || "Asignatura")}</div>
          <div class="coord-mat-row__grado">${escHTML(grados)}</div>
        </div>
        <span class="coord-status" data-estado="${est}">${escHTML(estadoLabel(est))}</span>
      `;
      row.addEventListener("click", () => {
  state.pln.asignacionSel = a.key;

  $$('#coordPlnMateriasList .coord-mat-row').forEach(r =>
    r.classList.toggle("is-selected", r.dataset.key === a.key)
  );

  renderDetallePlaneacion(a, doc);

  const wrap = $("#coordPln");
  if (wrap) {
    wrap.classList.add("has-docente");
    wrap.classList.add("has-detalle");

    if (wrap.dataset) {
      wrap.dataset.mobileStep = "detalle";
    }
  }
});

list.appendChild(row);
});
  }


  /* ------------------------------------------------------
     PLANEACIONES · detalle
  ------------------------------------------------------ */
  function renderDetallePlaneacion(asig, doc) {
    const body = $("#coordPlnDetalleBody");
    const wrap = $("#coordPln");
    wrap.classList.toggle("show-detalle", !!asig);

    if (!asig) {
      $("#coordPlnDetalleTitle").textContent = "Detalle";
      $("#coordPlnDetalleSub").textContent = "Selecciona una asignación";
      body.innerHTML = `
        <div class="coord-empty">
          <div class="coord-empty__icon">
            <svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z M9 12h6 M9 16h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </div>
          <h4>Sin planeación seleccionada</h4>
          <p>Elige una asignación para revisarla en detalle, aprobarla o solicitar ajustes.</p>
        </div>`;
      return;
    }

    $("#coordPlnDetalleTitle").textContent = asig.asignatura || "Detalle";
    $("#coordPlnDetalleSub").textContent = doc?.nombreDocente || "";

    // No enviada
    if (!asig.entregada) {
      body.innerHTML = `
        <div class="coord-detail-head">
          <h2>Planeación no enviada</h2>
          <div class="coord-detail-head__meta">
            <strong>${escHTML(doc?.nombreDocente || "—")}</strong>
            <span class="dot"></span>
            ${escHTML(asig.asignatura || "—")}
            <span class="dot"></span>
            ${escHTML(asig.gradoTexto || asig.grado || "—")}
            <span class="dot"></span>
            Periodo ${state.periodo} · Semana ${state.semana}
          </div>
        </div>
        <div class="coord-block">
          <div class="coord-block__label">Estado</div>
          <div class="coord-block__value">
            <span class="coord-status" data-estado="no_enviada">No enviada</span>
            <p style="margin:10px 0 0;color:var(--c-text-2);font-size:13px;">
              El docente aún no ha enviado la planeación correspondiente a esta semana.
            </p>
          </div>
        </div>`;
      return;
    }

    const p = asig.planeacion || {};
    const estado = normEstado(p.REVISION_COORD || asig.estadoRevision || "recibida");

    // Construir clases
    const clases = [];
    for (let i = 1; i <= 5; i++) {
      const tema = p[`D${i}_TEMA`];
      const acts = p[`D${i}_ACTIVIDADES`];
      if (tema || acts) clases.push({ n: i, tema, acts });
    }

    let html = `
      <div class="coord-detail-head">
        <h2>${escHTML(p.ASIGNATURA || asig.asignatura)}</h2>
        <div class="coord-detail-head__meta">
          <strong>${escHTML(p.NOMBRE_DOCENTE || doc?.nombreDocente || "—")}</strong>
          <span class="dot"></span>
          ${escHTML(asig.gradoTexto || p.GRADO || asig.grado || "—")}
          <span class="dot"></span>
          Periodo ${escHTML(p.PERIODO || state.periodo)}
          <span class="dot"></span>
          ${escHTML(p.SEMANA || `Semana ${state.semana}`)}
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="coord-status" data-estado="${estado}">${escHTML(estadoLabel(estado))}</span>
          ${p.ESTADO_PUBLICACION ? `<span class="coord-status" data-estado="pendiente">Publicación: ${escHTML(p.ESTADO_PUBLICACION)}</span>` : ""}
          ${p.FECHA_REVISION ? `<span style="font-size:11.5px;color:var(--c-text-3);">Revisada: ${escHTML(fmtDateTime(p.FECHA_REVISION))}</span>` : ""}
        </div>
        <div class="coord-detail-actions">
          <button class="coord-btn coord-btn--success" id="btnAprobar" type="button" ${estado === "aprobada" ? "disabled" : ""}>
            <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${estado === "aprobada" ? "Ya aprobada" : "Aprobar planeación"}
          </button>
          <button class="coord-btn coord-btn--warn" id="btnAjustes" type="button">
            <svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M21 7v4h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Solicitar ajustes
          </button>
        </div>
      </div>
    `;

    if (p.INDICADOR_SEMANAL) html += `
      <div class="coord-block coord-block--highlight">
        <div class="coord-block__label">
          <svg viewBox="0 0 24 24"><path d="M12 3l2.5 5.5 6 .5-4.5 4 1.5 6L12 16l-5.5 3 1.5-6L3.5 9l6-.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          Indicador de desempeño
        </div>
        <div class="coord-block__value">${escHTML(p.INDICADOR_SEMANAL)}</div>
      </div>`;

    if (p.OBSERVACIONES_SEMANA_ANTERIOR) html += `
      <div class="coord-block">
        <div class="coord-block__label">Observación de la semana anterior</div>
        <div class="coord-block__value">${escHTML(p.OBSERVACIONES_SEMANA_ANTERIOR)}</div>
      </div>`;

    if (clases.length) {
      html += `<h3 style="margin:18px 0 10px;font-size:14px;font-weight:700;color:var(--c-azul-oscuro);letter-spacing:.3px;text-transform:uppercase;">Clases de la semana</h3>`;
      clases.forEach(c => {
        html += `
          <div class="coord-clase">
            <div class="coord-clase__head">
              <span class="coord-clase__num">${c.n}</span>
              <span class="coord-clase__title">Clase ${c.n}</span>
            </div>
            ${c.tema ? `<div class="coord-clase__row"><strong>Tema</strong><p>${escHTML(c.tema)}</p></div>` : ""}
            ${c.acts ? `<div class="coord-clase__row"><strong>Actividades</strong><p>${escHTML(c.acts)}</p></div>` : ""}
          </div>`;
      });
    }

    if (p.ACT_COMP_DESCRIPCION || p.ACT_COMP_ANEXO_URL) html += `
      <div class="coord-block">
        <div class="coord-block__label">Actividad complementaria</div>
        <div class="coord-block__value">
          ${p.ACT_COMP_DESCRIPCION ? escHTML(p.ACT_COMP_DESCRIPCION) : ""}
          ${p.ACT_COMP_ANEXO_URL ? `<div style="margin-top:8px;"><a href="${escHTML(p.ACT_COMP_ANEXO_URL)}" target="_blank" rel="noopener">Ver anexo →</a></div>` : ""}
        </div>
      </div>`;

    if (p.OBS_FAMILIAS || p.ANEXO_FAMILIAS_URL) html += `
      <div class="coord-block">
        <div class="coord-block__label">Comunicación a familias</div>
        <div class="coord-block__value">
          ${p.OBS_FAMILIAS ? escHTML(p.OBS_FAMILIAS) : ""}
          ${p.ANEXO_FAMILIAS_URL ? `<div style="margin-top:8px;"><a href="${escHTML(p.ANEXO_FAMILIAS_URL)}" target="_blank" rel="noopener">Anexo a familias →</a></div>` : ""}
        </div>
      </div>`;

    if (p.GRUPOS_DESTINO) html += `
      <div class="coord-block">
        <div class="coord-block__label">Grupos destino</div>
        <div class="coord-block__value">${escHTML(p.GRUPOS_DESTINO)}</div>
      </div>`;

    if (p.OBS_COORDINACION) html += `
      <div class="coord-block">
        <div class="coord-block__label">Observación de coordinación</div>
        <div class="coord-block__value">${escHTML(p.OBS_COORDINACION)}</div>
      </div>`;

    if (p.MOTIVO_AJUSTE) {
      const motivos = String(p.MOTIVO_AJUSTE).split(/[\|\n;]/).filter(Boolean);
      html += `
        <div class="coord-block">
          <div class="coord-block__label">Motivos de ajuste</div>
          <div class="coord-block__value">
            ${motivos.map(m => `• ${escHTML(m.trim())}`).join("<br>")}
          </div>
        </div>`;
    }

    body.innerHTML = html;

    // Hooks
    body.querySelector("#btnAprobar")?.addEventListener("click", () => aprobarPlaneacion(p, asig, doc));
    body.querySelector("#btnAjustes")?.addEventListener("click", () => abrirModalAjustes(p, asig, doc));
  }

  /* ------------------------------------------------------
     PLANEACIONES · acciones (aprobar / ajustes)
  ------------------------------------------------------ */
  async function aprobarPlaneacion(p, asig, doc) {
    const planeacionId = getPlaneacionId(p, asig);

if (!planeacionId) {
  toast("No se encontró el ID de la planeación.", "error");
  return;
}
    const btn = document.getElementById("btnAprobar");
    if (btn) { btn.disabled = true; btn.textContent = "Aprobando…"; }

    try {
      const resp = await apiPost(API_PLN, {
        accion: "revisarPlaneacion",
        correo: state.user.correo,
        planeacionId,
        estado: "Aprobada",
        motivosAjuste: [],
        observacionCoordinacion: ""
      });
      if (!resp?.ok && !resp?.data?.ok) throw new Error(resp?.mensaje || "No se pudo aprobar.");

      // Actualizar caché local
      mergePlaneacionUpdate(planeacionId, {
        REVISION_COORD: "Aprobada",
        OBS_COORDINACION: "",
        MOTIVO_AJUSTE: "",
        FECHA_REVISION: new Date().toISOString()
      });

      toast("Planeación aprobada con éxito.", "success");
      // Refrescar
      const data = state.cache.coord.get(`${state.periodo}-${state.semana}`);
      renderInicio(data);
      renderDocentesPln();
      const docCur = state.pln.docentes.find(d => (d.docenteId || d.correo) === state.pln.docenteSel);
      const asigCur = docCur?.asignaciones?.find(a => a.key === state.pln.asignacionSel);
      renderDetallePlaneacion(asigCur, docCur);
    } catch (err) {
      console.error(err);
      toast(err.message || "Error al aprobar.", "error");
      if (btn) { btn.disabled = false; btn.textContent = "Aprobar planeación"; }
    }
  }

  function abrirModalAjustes(p, asig, doc) {
    state._ajustesCtx = { p, asig, doc };
    const cl = $("#ajustesChecklist");
    cl.innerHTML = "";
    MOTIVOS_AJUSTE.forEach((m, i) => {
      const item = el("label", { class: "coord-checklist__item" });
      item.innerHTML = `
        <input type="checkbox" data-motivo="${escHTML(m)}" />
        <span class="coord-checklist__check">
          <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span class="coord-checklist__label">${escHTML(m)}</span>
      `;
      const cb = item.querySelector("input");
      cb.addEventListener("change", () => item.classList.toggle("is-checked", cb.checked));
      cl.appendChild(item);
    });
    $("#ajustesObservacion").value = "";
    $("#sheetAjustesSub").textContent = `${asig.asignatura || ""} · ${doc?.nombreDocente || ""}`;
    openSheet("sheetAjustes");
  }

  async function enviarAjustes() {
    const ctx = state._ajustesCtx;
    if (!ctx) return;
    const planeacionId = getPlaneacionId(ctx.p, ctx.asig);
    if (!planeacionId) { toast("No se encontró el ID de la planeación.", "error"); return; }

    const motivos = $$('#ajustesChecklist input:checked').map(i => i.dataset.motivo);
    const obs = $("#ajustesObservacion").value.trim();

    if (!motivos.length && !obs) {
      toast("Selecciona al menos un motivo o escribe una observación.", "warn");
      return;
    }

    const btn = $("#btnEnviarAjustes");
    btn.disabled = true; btn.textContent = "Enviando…";

    try {
      const resp = await apiPost(API_PLN, {
        accion: "revisarPlaneacion",
        correo: state.user.correo,
        planeacionId,
        estado: "Con ajustes",
        motivosAjuste: motivos,
        observacionCoordinacion: obs
      });
      if (!resp?.ok && !resp?.data?.ok) throw new Error(resp?.mensaje || "No se pudo enviar.");

      mergePlaneacionUpdate(planeacionId, {
        REVISION_COORD: "Con ajustes",
        OBS_COORDINACION: obs,
        MOTIVO_AJUSTE: motivos.join(" | "),
        FECHA_REVISION: new Date().toISOString()
      });

      toast("Solicitud de ajustes enviada al docente.", "success");
      closeSheet("sheetAjustes");

      // Refrescar UI
      const data = state.cache.coord.get(`${state.periodo}-${state.semana}`);
      renderInicio(data);
      renderDocentesPln();
      const docCur = state.pln.docentes.find(d => (d.docenteId || d.correo) === state.pln.docenteSel);
      const asigCur = docCur?.asignaciones?.find(a => a.key === state.pln.asignacionSel);
      renderDetallePlaneacion(asigCur, docCur);
    } catch (err) {
      console.error(err);
      toast(err.message || "Error al enviar ajustes.", "error");
    } finally {
      btn.disabled = false; btn.textContent = "Enviar solicitud de ajustes";
    }
  }

  function mergePlaneacionUpdate(planeacionId, fields) {
    const data = state.cache.coord.get(`${state.periodo}-${state.semana}`);
    if (!data) return;
    let recibCount = 0, aprobCount = 0, ajusCount = 0, porRev = 0;

    (data.docentes || []).forEach(d => {
      let entregadas = 0;
      (d.asignaciones || []).forEach(a => {
        if (a.entregada) {
          entregadas++;
          if (a.planeacion && getPlaneacionId(a.planeacion, a) === planeacionId) {
            Object.assign(a.planeacion, fields);
            a.estadoRevision = fields.REVISION_COORD || a.estadoRevision;
          }
          recibCount++;
          const est = normEstado(a.estadoRevision || a.planeacion?.REVISION_COORD);
          if (est === "aprobada") aprobCount++;
          else if (est === "ajustes") ajusCount++;
          else porRev++;
        }
      });
      // Estado global del docente
      const tot = (d.asignaciones || []).length;
      if (entregadas < tot) d.estadoGlobal = "incompleta";
      else {
        const allEst = (d.asignaciones || []).map(a => normEstado(a.estadoRevision || a.planeacion?.REVISION_COORD));
        if (allEst.every(e => e === "aprobada")) d.estadoGlobal = "aprobada";
        else if (allEst.some(e => e === "ajustes")) d.estadoGlobal = "ajustes";
        else d.estadoGlobal = "por_revisar";
      }
    });

    data.resumen = data.resumen || {};
    data.resumen.planeacionesRecibidas = recibCount;
    data.resumen.aprobadas = aprobCount;
    data.resumen.conAjustes = ajusCount;
    data.resumen.porRevisar = porRev;
  }

  /* ------------------------------------------------------
     CITAS
  ------------------------------------------------------ */
  async function ensureCitas() {
    if (state.cache.citas) {
      renderCitas();
      return;
    }
    const list = $("#coordCitasList");
    if (list) list.innerHTML = skelCards(5);

    try {
      const resp = await apiPost(API, { action: "todasCitas", correo: state.user.correo });
      const data = resp?.data || resp;
      const arr = data?.citas || data?.lista || data || [];

      // Normalizar
      const citas = (Array.isArray(arr) ? arr : []).map(c => {
        const fecha = c.fecha || c.fechaInicio || c.start || c.fechaCita || c.timestamp;
        const d = fecha ? new Date(fecha) : null;
        return {
          id: c.id || c.citaId || c.uid || "",
          acudiente: c.acudiente || c.nombreAcudiente || c.acudienteNombre || "",
          estudiante: c.estudiante || c.nombreEstudiante || "",
          grado: c.grado || "",
          docente: c.docente || c.nombreDocente || "",
          motivo: c.motivo || c.descripcion || "",
          estado: String(c.estado || "").toLowerCase(),
          acta: c.acta || c.actaURL || c.urlActa || "",
          fecha: fecha || "",
          _date: d && !isNaN(d) ? d : null,
          _raw: c
        };
      });

      const today = new Date();
      const hoyCount = citas.filter(c => c._date && sameDay(c._date, today)).length;

      state.cache.citas = { lista: citas, hoy: hoyCount };
      renderCitas();
      renderCitasHoyResumen();
      // refrescar KPIs si estamos en inicio
      const data2 = state.cache.coord.get(`${state.periodo}-${state.semana}`);
      if (data2) renderInicio(data2);
    } catch (err) {
      console.error("citas error:", err);
      if (list) list.innerHTML = errorState("No se pudieron cargar las citas.", () => { state.cache.citas = null; ensureCitas(); });
    }
  }

  function skelCards(n) {
    let h = "";
    for (let i = 0; i < n; i++) h += `
      <div class="coord-cita-card">
        <div class="coord-skel" style="height:48px;border-radius:8px;"></div>
        <div>
          <div class="coord-skel" style="height:14px;width:60%;margin-bottom:6px;"></div>
          <div class="coord-skel" style="height:11px;width:40%;"></div>
        </div>
        <div class="coord-skel" style="height:22px;width:70px;border-radius:999px;"></div>
      </div>`;
    return h;
  }

  function errorState(msg, retry) {
    const box = document.createElement("div");
    box.className = "coord-empty";
    box.innerHTML = `
      <div class="coord-empty__icon">
        <svg viewBox="0 0 24 24"><path d="M12 4l10 17H2z M12 10v5M12 18h.01" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>
      </div>
      <h4>${escHTML(msg)}</h4>
      <p>Verifica tu conexión y vuelve a intentarlo.</p>
      <button class="coord-btn coord-btn--ghost" type="button">Reintentar</button>`;
    box.querySelector("button").addEventListener("click", retry);
    return box.outerHTML;
  }

  function renderCitas() {
    const list = $("#coordCitasList");
    if (!list) return;
    const all = state.cache.citas?.lista || [];

    const today = new Date();
    const wkStart = startOfWeek(today);
    const wkEnd   = new Date(wkStart); wkEnd.setDate(wkStart.getDate()+6); wkEnd.setHours(23,59,59,999);

    let arr = all.filter(c => {
      // estado
      if (state.citas.estado && c.estado !== state.citas.estado) return false;
      // rango
      if (!c._date) return state.citas.rango === "todas";
      if (state.citas.rango === "hoy")      return sameDay(c._date, today);
      if (state.citas.rango === "semana")   return c._date >= wkStart && c._date <= wkEnd;
      if (state.citas.rango === "proximas") return c._date >= today;
      return true;
    });

    const q = state.citas.query.toLowerCase().trim();
    if (q) {
      arr = arr.filter(c =>
        (c.acudiente + " " + c.estudiante + " " + c.docente + " " + c.motivo).toLowerCase().includes(q)
      );
    }

    arr.sort((a, b) => (a._date || 0) - (b._date || 0));

    $("#coordCitasSub").textContent = `${arr.length} cita${arr.length === 1 ? "" : "s"}`;

    list.innerHTML = "";
    if (!arr.length) {
      list.innerHTML = `
        <div class="coord-empty coord-empty--soft">
          <div class="coord-empty__icon">
            <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
          </div>
          <h4>Sin citas</h4>
          <p>No hay citas que coincidan con los filtros seleccionados.</p>
        </div>`;
      return;
    }

    arr.forEach(c => {
      const d = c._date;
      const card = el("button", { class: "coord-cita-card", type: "button" });
      const dia = d ? d.toLocaleDateString("es-CO", { weekday:"short", day:"2-digit" }).toUpperCase() : "—";
      const hora = d ? fmtTime(d) : "—";
      card.innerHTML = `
        <div class="coord-cita-card__when">
          <div class="coord-cita-card__when-d">${escHTML(dia)}</div>
          <div class="coord-cita-card__when-t">${escHTML(hora)}</div>
        </div>
        <div class="coord-cita-card__main">
          <strong>${escHTML(c.acudiente || "Acudiente")}</strong>
          <span>${escHTML(c.estudiante || "—")}${c.grado ? " · " + escHTML(c.grado) : ""}</span>
          <span style="font-size:11.5px;color:var(--c-text-3);">${escHTML(c.docente || "")}</span>
        </div>
        <span class="coord-status" data-estado="${escHTML(c.estado || "pendiente")}">${escHTML(c.estado || "pendiente")}</span>
      `;
      card.addEventListener("click", () => openCitaSheet(c));
      list.appendChild(card);
    });
  }

  function openCitaSheet(c) {
    $("#sheetCitaSub").textContent = c._date ? fmtDateTime(c._date) : "Sin fecha";
    const body = $("#sheetCitaBody");
    body.innerHTML = `
      <div class="coord-block">
        <div class="coord-block__label">Acudiente</div>
        <div class="coord-block__value">${escHTML(c.acudiente || "—")}</div>
      </div>
      <div class="coord-block">
        <div class="coord-block__label">Estudiante</div>
        <div class="coord-block__value">${escHTML(c.estudiante || "—")}${c.grado ? " · " + escHTML(c.grado) : ""}</div>
      </div>
      <div class="coord-block">
        <div class="coord-block__label">Docente</div>
        <div class="coord-block__value">${escHTML(c.docente || "—")}</div>
      </div>
      ${c.motivo ? `<div class="coord-block"><div class="coord-block__label">Motivo</div><div class="coord-block__value">${escHTML(c.motivo)}</div></div>` : ""}
      <div class="coord-block">
        <div class="coord-block__label">Estado</div>
        <div class="coord-block__value"><span class="coord-status" data-estado="${escHTML(c.estado||"pendiente")}">${escHTML(c.estado||"pendiente")}</span></div>
      </div>
      ${c.acta ? `<div class="coord-block"><div class="coord-block__label">Acta</div><div class="coord-block__value"><a href="${escHTML(c.acta)}" target="_blank" rel="noopener">Abrir acta →</a></div></div>` : ""}
    `;
    openSheet("sheetCita");
  }

  /* ------------------------------------------------------
     SOLICITUDES
  ------------------------------------------------------ */
  async function ensureSolicitudes() {
    if (state.cache.cierres) { renderSolicitudes(); return; }
    const list = $("#coordSolList");
    if (list) list.innerHTML = skelCards(3);

    try {
      const resp = await apiPost(API, { action: "cierresPendientes", correo: state.user.correo });
      const data = resp?.data || resp;
      const arr = data?.cierres || data?.lista || data || [];
      state.cache.cierres = Array.isArray(arr) ? arr : [];
      renderSolicitudes();
    } catch (err) {
      console.error(err);
      if (list) list.innerHTML = errorState("No se pudieron cargar las solicitudes.", () => { state.cache.cierres = null; ensureSolicitudes(); });
    }
  }

  function renderSolicitudes() {
    const list = $("#coordSolList");
    list.innerHTML = "";
    const arr = state.cache.cierres || [];
    if (!arr.length) {
      list.innerHTML = `
        <div class="coord-empty coord-empty--soft">
          <div class="coord-empty__icon">
            <svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
          </div>
          <h4>Sin solicitudes pendientes</h4>
          <p>No hay solicitudes de cierre o cambios por revisar.</p>
        </div>`;
      return;
    }
    arr.forEach(s => {
      const card = el("div", { class: "coord-sol-card" });
      const fecha = s.fecha || s.fechaInicio || s.fechaSolicitud;
      card.innerHTML = `
        <div>
          <div class="coord-sol-card__title">${escHTML(s.titulo || s.tipo || "Solicitud")}</div>
          <div class="coord-sol-card__sub">${escHTML(s.docente || s.nombreDocente || "")}</div>
          <div class="coord-sol-card__meta">
            ${fecha ? escHTML(fmtDateTime(fecha)) : ""}
            ${s.motivo ? `<span class="dot"></span>${escHTML(s.motivo)}` : ""}
          </div>
        </div>
        <span class="coord-status" data-estado="${escHTML(String(s.estado||"pendiente").toLowerCase())}">${escHTML(s.estado || "pendiente")}</span>
      `;
      list.appendChild(card);
    });
  }

  /* ------------------------------------------------------
     DOCENTES (vista)
  ------------------------------------------------------ */
  function renderDocentes() {
    const grid = $("#coordDocentesGrid");
    grid.innerHTML = "";
    let docs = state.pln.docentes.slice();

    const q = state.docs.query.toLowerCase().trim();
    if (q) docs = docs.filter(d => ((d.nombreDocente||"") + " " + (d.correo||"")).toLowerCase().includes(q));

    docs.sort((a,b) => (a.nombreDocente||"").localeCompare(b.nombreDocente||"", "es"));
    $("#coordDocSub").textContent = `${docs.length} docente${docs.length === 1 ? "" : "s"} · Periodo ${state.periodo} · Semana ${state.semana}`;

    if (!docs.length) {
      grid.innerHTML = `
        <div class="coord-empty coord-empty--soft" style="grid-column:1/-1;">
          <div class="coord-empty__icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 19c0-3 3-5 7-5s7 2 7 5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
          </div>
          <h4>Sin docentes</h4>
          <p>No hay docentes que coincidan con la búsqueda.</p>
        </div>`;
      return;
    }

    docs.forEach(d => {
      const total = (d.asignaciones||[]).length;
      const entregadas = (d.asignaciones||[]).filter(a => a.entregada).length;
      const aprobadas = (d.asignaciones||[]).filter(a => normEstado(a.estadoRevision) === "aprobada").length;
      const est = normEstado(d.estadoGlobal);

      const card = el("button", { class: "coord-docente-card", type: "button" });
      card.innerHTML = `
        <div class="coord-docente-card__head">
          <span class="coord-docente-card__avatar">${escHTML(initials(d.nombreDocente))}</span>
          <div style="flex:1;min-width:0;">
            <div class="coord-docente-card__name">${escHTML(d.nombreDocente || "—")}</div>
            <div class="coord-docente-card__email">${escHTML(d.correo || "")}</div>
          </div>
          <span class="coord-status" data-estado="${est}">${escHTML(estadoLabel(est))}</span>
        </div>
        <div class="coord-docente-card__metrics">
          <div class="coord-docente-card__metric"><strong>${total}</strong>Asignaciones</div>
          <div class="coord-docente-card__metric"><strong>${entregadas}</strong>Entregadas</div>
          <div class="coord-docente-card__metric"><strong>${aprobadas}</strong>Aprobadas</div>
        </div>
      `;
      card.addEventListener("click", () => {
        state.pln.docenteSel = d.docenteId || d.correo;
        state.pln.asignacionSel = null;
        setView("planeaciones");
      });
      grid.appendChild(card);
    });
  }

  /* ------------------------------------------------------
     CARGA Y REFRESCO
  ------------------------------------------------------ */
  async function refreshDataForPeriodWeek() {
    showSkeletonKpis();
    showSkeletonsPlaneaciones();
    const data = await cargarPlaneacionesCoordinacion();
    renderInicio(data);
    renderSemana();
    renderPlnRoot();
    if (state.view === "docentes") renderDocentes();
  }

   function ocultarSplashCoord() {
  const splash = document.getElementById("coordSplash");
  if (!splash) return;

  splash.classList.add("fade-out");

  setTimeout(() => {
    splash.style.display = "none";
  }, 550);
}

  async function cargarDashboard() {
  paintHeaderUser();
  paintPeriodLabel();
  buildWeekSelect();
  renderSemana();

  // Citas en paralelo porque alimentan el KPI "Citas de hoy".
  ensureCitas();

  const data = await cargarPlaneacionesCoordinacion();
  renderInicio(data);
  renderPlnRoot();

  // Quitar splash inicial.
  ocultarSplashCoord();
  document.body.dataset.loading = "false";
}

  /* ------------------------------------------------------
     EVENTOS GLOBALES
  ------------------------------------------------------ */
  function bindEvents() {
    // Nav top
    $$('.coord-nav__item').forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
    // Bottom nav
    $$('.coord-bottomnav__item').forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
    // Botones internos data-goto
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-goto]");
      if (t) setView(t.dataset.goto);
    });

    // Periodo
    $$('.coord-segmented__btn').forEach(b => b.addEventListener("click", () => setPeriodo(b.dataset.periodo)));

    // Logout
    $("#btnLogout")?.addEventListener("click", logout);
    $("#btnLogoutMobile")?.addEventListener("click", logout);

    // Calendario completo
    $("#btnOpenFullCal")?.addEventListener("click", openFullCalendar);

    // Sheets close
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-close-sheet]")) {
        const sh = e.target.closest(".coord-sheet");
        if (sh) closeSheet(sh.id);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSheet();
    });

    // Planeaciones · search/filter
    $("#coordPlnSearch")?.addEventListener("input", (e) => {
      state.pln.query = e.target.value;
      renderDocentesPln();
    });
    $$('#coordPlnFilters .coord-chip').forEach(c => c.addEventListener("click", () => {
      $$('#coordPlnFilters .coord-chip').forEach(x => x.classList.remove("is-active"));
      c.classList.add("is-active");
      state.pln.filterEstado = c.dataset.filter;
      renderDocentesPln();
    }));

    // Backs en planeaciones (mobile)
    $$('.coord-pln__back').forEach(b => b.addEventListener("click", () => {
      const wrap = $("#coordPln");
      const target = b.dataset.back;
      if (target === "docentes") { wrap.dataset.mobileStep = "docentes"; }
      else if (target === "materias") { wrap.dataset.mobileStep = "materias"; }
    }));

    // Citas filtros
    $("#coordCitasSearch")?.addEventListener("input", e => { state.citas.query = e.target.value; renderCitas(); });
    $("#coordCitasEstado")?.addEventListener("change", e => { state.citas.estado = e.target.value; renderCitas(); });
    $("#coordCitasRango")?.addEventListener("change", e => { state.citas.rango = e.target.value; renderCitas(); });
    $("#btnReloadCitas")?.addEventListener("click", () => { state.cache.citas = null; ensureCitas(); });

    // Docentes search
    $("#coordDocSearch")?.addEventListener("input", e => { state.docs.query = e.target.value; renderDocentes(); });

    // Solicitudes reload
    $("#btnReloadSol")?.addEventListener("click", () => { state.cache.cierres = null; ensureSolicitudes(); });

    // Enviar ajustes
    $("#btnEnviarAjustes")?.addEventListener("click", enviarAjustes);

    // Init mobile step
    const wrap = $("#coordPln");
    if (wrap) wrap.dataset.mobileStep = "docentes";
  }

  /* ------------------------------------------------------
     BOOT
  ------------------------------------------------------ */
  async function boot() {
    bindEvents();
    const u = await validarSesion();
    if (!u) return;
    state.user = u;
    await cargarDashboard();
  }

  document.addEventListener("DOMContentLoaded", boot);

  // Exponer mínimo para depuración (no compromete seguridad)
  window.__coord = { state, refresh: refreshDataForPeriodWeek };

})();
