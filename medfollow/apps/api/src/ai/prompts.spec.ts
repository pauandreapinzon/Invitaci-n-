import { containsProhibitedContent } from './prompts';

/**
 * El MVP excluye explicitamente diagnosticar y prescribir.
 * Estas comprobaciones son la ultima barrera antes de enviar texto al paciente.
 */
describe('barrera de contenido prohibido', () => {
  it.each([
    'Toma 500 mg de acetaminofen cada 8 horas',
    'Te recomiendo tomar otra pastilla hoy',
    'Puedes duplicar la dosis del antibiotico',
    'Por lo que describes tienes neumonia',
    'Suspende el medicamento hasta nueva orden',
  ])('bloquea una respuesta con prescripcion o diagnostico: %s', (text) => {
    expect(containsProhibitedContent(text)).toBe(true);
  });

  it.each([
    'Gracias por responder. Continua el tratamiento como te lo indicaron y cuentame si algo cambia.',
    'La dificultad para respirar es un signo de alarma, acude a urgencias ahora.',
    'Te has tomado la temperatura? Cual fue el valor?',
    'Me alegra saber que vas mejor.',
  ])('permite mensajes de acompanamiento: %s', (text) => {
    expect(containsProhibitedContent(text)).toBe(false);
  });
});
