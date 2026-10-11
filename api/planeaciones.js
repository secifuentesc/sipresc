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
const PRODUCTION_ORIGINS = new Set([
  "https://sipresc.co",
  "https://www.sipresc.co",
  // TEMPORAL: URL de preview, quitar antes de merge a main
  "https://sipresc-6k19tny2b-secifuentes-7177s-projects.vercel.app"
]);

function isLocalOrigin(origin) {
  if (process.env.VERCEL_ENV === "production") return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (!origin) return true;
  if (!PRODUCTION_ORIGINS.has(origin) && !isLocalOrigin(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  return true;
}

function serviceUnavailable(res) {
  return res.status(502).json({
    ok: false,
    mensaje: "Servicio temporalmente no disponible"
  });
}

export default async function handler(req, res) {
  // CORS / cache
  res.setHeader("Cache-Control", "no-store");

  if (!applyCors(req, res)) {
    return res.status(403).json({ ok: false, mensaje: "Origen no autorizado" });
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (!APPS_SCRIPT_URL) {
    return res.status(500).json({
      ok: false,
      mensaje: "Configuración del servicio no disponible"
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
      if (!r.ok) {
        console.warn("PLANEACIONES_UPSTREAM_HTTP_ERROR", { status: r.status });
        return serviceUnavailable(res);
      }
      try {
        const json = JSON.parse(text);
        return res.status(r.status).json(json);
      } catch {
        console.warn("PLANEACIONES_UPSTREAM_INVALID_JSON", { status: r.status });
        return serviceUnavailable(res);
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
      if (!r.ok) {
        console.warn("PLANEACIONES_UPSTREAM_HTTP_ERROR", { status: r.status });
        return serviceUnavailable(res);
      }
      try {
        const json = JSON.parse(text);
        return res.status(r.status).json(json);
      } catch {
        console.warn("PLANEACIONES_UPSTREAM_INVALID_JSON", { status: r.status });
        return serviceUnavailable(res);
      }
    }

    return res.status(405).json({ ok: false, error: "Método no permitido" });
  } catch (err) {
    console.error("PLANEACIONES_PROXY_FAILED", {
      name: err && err.name ? err.name : "Error"
    });
    return serviceUnavailable(res);
  }
}
