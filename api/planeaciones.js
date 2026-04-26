const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxaErInUj96K3bJtArXlc0QXsPtaxQ-L4TYmSVz8Qky68bZ8HWtE5-Z2SWlarPa0iu5/exec";

export default async function handler(req, res) {

  try {

    // 🔵 GET
    if (req.method === "GET") {

      const { accion, correo } = req.query;

      const url = `${SCRIPT_URL}?accion=${accion}&correo=${encodeURIComponent(correo)}`;

      const response = await fetch(url, {
  method: "GET",
  redirect: "follow",
  headers: {
    "Accept": "application/json"
  }
});

      const text = await response.text();

      console.log("RESPUESTA BACKEND:", text);

      // 🔥 FORZAR JSON (clave)
      try {
        const json = JSON.parse(text);
        return res.status(200).json(json);
      } catch {
        return res.status(500).json({
          ok: false,
          mensaje: text
        });
      }
    }

    // 🔴 POST
    if (req.method === "POST") {

      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(req.body)
      });

      const text = await response.text();

      try {
        const json = JSON.parse(text);
        return res.status(200).json(json);
      } catch {
        return res.status(500).json({
          ok: false,
          mensaje: text
        });
      }
    }

    return res.status(405).json({
      ok: false,
      mensaje: "Método no permitido"
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      mensaje: error.message
    });

  }
}
