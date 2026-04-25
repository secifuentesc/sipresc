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

    const GAS_URL = "https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec";

    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const text = await response.text();

    // 🔥 LIMPIEZA ROBUSTA (NO solo replace simple)
    const clean = text
      .replace(/^\)\]\}'/, '') // ← más seguro (regex)
      .trim();

    let data;

    try {
      data = JSON.parse(clean);
    } catch (e) {
      console.error("RAW RESPONSE:", text);

      return res.status(500).json({
        ok: false,
        mensaje: 'Respuesta inválida del backend',
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
