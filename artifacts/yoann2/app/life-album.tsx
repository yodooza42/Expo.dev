import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ProjectPhoto } from '@/components/ProjectPhoto';
import { useColors } from '@/hooks/useColors';
import {
  albumAgeAt,
  albumDay,
  buildAlbumTimeline,
  chronologicalMemories,
  importAlbumPhotos,
  isAlbumDate,
  loadLifeAlbum,
  makeAlbumId,
  saveLifeAlbum,
  unassignedAlbumPhotos,
  type AlbumMemory,
  type AlbumPhoto,
  type AlbumTimelineRow,
  type LifeAlbum,
} from '@/utils/lifeAlbum';
import { lifeAlbumTheme as ink } from '@/constants/lifeAlbumTheme';

type MemoryDraft = { id: string; title: string; date: string; note: string; photoIds: string[]; createdAt: number };

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

function formattedDate(value: string): string {
  return isAlbumDate(value) ? dateFormatter.format(dateFromKey(value)) : value;
}

export default function LifeAlbumScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [album, setAlbum] = useState<LifeAlbum | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editor, setEditor] = useState<'profile' | 'memory' | null>(null);
  const [profileDraft, setProfileDraft] = useState({ name: '', birthDate: '', coverPhotoId: '' });
  const [memoryDraft, setMemoryDraft] = useState<MemoryDraft | null>(null);
  const [selectedInbox, setSelectedInbox] = useState<string[]>([]);
  const [viewerPhoto, setViewerPhoto] = useState<AlbumPhoto | null>(null);
  const [inboxLimit, setInboxLimit] = useState(30);
  const [editorPhotoLimit, setEditorPhotoLimit] = useState(60);
  const [coverPhotoLimit, setCoverPhotoLimit] = useState(60);
  const editorBaseline = useRef('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setAlbum(await loadLifeAlbum());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Impossible de lire l’album.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const persist = useCallback(async (next: LifeAlbum): Promise<boolean> => {
    setSaving(true);
    setMessage('');
    try {
      await saveLifeAlbum(next);
      setAlbum(next);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enregistrement impossible. Réessaie.');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const openProfile = useCallback(() => {
    if (!album) return;
    const draft = {
      name: album.profile.name,
      birthDate: album.profile.birthDate ?? '',
      coverPhotoId: album.profile.coverPhotoId ?? '',
    };
    setProfileDraft(draft);
    setCoverPhotoLimit(60);
    editorBaseline.current = JSON.stringify(draft);
    setEditor('profile');
  }, [album]);

  const openMemory = useCallback((memory?: AlbumMemory, photoIds: string[] = []) => {
    if (!album) return;
    const now = Date.now();
    const preferredPhotoDate = photoIds
      .map(id => album.photos.find(photo => photo.id === id)?.takenAt)
      .filter((date): date is number => typeof date === 'number')
      .sort((a, b) => a - b)[0];
    const draft: MemoryDraft = memory
      ? { ...memory, photoIds: [...memory.photoIds] }
      : {
          id: makeAlbumId(), title: '', date: preferredPhotoDate ? albumDay(preferredPhotoDate) : albumDay(now),
          note: '', photoIds: [...photoIds], createdAt: now,
        };
    setMemoryDraft(draft);
    setEditorPhotoLimit(60);
    editorBaseline.current = JSON.stringify(draft);
    setEditor('memory');
  }, [album]);

  const closeEditor = useCallback(() => {
    const draft = editor === 'profile' ? profileDraft : memoryDraft;
    const changed = !!draft && JSON.stringify(draft) !== editorBaseline.current;
    const finish = () => {
      setEditor(null);
      setMemoryDraft(null);
    };
    if (!changed) { finish(); return; }
    Alert.alert('Quitter sans enregistrer ?', 'Les modifications de ce formulaire seront perdues.', [
      { text: 'Continuer', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: finish },
    ]);
  }, [editor, memoryDraft, profileDraft]);

  useEffect(() => {
    if (!editor) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeEditor();
      return true;
    });
    return () => subscription.remove();
  }, [closeEditor, editor]);

  async function addPhotos() {
    if (!album || importing || saving) return;
    setImporting(true);
    setMessage('');
    try {
      const result = await importAlbumPhotos();
      if (!result.photos.length && !result.failed.length) return;
      const photos = [...album.photos];
      const known = new Set(photos.map(photo => photo.id));
      let addedCount = 0;
      for (const photo of result.photos) {
        if (known.has(photo.id)) continue;
        known.add(photo.id);
        photos.push(photo);
        addedCount++;
      }
      const saved = await persist({ ...album, photos });
      if (!saved) return;
      if (result.failed.length) {
        setMessage(addedCount > 0
          ? `${result.failed.length} photo(s) n’ont pas pu être ajoutées. Les photos copiées sont disponibles dans les photos à classer.`
          : `${result.failed.length} photo(s) n’ont pas pu être ajoutées.`);
      } else if (addedCount > 0) {
        setMessage(`${addedCount} photo(s) ajoutée(s) aux photos à classer.`);
      } else {
        setMessage('Ces photos sont déjà dans l’album.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ajout des photos impossible.');
    } finally {
      setImporting(false);
    }
  }

  async function saveProfile() {
    if (!album) return;
    const name = profileDraft.name.trim();
    const birthDate = profileDraft.birthDate.trim();
    if (birthDate && !isAlbumDate(birthDate)) {
      setMessage('Saisis la date au format AAAA-MM-JJ, ou laisse le champ vide.');
      return;
    }
    if (birthDate && birthDate > albumDay(Date.now())) {
      setMessage('La date de naissance ne peut pas être dans le futur.');
      return;
    }
    const next = {
      ...album,
      profile: {
        name,
        birthDate: birthDate || null,
        coverPhotoId: profileDraft.coverPhotoId || null,
      },
    };
    if (await persist(next)) {
      editorBaseline.current = JSON.stringify(profileDraft);
      setEditor(null);
    }
  }

  async function saveMemory() {
    if (!album || !memoryDraft) return;
    if (!isAlbumDate(memoryDraft.date)) {
      setMessage('Saisis une date valide au format AAAA-MM-JJ.');
      return;
    }
    if (memoryDraft.date > albumDay(Date.now())) {
      setMessage('Un souvenir ne peut pas être daté dans le futur.');
      return;
    }
    const photoIds = [...new Set(memoryDraft.photoIds)].filter(id => album.photos.some(photo => photo.id === id));
    const title = memoryDraft.title.trim();
    if (!title && photoIds.length === 0) {
      setMessage('Ajoute un titre à cet événement ou choisis au moins une photo.');
      return;
    }
    const now = Date.now();
    const memory: AlbumMemory = {
      id: memoryDraft.id,
      title,
      date: memoryDraft.date,
      note: memoryDraft.note.trim(),
      photoIds,
      createdAt: memoryDraft.createdAt,
      updatedAt: now,
    };
    const memories = album.memories.some(item => item.id === memory.id)
      ? album.memories.map(item => item.id === memory.id ? memory : item)
      : [...album.memories, memory];
    if (await persist({ ...album, memories })) {
      editorBaseline.current = JSON.stringify({ ...memory, photoIds: [...memory.photoIds] });
      setEditor(null);
      setMemoryDraft(null);
      setSelectedInbox([]);
    }
  }

  function toggleDraftPhoto(id: string) {
    setMemoryDraft(current => {
      if (!current) return current;
      const photoIds = current.photoIds.includes(id)
        ? current.photoIds.filter(item => item !== id)
        : [...current.photoIds, id];
      return { ...current, photoIds };
    });
  }

  function deleteMemory(memory: AlbumMemory) {
    if (!album) return;
    Alert.alert('Supprimer ce souvenir ?', 'Les photos ne seront pas supprimées. Celles qui ne sont plus liées à un autre souvenir retourneront dans les photos à classer.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer le souvenir',
        style: 'destructive',
        onPress: () => {
          const memories = album.memories.filter(item => item.id !== memory.id);
          void persist({ ...album, memories });
        },
      },
    ]);
  }

  function toggleInboxPhoto(id: string) {
    setSelectedInbox(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  const orderedMemories = useMemo(() => album ? chronologicalMemories(album) : [], [album]);
  const timelineRows = useMemo(
    () => buildAlbumTimeline(orderedMemories, album?.profile.birthDate ?? null, albumDay(Date.now())),
    [orderedMemories, album?.profile.birthDate],
  );
  const inbox = useMemo(() => album ? unassignedAlbumPhotos(album) : [], [album]);
  const orderedInbox = useMemo(() => [...inbox].sort((a, b) => b.addedAt - a.addedAt), [inbox]);
  const orderedAlbumPhotos = useMemo(() => album ? [...album.photos].sort((a, b) => b.addedAt - a.addedAt) : [], [album]);
  const cover = album?.photos.find(photo => photo.id === album.profile.coverPhotoId);
  const currentAge = album?.profile.birthDate ? albumAgeAt(album.profile.birthDate, albumDay(Date.now())) : null;
  const viewerIndex = viewerPhoto && album ? album.photos.findIndex(photo => photo.id === viewerPhoto.id) : -1;
  const webInsets = Platform.OS === 'web' ? { paddingTop: Math.max(insets.top, 67), paddingBottom: Math.max(insets.bottom, 34) } : {};

  function renderMemory(memory: AlbumMemory) {
    const photos = memory.photoIds.map(id => album?.photos.find(photo => photo.id === id)).filter((photo): photo is AlbumPhoto => !!photo);
    const age = album ? albumAgeAt(album.profile.birthDate, memory.date) : null;
    return (
      <View style={styles.memoryRow}>
        <View style={[styles.timelineSpine, { backgroundColor: ink.rule }]} />
        <View style={[styles.timelineDot, { backgroundColor: ink.accent, borderColor: colors.background }]} />
        <View style={styles.memoryContent}>
          <View style={styles.memoryDateLine}>
            <Text style={[styles.memoryDate, { color: ink.accent }]}>{formattedDate(memory.date)}</Text>
            {age ? <Text style={[styles.memoryAge, { color: ink.quiet }]}>{age}</Text> : null}
          </View>
          {memory.title ? <Text style={[styles.memoryTitle, { color: ink.ink }]}>{memory.title}</Text> : null}
          {memory.note ? <Text style={[styles.memoryNote, { color: ink.text }]}>{memory.note}</Text> : null}
          {photos.length > 0 ? (
            <View style={styles.memoryPhotoLayout}>
              <Pressable onPress={() => setViewerPhoto(photos[0]!)} accessibilityRole="imagebutton" accessibilityLabel={`Voir la photo du ${formattedDate(memory.date)}`}>
                <ProjectPhoto uri={photos[0]!.uri} style={styles.memoryHeroPhoto} contentFit="cover" />
              </Pressable>
              {photos.length > 1 ? (
                <View style={styles.memoryPhotoStrip}>
                  {photos.slice(1, 6).map(photo => (
                    <Pressable key={photo.id} onPress={() => setViewerPhoto(photo)} accessibilityRole="imagebutton" accessibilityLabel="Afficher cette photo">
                      <ProjectPhoto uri={photo.uri} style={styles.memoryStripPhoto} contentFit="cover" />
                    </Pressable>
                  ))}
                  {photos.length > 6 ? (
                    <Pressable onPress={() => setViewerPhoto(photos[6]!)} accessibilityRole="button" accessibilityLabel={`Afficher les ${photos.length - 6} autres photos`} style={[styles.moreMemoryPhotos, { backgroundColor: ink.surfaceRaised }]}>
                      <Text style={[styles.moreMemoryPhotosText, { color: ink.ink }]}>+{photos.length - 6}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          <Pressable
            testID={`edit-life-memory-${memory.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Modifier ${memory.title || 'ce souvenir'}`}
            onPress={() => openMemory(memory)}
            style={styles.memoryEdit}
          >
            <Text style={[styles.memoryEditText, { color: ink.quiet }]}>Modifier</Text>
            <MaterialCommunityIcons name="chevron-right" size={17} color={ink.quiet} />
          </Pressable>
        </View>
      </View>
    );
  }

  function renderTimelineRow({ item }: { item: AlbumTimelineRow }) {
    if (item.kind === 'year') {
      return (
        <View style={styles.yearRow}>
          <Text style={[styles.yearText, { color: ink.accent }]}>{item.year}</Text>
          <View style={[styles.yearRule, { backgroundColor: ink.rule }]} />
        </View>
      );
    }
    if (item.kind === 'memory') return renderMemory(item.memory);
    if (item.kind === 'beforeBirth') {
      return (
        <View style={styles.memoryRow}>
          <View style={[styles.timelineSpine, { backgroundColor: ink.rule }]} />
          <View style={[styles.timelineDot, { backgroundColor: ink.black, borderColor: ink.accent }]} />
          <View style={[styles.memoryContent, styles.dateMarker]}>
            <Text style={[styles.markerTitle, { color: ink.ink }]}>Avant sa naissance</Text>
            <Text style={[styles.memoryDate, { color: ink.accent }]}>Souvenirs avant le {formattedDate(item.date)}</Text>
          </View>
        </View>
      );
    }
    const isToday = item.kind === 'today';
    const age = isToday && album ? albumAgeAt(album.profile.birthDate, item.date) : null;
    return (
      <View style={styles.memoryRow}>
        <View style={[styles.timelineSpine, { backgroundColor: ink.rule }]} />
        <View style={[styles.timelineDot, { backgroundColor: isToday ? ink.black : ink.accent, borderColor: ink.accent }]} />
        <View style={[styles.memoryContent, styles.dateMarker]}>
          <Text style={[styles.markerTitle, { color: ink.ink }]}>{isToday ? 'Aujourd’hui' : 'Naissance'}</Text>
          <Text style={[styles.memoryDate, { color: ink.accent }]}>{formattedDate(item.date)}</Text>
          {age ? <Text style={[styles.memoryAge, { color: ink.quiet, marginTop: 4 }]}>{age}</Text> : null}
        </View>
      </View>
    );
  }

  const listHeader = (
    <View>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 8 : insets.top + 8 }]}>
        <Pressable
          testID="life-album-back"
          accessibilityRole="button"
          accessibilityLabel="Retour à l’accueil"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/accueil' as any)}
          style={styles.iconButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={23} color={ink.ink} />
        </Pressable>
        <Text style={[styles.topBarTitle, { color: ink.quiet }]}>ALBUM DE VIE</Text>
        <Pressable testID="edit-life-profile" accessibilityRole="button" accessibilityLabel="Modifier le profil de l’album" onPress={openProfile} style={styles.iconButton}>
          <MaterialCommunityIcons name="tune-variant" size={21} color={ink.accent} />
        </Pressable>
      </View>

      <View style={styles.coverBlock}>
        {cover ? (
          <Pressable onPress={() => setViewerPhoto(cover)} accessibilityRole="imagebutton" accessibilityLabel="Afficher la photo de couverture">
            <ProjectPhoto uri={cover.uri} style={styles.coverPhoto} contentFit="cover" />
          </Pressable>
        ) : (
          <View style={[styles.coverEmpty, { borderColor: ink.rule }]}>
            <MaterialCommunityIcons name="image-outline" size={28} color={ink.accentSoft} />
            <Text style={[styles.coverEmptyText, { color: ink.quiet }]}>Une place pour la photo de couverture</Text>
          </View>
        )}
        <Text style={[styles.kicker, { color: ink.accent }]}>SON HISTOIRE, EN IMAGES</Text>
        <Text style={[styles.coverTitle, { color: ink.ink }]}>{album?.profile.name ? `L’histoire de ${album.profile.name}` : 'Son histoire'}</Text>
        <Text style={[styles.coverSubtitle, { color: ink.quiet }]}>
          {album?.profile.birthDate
            ? `Depuis le ${shortDateFormatter.format(dateFromKey(album.profile.birthDate))}${currentAge ? ` · ${currentAge}` : ''}`
            : 'De sa naissance à aujourd’hui'}
        </Text>
      </View>

      {album && album.profile.name.length === 0 && album.profile.birthDate === null ? (
        <Pressable testID="setup-life-profile" onPress={openProfile} style={[styles.profilePrompt, { borderColor: ink.rule }]}>
          <Text style={[styles.profilePromptText, { color: ink.text }]}>Ajoute son prénom et sa date de naissance pour afficher son âge dans la chronologie.</Text>
          <MaterialCommunityIcons name="chevron-right" size={19} color={ink.accent} />
        </Pressable>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          testID="import-life-album-photos"
          accessibilityRole="button"
          accessibilityLabel="Ajouter des photos"
          disabled={importing || saving}
          onPress={() => void addPhotos()}
          style={[styles.importButton, { borderColor: ink.accentSoft, opacity: importing || saving ? 0.55 : 1 }]}
        >
          <MaterialCommunityIcons name={importing ? 'progress-clock' : 'image-plus-outline'} size={19} color={ink.accent} />
          <Text style={[styles.importText, { color: ink.accent }]}>{importing ? 'Ajout en cours…' : 'Ajouter des photos'}</Text>
        </Pressable>
        <Pressable
          testID="create-life-event"
          accessibilityRole="button"
          accessibilityLabel="Ajouter un événement"
          onPress={() => openMemory()}
          style={[styles.addEventButton, { backgroundColor: ink.accent }]}
        >
          <MaterialCommunityIcons name="plus" size={20} color={ink.black} />
          <Text style={[styles.addEventText, { color: ink.black }]}>Événement</Text>
        </Pressable>
      </View>

      {message ? <Text accessibilityRole="alert" style={[styles.message, { color: ink.accent }]}>{message}</Text> : null}

      {inbox.length > 0 ? (
        <View style={styles.inboxBlock}>
          <View style={styles.sectionTitleRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: ink.ink }]}>À classer</Text>
              <Text style={[styles.sectionHint, { color: ink.quiet }]}>Elles resteront ici jusqu’à ce que tu les classes.</Text>
            </View>
            {selectedInbox.length > 0 ? (
              <Pressable
                testID="create-memory-from-inbox"
                accessibilityRole="button"
                onPress={() => openMemory(undefined, selectedInbox)}
                style={[styles.createFromSelection, { borderColor: ink.accentSoft }]}
              >
                <Text style={[styles.createFromSelectionText, { color: ink.accent }]}>{selectedInbox.length} · créer</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.photoGrid}>
            {orderedInbox.slice(0, inboxLimit).map(photo => {
              const selected = selectedInbox.includes(photo.id);
              return (
                <Pressable
                  key={photo.id}
                  testID={`select-inbox-photo-${photo.id}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Photo${photo.takenAt ? ` du ${formattedDate(albumDay(photo.takenAt))}` : ''}`}
                  onPress={() => toggleInboxPhoto(photo.id)}
                  style={[styles.inboxPhoto, { borderColor: selected ? ink.accent : ink.rule }]}
                >
                  <ProjectPhoto uri={photo.uri} style={styles.inboxImage} contentFit="cover" />
                  {photo.takenAt ? <Text numberOfLines={1} style={[styles.inboxDate, { color: ink.quiet }]}>{shortDateFormatter.format(new Date(photo.takenAt))}</Text> : null}
                  {selected ? (
                    <View style={[styles.selectedMark, { backgroundColor: ink.accent }]}>
                      <MaterialCommunityIcons name="check" size={15} color={ink.black} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {orderedInbox.length > inboxLimit ? (
            <Pressable testID="show-more-inbox-photos" onPress={() => setInboxLimit(value => value + 30)} style={styles.showMoreButton}>
              <Text style={[styles.showMoreText, { color: ink.accent }]}>Afficher 30 photos de plus</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.timelineHeading}>
        <Text style={[styles.sectionTitle, { color: ink.ink }]}>Dans le temps</Text>
        <Text style={[styles.sectionHint, { color: ink.quiet }]}>Les souvenirs restent dans l’ordre de leurs dates.</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <StatusBar style="light" />
        <Text style={[styles.loadingText, { color: ink.quiet }]}>Ouverture de l’album…</Text>
      </View>
    );
  }

  if (loadError || !album) {
    return (
      <View style={[styles.centered, webInsets, { backgroundColor: colors.background }]}>
        <StatusBar style="light" />
        <Text style={[styles.errorTitle, { color: ink.ink }]}>L’album ne s’est pas ouvert</Text>
        <Text accessibilityRole="alert" style={[styles.errorText, { color: ink.quiet }]}>{loadError || 'Données de l’album indisponibles.'}</Text>
        <Pressable testID="retry-life-album-load" onPress={() => void refresh()} style={[styles.retryButton, { borderColor: ink.accentSoft }]}>
          <Text style={[styles.retryText, { color: ink.accent }]}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <FlatList
        testID="life-album-timeline"
        data={timelineRows}
        keyExtractor={item => item.key}
        renderItem={renderTimelineRow}
        ListHeaderComponent={listHeader}
        ListFooterComponent={album.memories.length === 0 ? (
          <View style={[styles.emptyTimeline, { borderColor: ink.rule }]}>
            <Text style={[styles.emptyTitle, { color: ink.ink }]}>Pas encore de souvenir.</Text>
            <Text style={[styles.emptyText, { color: ink.quiet }]}>Ajoute des photos ou un événement pour commencer la chronologie. Tu pourras compléter les détails plus tard.</Text>
            <Pressable testID="create-first-life-memory" onPress={() => openMemory()} style={[styles.emptyAction, { backgroundColor: ink.accent }]}>
              <Text style={[styles.emptyActionText, { color: ink.black }]}>Ajouter un souvenir</Text>
            </Pressable>
          </View>
        ) : null}
        contentContainerStyle={[styles.listContent, webInsets]}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={!!editor} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeEditor}>
        <View style={[styles.editorScreen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top, paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom }]}>
          <View style={[styles.editorHeader, { borderBottomColor: ink.rule }]}>
            <Pressable testID="close-life-editor" accessibilityRole="button" accessibilityLabel="Fermer sans enregistrer" onPress={closeEditor} style={styles.iconButton}>
              <MaterialCommunityIcons name="close" size={23} color={ink.ink} />
            </Pressable>
            <Text style={[styles.editorHeaderTitle, { color: ink.ink }]}>{editor === 'profile' ? 'L’album' : memoryDraft && album.memories.some(item => item.id === memoryDraft.id) ? 'Modifier le souvenir' : 'Nouveau souvenir'}</Text>
            <Pressable
              testID="save-life-editor"
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void (editor === 'profile' ? saveProfile() : saveMemory())}
              style={styles.iconButton}
            >
              <MaterialCommunityIcons name="content-save-outline" size={22} color={saving ? ink.quiet : ink.accent} />
            </Pressable>
          </View>
          <KeyboardAwareScrollViewCompat
            style={styles.editorScroll}
            contentContainerStyle={styles.editorContent}
            keyboardShouldPersistTaps="handled"
            bottomOffset={24}
          >
            {editor === 'profile' ? (
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: ink.quiet }]}>SON PRÉNOM (FACULTATIF)</Text>
                <TextInput
                  testID="life-album-name-input"
                  accessibilityLabel="Prénom"
                  value={profileDraft.name}
                  onChangeText={name => setProfileDraft(current => ({ ...current, name }))}
                  placeholder="Prénom"
                  placeholderTextColor={ink.quiet}
                  style={[styles.input, { color: ink.ink, borderColor: ink.rule, backgroundColor: ink.surface }]}
                  returnKeyType="done"
                />
                <Text style={[styles.formLabel, { color: ink.quiet, marginTop: 18 }]}>DATE DE NAISSANCE (FACULTATIVE)</Text>
                <TextInput
                  testID="life-album-birth-date-input"
                  accessibilityLabel="Date de naissance"
                  value={profileDraft.birthDate}
                  onChangeText={birthDate => setProfileDraft(current => ({ ...current, birthDate }))}
                  placeholder="AAAA-MM-JJ"
                  placeholderTextColor={ink.quiet}
                  style={[styles.input, { color: ink.ink, borderColor: ink.rule, backgroundColor: ink.surface }]}
                  autoCapitalize="none"
                  maxLength={10}
                />
                <Text style={[styles.formHelp, { color: ink.quiet }]}>Cette date sert uniquement à afficher son âge au fil des souvenirs.</Text>
                <Text style={[styles.formLabel, { color: ink.quiet, marginTop: 24 }]}>PHOTO DE COUVERTURE</Text>
                <View style={styles.coverChoiceGrid}>
                  <Pressable testID="clear-life-album-cover" onPress={() => setProfileDraft(current => ({ ...current, coverPhotoId: '' }))} style={[styles.coverChoice, { borderColor: !profileDraft.coverPhotoId ? ink.accent : ink.rule }]}>
                    <Text style={[styles.coverChoiceText, { color: ink.quiet }]}>Aucune</Text>
                  </Pressable>
                  {orderedAlbumPhotos.slice(0, coverPhotoLimit).map(photo => (
                    <Pressable key={photo.id} testID={`choose-life-album-cover-${photo.id}`} accessibilityRole="radio" accessibilityState={{ checked: profileDraft.coverPhotoId === photo.id }} onPress={() => setProfileDraft(current => ({ ...current, coverPhotoId: photo.id }))} style={[styles.coverChoice, { borderColor: profileDraft.coverPhotoId === photo.id ? ink.accent : ink.rule }]}>
                      <ProjectPhoto uri={photo.uri} style={styles.coverChoicePhoto} contentFit="cover" />
                    </Pressable>
                  ))}
                </View>
                {orderedAlbumPhotos.length > coverPhotoLimit ? (
                  <Pressable testID="show-more-cover-photos" onPress={() => setCoverPhotoLimit(value => value + 60)} style={styles.showMoreButton}>
                    <Text style={[styles.showMoreText, { color: ink.accent }]}>Afficher 60 photos de plus</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : memoryDraft ? (
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: ink.quiet }]}>DATE</Text>
                <TextInput
                  testID="life-memory-date-input"
                  accessibilityLabel="Date du souvenir"
                  value={memoryDraft.date}
                  onChangeText={date => setMemoryDraft(current => current ? { ...current, date } : current)}
                  placeholder="AAAA-MM-JJ"
                  placeholderTextColor={ink.quiet}
                  style={[styles.input, { color: ink.ink, borderColor: ink.rule, backgroundColor: ink.surface }]}
                  autoCapitalize="none"
                  maxLength={10}
                />
                <Text style={[styles.formHelp, { color: ink.quiet }]}>Préremplie avec la date d’une photo si elle est connue. Tu peux la corriger.</Text>
                <Text style={[styles.formLabel, { color: ink.quiet, marginTop: 20 }]}>TITRE (FACULTATIF AVEC PHOTO)</Text>
                <TextInput
                  testID="life-memory-title-input"
                  accessibilityLabel="Titre du souvenir"
                  value={memoryDraft.title}
                  onChangeText={title => setMemoryDraft(current => current ? { ...current, title } : current)}
                  placeholder="Un événement, une étape…"
                  placeholderTextColor={ink.quiet}
                  style={[styles.input, { color: ink.ink, borderColor: ink.rule, backgroundColor: ink.surface }]}
                  maxLength={90}
                  returnKeyType="next"
                />
                <Text style={[styles.formLabel, { color: ink.quiet, marginTop: 20 }]}>QUELQUES MOTS (FACULTATIF)</Text>
                <TextInput
                  testID="life-memory-note-input"
                  accessibilityLabel="Note du souvenir"
                  value={memoryDraft.note}
                  onChangeText={note => setMemoryDraft(current => current ? { ...current, note } : current)}
                  placeholder="Note, lieu, détail…"
                  placeholderTextColor={ink.quiet}
                  style={[styles.input, styles.noteInput, { color: ink.ink, borderColor: ink.rule, backgroundColor: ink.surface }]}
                  multiline
                  maxLength={1000}
                  textAlignVertical="top"
                />
                <View style={styles.formPhotoTitle}>
                  <Text style={[styles.formLabel, { color: ink.quiet }]}>PHOTOS DU SOUVENIR</Text>
                  <Text style={[styles.formHelp, { color: ink.quiet }]}>{memoryDraft.photoIds.length} choisie(s)</Text>
                </View>
                {album.photos.length === 0 ? (
                  <Pressable testID="import-from-life-memory-editor" onPress={() => void addPhotos()} style={[styles.importInline, { borderColor: ink.accentSoft }]}>
                    <MaterialCommunityIcons name="image-plus-outline" size={18} color={ink.accent} />
                    <Text style={[styles.importText, { color: ink.accent }]}>Ajouter des photos d’abord</Text>
                  </Pressable>
                ) : (
                  <View style={styles.photoGrid}>
                    {orderedAlbumPhotos.slice(0, editorPhotoLimit).map(photo => {
                      const selected = memoryDraft.photoIds.includes(photo.id);
                      return (
                        <Pressable key={photo.id} testID={`select-memory-photo-${photo.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`Choisir cette photo${photo.takenAt ? ` du ${formattedDate(albumDay(photo.takenAt))}` : ''}`} onPress={() => toggleDraftPhoto(photo.id)} style={[styles.inboxPhoto, { borderColor: selected ? ink.accent : ink.rule }]}>
                          <ProjectPhoto uri={photo.uri} style={styles.inboxImage} contentFit="cover" />
                          {photo.takenAt ? <Text numberOfLines={1} style={[styles.inboxDate, { color: ink.quiet }]}>{shortDateFormatter.format(new Date(photo.takenAt))}</Text> : null}
                          {selected ? <View style={[styles.selectedMark, { backgroundColor: ink.accent }]}><MaterialCommunityIcons name="check" size={15} color={ink.black} /></View> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {orderedAlbumPhotos.length > editorPhotoLimit ? (
                  <Pressable testID="show-more-memory-photos" onPress={() => setEditorPhotoLimit(value => value + 60)} style={styles.showMoreButton}>
                    <Text style={[styles.showMoreText, { color: ink.accent }]}>Afficher 60 photos de plus</Text>
                  </Pressable>
                ) : null}
                {album.memories.some(item => item.id === memoryDraft.id) ? (
                  <Pressable testID="delete-life-memory" onPress={() => {
                    const existing = album.memories.find(item => item.id === memoryDraft.id);
                    if (existing) {
                      setEditor(null);
                      deleteMemory(existing);
                    }
                  }} style={styles.deleteMemoryButton}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.destructive} />
                    <Text style={[styles.deleteMemoryText, { color: colors.destructive }]}>Supprimer ce souvenir</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {message ? <Text accessibilityRole="alert" style={[styles.message, { color: ink.accent }]}>{message}</Text> : null}
            <Pressable testID="save-life-editor-button" disabled={saving} onPress={() => void (editor === 'profile' ? saveProfile() : saveMemory())} style={[styles.saveButton, { backgroundColor: ink.accent, opacity: saving ? 0.6 : 1 }]}>
              <Text style={[styles.saveButtonText, { color: ink.black }]}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal visible={!!viewerPhoto} transparent animationType="fade" onRequestClose={() => setViewerPhoto(null)}>
        <View style={[styles.viewer, { backgroundColor: ink.black }]}>
          <Pressable testID="close-life-photo-viewer" accessibilityRole="button" accessibilityLabel="Fermer la photo" onPress={() => setViewerPhoto(null)} style={[styles.viewerClose, { top: Math.max(insets.top, Platform.OS === 'web' ? 67 : 12) }]}>
            <MaterialCommunityIcons name="close" size={26} color={ink.ink} />
          </Pressable>
          {viewerPhoto ? <ProjectPhoto uri={viewerPhoto.uri} style={styles.viewerImage} contentFit="contain" /> : null}
          {viewerIndex > 0 ? (
            <Pressable testID="previous-life-photo" accessibilityRole="button" accessibilityLabel="Photo précédente" onPress={() => setViewerPhoto(album.photos[viewerIndex - 1]!)} style={[styles.viewerArrow, styles.viewerArrowLeft]}>
              <MaterialCommunityIcons name="chevron-left" size={32} color={ink.ink} />
            </Pressable>
          ) : null}
          {viewerIndex >= 0 && viewerIndex < album.photos.length - 1 ? (
            <Pressable testID="next-life-photo" accessibilityRole="button" accessibilityLabel="Photo suivante" onPress={() => setViewerPhoto(album.photos[viewerIndex + 1]!)} style={[styles.viewerArrow, styles.viewerArrowRight]}>
              <MaterialCommunityIcons name="chevron-right" size={32} color={ink.ink} />
            </Pressable>
          ) : null}
          {viewerIndex >= 0 ? <Text style={[styles.viewerCount, { color: ink.quiet }]}>{viewerIndex + 1} / {album.photos.length}</Text> : null}
          {viewerPhoto?.takenAt ? <Text style={[styles.viewerDate, { color: ink.quiet }]}>{formattedDate(albumDay(viewerPhoto.takenAt))}</Text> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  loadingText: { fontSize: 14 },
  errorTitle: { fontFamily: 'serif', fontSize: 26, textAlign: 'center' },
  errorText: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginTop: 12 },
  retryButton: { borderWidth: 1, paddingHorizontal: 20, paddingVertical: 12, marginTop: 22 },
  retryText: { fontSize: 14, fontWeight: '600' },
  listContent: { paddingBottom: 36 },
  topBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  topBarTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2.2 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  coverBlock: { paddingHorizontal: 24, paddingTop: 15, paddingBottom: 26 },
  coverPhoto: { width: '100%', height: 265, marginBottom: 23 },
  coverEmpty: { height: 156, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 22 },
  coverEmptyText: { fontSize: 12 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  coverTitle: { fontFamily: 'serif', fontSize: 34, lineHeight: 40 },
  coverSubtitle: { fontSize: 13, marginTop: 8, letterSpacing: 0.15 },
  profilePrompt: { marginHorizontal: 24, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profilePromptText: { flex: 1, fontSize: 12, lineHeight: 18, paddingRight: 10 },
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingBottom: 16 },
  importButton: { flex: 1, minHeight: 48, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  importText: { fontSize: 13, fontWeight: '600' },
  addEventButton: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  addEventText: { fontSize: 13, fontWeight: '700' },
  message: { paddingHorizontal: 24, paddingVertical: 8, fontSize: 12, lineHeight: 18 },
  inboxBlock: { paddingTop: 17, paddingBottom: 23, paddingHorizontal: 24, borderTopWidth: 1, borderColor: ink.rule },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontFamily: 'serif', fontSize: 24, lineHeight: 30 },
  sectionHint: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  createFromSelection: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  createFromSelectionText: { fontSize: 11, fontWeight: '700' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  showMoreButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 4, marginTop: 8 },
  showMoreText: { fontSize: 12, fontWeight: '600' },
  inboxPhoto: { width: '31.5%', padding: 2, borderWidth: 1, position: 'relative' },
  inboxImage: { width: '100%', aspectRatio: 1, backgroundColor: ink.surfaceRaised },
  inboxDate: { fontSize: 9, paddingHorizontal: 2, paddingTop: 4, paddingBottom: 2 },
  selectedMark: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  timelineHeading: { paddingHorizontal: 24, paddingTop: 21, paddingBottom: 12, borderTopWidth: 1, borderColor: ink.rule },
  yearRow: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 13 },
  yearText: { fontFamily: 'serif', fontSize: 28, letterSpacing: 0.5 },
  yearRule: { height: StyleSheet.hairlineWidth, flex: 1 },
  memoryRow: { position: 'relative', paddingLeft: 24, paddingRight: 24, paddingBottom: 24, flexDirection: 'row' },
  timelineSpine: { position: 'absolute', left: 31, top: 6, bottom: 0, width: StyleSheet.hairlineWidth },
  timelineDot: { width: 13, height: 13, borderRadius: 7, borderWidth: 3, marginTop: 4, marginRight: 13, zIndex: 1 },
  memoryContent: { flex: 1 },
  dateMarker: { paddingBottom: 16 },
  memoryDateLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  memoryDate: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  memoryAge: { fontSize: 11 },
  memoryTitle: { fontFamily: 'serif', fontSize: 23, lineHeight: 29, marginBottom: 5 },
  memoryNote: { fontSize: 13, lineHeight: 20, marginBottom: 10 },
  memoryPhotoLayout: { gap: 6, marginTop: 9 },
  memoryHeroPhoto: { width: '100%', height: 244, backgroundColor: ink.surfaceRaised },
  memoryPhotoStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  memoryStripPhoto: { width: 76, height: 76, backgroundColor: ink.surfaceRaised },
  moreMemoryPhotos: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  moreMemoryPhotosText: { fontSize: 16, fontWeight: '600' },
  memoryEdit: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingRight: 8 },
  memoryEditText: { fontSize: 11, letterSpacing: 0.5 },
  markerTitle: { fontFamily: 'serif', fontSize: 20, marginBottom: 3 },
  emptyTimeline: { marginHorizontal: 24, marginVertical: 28, padding: 20, borderTopWidth: 1, borderBottomWidth: 1 },
  emptyTitle: { fontFamily: 'serif', fontSize: 22 },
  emptyText: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  emptyAction: { alignSelf: 'flex-start', paddingHorizontal: 15, paddingVertical: 11, marginTop: 16 },
  emptyActionText: { fontSize: 13, fontWeight: '700' },
  editorScreen: { flex: 1 },
  editorHeader: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  editorHeaderTitle: { fontSize: 14, fontWeight: '600' },
  editorScroll: { flex: 1 },
  editorContent: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 36 },
  formGroup: { gap: 0 },
  formLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 9 },
  input: { minHeight: 48, borderWidth: 1, paddingHorizontal: 13, fontSize: 15 },
  formHelp: { fontSize: 11, lineHeight: 17, marginTop: 7 },
  noteInput: { minHeight: 104, paddingTop: 12 },
  coverChoiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  coverChoice: { width: 76, height: 76, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  coverChoiceText: { fontSize: 10 },
  coverChoicePhoto: { width: 70, height: 70 },
  formPhotoTitle: { marginTop: 23, marginBottom: 10, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  importInline: { height: 46, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  deleteMemoryButton: { marginTop: 30, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  deleteMemoryText: { fontSize: 13 },
  saveButton: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  saveButtonText: { fontSize: 14, fontWeight: '700' },
  viewer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  viewerClose: { position: 'absolute', right: 16, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '82%' },
  viewerArrow: { position: 'absolute', top: '48%', zIndex: 2, width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
  viewerArrowLeft: { left: 2 },
  viewerArrowRight: { right: 2 },
  viewerCount: { fontSize: 11, marginTop: 10 },
  viewerDate: { fontSize: 12, marginTop: 12 },
});
