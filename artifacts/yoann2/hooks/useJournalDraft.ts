import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '@/types';
import type { JournalChoices } from '@/types/projectJournal';
import { initialJournalChoices, validateJournalChoices } from '@/utils/projectJournal';

export function useJournalDraft(projects: Project[], loading: boolean, projectId?: string) {
  const [choices, setChoices] = useState<JournalChoices | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const latest = useRef(projects); latest.current = projects;
  const alive = useRef(true);
  const chain = useRef(Promise.resolve());
  const revision = useRef(0);
  const key = `@yoann2_project_journal_v1:${projectId ?? 'all'}`;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (loading) return;
    let active = true;
    setChoices(null); setError('');
    AsyncStorage.getItem(key).then(raw => {
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (stored && !validateJournalChoices(stored)) throw new Error('Format du carnet enregistré non reconnu.');
      if (active) setChoices(stored ? stored as JournalChoices : initialJournalChoices(latest.current, projectId));
    }).catch(() => {
      if (active) setError('Impossible de relire les choix du carnet. Rien n’a été remplacé. Réessaie sans effacer les données.');
    });
    return () => { active = false; };
  }, [key, loading, projectId, retry]);

  const save = useCallback((next: JournalChoices) => {
    setChoices(next);
    const current = ++revision.current;
    if (!validateJournalChoices(next)) {
      setSaving(false);
      setError('Corrige les dates ou le titre avant d’enregistrer ces choix. Le dernier carnet valide est conservé.');
      return;
    }
    setSaving(true);
    // Serialize writes so rapid typing cannot restore an older caption.
    chain.current = chain.current.catch(() => {}).then(() => AsyncStorage.setItem(key, JSON.stringify(next))).then(() => {
      if (alive.current && revision.current === current) { setError(''); setSaving(false); }
    }).catch(() => {
      if (alive.current && revision.current === current) {
        setSaving(false);
        setError('Ces derniers choix n’ont pas pu être enregistrés. Réessaie avant de quitter le carnet.');
      }
    });
  }, [key]);
  return { choices, save, error, saving, retry: () => {
    if (choices) save(choices); else setRetry(value => value + 1);
  } };
}
