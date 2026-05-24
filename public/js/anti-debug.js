// ============================================================
// BLOQUEO EXTREMO - Para poner en el <head> de TODAS las páginas
// ============================================================

(function() {
  'use strict';
  
  // ──────────────────────────────────────────────────────────
  // CAPA 1: Eventos del mouse
  // ──────────────────────────────────────────────────────────
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('dragstart', e => e.preventDefault());
  document.addEventListener('selectstart', e => e.preventDefault());
  
  // ──────────────────────────────────────────────────────────
  // CAPA 2: Teclas de desarrollador
  // ──────────────────────────────────────────────────────────
  const teclasProhibidas = [
    'F12', 'F11', 'F10', 'F9', 'F8', 'F7', 'F6', 'F5',
    'I', 'U', 'J', 'C', 'S', 'K', 'P'
  ];
  
  document.addEventListener('keydown', e => {
    // Bloquear teclas de función
    if(teclasProhibidas.includes(e.key)) {
      e.preventDefault();
      return;
    }
    
    // Bloquear combinaciones con Ctrl
    if(e.ctrlKey && (
      e.key === 'u' || e.key === 'U' ||
      e.key === 'i' || e.key === 'I' ||
      e.key === 'j' || e.key === 'J' ||
      e.key === 'c' || e.key === 'C' ||
      e.key === 's' || e.key === 'S' ||
      e.key === 'p' || e.key === 'P' ||
      e.key === 'k' || e.key === 'K'
    )) {
      e.preventDefault();
    }
    
    // Bloquear Ctrl+Shift+...
    if(e.ctrlKey && e.shiftKey && (
      e.key === 'I' || e.key === 'i' ||
      e.key === 'J' || e.key === 'j' ||
      e.key === 'C' || e.key === 'c'
    )) {
      e.preventDefault();
    }
  });
  
  // ──────────────────────────────────────────────────────────
  // CAPA 3: Detección y bloqueo de DevTools
  // ──────────────────────────────────────────────────────────
  function detectarDevTools() {
    const umbral = 160; // ms
    
    const medir = () => {
      const inicio = performance.now();
      debugger;
      const fin = performance.now();
      
      if(fin - inicio > umbral) {
        // DevTools detectado → destruir la página
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
        
        // También redirigir por si acaso
        setTimeout(() => {
          window.location.href = '/';
        }, 100);
      }
    };
    
    setInterval(medir, 1500);
  }
  
  detectarDevTools();
  
  // ──────────────────────────────────────────────────────────
  // CAPA EXTRA: Prevenir apertura de DevTools antes de cargar
  // ──────────────────────────────────────────────────────────
  (function() {
    const antes = Date.now();
    debugger;
    const despues = Date.now();
    if(despues - antes > 50) {
      window.location.href = '/';
    }
  })();
  
})();
