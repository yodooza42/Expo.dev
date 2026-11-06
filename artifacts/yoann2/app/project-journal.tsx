import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { useJournalDraft } from '@/hooks/useJournalDraft';
import { usePeriodStoryGeneration } from '@/hooks/usePeriodStoryGeneration';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { JournalCover } from '@/components/project-journal/JournalCover';
import { JournalDateInput } from '@/components/project-journal/JournalDateInput';
import { JournalEntryEditor, toggleJournalId } from '@/components/project-journal/JournalEntryEditor';
import { JournalEngine } from '@/components/project-journal/JournalEngine';
import { JournalPreview } from '@/components/project-journal/JournalPreview';
import { StoryVideoReview } from '@/components/period-story/StoryVideoReview';
import type { JournalChoices, JournalVideoPayload } from '@/types/projectJournal';
import { buildProjectJournal, journalDateKey } from '@/utils/projectJournal';
import { parseCompletionDate } from '@/utils/completionDate';
import { prepareJournal } from '@/utils/prepareJournal';

const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)} min ${String(Math.round(seconds % 60)).padStart(2, '0')} s`;
const STEPS = ['Sélection', 'Montage', 'Vidéo'];

export default function ProjectJournalScreen() {
  const c = useColors(), insets = useSafeAreaInsets(), router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const { projects, tasks, loading } = useApp();
  const draft = useJournalDraft(projects, loading, projectId);
  const generation = usePeriodStoryGeneration('journal');
  const [step, setStep] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<JournalVideoPayload | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [previewDetail, setPreviewDetail] = useState('');
  const [error, setError] = useState('');
  const [showUndated, setShowUndated] = useState(false);
  const previewRun = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; previewRun.current++; };
  }, []);
  const choices = draft.choices;
  const journal = useMemo(() => choices ? buildProjectJournal(projects, tasks, choices) : null, [projects, tasks, choices]);
  const busy = preparing || generation.isGenerating || generation.isSharing;
  const ready = !!journal && !journal.error && !draft.error && !draft.saving && !busy;
  // Edits made elsewhere must invalidate a prepared video/preview too.
  const sourceSignature = JSON.stringify(journal?.request);
  const previousSignature = useRef(sourceSignature);
  useEffect(() => {
    if (previousSignature.current !== sourceSignature) {
      previousSignature.current = sourceSignature;
      previewRun.current++; setPreparing(false); setPreview(null);
      generation.discardResult();
    }
  }, [sourceSignature, generation.discardResult]);

  function change(next: JournalChoices) {
    if (busy) return;
    setError(''); setPreview(null); previewRun.current++;
    generation.discardResult();
    draft.save(next);
  }
  async function openPreview() {
    if (!journal || !ready) return;
    const token = ++previewRun.current;
    setPreparing(true); setError('');
    const current = () => alive.current && previewRun.current === token;
    try {
      const payload = await prepareJournal(journal.request, `preview-${token}`, current, (done, total) => {
        if (current()) setPreviewDetail(`${done} / ${total} photos`);
      });
      if (current()) setPreview(payload);
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : 'Impossible de préparer l’aperçu.');
    } finally { if (current()) setPreparing(false); }
  }
  function cancel() {
    previewRun.current++; setPreparing(false); generation.cancel();
  }
  const button = (label: string, action: () => void, disabled = false, primary = false, testID?: string) =>
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={action}
      style={[s.button, { backgroundColor: primary ? c.primary : c.card, borderColor: primary ? c.primary : c.border, opacity: disabled ? 0.4 : 1 }]}>
      <Text style={[s.buttonText, { color: primary ? c.primaryForeground : c.foreground }]}>{label}</Text>
    </Pressable>;

  return <View style={[s.root, { backgroundColor: c.background }]}>
    <View style={[s.header, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 8, borderColor: c.border }]}>
      <Pressable disabled={busy} accessibilityLabel="Retour" onPress={() => router.back()} style={s.iconButton}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={c.foreground} />
      </Pressable>
      <View style={s.flex}>
        <Text style={[s.headerTitle, { color: c.foreground }]}>Carnet de bord</Text>
        <Text style={[s.small, { color: c.mutedForeground }]}>La mémoire de tes réalisations</Text>
      </View>
      <MaterialCommunityIcons name="notebook-edit-outline" size={25} color={c.primary} />
    </View>
    <View style={[s.steps, { borderColor: c.border }]}>
      {STEPS.map((label, index) => <Pressable key={label} testID={`journal-step-${index}`} disabled={busy || (!journal?.candidates.length && index > 0)}
        onPress={() => setStep(index)} style={[s.step, { borderBottomColor: step === index ? c.primary : c.background }]}>
        <Text style={[s.stepText, { color: step === index ? c.primary : c.mutedForeground }]}>{index + 1}. {label}</Text>
      </Pressable>)}
    </View>
    {!choices || !journal ? <View style={s.loading}>
      {draft.error ? <><Text style={{ color: c.destructive }}>{draft.error}</Text>{button('Réessayer', draft.retry)}</>
        : <ActivityIndicator color={c.primary} />}
    </View> : <>
      <KeyboardAwareScrollViewCompat key={step} bottomOffset={20} keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {step === 0 && <>
          <JournalCover title={choices.title} summary="Choisis une période et les projets à raconter. Tes étapes se classent par date réelle de fin." />
          <Text style={[s.section, { color: c.foreground }]}>01 / Le cadre du carnet</Text>
          <Text style={[s.label, { color: c.mutedForeground }]}>TITRE DE LA VIDÉO</Text>
          <TextInput testID="journal-title" accessibilityLabel="Titre du carnet" value={choices.title} maxLength={80}
            onChangeText={title => change({ ...choices, title })} placeholder="Carnet de bord" placeholderTextColor={c.mutedForeground}
            style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.card }]} />
          <View style={s.row}>
            <JournalDateInput label="Date de début" value={choices.from} onChange={from => change({ ...choices, from })} />
            <JournalDateInput label="Date de fin" value={choices.to} onChange={to => change({ ...choices, to })} />
          </View>
          <View style={s.row}>
            {button('Ce mois-ci', () => {
              const now = new Date(); change({ ...choices, from: journalDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: journalDateKey(now) });
            })}
            {button('Tout l’historique', () => {
              const dates = [...projects, ...tasks].filter(item => item.status === 'done')
                .map(item => item.completedAt ? parseCompletionDate(item.completedAt) : null).filter((date): date is Date => !!date);
              change({ ...choices, from: journalDateKey(new Date(Math.min(Date.now(), ...dates.map(d => d.getTime())))), to: journalDateKey(new Date()) });
            })}
          </View>
          <View style={s.row}>
            <Text style={[s.section, s.flex, { color: c.foreground }]}>Les projets</Text>
            <Pressable onPress={() => change({ ...choices, projectIds: choices.projectIds.length === projects.length ? [] : projects.map(p => p.id) })}>
              <Text style={[s.small, { color: c.primary }]}>{choices.projectIds.length === projects.length ? 'Aucun' : 'Tous'}</Text>
            </Pressable>
          </View>
          {projects.map(project => {
            const selected = choices.projectIds.includes(project.id);
            return <Pressable key={project.id} testID={`journal-project-${project.id}`} accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }} onPress={() => change({ ...choices, projectIds: toggleJournalId(choices.projectIds, project.id) })}
              style={[s.project, { borderColor: selected ? c.primary : c.border, backgroundColor: c.card }]}>
              <MaterialCommunityIcons name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={selected ? c.primary : c.mutedForeground} />
              <View style={s.flex}>
                <Text style={[s.body, { color: c.foreground }]}>{project.name}</Text>
                <Text style={[s.small, { color: c.mutedForeground }]}>{project.category}{project.archived ? ' · Archivé' : ''}</Text>
              </View>
            </Pressable>;
          })}
          {!projects.length && <Text style={[s.body, { color: c.mutedForeground }]}>Crée d’abord un projet et termine une tâche pour commencer ton carnet.</Text>}
          <Text style={[s.small, { color: c.mutedForeground }]}>
            Seuls les éléments terminés dont la date de fin se situe dans la période sont retenus. Les albums des projets terminés ont aussi leur page.
          </Text>
        </>}
        {step === 1 && <>
          <Text style={[s.section, { color: c.foreground }]}>02 / Tes étapes, dans l’ordre</Text>
          <Text style={[s.body, { color: c.mutedForeground }]}>
            Décoche une étape ou une photo, puis personnalise les légendes. Cela ne change jamais les originaux.
          </Text>
          <Text style={[s.small, { color: c.mutedForeground }]}>Un carnet peut contenir jusqu’à 60 photos et 80 étapes, pour 10 minutes maximum.</Text>
          {journal.candidates.map((entry, index) => <JournalEntryEditor key={entry.id} entry={entry} number={index + 1}
            choices={choices} expanded={expanded === entry.id} onExpand={() => setExpanded(expanded === entry.id ? null : entry.id)} onChange={change} />)}
          {!journal.candidates.length && <Text style={{ color: c.mutedForeground }}>Aucune réalisation datée pour cette sélection.</Text>}
        </>}
        {step === 2 && <>
          {generation.result ? <StoryVideoReview uri={generation.result.uri} isSharing={generation.isSharing}
            onShare={() => { void generation.shareResult(); }} onDiscard={generation.discardResult}
            discardLabel="Fermer la vidéo et revenir au montage"
            shareLabel={Platform.OS === 'web' ? 'Télécharger la vidéo' : 'Partager / enregistrer la vidéo'} /> : <>
            <Text style={[s.section, { color: c.foreground }]}>03 / Ton carnet, en mouvement</Text>
            {preview ? <JournalPreview payload={preview} onError={message => { setPreview(null); setError(message); }} />
              : <JournalCover title={choices.title} summary={`${journal.request.periodLabel}\n${journal.entries.length} étapes · ${journal.photoCount} photos`} />}
            {button(preview ? 'Recommencer l’aperçu' : 'Lire l’aperçu animé', () => { setPreview(null); void openPreview(); }, !ready, false, 'journal-preview')}
          </>}
          <Text style={[s.label, { color: c.mutedForeground }]}>RYTHME DU CARNET</Text>
          <View style={s.row}>{(['quick', 'normal', 'calm'] as const).map((pace, i) =>
            <Pressable key={pace} testID={`journal-pace-${pace}`} disabled={busy} onPress={() => change({ ...choices, pace })}
              style={[s.pace, { borderColor: choices.pace === pace ? c.primary : c.border, backgroundColor: c.card }]}>
              <Text style={[s.small, { color: choices.pace === pace ? c.primary : c.foreground }]}>{['Dynamique', 'Équilibré', 'Contemplatif'][i]}</Text>
            </Pressable>)}</View>
          <Text style={[s.body, { color: c.mutedForeground }]}>
            {journal.entries.length} étapes · {journal.photoCount} photos · environ {timeLabel(journal.duration)}
          </Text>
          <Text style={[s.small, { color: c.mutedForeground }]}>
            Vidéo verticale 720 × 1280 · papier à petits carreaux · sans musique. Les photos gardent leur cadrage.
            {'\n'}Garde l’application ouverte pendant l’export. MP4 si l’appareil le permet, sinon WebM. Le partage reste manuel.
          </Text>
        </>}
        {journal.undated.length > 0 && <View style={[s.notice, { borderColor: c.border }]}>
          <Text style={[s.label, { color: c.foreground }]}>{journal.undated.length} élément(s) terminé(s) sans date de fin</Text>
          <Text style={[s.small, { color: c.mutedForeground }]}>Ils ne sont pas placés arbitrairement dans le carnet. Renseigne leur date réelle pour les inclure.</Text>
          {(showUndated ? journal.undated : journal.undated.slice(0, 5)).map(item => <Pressable key={`${item.kind}:${item.id}`}
            onPress={() => router.push({ pathname: item.kind === 'task' ? '/task/new' : '/project/new', params: { id: item.id } })}>
            <Text style={[s.small, { color: c.primary }]}>{item.title} · préciser la date</Text>
          </Pressable>)}
          {journal.undated.length > 5 && <Pressable onPress={() => setShowUndated(value => !value)}>
            <Text style={[s.small, { color: c.primary }]}>{showUndated ? 'Réduire la liste' : `Voir les ${journal.undated.length - 5} autres éléments`}</Text>
          </Pressable>}
        </View>}
        {!!(error || generation.error || draft.error) && <View style={[s.notice, { borderColor: c.destructive }]}>
          <Text accessibilityLiveRegion="polite" style={[s.body, { color: c.destructive }]}>{error || generation.error || draft.error}</Text>
          {!!draft.error && button('Réessayer l’enregistrement', draft.retry)}
        </View>}
        {!!journal.error && <Text testID="journal-validation" style={[s.small, { color: c.mutedForeground }]}>{journal.error}</Text>}
      </KeyboardAwareScrollViewCompat>
      <View style={[s.footer, { borderColor: c.border, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 12 }]}>
        <Text style={[s.small, { color: c.mutedForeground }]}>{draft.saving ? 'Enregistrement des choix…' : draft.error ? 'Choix non enregistrés' : 'Choix conservés automatiquement'}</Text>
        {step < 2 ? button(step === 0 ? 'Choisir les photos & légendes' : 'Préparer ma vidéo', () => setStep(step + 1),
          step === 0 ? !journal.candidates.length : !ready, true, 'journal-continue')
          : button(generation.result ? 'Recréer la vidéo' : 'Créer la vidéo', () => {
            setPreview(null); void generation.start(journal.request);
          }, !ready, true, 'journal-generate')}
      </View>
    </>}
    <Modal visible={preparing || generation.isGenerating} transparent animationType="fade" onRequestClose={cancel}>
      <View style={[s.overlay, { backgroundColor: c.background }]}>
        <MaterialCommunityIcons name="notebook-outline" size={46} color={c.primary} />
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={[s.section, { color: c.foreground }]}>{preparing ? 'Préparation de l’aperçu' : generation.title}</Text>
        <Text accessibilityLiveRegion="polite" style={[s.body, { color: c.mutedForeground }]}>{preparing ? previewDetail : generation.detail}</Text>
        {!preparing && <View style={[s.progress, { backgroundColor: c.muted }]}>
          <View style={{ backgroundColor: c.primary, height: 5, width: `${generation.progress}%` }} />
        </View>}
        <Text style={[s.small, { color: c.mutedForeground, textAlign: 'center' }]}>Ton carnet se prépare. Garde l’app ouverte ; les originaux restent intacts.</Text>
        {button('Annuler', cancel, false, false, 'journal-cancel')}
      </View>
    </Modal>
    <JournalEngine generation={generation} />
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', lineHeight: 26 }, iconButton: { padding: 8, minHeight: 44, justifyContent: 'center' },
  small: { fontSize: 12, lineHeight: 18 }, steps: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  step: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2 }, stepText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  loading: { flex: 1, justifyContent: 'center', padding: 24, gap: 20 }, scroll: { padding: 20, paddingBottom: 30, gap: 16 },
  section: { fontSize: 19, lineHeight: 27, fontFamily: 'Inter_600SemiBold', marginTop: 8 }, label: { fontSize: 11, lineHeight: 18, letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 14, lineHeight: 22, fontFamily: 'Inter_400Regular' }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15 },
  button: { flexShrink: 1, minHeight: 48, paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  buttonText: { fontSize: 13, lineHeight: 19, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  project: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, borderWidth: 1 },
  notice: { padding: 16, gap: 10, borderRadius: 12, borderWidth: 1 }, pace: { flex: 1, paddingHorizontal: 6, paddingVertical: 14, borderWidth: 1, borderRadius: 10, alignItems: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 22 },
  progress: { height: 5, width: '100%', borderRadius: 3, overflow: 'hidden' },
});
