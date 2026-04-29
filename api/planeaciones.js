const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwqfbF0kAUBl2t_ot7sHfJgBN9-4Ana6OHqrqb4_tYJd5xZHtw1AohGEz3sZ-OU4AfcbQ/exec";

// ⏱️ Timeout
async function fetchConTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req, res) {
  try {

    console.log("REQ:", req.method);

    // =========================
    // 🔵 GET
    // =========================
    if (req.method === "GET") {

      const accion = (req.query?.accion || "").trim();
      const correo = (req.query?.correo || "").trim();

      if (!accion) {
        return res.status(400).json({
          ok: false,
          mensaje: "Falta accion"
        });
      }

      const url = `${SCRIPT_URL}?accion=${encodeURIComponent(accion)}&correo=${encodeURIComponent(correo)}`;

      const response = await fetchConTimeout(url, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      const text = await response.text();
      console.log("RESPUESTA GET:", text);

      try {
        return res.status(200).json(JSON.parse(text));
      } catch {
        return res.status(500).json({
          ok: false,
          mensaje: text
        });
      }
    }

    // =========================
    // 🔴 POST
    // =========================
    if (req.method === "POST") {

      let payload = {};

      // 🔥 PARSEO SEGURO
      try {
        payload = typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};
      } catch (e) {
        payload = {};
      }

      // 🔥 FIX CLAVE: GARANTIZAR CORREO
      if (!payload.correo) {
        payload.correo = req.headers["x-correo"] || "";
      }

      console.log("PAYLOAD FINAL:", payload);

      if (!payload.correo) {
        return res.status(400).json({
          ok: false,
          mensaje: "Correo no enviado"
        });
      }

      // 🔥 ENVÍO A APPS SCRIPT
      const response = await fetchConTimeout(SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      console.log("RESPUESTA POST:", text);

      try {
        return res.status(200).json(JSON.parse(text));
      } catch {
        return res.status(500).json({
          ok: false,
          mensaje: text
        });
      }
    }

    // =========================
    // ❌ MÉTODO NO PERMITIDO
    // =========================
    return res.status(405).json({
      ok: false,
      mensaje: "Método no permitido"
    });

  } catch (error) {

    console.error("ERROR:", error);

    return res.status(500).json({
      ok: false,
      mensaje: error.message
    });
  }
}
