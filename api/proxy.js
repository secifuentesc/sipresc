import {
  applyCors,
  handleVerifyCode,
  parseRequestBody,
  postToAdmin,
  readSessionToken,
  serviceUnavailable
} from '../lib/server/sipresc-session.js';

const PUBLIC_ACTIONS = new Set([
  'enviarCodigo',
  'verificarCodigo',
  'disponibilidadCompleta',
  'grados',
  'estadoAgenda',
  'reservarCita',
  'horariosPublicos',
  'citasPublicas',
  'crearReserva',
  'cancelarToken'
]);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

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

  const body = parseRequestBody(req);
  const action = typeof body.action === 'string' ? body.action.trim() : '';

  if (action === 'verificarCodigo') {
    return handleVerifyCode(req, res, body);
  }

  // Estas acciones solo se atienden mediante /api/auth/sesion y /api/auth/logout.
  if (action === 'validarSesion' || action === 'revocarSesion') {
    return res.status(400).json({ ok: false, error: 'ACCION_NO_DISPONIBLE' });
  }

  const payload = { ...body, action };

  if (!PUBLIC_ACTIONS.has(action)) {
    const token = readSessionToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: 'SESION_INVALIDA' });
    }

    delete payload.correo;
    delete payload.rol;
    delete payload.nombre;
    delete payload.token;
    payload.token = token;
  }

  try {
    const data = await postToAdmin(payload);
    return res.status(200).json(data);
  } catch {
    return serviceUnavailable(res);
  }
}
