import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';

interface VersionEntry {
  version: string;
  date: string;
  items: string[];
}

const HISTORY: VersionEntry[] = [
  {
    version: 'v1.0.0',
    date: 'Fondation',
    items: [
      'Projets, tâches, dépenses et agenda',
      'Kanban : En cours, À faire, Idées, En attente, Terminées',
      'Priorités : Faible, Moyenne, Haute, Critique',
      'Matrice d\'Eisenhower (urgence / importance)',
      'Timeline interactive des tâches avec photos',
      'Suivi de budget par projet (budget vs dépensé)',
      'Thème sombre #121212 / #FFC107',
      'Widget Android : tâches, RDV, pause',
    ],
  },
  {
    version: 'v1.1.0',
    date: 'Pause & Rapports',
    items: [
      'Icônes personnalisées (jaune) sur navigation et widget',
      'Chronomètre de pause (travail) avec stats',
      'Rapports hebdomadaires et mensuels',
      'Notifications automatiques dimanche / dernier jour du mois',
      'Sauvegarde automatique locale (5 archives)',
    ],
  },
  {
    version: 'v1.2.0',
    date: 'Sessions de travail',
    items: [
      'Page Travail dédiée avec timeline',
      'Tracking des sessions (démarrage / pause / fin)',
      'Import des données historiques (mai)',
      'Daily breakdown dans les rapports',
      'Correction du calcul des heures de travail',
    ],
  },
  {
    version: 'v2.0.0',
    date: 'Famille & Smartness',
    items: [
      'Planning Marie (PB/PD) avec calendrier interactif',
      'Planning Anna (nounou) : badges Isabelle #00BCD4 / Evelyne #9C27B0',
      'Détection automatique "personne à la maison" (intersection horaires)',
      'Quick access bar : raccourcis Travail, Marie, Anna, Paramètres',
      'Widget intégré : cercle Marie + infos nounou + travail + pause',
      'Section stats RDV dans le Kanban (à venir)',
      'Tâches récurrentes (quotidienne, hebdo, mensuelle)',
      'Swipe dans le Kanban pour changer de colonne',
    ],
  },
];

export default function ChangelogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Recap MàJ</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome */}
        <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="brain" size={32} color={colors.primary} />
          <Text style={[styles.heroText, { color: colors.foreground }]}>
            Bienvenue dans mon cerveau numérique
          </Text>
          <Text style={[styles.heroVersion, { color: colors.primary }]}>
            Yoann2.0  ·  v2.0.0
          </Text>
        </View>

        {/* Timeline */}
        {HISTORY.map((v, i) => (
          <View key={v.version} style={styles.versionBlock}>
            {/* Header */}
            <View style={styles.versionHeader}>
              <View style={[styles.versionDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.versionLabel, { color: colors.primary }]}>
                {v.version}
              </Text>
              <Text style={[styles.versionDate, { color: colors.mutedForeground }]}>
                {v.date}
              </Text>
            </View>

            {/* Items */}
            <View style={[styles.versionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {v.items.map((item, j) => (
                <View key={j} style={[styles.itemRow, j < v.items.length - 1 && { borderBottomColor: colors.border }]}>
                  <MaterialCommunityIcons name="circle-small" size={14} color={colors.primary} />
                  <Text style={[styles.itemText, { color: colors.foreground }]}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Connector line */}
            {i < HISTORY.length - 1 && (
              <View style={[styles.connector, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  hero: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    gap: 8,
  },
  heroText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  heroVersion: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  versionBlock: {
    marginBottom: 0,
  },
  versionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingLeft: 4,
  },
  versionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  versionLabel: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  versionDate: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  versionCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginLeft: 12,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  itemText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  connector: {
    width: 2,
    height: 16,
    marginLeft: 19,
    marginTop: 4,
    marginBottom: 4,
  },
});
