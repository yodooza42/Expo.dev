import { JOURNAL_DIR, joinRel, monthStamp } from '@/utils/library/paths';
import { getLoadedRoot, readText, writeText } from '@/utils/library/saf';

/**
 * Human-readable monthly log in Yoann2.0/Journal (imports, moves, backups,
 * restores, errors). Lines are buffered and written in batches.
 */

const MAX_BYTES = 400_000;
let buffer: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();

const pad = (value: number) => String(value).padStart(2, '0');

function stamp(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function logEvent(kind: string, message: string): void {
  buffer.push(`${stamp(Date.now())} [${kind}] ${message.replace(/\s+/g, ' ').trim()}`);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void flushJournal(); }, 3000);
}

export function flushJournal(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  writing = writing.then(async () => {
    if (!buffer.length || !getLoadedRoot()) return;
    const lines = buffer;
    buffer = [];
    const rel = joinRel(JOURNAL_DIR, `${monthStamp(Date.now())}.txt`);
    try {
      const previous = (await readText(rel)) ?? '';
      let text = previous + lines.join('\n') + '\n';
      if (text.length > MAX_BYTES) text = text.slice(text.length - MAX_BYTES).replace(/^[^\n]*\n/, '');
      await writeText(rel, text, 'text/plain');
    } catch {
      // Keep the lines for the next attempt rather than losing them.
      buffer = [...lines, ...buffer].slice(-500);
    }
  }).catch(() => {});
  return writing;
}
