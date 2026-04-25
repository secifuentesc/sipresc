export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        ok: false,
        mensaje: 'Método no permitido'
      });
    }

    const GAS_URL = "https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec";

    // 🔥 LEER BODY REAL (CLAVE)
    let body = '';

    await new Promise((resolve, reject) => {
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', resolve);
      req.on('error', reject);
    });

    // 🔥 ENVIAR TAL CUAL A GAS
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: body
    });

    const text = await response.text();

    // 🔥 DEBUG (por si vuelve a fallar)
    console.log("RESPUESTA GAS:", text);

    // 🔥 INTENTAR PARSEAR
    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        mensaje: 'Apps Script no devolvió JSON',
        raw: text
      });
    }

  } catch (error) {
    return res.status(500).json({
      ok: false,
      mensaje: error.message
    });
  }
}
