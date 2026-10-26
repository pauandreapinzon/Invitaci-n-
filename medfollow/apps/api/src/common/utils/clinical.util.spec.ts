import { ageInYears, alertPriority, followUpDay, firstName, isQuietHour } from './clinical.util';

describe('utilidades clinicas', () => {
  it('calcula la edad en anos cumplidos', () => {
    const reference = new Date('2026-06-15T12:00:00Z');
    expect(ageInYears(new Date('1986-06-14'), reference)).toBe(40);
    expect(ageInYears(new Date('1986-06-16'), reference)).toBe(39);
    expect(ageInYears(null, reference)).toBe(40);
  });

  it('calcula el dia de seguimiento desde la consulta', () => {
    const start = new Date('2026-06-10T08:00:00');
    expect(followUpDay(start, new Date('2026-06-10T20:00:00'))).toBe(0);
    expect(followUpDay(start, new Date('2026-06-13T07:00:00'))).toBe(3);
  });

  it('prioriza la cola de alertas por nivel de riesgo', () => {
    expect(alertPriority('RED')).toBeLessThan(alertPriority('YELLOW'));
    expect(alertPriority('YELLOW')).toBeLessThan(alertPriority('GREEN'));
  });

  it('respeta el horario silencioso que cruza la medianoche', () => {
    expect(isQuietHour(22, 21, 7)).toBe(true);
    expect(isQuietHour(3, 21, 7)).toBe(true);
    expect(isQuietHour(9, 21, 7)).toBe(false);
    expect(isQuietHour(7, 21, 7)).toBe(false);
  });

  it('toma el primer nombre para dirigirse al paciente', () => {
    expect(firstName('Maria Gomez Ruiz')).toBe('Maria');
  });
});
