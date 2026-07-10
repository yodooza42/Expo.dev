import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import type { Priority, ProjectStatus } from '@/types';

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];
const PRIORITY_LABELS: Record<Priority, string> = { low: 'Faible', medium: 'Moyenne', high: 'Haute', critical: 'Critique' };
const PRIORITY_COLORS: Record<Priority, string> = { low: '#4CAF50', medium: '#FF9800', high: '#F44336', critical: '#9C27B0' };

const STATUSES: ProjectStatus[] = ['idea', 'todo', 'inprogress', 'waiting', 'done', 'abandoned'];
const STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: 'Idée', todo: 'À faire', inprogress: 'En cours',
  waiting: 'En attente', done: 'Terminé', abandoned: 'Abandonné',
};

export default function NewProjectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { projects, addProject, updateProject, categories } = useApp();

  const existing = id ? projects.find(p => p.id === id) : null;
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [desc, setDesc] = useState(existing?.description ?? '');
  const [category, setCategory] = useState(existing?.category ?? categories[0]?.name ?? '');
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium');
  const [status, setStatus] = useState<ProjectStatus>(existing?.status ?? 'todo');
  const [budget, setBudget] = useState(existing?.budget?.toString() ?? '0');
  const [startDate, setStartDate] = useState(
    existing ? new Date(existing.startDate).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')
  );
  const [dueDate, setDueDate] = useState(
    existing ? new Date(existing.dueDate).toLocaleDateString('fr-FR') : ''
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function parseFrDate(s: string): Date {
    const parts = s.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    return new Date();
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Le nom est obligatoire';
    if (!dueDate.trim()) e.dueDate = "La date d'échéance est obligatoire";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const data = {
      name: name.trim(),
      description: desc.trim(),
      category,
      photos: existing?.photos ?? [],
      startDate: parseFrDate(startDate).toISOString(),
      dueDate: parseFrDate(dueDate).toISOString(),
      budget: parseFloat(budget) || 0,
      spent: existing?.spent ?? 0,
      priority,
      status,
    };
    if (isEditing && existing) {
      updateProject(existing.id, data);
    } else {
      addProject(data);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title={isEditing ? 'Modifier le projet' : 'Nouveau projet'}
        right={
          <Pressable onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.saveBtnTxt, { color: colors.primaryForeground }]}>Enregistrer</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={[styles.form, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Nom du projet *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Encore un plan sur la comète ?"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: errors.name ? colors.destructive : colors.border }]}
          />
          {errors.name && <Text style={[styles.error, { color: colors.destructive }]}>{errors.name}</Text>}
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Description</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="Description du projet…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.textarea, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          />
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Catégorie</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {categories.map(c => (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.name)}
                style={[
                  styles.chip,
                  category === c.name
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.chipTxt, { color: category === c.name ? colors.primaryForeground : colors.mutedForeground }]}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Priorité</Text>
          <View style={styles.row}>
            {PRIORITIES.map(p => (
              <Pressable
                key={p}
                onPress={() => setPriority(p)}
                style={[
                  styles.priorityChip,
                  priority === p
                    ? { backgroundColor: PRIORITY_COLORS[p] }
                    : { backgroundColor: PRIORITY_COLORS[p] + '20', borderColor: PRIORITY_COLORS[p], borderWidth: 1 },
                ]}
              >
                <Text style={[styles.chipTxt, { color: priority === p ? '#fff' : PRIORITY_COLORS[p] }]}>
                  {PRIORITY_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Statut</Text>
          <View style={styles.statusGrid}>
            {STATUSES.map(s => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[
                  styles.statusChip,
                  status === s
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.chipTxt, { color: status === s ? colors.primaryForeground : colors.mutedForeground }]}>
                  {STATUS_LABELS[s]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Date de début</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="JJ/MM/AAAA"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Échéance *</Text>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="JJ/MM/AAAA"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: errors.dueDate ? colors.destructive : colors.border }]}
            />
            {errors.dueDate && <Text style={[styles.error, { color: colors.destructive }]}>{errors.dueDate}</Text>}
          </View>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Budget prévu (€)</Text>
          <TextInput
            value={budget}
            onChangeText={setBudget}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  form: { paddingHorizontal: 16, paddingTop: 20, gap: 20 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  error: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  row: { flexDirection: 'row', gap: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  chipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
});
