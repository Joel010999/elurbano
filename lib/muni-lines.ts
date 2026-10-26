import lines from './muni-lines.json';

export interface MuniLine {
  id: string;
  number: string;
  name: string;
}

export const MUNI_LINES: MuniLine[] = lines as MuniLine[];

export const LINE_NUMBERS: string[] = Array.from(new Set(MUNI_LINES.map((l) => l.number))).sort(
  (a, b) => parseInt(a, 10) - parseInt(b, 10),
);

export function isLineaMunicipal(linea: string): boolean {
  return LINE_NUMBERS.includes(linea);
}
