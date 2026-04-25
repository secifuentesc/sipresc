const SCRIPT_PLANEACIONES_URL = 'https://script.google.com/a/macros/lapresentaciongirardota.edu.co/s/AKfycbxaErInUj96K3bJtArXlc0QXsPtaxQ-L4TYmSVz8Qky68bZ8HWtE5-Z2SWlarPa0iu5/exec';

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      mensaje: 'Método no permitido'
    });
  }

  try {

    const response = await fetch(SCRIPT_PLANEACIONES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(req.body)
    });

    const text = await response.text();

    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      return res.status(200).json({
        ok: false,
        mensaje: text
      });
    }

  } catch (error) {

    return res.status(500).json({
      ok: false,
      mensaje: error.message
    });

  }
}
