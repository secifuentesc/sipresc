// ============================================================
// anti-debug.js - SIPRESC
// Bloqueo de inspección + modo admin con tecla secreta
// Compatible con Windows, Mac y Linux
// Tecla secreta: Ctrl + Shift (Windows/Linux) o Cmd + Shift (Mac)
// ============================================================

(function() {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // DETECTAR SISTEMA OPERATIVO (solo para info visual)
  // ──────────────────────────────────────────────────────────
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const teclaModificador = isMac ? 'Cmd' : 'Ctrl';

  // ──────────────────────────────────────────────────────────
  // TECLA SECRETA: Ctrl/Cmd + Shift (cualquier Shift)
  // ──────────────────────────────────────────────────────────
  let modoAdminTemporal = false;
  let contadorTecla = 0;
  let tiempoUltimaTecla = 0;

  document.addEventListener('keydown', (e) => {
    // Detectar Ctrl (Windows/Linux) o Cmd (Mac) + Shift
    const modificadorPresionado = (e.ctrlKey || e.metaKey);
    const shiftPresionado = (e.shiftKey || e.key === 'Shift');
    
    if (modificadorPresionado && shiftPresionado) {
      e.preventDefault();
      
      const ahora = Date.now();
      if (ahora - tiempoUltimaTecla < 500) {
        contadorTecla++;
      } else {
        contadorTecla = 1;
      }
      tiempoUltimaTecla = ahora;
      
      if (contadorTecla >= 3) {
        modoAdminTemporal = !modoAdminTemporal;
        contadorTecla = 0;
        
        // Feedback visual
        const msg = document.createElement('div');
        msg.textContent = modoAdminTemporal 
          ? `👑 Modo inspección ACTIVADO (${teclaModificador}+Shift para desactivar)` 
          : `🔒 Modo inspección DESACTIVADO`;
        msg.style.cssText = `
          position: fixed; top: 20px; right: 20px; z-index: 99999;
          background: #0d1f3c; border: 1px solid #c9962a;
          border-radius: 12px; padding: 8px 16px;
          font-family: monospace; font-size: 12px;
          color: #e8edf8; backdrop-filter: blur(10px);
          animation: fadeOutMsg 2s ease forwards;
        `;
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2000);
      }
    }
  });

  // Si el modo admin está activo, NO bloqueamos nada
  function bloqueoActivo() {
    return !modoAdminTemporal;
  }

  // ──────────────────────────────────────────────────────────
  // MENSAJE ESTILO SIPRESC
  // ──────────────────────────────────────────────────────────
  function mostrarMensajeSipresc() {
    if (!bloqueoActivo()) return;
    if (document.getElementById('sipresc-toast-msg')) return;
    
    const div = document.createElement('div');
    div.id = 'sipresc-toast-msg';
    div.innerHTML = `
      <div style="
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: #0d1f3c;
        border: 1px solid rgba(201,150,42,0.3);
        border-radius: 12px;
        padding: 12px 20px;
        font-family: -apple-system, 'Helvetica Neue', sans-serif;
        font-size: 13px;
        color: #e8edf8;
        backdrop-filter: blur(20px);
        background: rgba(13,31,60,0.95);
        box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        z-index: 99999;
        text-align: center;
        pointer-events: none;
        animation: fadeInUp 0.25s ease;
      ">
        ¿Necesitas copiar algo? Ctrl + C funciona perfectamente.
      </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      @keyframes fadeOutMsg {
        0% { opacity: 1; transform: translateY(0); }
        70% { opacity: 1; }
        100% { opacity: 0; transform: translateY(-10px); visibility: hidden; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(div);
    
    setTimeout(() => div.remove(), 4000);
  }

  // ──────────────────────────────────────────────────────────
  // CAPA 1: Clic derecho
  // ──────────────────────────────────────────────────────────
  document.addEventListener('contextmenu', (e) => {
    if (!bloqueoActivo()) return;
    e.preventDefault();
    mostrarMensajeSipresc();
  });

  // ──────────────────────────────────────────────────────────
  // CAPA 2: Teclas de desarrollador (PERMITIR Ctrl+C / Cmd+C)
  // ──────────────────────────────────────────────────────────
  const teclasProhibidas = ['F12', 'F11', 'F10', 'F9', 'F8', 'F7', 'F6', 'F5'];
  
  // Combinaciones de copiar/pegar que NO deben bloquearse
  const comandosPermitidos = (modificador, tecla) => {
    const teclaUpper = tecla.toUpperCase();
    // Permitir Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A
    if (modificador && (teclaUpper === 'C' || teclaUpper === 'V' || teclaUpper === 'X' || teclaUpper === 'A')) {
      return true;
    }
    return false;
  };
  
  document.addEventListener('keydown', (e) => {
    if (!bloqueoActivo()) return;
    
    const modificador = (e.ctrlKey || e.metaKey);
    const tecla = e.key;
    const teclaUpper = tecla.toUpperCase();
    
    // 🔥 PERMITIR copiar, pegar, cortar, seleccionar todo
    if (comandosPermitidos(modificador, tecla)) {
      return; // No bloquear
    }
    
    // Teclas de función (F12, etc.)
    if (teclasProhibidas.includes(tecla)) {
      e.preventDefault();
      mostrarMensajeSipresc();
      return;
    }
    
    // Combinaciones peligrosas (excepto las permitidas arriba)
    if (modificador && (
      teclaUpper === 'U' ||
      teclaUpper === 'I' ||
      teclaUpper === 'J' ||
      teclaUpper === 'S' ||
      teclaUpper === 'P' ||
      teclaUpper === 'K'
    )) {
      e.preventDefault();
      mostrarMensajeSipresc();
    }
    
    // Combinación con Shift: Ctrl/Cmd + Shift + ...
    if (modificador && e.shiftKey && (
      teclaUpper === 'I' ||
      teclaUpper === 'J' ||
      teclaUpper === 'C'
    )) {
      e.preventDefault();
      mostrarMensajeSipresc();
    }
    
    // Bloquear Cmd + Option + I/J/C/U en Mac (equivalente a Ctrl+Shift+I en Windows)
    if (isMac && e.metaKey && e.altKey && (
      teclaUpper === 'I' ||
      teclaUpper === 'J' ||
      teclaUpper === 'C' ||
      teclaUpper === 'U'
    )) {
      e.preventDefault();
      mostrarMensajeSipresc();
    }
  });

  // ──────────────────────────────────────────────────────────
  // CAPA 3: Detección de DevTools (universal)
  // ──────────────────────────────────────────────────────────
  function detectarDevTools() {
    if (!bloqueoActivo()) return;
    
    const umbral = 160;
    
    const medir = () => {
      const inicio = performance.now();
      debugger;
      const fin = performance.now();
      
      if (fin - inicio > umbral) {
        // DevTools detectado
        mostrarMensajeSipresc();
        document.body.innerHTML = `
          <div style="
            position:fixed;inset:0;
            background:#0a1628;
            display:flex;
            align-items:center;
            justify-content:center;
            flex-direction:column;
            z-index:99999;
            font-family:monospace;
          ">
            <div style="
              background:#1a1a2e;
              padding:40px;
              border-radius:20px;
              text-align:center;
              border:1px solid #c9962a;
            ">
              <div style="font-size:64px;margin-bottom:16px;">⚠️</div>
              <h2 style="color:#fff;margin-bottom:8px;">Acceso denegado</h2>
              <p style="color:#888;">Herramientas de desarrollo deshabilitadas</p>
            </div>
          </div>
        `;
        setTimeout(() => window.location.href = '/', 100);
      }
    };
    
    setInterval(medir, 1500);
  }
  
  detectarDevTools();
  
})();
