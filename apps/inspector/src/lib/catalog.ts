import urbanoLinesData from '../data/urbano-lines.json';

export type MapPath = { direction: string; coordinates: [number, number][]; color?: string };
type UrbanoLine = { id: string; number: string; name: string; paths: MapPath[] };

export const URBANO_LINES = urbanoLinesData as UrbanoLine[];

export const LINE_NUMBERS = Array.from(new Set(URBANO_LINES.map((l) => l.number))).sort(
  (a, b) => parseInt(a, 10) - parseInt(b, 10),
);

const PALETTE = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#6d4c41', '#d81b60', '#3949ab', '#7cb342', '#f4511e', '#546e7a'];

export function lineColor(n: string): string {
  const i = LINE_NUMBERS.indexOf(n);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length] ?? '#e53935';
}

export function lineNames(n: string): string {
  return URBANO_LINES.filter((l) => l.number === n).map((l) => l.name).join(' / ');
}

export function mapBusId(id: string): number {
  if (/^\d+$/.test(id)) return Number(id);
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(31, hash) + id.charCodeAt(i)) | 0;
  const n = Math.abs(hash);
  return n || 1;
}

/** Número grande del cartel: el id si ya es numérico, si no el último grupo de dígitos. */
export function numeroCartel(id: string): string {
  const limpio = id.trim();
  if (/^\d+$/.test(limpio)) return limpio;
  const grupos = limpio.match(/\d+/g);
  return grupos?.length ? grupos[grupos.length - 1] : limpio;
}
