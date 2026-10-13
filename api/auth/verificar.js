import {
  applyCors,
  handleVerifyCode
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

  return handleVerifyCode(req, res);
}
