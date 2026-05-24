// Mensaje estilo SIPRESC cuando intentan inspeccionar
function mostrarMensajeSipresc() {
  // Evitar duplicados
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
  `;
  document.head.appendChild(style);
  document.body.appendChild(div);
  
  setTimeout(() => {
    div.remove();
  }, 4000);
}

// Disparar el mensaje en acciones sospechosas
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  mostrarMensajeSipresc();
});

document.addEventListener('keydown', (e) => {
  const teclas = ['F12', 'I', 'U', 'J', 'C', 'S'];
  if (e.ctrlKey && teclas.includes(e.key.toUpperCase())) {
    e.preventDefault();
    mostrarMensajeSipresc();
  }
  if (e.key === 'F12') {
    e.preventDefault();
    mostrarMensajeSipresc();
  }
});
