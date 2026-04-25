export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        ok: false,
        mensaje: 'Método no permitido'
      });
    }

    const GAS_URL = "https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec";

    // 🔥 IMPORTANTE: en Vercel req.body puede ser string o objeto
    const body = typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);

    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: body
    });

    const text = await response.text();

    console.log("RESPUESTA GAS:", text);

    // 🔥 Si GAS devuelve HTML → lo mostramos
    if (text.startsWith("<!DOCTYPE")) {
      return res.status(500).json({
        ok: false,
        mensaje: "Apps Script devolvió HTML (error)",
        raw: text
      });
    }

    const data = JSON.parse(text);
    return res.status(200).json(data);

  } catch (error) {
    console.error("ERROR PROXY:", error);

    return res.status(500).json({
      ok: false,
      mensaje: error.message
    });
  }
}
