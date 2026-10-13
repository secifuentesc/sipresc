const COOKIE_NAME = '__Host-sipresc_session_v2';
const COOKIE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

const PRODUCTION_ORIGINS = new Set([
  'https://sipresc.co',
  'https://www.sipresc.co'
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

export function applyCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!origin) return true;
  if (!PRODUCTION_ORIGINS.has(origin) && !isLocalOrigin(origin)) return false;

  res.setHeader('Access-Control-Allow-Origin', origin);
  return true;
}

export function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function parseCookies(header) {
  const cookies = {};

  for (const part of String(header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;

    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!name) continue;

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

export function readSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

export function setSessionCookie(res, token) {
  const expires = new Date(Date.now() + COOKIE_MAX_AGE_SECONDS * 1000);
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    `Expires=${expires.toUTCString()}`
  ].join('; ');

  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res) {
  const cookie = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ].join('; ');

  res.setHeader('Set-Cookie', cookie);
}

export function projectIdentity(data) {
  return {
    ok: true,
    correo: String(data.correo || ''),
    rol: String(data.rol || ''),
    nombre: String(data.nombre || '')
  };
}

export function serviceUnavailable(res) {
  return res.status(502).json({
    ok: false,
    error: 'SERVICIO_NO_DISPONIBLE',
    mensaje: 'Servicio temporalmente no disponible'
  });
}

export async function postToAdmin(payload) {
  const gasUrl = String(process.env.SIPRESC_ADMIN_GAS_URL || '').trim();
  if (!gasUrl) throw new Error('ADMIN_GAS_URL_NOT_CONFIGURED');

  let parsedUrl;
  try {
    parsedUrl = new URL(gasUrl);
  } catch {
    throw new Error('ADMIN_GAS_URL_INVALID');
  }

  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'script.google.com') {
    throw new Error('ADMIN_GAS_URL_INVALID');
  }

  const response = await fetch(parsedUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });

  if (!response.ok) throw new Error('ADMIN_GAS_HTTP_ERROR');

  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('ADMIN_GAS_INVALID_RESPONSE');
    }
    return data;
  } catch {
    throw new Error('ADMIN_GAS_INVALID_RESPONSE');
  }
}

export async function handleVerifyCode(req, res, suppliedBody) {
  const body = suppliedBody || parseRequestBody(req);
  const correo = typeof body.correo === 'string' ? body.correo.trim().toLowerCase() : '';
  const codigo = typeof body.codigo === 'string' || typeof body.codigo === 'number'
    ? String(body.codigo).trim()
    : '';

  if (!correo || !codigo) {
    return res.status(400).json({
      ok: false,
      error: 'DATOS_INVALIDOS',
      mensaje: 'Correo y código son obligatorios'
    });
  }

  try {
    const data = await postToAdmin({
      action: 'verificarCodigo',
      correo,
      codigo
    });

    if (!data.ok || typeof data.token !== 'string' || !data.token.trim()) {
      return res.status(200).json({
        ok: false,
        error: 'OTP_INVALIDO',
        mensaje: 'Código inválido o vencido'
      });
    }

    setSessionCookie(res, data.token.trim());
    return res.status(200).json(projectIdentity(data));
  } catch {
    return serviceUnavailable(res);
  }
}

export { COOKIE_NAME, COOKIE_MAX_AGE_SECONDS };
