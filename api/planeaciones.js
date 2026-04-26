const SCRIPT_PLANEACIONES_URL = 'https://script.google.com/macros/s/AKfycbxaErInUj96K3bJtArXlc0QXsPtaxQ-L4TYmSVz8Qky68bZ8HWtE5-Z2SWlarPa0iu5/exec';

export default async function handler(req, res) {

  try {

    // 🔵 GET → CARGAR MATERIAS
    if (req.method === 'GET') {

      const { accion, correo } = req.query;

      const response = await fetch(
        `${SCRIPT_PLANEACIONES_URL}?accion=${accion}&correo=${correo}`
      );

      const data = await response.json();

      return res.status(200).json(data);
    }

    // 🔴 POST → GUARDAR PLANEACIÓN
    if (req.method === 'POST') {

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
    }

    return res.status(405).json({
      ok: false,
      mensaje: 'Método no permitido'
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      mensaje: error.message
    });

  }
}
