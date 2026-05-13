// Confederation membership for all 48 FIFA World Cup 2026 teams

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC'

export const CONFEDERATION_ORDER: Confederation[] = [
  'UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC',
]

export const CONFEDERATION_LABELS: Record<Confederation, string> = {
  UEFA:     '🇪🇺 UEFA — Europa',
  CONMEBOL: '🌎 CONMEBOL — Sudamérica',
  CONCACAF: '🏟 CONCACAF — Norte y Centro América',
  CAF:      '🌍 CAF — África',
  AFC:      '🌏 AFC — Asia',
  OFC:      '🌊 OFC — Oceanía',
}

export const CONFEDERATION_SHORT: Record<Confederation, string> = {
  UEFA:     'UEFA',
  CONMEBOL: 'CONMEBOL',
  CONCACAF: 'CONCACAF',
  CAF:      'CAF',
  AFC:      'AFC',
  OFC:      'OFC',
}

// Team code → Confederation
export const TEAM_CONFEDERATION: Record<string, Confederation> = {
  // UEFA (16 teams)
  CZE: 'UEFA', SUI: 'UEFA', BIH: 'UEFA', SCO: 'UEFA',
  GER: 'UEFA', NED: 'UEFA', SWE: 'UEFA', BEL: 'UEFA',
  ESP: 'UEFA', FRA: 'UEFA', NOR: 'UEFA', AUT: 'UEFA',
  POR: 'UEFA', ENG: 'UEFA', CRO: 'UEFA', TUR: 'UEFA',

  // CONMEBOL (6 teams)
  BRA: 'CONMEBOL', PAR: 'CONMEBOL', ECU: 'CONMEBOL',
  URU: 'CONMEBOL', ARG: 'CONMEBOL', COL: 'CONMEBOL',

  // CONCACAF (6 teams)
  MEX: 'CONCACAF', CAN: 'CONCACAF', HAI: 'CONCACAF',
  USA: 'CONCACAF', CUW: 'CONCACAF', PAN: 'CONCACAF',

  // CAF (10 teams)
  RSA: 'CAF', MAR: 'CAF', TUN: 'CAF', EGY: 'CAF', SEN: 'CAF',
  ALG: 'CAF', COD: 'CAF', GHA: 'CAF', CIV: 'CAF', CPV: 'CAF',

  // AFC (8 teams)
  KOR: 'AFC', QAT: 'AFC', JPN: 'AFC', IRN: 'AFC',
  KSA: 'AFC', IRQ: 'AFC', JOR: 'AFC', UZB: 'AFC',

  // OFC (2 teams)
  NZL: 'OFC', AUS: 'OFC',
}
