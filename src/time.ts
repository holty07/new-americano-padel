export type WindowTone = 'good' | 'warn' | 'over';

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;

  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

export function describeWindow(minutes: number): { label: string; tone: WindowTone } {
  if (minutes <= 90) return { label: 'Fits in 90 min', tone: 'good' };
  if (minutes <= 120) return { label: 'Needs up to 2 h', tone: 'warn' };
  return { label: 'Over 2 h', tone: 'over' };
}
