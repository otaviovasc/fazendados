/**
 * Design tokens do jogo ("Tabuleiro da Fazenda"). Fonte única de cores,
 * tempos e tamanhos da camada /jogo — sprites e camadas importam daqui, nunca
 * hex solto. A paleta base conversa com os tokens do app (verde-pasto
 * #3E6B42, paper/ink do tailwind.config).
 *
 * Estação visual (hemisfério sul): `seasonalColors` sobrepõe tons de grama,
 * pasto e copa conforme a época do ano — só cor de SVG, nenhuma regra muda.
 */

export type Season = 'verao' | 'outono' | 'inverno' | 'primavera';

/** Estação do ano no hemisfério sul, derivada do mês. */
export function currentSeason(date: Date = new Date()): Season {
  const month = date.getMonth(); // 0 = janeiro
  if (month >= 2 && month <= 4) return 'outono'; // mar–mai
  if (month >= 5 && month <= 7) return 'inverno'; // jun–ago
  if (month >= 8 && month <= 10) return 'primavera'; // set–nov
  return 'verao'; // dez–fev
}

const baseColors = {
  /** Grama do terreno (piso dentro da cerca). */
  grass: '#ADBF8B',
  grassLight: '#BFCF9E',
  /** Traço interno sutil entre pastos. */
  meadowEdge: '#8FA96B',
  /** Curral e entorno de instalações. */
  dirt: '#D9BC90',
  /** Cercas e madeira. */
  wood: '#8A6F4D',
  woodDark: '#6E5638',
  /** Cerca interna dos pastos: a mesma cerca, em madeira mais clara. */
  woodLight: '#B29A76',
  woodLightDark: '#95805D',
  /** Telhados — o accent quente; no máximo 2 destaques por cena. */
  roof: '#D98E73',
  /** Leite no tanque. */
  milk: '#FFF9EF',
  /** Metal do tanque. */
  steel: '#9FB4C7',
  /** Rótulos e ícones sobre o mapa (ink do app). */
  ink: '#1C1917',
  /** Copa das árvores. */
  tree: '#6E8F57',
  treeShade: '#5A7A46',
  /** Vacas (corpo claro + manchas). */
  cow: '#F7F2E9',
  cowSpot: '#4A443C',
};

/**
 * Gradiente de descanso do pasto (5 faixas): do verde de "em pastejo"
 * ao marrom de "muitos dias de descanso". As faixas casam com `restBucket`
 * (domain/game/pasture-rest): 0 = em pastejo, depois 1–7, 8–21, 22–45 e 46+
 * dias de descanso.
 */
const restStopsBase: { light: string; base: string; label: string }[] = [
  { light: '#B5CD93', base: '#A4C17E', label: 'Em pastejo' },
  { light: '#C6D9A6', base: '#B7CE93', label: 'Até 1 semana' },
  { light: '#D8DCA4', base: '#CDD18D', label: 'Até 3 semanas' },
  { light: '#E0D49C', base: '#D6C47E', label: 'Até 1,5 mês' },
  { light: '#D9BC8E', base: '#C7A671', label: 'Muito descanso' },
];

export const gameTokens = {
  colors: baseColors,
  restStops: restStopsBase,
  motion: {
    /** Pastar: faixa de duração do vagar lento das vacas (por vaca, semeado). */
    grazeMinMs: 9000,
    grazeMaxMs: 17000,
  },
  sprite: {
    /** Grid local dos sprites: viewBox 0 0 64 64. */
    grid: 64,
  },
  /** Largura fixa do viewBox do mapa; a altura vem da razão de aspecto do perímetro. */
  viewBoxWidth: 1000,
  /** Máximo de sprites de vaca por pasto antes de acumular no badge. */
  herdClusterCap: 8,
  /** Cercas: espaçamento e raio dos mourões (unidades do viewBox). */
  fence: { postSpacing: 34, postRadius: 3.1, pasturePostSpacing: 28, pasturePostRadius: 2.2 },
} as const;

type SeasonalOverride = Partial<Pick<typeof baseColors, 'grass' | 'grassLight' | 'meadowEdge' | 'tree' | 'treeShade'>> & {
  restLight?: string[];
  restBase?: string[];
};

/** Sobretons por estação (hemisfério sul): inverno mais seco/dourado, primavera mais viçoso. */
const SEASONAL: Record<Season, SeasonalOverride> = {
  verao: {},
  primavera: {
    grass: '#B4C78E',
    grassLight: '#C6D6A2',
    tree: '#74975A',
    restLight: ['#BBD69A', '#C9DCA9', '#D8DCA4', '#E0D49C', '#D9BC8E'],
    restBase: ['#ABC686', '#BBD196', '#CDD18D', '#D6C47E', '#C7A671'],
  },
  outono: {
    grass: '#B3B98A',
    grassLight: '#C5C89C',
    meadowEdge: '#93A06B',
    tree: '#7E8A52',
    treeShade: '#6A7444',
  },
  inverno: {
    grass: '#BDB58C',
    grassLight: '#CDC39B',
    meadowEdge: '#9A9168',
    tree: '#74805C',
    treeShade: '#606B4B',
    restLight: ['#C2C493', '#CFC99C', '#DCD1A0', '#E2D09E', '#D9BC8E'],
    restBase: ['#B2B47E', '#C0BA87', '#CEC187', '#D2BE7E', '#C7A671'],
  },
};

/** Cores do tabuleiro tingidas pela estação do ano (só cor; geometria intacta). */
export function seasonalColors(season: Season): typeof baseColors {
  return { ...baseColors, ...SEASONAL[season] };
}

/** Faixas do gradiente de descanso tingidas pela estação. */
export function seasonalRestStops(season: Season): typeof restStopsBase {
  const override = SEASONAL[season];
  if (!override.restLight && !override.restBase) return restStopsBase;
  return restStopsBase.map((stop, index) => ({
    ...stop,
    light: override.restLight?.[index] ?? stop.light,
    base: override.restBase?.[index] ?? stop.base,
  }));
}
