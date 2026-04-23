// Primary brand colour per Premier League club, keyed by FPL short_name.
// Used as the accent on the player hero. Fallback is the app's default accent.
const COLORS: Record<string, string> = {
  ARS: '#EF0107',
  AVL: '#670E36',
  BOU: '#DA291C',
  BRE: '#E30613',
  BHA: '#0057B8',
  BUR: '#6C1D45',
  CHE: '#034694',
  CRY: '#1B458F',
  EVE: '#003399',
  FUL: '#111111',
  IPS: '#3E74BC',
  LEE: '#FFCD00',
  LEI: '#003090',
  LIV: '#C8102E',
  LUT: '#F78F1E',
  MCI: '#6CABDD',
  MUN: '#DA291C',
  NEW: '#241F20',
  NFO: '#DD0000',
  SHU: '#EE2737',
  SOU: '#D71920',
  SUN: '#EB172B',
  TOT: '#132257',
  WHU: '#7A263A',
  WOL: '#FDB913',
};

export function teamColor(shortName: string | undefined | null): string {
  if (!shortName) return '#0071e3';
  return COLORS[shortName.toUpperCase()] ?? '#0071e3';
}
