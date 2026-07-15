import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';

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
      'Widget Android : tâches, RDV',
    ],
  },
  {
    version: 'v1.1.0',
    date: 'Rapports',
    items: [
      'Icônes personnalisées (jaune) sur navigation et widget',
      'Rapports hebdomadaires et mensuels détaillés',
      'Notifications automatiques dimanche / dernier jour du mois',
      'Sauvegarde automatique locale (5 archives)',
    ],
  },
  {
    version: 'v1.2.0',
    date: 'Sessions de travail',
    items: [
      'Page Travail dédiée avec timeline',
      'Tracking des sessions de travail',
      'Import des données historiques (mai)',
      'Daily breakdown dans les rapports',
    ],
  },
  {
    version: 'v2.0.0',
    date: 'Famille & Smartness',
    items: [
      'Planning Marie (PB/PD) avec calendrier interactif',
      'Planning Anna (nounou) : badges Isabelle #00BCD4 / Evelyne #9C27B0',
      'Détection automatique "personne à la maison" (intersection horaires)',
      'Quick access bar : raccourcis Travail, Marie, Anna',
      'Widget intégré : cercle Marie + infos nounou + travail',
      'Tâches récurrentes (quotidienne, hebdo, mensuelle)',
      'Swipe dans le Kanban pour changer de colonne',
    ],
  },
  {
    version: 'v2.1.0',
    date: 'Finance & Épargne',
    items: [
      'Module Finance complet : solde courant, revenus, dépenses',
      'Compte épargne séparé avec historique de virements',
      'Virements ponctuels et programmés (mensuel / hebdomadaire)',
      'Catégories de revenus et dépenses personnalisées',
      'Statistiques financières mensuelles avec graphiques',
      'Intégration automatique des dépenses projet → transactions',
      'Export Excel des transactions',
    ],
  },
  {
    version: 'v2.2.0',
    date: 'Navigation & Trajets',
    items: [
      'Onglet Trajets : détection automatique GPS (départ / arrivée)',
      'Carte interactive par trajet (OpenStreetMap + tracé OSRM)',
      'Statistiques par trajet : distance, durée, vitesse moyenne',
      'Trajets manuels : ajout de points de départ/arrivée',
      'Lieux connus avec catégories et icônes personnalisées',
      'Widget Navigation : 3 raccourcis Waze + bouton plein d\'essence',
      'Statistiques globales de trajets (mensuel / annuel)',
    ],
  },
  {
    version: 'v2.3.0',
    date: 'Rapports & Voix',
    items: [
      'Rapports de projet exportables en PDF',
      'Statistiques dépenses par catégorie (graphiques)',
      'Assistant vocal : création de tâches et notes par la parole',
      'Rapport de maintenance véhicule (Moto / Doblo)',
      'Planificateur de maintenance avec alertes kilométrage',
      'Suivi carburant : historique de pleins, coût au litre, autonomie',
    ],
  },
  {
    version: 'v2.4.0',
    date: 'Sauvegarde & Paramètres',
    items: [
      'Sauvegarde manuelle en un tap (dossier SAF Yoann2.0)',
      'Liste des backups avec restauration sélective',
      'Dossier Photos par projet visible dans le gestionnaire de fichiers',
      'Paramètres véhicule : type carburant, consommation de référence',
      'Widget personnalisable : couleur principale, taille police',
    ],
  },
  {
    version: 'v2.5.0',
    date: 'Juillet 2026 — Polissage',
    items: [
      'Édition date et heure des trajets directement sur la carte',
      'Virements programmés visibles dans le calendrier',
      'Photos projet : copie locale persistante',
      'Widget Navigation : labels de destination sous chaque bouton',
      'Correction : imports/exports de sauvegarde via SAF',
    ],
  },
  {
    version: 'v2.6.0',
    date: 'Juillet 2026 — Finitions',
    items: [
      'Finance : types "Vers marché" / "Depuis marché" dans les transactions',
      'Finance : séparateurs de milliers sur tous les montants (1 500,00 €)',
      'Marché : résolution automatique du symbole Yahoo Finance depuis le ticker Trade Republic',
      'Accueil : mini stats (RDV, projets, tâches) sous la bannière Aujourd\'hui',
      'Accueil : suppression des pills stats dans le header (gain de hauteur)',
      'Navigation : bouton retour Android → Accueil au lieu de Calendrier',
      'Paramètres : suppression de la section Couleurs inutilisée, réorganisation par catégorie',
      'Seed : injection automatique des données réelles depuis la dernière sauvegarde',
    ],
  },
  {
    version: 'v2.7.0',
    date: 'Juillet 2026 — Trajets manuels & Travail',
    items: [
      'Trajet manuel via widget : bouton ▶ Départ (vert) / ⏹ Fin (rouge)',
      'GPS activé uniquement entre les deux boutons (économie batterie)',
      'Intervalle GPS 15 s / 50 m — distance calculée sur la vraie route (OSRM)',
      'Auto-détection désactivée en mode manuel (pas de doublons)',
      'Tolérance feux rouges : 30 s de vitesse basse avant d\'annuler la détection',
      'Plein de carburant : sélecteur de véhicule nommé (Doblo / Msx)',
      'Carburant : type mémorisé par véhicule (Gazole / SP95 / SP98)',
      'Carburant : saisie date, Total € + Litres, transaction finance auto-créée',
      'Stats carburant : coût / 100 km comparatif avec ratio d\'efficacité',
      'Travail : navigation ← → entre semaines pour compléter les jours passés',
      'Travail : rapport mensuel mis à jour automatiquement à chaque saisie',
    ],
  },
  {
    version: 'v2.8.0',
    date: 'Juillet 2026 — Musique & GPS',
    items: [
      'Lecteur audio voiture : playlist locale, lecture en arrière-plan, notification MediaSession',
      'Contrôles widget : ▶ démarre la musique + GPS, ⏸ pause, ⏹ arrête tout',
      'Notification GPS intégrée dans la notification musicale : "🚗 GPS actif — Yoann2.0" pendant un trajet',
      'Notification non-swipeable pendant la lecture (comportement identique à Spotify)',
      'Plugin natif : foregroundServiceType location|mediaPlayback sur le service GPS',
      'Musique déplacée de la barre principale → sous-page de Trajets',
    ],
  },
  {
    version: 'v2.9.0',
    date: 'Juillet 2026 — Véhicule Balade',
    items: [
      'Nouveau type de véhicule "Balade" (icône verte) dans les réglages',
      'Onglet Participants : groupes Humains et Chiens, ajout/suppression',
      'Onglet Stats : km et durée sur 7 / 30 / 90 jours par participant',
      'Rappel de balade sur l\'Accueil quand un chien n\'est pas sorti depuis N jours',
      'Saisie manuelle de balade : heure début, durée (H + min), km — sans GPS ni adresses',
      'Heure de fin calculée automatiquement depuis la durée',
      'Sélection des participants (humains + chiens) à chaque saisie',
      'WalkCard dans l\'onglet Trajets : km du mois, sorties, avatars participants',
      'Historique des balades par participant dans la fiche véhicule (10 par défaut)',
      'Bouton "Voir plus" pour afficher toutes les balades d\'un participant',
      'Icône walk verte + avatars participants dans la liste des trajets',
      'Tap sur les avatars en mode compact → noms complets en tooltip',
      'Navigation vers le détail d\'une balade depuis la fiche participant',
    ],
  },
  {
    version: 'v2.10.0',
    date: 'Juillet 2026 — Polissage & Consommation',
    items: [
      'Trajets : système de groupes libres (labels) indépendants des catégories géo',
      'Trajets : section "Groupes" fusionnée dans "Trajets" — un seul titre, deux types de regroupement',
      'Accueil : carte Aujourd\'hui/Nanny remontée au-dessus des Prochaines Balades',
      'Consommation : confirmation avant suppression d\'une entrée café / clope',
      'Consommation : ajout manuel avec heure personnalisée (format 1250 = 12h50) et sélecteur de jour',
      'Consommation : heures affichées en HH:MM (sans les secondes)',
      'Consommation : modal d\'ajout remonte au-dessus du clavier (KeyboardAvoidingView)',
      'Consommation : bouton d\'ajout déplacé dans le header (＋) pour libérer l\'écran',
      'Stats trajets : véhicule "Balade" exclu des sections carburant (sans moteur)',
      'Navigation : onglet fantôme (cercle gris) supprimé de la barre du bas',
      'Paramètres : version affichée correcte, card À propos visuellement séparée',
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
      <SubPageHeader title="Recap MàJ" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="brain" size={32} color={colors.primary} />
          <Text style={[styles.heroText, { color: colors.foreground }]}>
            Bienvenue dans mon cerveau numérique
          </Text>
          <Text style={[styles.heroVersion, { color: colors.primary }]}>
            Yoann2.0  ·  v2.10.0
          </Text>
        </View>

        {[...HISTORY].reverse().map((v, i) => (
          <View key={v.version} style={styles.versionBlock}>
            <View style={styles.versionHeader}>
              <View style={[styles.versionDot, { backgroundColor: i === 0 ? colors.primary : colors.border }]} />
              <Text style={[styles.versionLabel, { color: i === 0 ? colors.primary : colors.foreground }]}>
                {v.version}
              </Text>
              <Text style={[styles.versionDate, { color: colors.mutedForeground }]}>
                {v.date}
              </Text>
            </View>

            <View style={[styles.versionCard, { backgroundColor: colors.card, borderColor: i === 0 ? colors.primary + '40' : colors.border }]}>
              {v.items.map((item, j) => (
                <View key={j} style={[styles.itemRow, j < v.items.length - 1 && { borderBottomColor: colors.border }]}>
                  <MaterialCommunityIcons
                    name="circle-small"
                    size={14}
                    color={i === 0 ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={[styles.itemText, { color: colors.foreground }]}>{item}</Text>
                </View>
              ))}
            </View>

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
