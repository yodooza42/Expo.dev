export type JournalChoices = {
  title: string;
  from: string;
  to: string;
  projectIds: string[];
  excludedEntryIds: string[];
  excludedPhotoIds: string[];
  captions: Record<string, string>;
  photoCaptions: Record<string, string>;
  pace: 'calm' | 'normal' | 'quick';
  /** Story-only task IDs, scoped to their completion day. Optional for older drafts. */
  taskOrderByDate?: Record<string, string[]>;
};

export type JournalPhoto = { id: string; uri: string; caption: string };
export type JournalEntry = {
  id: string;
  sourceId: string;
  kind: 'task' | 'project';
  title: string;
  project: string;
  dateLabel: string;
  dateKey: string;
  caption: string;
  photos: JournalPhoto[];
  /** A project recap follows its closing task, never a project-sorted chapter. */
  afterTaskId?: string;
  recapTasks?: Array<{ id: string; title: string; dateLabel: string }>;
};

/** All media are temporary story copies. Never modify the source tasks/photos. */
export type JournalVideoPayload = {
  jobId: string;
  journal: true;
  preview?: boolean;
  title: string;
  periodLabel: string;
  projectNames: string[];
  entryCount: number;
  photoCount: number;
  secondsPerPhoto: number;
  entries: Array<Omit<JournalEntry, 'photos'> & {
    photos: Array<{ id: string; img: string; caption: string }>;
  }>;
};

export type JournalGenerationRequest = Omit<JournalVideoPayload, 'jobId' | 'preview' | 'entries'> & {
  entries: JournalEntry[];
};
