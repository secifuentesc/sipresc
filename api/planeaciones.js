// /api/planeaciones.js
// Vercel Serverless Function - Proxy a Google Apps Script para planeaciones.
//
// Esta versión REENVÍA TODOS los parámetros (no solo "accion" y "correo"),
// para soportar nuevas acciones como "dashboardCoordinacion" que requieren
// "periodo", "semana", "planeacionId", etc.
//
// Compatibilidad: las acciones existentes siguen funcionando igual,
// porque solo se AGREGAN parámetros — no se quitan ni renombran.

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwqfbF0kAUBl2t_ot7sHfJgBN9-4Ana6OHqrqb4_tYJd5xZHtw1AohGEz3sZ-OU4AfcbQ/exec";

export default async function handler(req, res) {
  // CORS / cache
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (!APPS_SCRIPT_URL) {
    return res.status(500).json({
      ok: false,
      error: "APPS_SCRIPT_URL no configurado en variables de entorno."
    });
  }

  try {
    if (req.method === "GET") {
      // Reenviar TODOS los query params al backend
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query || {})) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          v.forEach(val => params.append(k, val));
        } else {
          params.append(k, String(v));
        }
      }

      const url = `${APPS_SCRIPT_URL}?${params.toString()}`;
      const r = await fetch(url, {
        method: "GET",
        redirect: "follow"
      });
      const text = await r.text();
      // Apps Script devuelve JSON; si no, lo devolvemos como texto plano
      try {
        const json = JSON.parse(text);
        return res.status(r.status).json(json);
      } catch {
        return res.status(r.status).send(text);
      }
    }

    if (req.method === "POST") {
      // Reenviar el body íntegro como JSON al backend
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { /* dejarlo como string */ }
      }
      const payload = typeof body === "object" ? JSON.stringify(body) : String(body || "{}");

      const r = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        redirect: "follow"
      });
      const text = await r.text();
      try {
        const json = JSON.parse(text);
        return res.status(r.status).json(json);
      } catch {
        return res.status(r.status).send(text);
      }
    }

    return res.status(405).json({ ok: false, error: "Método no permitido" });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Fallo en proxy de planeaciones",
      detail: String(err && err.message || err)
    });
  }
}
