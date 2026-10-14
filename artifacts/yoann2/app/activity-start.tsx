import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import type { ActivityKind, WalkParticipant } from '@/types/trips';
import { ACTIVITIES } from '@/utils/activities';
import { getManualTripState, saveManualTripState } from '@/utils/manualTripStorage';
import { getVehicleSettings } from '@/utils/tripStorage';
import { updateTodoWidget } from '@/widgets/updateWidget';

export default function ActivityStartScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<ActivityKind>('walk');
  const [participants, setParticipants] = useState<string[]>([]);
  const [people, setPeople] = useState<WalkParticipant[]>([]);
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    Promise.all([getManualTripState(), getVehicleSettings()]).then(([state, settings]) => {
      if (!mounted) return;
      setActive(!!state?.active && state.tripMode === 'balade');
      setKind(state?.activityType ?? 'walk');
      setParticipants(state?.walkParticipants ?? []);
      setPeople(settings.find(vehicle => vehicle.type === 'walk')?.walkParticipants ?? []);
      setLoaded(true);
    });
    return () => { mounted = false; };
  }, []);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const state = await getManualTripState();
      if (!state?.active || state.tripMode !== 'balade') throw new Error('Cette activité est déjà terminée.');
      if (!await saveManualTripState({ ...state, activityType: kind, walkParticipants: participants })) throw new Error('Impossible de conserver les choix.');
      void updateTodoWidget();
      router.replace('/(tabs)/player');
    } catch (error) { Alert.alert('Activité', error instanceof Error ? error.message : 'Réessaie.'); }
    finally { setSaving(false); }
  };
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <SubPageHeader title="Choisir l’activité" />
    {!loaded ? <ActivityIndicator color={colors.primary} /> : <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 24 }}>
      {!active ? <Text style={{ color: colors.foreground }}>Démarre une activité avec le bouton Balade du widget. Le choix Marche / Course / Vélo / Kayak s’ouvrira ensuite.</Text> : <>
        <Text style={{ color: colors.mutedForeground }}>Le GPS enregistre déjà. Choisis le type et les participants, puis profite de ta sortie.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {ACTIVITIES.map(activity => <Pressable key={activity.key} onPress={() => setKind(activity.key)}
            style={{ width: '46%', padding: 20, alignItems: 'center', gap: 9, borderRadius: 16, borderWidth: 1,
              borderColor: kind === activity.key ? colors.primary : colors.border, backgroundColor: kind === activity.key ? colors.primary : colors.card }}>
            <MaterialCommunityIcons name={activity.icon} size={30} color={kind === activity.key ? colors.primaryForeground : colors.foreground} />
            <Text style={{ color: kind === activity.key ? colors.primaryForeground : colors.foreground }}>{activity.label}</Text>
          </Pressable>)}
        </View>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Participants facultatifs</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {people.map(person => <Pressable key={person.id} onPress={() => setParticipants(ids => ids.includes(person.id) ? ids.filter(id => id !== person.id) : [...ids, person.id])}
            style={{ padding: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: participants.includes(person.id) ? colors.primary : colors.card }}>
            <Text style={{ color: participants.includes(person.id) ? colors.primaryForeground : colors.foreground }}>{person.name}</Text>
          </Pressable>)}
        </View>
        <Pressable disabled={saving} onPress={() => { void save(); }} style={{ padding: 16, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' }}>
          <Text style={{ color: colors.primaryForeground }}>Continuer la sortie</Text>
        </Pressable>
        <Text style={{ color: colors.mutedForeground }}>À l’arrivée, termine l’activité depuis le widget. Un petit questionnaire facultatif sera proposé.</Text>
      </>}
    </ScrollView>}
  </View>;
}
