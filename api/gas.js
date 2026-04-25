export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const response = await fetch(
      'https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // 🔥 ESTE ES EL FIX
        },
        body: JSON.stringify(req.body),
      }
    );

    const text = await response.text();

    // 🔥 IMPORTANTE: devolver JSON real
    res.status(200).json(JSON.parse(text));

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
