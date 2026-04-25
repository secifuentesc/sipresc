export default async function handler(req, res) {
  try {
    // 🔴 SOLO permitir POST
    if (req.method !== 'POST') {
      return res.status(405).json({
        ok: false,
        mensaje: 'Método no permitido'
      });
    }

    const GAS_URL = "https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec";

    // 🔥 IMPORTANTE: req.body ya viene parseado en Vercel
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(req.body)
    });

    const text = await response.text();

    // 🔥 INTENTAR convertir a JSON seguro
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        mensaje: "Respuesta inválida de Apps Script",
        raw: text
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      ok: false,
      mensaje: error.message
    });
  }
}
