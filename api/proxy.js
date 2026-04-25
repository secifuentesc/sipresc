export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, mensaje:'Método no permitido' });
  }

  try {
    const response = await fetch(
      'https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(req.body || {})
      }
    );

    const text = await response.text();

    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch {
      return res.status(500).json({
        ok:false,
        mensaje:'Apps Script devolvió HTML',
        raw:text.substring(0,200)
      });
    }

  } catch (error) {
    return res.status(500).json({
      ok:false,
      mensaje:error.message
    });
  }
}
