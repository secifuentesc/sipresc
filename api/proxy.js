export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        ok: false,
        mensaje: 'Método no permitido'
      });
    }

    const GAS_URL = "https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec";

    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(req.body)
    });

    const text = await response.text();

    // 🔥 si GAS devuelve HTML → lo detectamos
    if (text.startsWith('<!DOCTYPE')) {
      return res.status(500).json({
        ok: false,
        mensaje: 'Apps Script está devolviendo HTML',
        raw: text
      });
    }

    return res.status(200).json(JSON.parse(text));

  } catch (err) {
    return res.status(500).json({
      ok: false,
      mensaje: err.message
    });
  }
}
