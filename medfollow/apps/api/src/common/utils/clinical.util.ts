/** Edad en anos cumplidos; 40 por defecto si no hay fecha de nacimiento registrada. */
export function ageInYears(birthDate?: Date | null, reference: Date = new Date()): number {
  if (!birthDate) return 40;
  let age = reference.getFullYear() - birthDate.getFullYear();
  const monthDiff = reference.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < birthDate.getDate())) age -= 1;
  return Math.max(0, age);
}

/** Dia de seguimiento: 1 es el dia siguiente a la consulta. */
export function followUpDay(startDate: Date, reference: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const now = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).getTime();
  return Math.max(0, Math.round((now - start) / msPerDay));
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Prioridad de cola de alertas: 1 (rojo) a 3 (verde). */
export function alertPriority(level: 'GREEN' | 'YELLOW' | 'RED'): number {
  if (level === 'RED') return 1;
  if (level === 'YELLOW') return 2;
  return 3;
}

/** Verifica si la hora local esta dentro del horario silencioso del hospital. */
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
