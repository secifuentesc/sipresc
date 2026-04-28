const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxaErInUj96K3bJtArXlc0QXsPtaxQ-L4TYmSVz8Qky68bZ8HWtE5-Z2SWlarPa0iu5/exec";

// ⏱️ Timeout para evitar cuelgues
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
    console.log("REQ:", req.method, req.query || req.body);

    // 🔵 GET
    if (req.method === "GET") {

      const accion = (req.query?.accion || "").trim();
      const correo = (req.query?.correo || "").trim();

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

    // 🔴 POST
    if (req.method === "POST") {

      // 🔥 IMPORTANTE: aceptar lo que venga (FormData convertido o JSON)
      const payload = req.body || {};

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

    // ❌ Método no permitido
    return res.status(405).json({
      ok: false,
      mensaje: "Método no permitido"
    });

  } catch (error) {

    console.error("ERROR:", error);

    const isTimeout = error.name === "AbortError";

    return res.status(isTimeout ? 504 : 500).json({
      ok: false,
      mensaje: isTimeout
        ? "Tiempo de espera agotado"
        : error.message
    });
  }
}
