/**
 * Chat skin / legacy bedroom palettes. Each is a self-contained dark
 * theme — bg, text, accent — independent of persona. Selectable from
 * the general chat LeafMenu as 皮肤 (also used by the toy control panel).
 */
export interface BedroomTheme {
  id: string;
  name: string;
  /** Page background. */
  bg: string;
  /** Slightly lighter bg (input container). */
  sl: string;
  /** Assistant body text. */
  text: string;
  /** User text. */
  tu: string;
  /** Muted text (subtitle, thinking body). */
  tm: string;
  /** Thinking divider color. */
  tmf: string;
  /** Send button accent. */
  ac: string;
  /** Send button disabled bg. */
  as: string;
  /** Borders. */
  bd: string;
  /** Divider line between assistant messages. */
  dv: string;
  /** User bubble bg. */
  ub: string;
  /** User bubble ring. */
  ur: string;
}

export const BEDROOM_THEMES: BedroomTheme[] = [
  {
    id: 'wisteria',
    name: '紫雾',
    bg: '#2a1f3e',
    sl: '#352848',
    text: '#dccfee',
    tu: '#e8dfff',
    tm: '#9888b5',
    tmf: 'rgba(152,136,181,0.3)',
    ac: '#a98ac2',
    as: 'rgba(169,138,194,0.22)',
    bd: 'rgba(169,138,194,0.18)',
    dv: 'rgba(220,207,238,0.06)',
    ub: 'rgba(75,55,110,0.5)',
    ur: 'rgba(169,138,194,0.2)',
  },
  {
    id: 'pomegranate',
    name: '石榴',
    bg: '#5c2232',
    sl: '#6a2838',
    text: '#e8c468',
    tu: '#f0e0d0',
    tm: '#c8a060',
    tmf: 'rgba(200,160,96,0.35)',
    ac: '#cc2244',
    as: 'rgba(204,34,68,0.25)',
    bd: 'rgba(204,34,68,0.2)',
    dv: 'rgba(232,196,104,0.07)',
    ub: 'rgba(130,48,64,0.5)',
    ur: 'rgba(220,60,80,0.18)',
  },
  {
    id: 'midnight',
    name: '千夜',
    bg: '#2a2252',
    sl: '#342c62',
    text: '#d0c8e8',
    tu: '#d4cce8',
    tm: '#9890c0',
    tmf: 'rgba(152,144,192,0.3)',
    ac: '#8878c0',
    as: 'rgba(136,120,192,0.22)',
    bd: 'rgba(136,120,192,0.16)',
    dv: 'rgba(208,200,232,0.06)',
    ub: 'rgba(60,48,100,0.45)',
    ur: 'rgba(136,120,192,0.18)',
  },
  {
    id: 'moss',
    name: '苔青',
    bg: '#1f3530',
    sl: '#28403a',
    text: '#d4e2c8',
    tu: '#e0e8d4',
    tm: '#8aa498',
    tmf: 'rgba(138,164,152,0.3)',
    ac: '#6ea088',
    as: 'rgba(110,160,136,0.22)',
    bd: 'rgba(110,160,136,0.18)',
    dv: 'rgba(212,226,200,0.07)',
    ub: 'rgba(50,80,68,0.5)',
    ur: 'rgba(110,160,136,0.2)',
  },
];

export const DEFAULT_BEDROOM_THEME_ID = 'wisteria';

/** Per-persona default theme when the conversation has no explicit pick.
 *  理理酱 stays in the 紫雾 wisteria room; Rhema酱 gets the 石榴 red room. */
const PERSONA_DEFAULT_THEME: Record<string, string> = {
  persona_ririchan: 'wisteria',
  persona_rhema: 'pomegranate',
};

export function defaultThemeForPersona(personaId: string | undefined): string {
  if (personaId && PERSONA_DEFAULT_THEME[personaId]) {
    return PERSONA_DEFAULT_THEME[personaId];
  }
  return DEFAULT_BEDROOM_THEME_ID;
}

export function getBedroomTheme(
  id: string | undefined,
  fallbackPersonaId?: string,
): BedroomTheme {
  // If the saved theme happens to be the old global default ('wisteria')
  // AND this persona has a different per-persona default, prefer the
  // persona default. Migrates rooms that got 'wisteria' baked in during
  // the brief window when everyone defaulted to it.
  const personaDefault = defaultThemeForPersona(fallbackPersonaId);
  const effective =
    id === DEFAULT_BEDROOM_THEME_ID &&
    personaDefault !== DEFAULT_BEDROOM_THEME_ID
      ? personaDefault
      : id ?? personaDefault;
  return (
    BEDROOM_THEMES.find((t) => t.id === effective) ??
    BEDROOM_THEMES.find((t) => t.id === DEFAULT_BEDROOM_THEME_ID) ??
    BEDROOM_THEMES[0]
  );
}
