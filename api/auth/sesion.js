import {
  applyCors,
  clearSessionCookie,
  postToAdmin,
  projectIdentity,
  readSessionToken,
  serviceUnavailable
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
  if (!token) {
    return res.status(200).json({ ok: false });
  }

  try {
    const data = await postToAdmin({ action: 'validarSesion', token });

    if (!data.ok) {
      clearSessionCookie(res);
      return res.status(200).json({ ok: false });
    }

    return res.status(200).json(projectIdentity(data));
  } catch {
    return serviceUnavailable(res);
  }
}
