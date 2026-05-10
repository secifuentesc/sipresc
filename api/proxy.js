export default async function handler(req, res) {
  // ─────────────────────────────
  // CORS
  // ─────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 🔥 URL actual de Google Apps Script
  const GAS_URL =
    'https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec';

  try {
    // ─────────────────────────────
    // GET
    // Ejemplo:
    // /api/proxy?accion=misPlaneacionesDocente&correo=...&periodo=2
    // ─────────────────────────────
    if (req.method === 'GET') {
      const query = new URLSearchParams(req.query).toString();
      const url = query ? `${GAS_URL}?${query}` : GAS_URL;

      console.log('[PROXY GET URL]', url);

      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow'
      });

      const text = await response.text();

      console.log('[RESPUESTA GOOGLE GET]', text);

      let data;

      try {
        data = JSON.parse(text);
      } catch (error) {
        return res.status(500).json({
          ok: false,
          mensaje: 'Google devolvió algo que no es JSON en GET',
          raw: text
        });
      }

      return res.status(200).json(data);
    }

    // ─────────────────────────────
    // POST
    // Ejemplo body:
    // {
    //   accion: "misPlaneacionesDocente",
    //   correo: "...",
    //   periodo: "2"
    // }
    // ─────────────────────────────
    if (req.method === 'POST') {
      let body = req.body;

      // Si Vercel lo recibe como texto, lo convertimos a objeto.
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (error) {
          body = {};
        }
      }

      // Seguridad por si llega vacío.
      if (!body || typeof body !== 'object') {
        body = {};
      }

      console.log('[PROXY POST BODY]', body);

      // Validación clave.
      if (!body.accion && !body.action) {
        return res.status(400).json({
          ok: false,
          mensaje: 'El proxy no recibió accion',
          bodyRecibido: body
        });
      }

      // Compatibilidad: si llega action, lo convierte a accion.
      if (!body.accion && body.action) {
        body.accion = body.action;
      }

      const response = await fetch(GAS_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const text = await response.text();

      console.log('[RESPUESTA GOOGLE POST]', text);

      let data;

      try {
        data = JSON.parse(text);
      } catch (error) {
        return res.status(500).json({
          ok: false,
          mensaje: 'Google devolvió algo que no es JSON en POST',
          raw: text
        });
      }

      return res.status(200).json(data);
    }

    // ─────────────────────────────
    // Método no permitido
    // ─────────────────────────────
    return res.status(405).json({
      ok: false,
      mensaje: 'Método no permitido'
    });

  } catch (error) {
    console.error('[ERROR PROXY]', error);

    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del proxy',
      error: error.message
    });
  }
}
