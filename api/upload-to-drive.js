// /api/upload-to-drive.js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwqfbF0kAUBl2t_ot7sHfJgBN9-4Ana6OHqrqb4_tYJd5xZHtw1AohGEz3sZ-OU4AfcbQ/exec";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  try {
    const { archivo, nombre, carpetaId } = req.body;

    if (!archivo || !nombre) {
      return res.status(400).json({ ok: false, error: "Faltan archivo o nombre" });
    }

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "subirArchivoDirecto",
        archivo: archivo,
        nombre: nombre,
        carpetaId: carpetaId
      })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
