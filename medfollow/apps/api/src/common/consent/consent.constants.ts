/**
 * Consentimiento informado digital para el canal de seguimiento.
 * Ley 1581 de 2012 (proteccion de datos personales), Decreto 1377 de 2013
 * y Ley 23 de 1981 (deberes del profesional de la salud).
 */
export const CONSENT_TEXT_VERSION = '2026.1';

export const CONSENT_TEXT = [
  'Autorizacion de tratamiento de datos personales y seguimiento por WhatsApp.',
  'El hospital usara este canal para hacer seguimiento a tu evolucion despues de la consulta,',
  'recordarte tu tratamiento y detectar senales que requieran atencion.',
  'Tus datos se tratan conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013,',
  'se almacenan cifrados y solo el personal autorizado del hospital puede consultarlos.',
  'Este canal no reemplaza una consulta medica ni atiende urgencias.',
  'Puedes retirar tu autorizacion en cualquier momento escribiendo RETIRO.',
  'Responde ACEPTO para autorizar el seguimiento.',
].join(' ');

export const CONSENT_ACCEPT_WORDS = ['acepto', 'autorizo', 'si acepto', 'de acuerdo', 'si autorizo'];
export const CONSENT_WITHDRAW_WORDS = ['retiro', 'no autorizo', 'cancelar seguimiento', 'no quiero mas mensajes'];
