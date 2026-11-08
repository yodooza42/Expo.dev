import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ProjectPhoto } from '@/components/ProjectPhoto';
import { useColors } from '@/hooks/useColors';
import type { JournalChoices, JournalEntry } from '@/types/projectJournal';
import { moveJournalTask } from '@/utils/projectJournal';

export function toggleJournalId(values: string[], id: string) {
  return values.includes(id) ? values.filter(value => value !== id) : [...values, id];
}
export function JournalEntryEditor({ entry, choices, expanded, onExpand, onChange, number, candidates }: {
  entry: JournalEntry; choices: JournalChoices; expanded: boolean; onExpand: () => void;
  onChange: (next: JournalChoices) => void; number: number; candidates: JournalEntry[];
}) {
  const c = useColors();
  const [page, setPage] = useState(0);
  const included = !choices.excludedEntryIds.includes(entry.id);
  const photoCount = entry.photos.filter(p => !choices.excludedPhotoIds.includes(p.id)).length;
  const pages = Math.ceil(entry.photos.length / 12);
  const sameDay = candidates.filter(item => item.kind === 'task' && item.dateKey === entry.dateKey);
  const taskIndex = sameDay.findIndex(item => item.id === entry.id);
  return <View style={[s.card, { backgroundColor: c.card, borderColor: included ? c.border : c.muted }]}>
    <View style={s.row}>
      <Pressable testID={`journal-include-${entry.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: included }}
        accessibilityLabel={`Inclure ${entry.title}`}
        onPress={() => onChange({ ...choices, excludedEntryIds: toggleJournalId(choices.excludedEntryIds, entry.id) })}
        style={s.check}>
        <MaterialCommunityIcons name={included ? 'checkbox-marked' : 'checkbox-blank-outline'} size={25} color={included ? c.primary : c.mutedForeground} />
      </Pressable>
      <Pressable testID={`journal-expand-${entry.id}`} onPress={onExpand} style={[s.flex, s.heading]}>
        <Text style={[s.date, { color: c.mutedForeground }]}>{String(number).padStart(2, '0')} / {entry.dateLabel}</Text>
        {entry.parentTaskTitle && <Text style={[s.small, { color: c.primary }]}>Tâche · {entry.parentTaskTitle}</Text>}
        <Text style={[s.title, { color: included ? c.foreground : c.mutedForeground }]}>{entry.title}</Text>
        <Text style={[s.small, { color: c.mutedForeground }]}>
          {entry.recapTasks ? `Récapitulatif · ${entry.recapTasks.length} tâches accomplies` : entry.parentTaskTitle ? `Sous-tâche · ${entry.project}` : entry.kind === 'project' ? 'Projet terminé' : entry.project} · {photoCount} photo{photoCount > 1 ? 's' : ''}
        </Text>
      </Pressable>
      <Pressable onPress={onExpand} accessibilityLabel={expanded ? 'Replier l’étape' : 'Modifier les photos et légendes'} style={s.check}>
        <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={c.mutedForeground} />
      </Pressable>
    </View>
    {entry.kind === 'task' && sameDay.length > 1 && <View style={[s.row, s.order]}>
      <Text style={[s.small, s.flex, { color: c.mutedForeground }]}>Ordre du jour · {taskIndex + 1}/{sameDay.length}</Text>
      {([-1, 1] as const).map(direction => {
        const disabled = direction === -1 ? taskIndex === 0 : taskIndex === sameDay.length - 1;
        return <Pressable key={direction} testID={`journal-move-${direction === -1 ? 'up' : 'down'}-${entry.id}`}
          accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
          accessibilityLabel={`${direction === -1 ? 'Avancer' : 'Reculer'} ${entry.title} dans cette journée`}
          onPress={() => onChange(moveJournalTask(choices, candidates, entry.id, direction))} style={s.check}>
          <MaterialCommunityIcons name={direction === -1 ? 'arrow-up' : 'arrow-down'} size={22}
            color={disabled ? c.muted : c.primary} />
        </Pressable>;
      })}
    </View>}
    {expanded && <View style={s.content}>
      {entry.recapTasks && <>
        <Text style={[s.label, { color: c.primary }]}>Juste après la dernière tâche du projet</Text>
        {entry.recapTasks.map(task => <Text key={task.id} style={[s.small, { color: c.foreground }]}>
          ✓ {task.title} · {task.dateLabel}
        </Text>)}
        <Text style={[s.small, { color: c.mutedForeground }]}>Toutes les tâches du projet sont récapitulées, y compris celles réalisées avant la période choisie. Les longues listes sont réparties sur plusieurs pages.</Text>
      </>}
      <Text style={[s.label, { color: c.foreground }]}>Légende de l’étape</Text>
      <TextInput testID={`journal-caption-${entry.id}`} accessibilityLabel={`Légende de ${entry.title}`}
        multiline maxLength={280} value={entry.caption} placeholder="Ce qui a changé, un détail à retenir…"
        placeholderTextColor={c.mutedForeground}
        onChangeText={value => onChange({ ...choices, captions: { ...choices.captions, [entry.id]: value } })}
        style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.background }]} />
      <Text style={[s.small, { color: c.mutedForeground }]}>{entry.caption.length}/280 · uniquement dans cette vidéo</Text>
      {entry.photos.length === 0 ? <Text style={[s.small, { color: c.mutedForeground }]}>
        {entry.recapTasks ? 'Cette page récapitule les tâches accomplies ; leurs photos restent sur leurs étapes respectives.' : 'Sans photo : cette étape aura sa propre page de carnet, avec son titre et sa légende.'}
      </Text> : <>
        <View style={s.row}>
          <Text style={[s.label, s.flex, { color: c.foreground }]}>Photos · {photoCount}/{entry.photos.length}</Text>
          <Pressable onPress={() => {
            const ids = new Set(entry.photos.map(p => p.id));
            onChange({ ...choices, excludedPhotoIds: photoCount === entry.photos.length
              ? [...new Set([...choices.excludedPhotoIds, ...ids])]
              : choices.excludedPhotoIds.filter(id => !ids.has(id)) });
          }}><Text style={[s.small, { color: c.primary }]}>{photoCount === entry.photos.length ? 'Tout décocher' : 'Tout choisir'}</Text></Pressable>
        </View>
        {entry.photos.slice(page * 12, page * 12 + 12).map((photo, index) => {
          const selected = !choices.excludedPhotoIds.includes(photo.id);
          return <View key={photo.id} style={[s.photoCard, { borderColor: selected ? c.primary : c.border }]}>
            <Pressable testID={`journal-photo-${photo.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
              accessibilityLabel={`Photo ${page * 12 + index + 1} de ${entry.title}`}
              onPress={() => onChange({ ...choices, excludedPhotoIds: toggleJournalId(choices.excludedPhotoIds, photo.id) })}>
              <ProjectPhoto uri={photo.uri} style={s.photo} contentFit="contain" />
              <View style={[s.badge, { backgroundColor: c.card }]}>
                <MaterialCommunityIcons name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={selected ? c.primary : c.mutedForeground} />
              </View>
            </Pressable>
            <TextInput accessibilityLabel={`Légende photo ${page * 12 + index + 1}`} multiline maxLength={280}
              value={photo.caption} placeholder="Légende de cette photo (facultatif)"
              placeholderTextColor={c.mutedForeground} style={[s.photoInput, { color: c.foreground }]}
              onChangeText={value => onChange({ ...choices, photoCaptions: { ...choices.photoCaptions, [photo.id]: value } })} />
          </View>;
        })}
        {pages > 1 && <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Pressable disabled={page === 0} onPress={() => setPage(n => n - 1)} style={s.check}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={page === 0 ? c.muted : c.primary} />
          </Pressable>
          <Text style={[s.small, { color: c.mutedForeground }]}>Photos · page {page + 1}/{pages}</Text>
          <Pressable disabled={page === pages - 1} onPress={() => setPage(n => n + 1)} style={s.check}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={page === pages - 1 ? c.muted : c.primary} />
          </Pressable>
        </View>}
      </>}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  flex: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  order: { paddingHorizontal: 16, paddingBottom: 6 },
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' }, check: { padding: 10, minHeight: 44, justifyContent: 'center' },
  heading: { paddingVertical: 14, gap: 5 }, title: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 21 },
  date: { fontSize: 10, letterSpacing: 0.6, fontFamily: 'Inter_500Medium' },
  small: { fontSize: 12, lineHeight: 18 }, content: { padding: 16, paddingTop: 0, gap: 12 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  input: { borderWidth: 1, padding: 12, borderRadius: 10, minHeight: 90, textAlignVertical: 'top', fontSize: 14 },
  photoCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' }, photo: { width: '100%', height: 200 },
  badge: { position: 'absolute', top: 10, right: 10, borderRadius: 7, padding: 3 },
  photoInput: { padding: 12, minHeight: 50, fontSize: 13, lineHeight: 19, textAlignVertical: 'top' },
});
