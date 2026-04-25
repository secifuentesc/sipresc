export default async function handler(req, res) {

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

    const body = typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);

    const response = await fetch(GAS_URL, {
  method: 'POST',
  body: JSON.stringify(req.body)
});

    const text = await response.text();

    let clean = text.trim();

    if (clean.startsWith(")]}'")) {
      clean = clean.substring(4).trim();
    }

    if (clean.startsWith("<")) {
      return res.status(500).json({
        ok: false,
        mensaje: 'Google devolvió HTML y no JSON',
        raw: text
      });
    }

    let data;

    try {
      data = JSON.parse(clean);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        mensaje: 'Respuesta inválida del backend',
        raw: text
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno del proxy',
      error: error.message
    });
  }
}
