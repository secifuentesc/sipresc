export default async function handler(req, res) {

  // 🔥 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      mensaje: 'Método no permitido'
    });
  }

  try {

    const GAS_URL = "https://script.google.com/macros/s/AKfycbwqfbF0kAUBl2t_ot7sHfJgBN9-4Ana6OHqrqb4_tYJd5xZHtw1AohGEz3sZ-OU4AfcbQ/exec";

    const response = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(req.body),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();

    // 🔥 DEBUG REAL
    console.log("RESPUESTA GOOGLE:", text);

    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        mensaje: 'Google devolvió algo que no es JSON',
        raw: text
      });
    }

    return res.status(200).json(data);

  } catch (error) {

    console.error("ERROR PROXY:", error);

    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del proxy',
      error: error.message
    });
  }
}
