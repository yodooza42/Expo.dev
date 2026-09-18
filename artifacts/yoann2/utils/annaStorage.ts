import AsyncStorage from '@react-native-async-storage/async-storage';

const ANNA_KEY = '@anna_badges_v1';

export type Nounou = 'Isabelle' | 'Evelyne';

export type AnnaBadges = Record<string, Nounou>;

export const NOUNOU_COLORS: Record<Nounou, string> = {
  Isabelle: '#00BCD4',
  Evelyne:  '#9C27B0',
};

export async function loadAnnaBadges(): Promise<AnnaBadges> {
  try {
    const raw = await AsyncStorage.getItem(ANNA_KEY);
    return raw ? (JSON.parse(raw) as AnnaBadges) : {};
  } catch {
    return {};
  }
}

export async function saveAnnaBadges(badges: AnnaBadges): Promise<void> {
  await AsyncStorage.setItem(ANNA_KEY, JSON.stringify(badges));
}

export async function toggleAnnaBadge(date: string, current: Nounou): Promise<AnnaBadges> {
  const badges = await loadAnnaBadges();
  badges[date] = current === 'Isabelle' ? 'Evelyne' : 'Isabelle';
  await saveAnnaBadges(badges);
  return badges;
}
