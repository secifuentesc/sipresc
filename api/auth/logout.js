import {
  applyCors,
  clearSessionCookie,
  postToAdmin,
  readSessionToken
} from '../../lib/server/sipresc-session.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!applyCors(req, res)) {
    return res.status(403).json({ ok: false, mensaje: 'Origen no autorizado' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, mensaje: 'Método no permitido' });
  }

  const token = readSessionToken(req);
  let revocacionConfirmada = !token;

  if (token) {
    try {
      const data = await postToAdmin({ action: 'revocarSesion', token });
      revocacionConfirmada = data.ok === true;
    } catch {
      revocacionConfirmada = false;
    }
  }

  clearSessionCookie(res);
  return res.status(200).json({ ok: true, revocacionConfirmada });
}
