const PRODUCTION_ORIGINS = new Set([
  'https://sipresc.co',
  'https://www.sipresc.co',
  // TEMPORAL: URL de preview, quitar antes de merge a main
  'https://sipresc-6k19tny2b-secifuentes-7177s-projects.vercel.app'
]);

function isLocalOrigin(origin) {
  if (process.env.VERCEL_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!origin) return true;
  if (!PRODUCTION_ORIGINS.has(origin) && !isLocalOrigin(origin)) return false;

  res.setHeader('Access-Control-Allow-Origin', origin);
  return true;
}

function serviceUnavailable(res) {
  return res.status(502).json({
    ok: false,
    mensaje: 'Servicio temporalmente no disponible'
  });
}

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ ok: false, mensaje: 'Origen no autorizado' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      mensaje: 'Método no permitido'
    });
  }

  try {

    const GAS_URL = "https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec";

    const response = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(req.body),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();

    if (!response.ok) {
      console.warn('PROXY_UPSTREAM_HTTP_ERROR', { status: response.status });
      return serviceUnavailable(res);
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.warn('PROXY_UPSTREAM_INVALID_JSON', { status: response.status });
      return serviceUnavailable(res);
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('PROXY_REQUEST_FAILED', {
      name: error && error.name ? error.name : 'Error'
    });
    return serviceUnavailable(res);
  }
}
