import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image as RNImage } from 'react-native';

import type { Project, Task } from '@/types';
import { fmtDateLong } from '@/utils/date';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

/** Extract timestamp embedded in photo filename: photo_1234567890_abc.jpg */
function photoTs(uri: string): number | null {
  const m = uri.match(/photo_(\d+)_/);
  return m ? parseInt(m[1]!, 10) : null;
}

// ── Image dimensions ──────────────────────────────────────────────────────────

function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 9999, height: 9999 }), // assume large on error → resize
    );
  });
}

// ── Image → base64 data URI (resize + compress for PDF) ──────────────────────
//
// Strategy:
//   1. Read original dimensions — if max dim ≤ 1080 px, skip resize (no upscaling).
//   2. Always compress to JPEG 75 % to cut file size regardless of original format.
//   3. Return data:image/jpeg;base64,... — never touches the original stored file.

const MAX_DIM = 1080;
const JPEG_QUALITY = 0.75;

async function toDataUri(uri: string): Promise<string> {
  try {
    const { width, height } = await getImageDimensions(uri);
    const maxDim = Math.max(width, height);

    const actions: ImageManipulator.Action[] = [];
    if (maxDim > MAX_DIM) {
      const scale = MAX_DIM / maxDim;
      actions.push({
        resize: {
          width:  Math.round(width  * scale),
          height: Math.round(height * scale),
        },
      });
    }

    const result = await ImageManipulator.manipulateAsync(
      uri,
      actions,
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );

    const b64 = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return '';
  }
}

// ── Status metadata ───────────────────────────────────────────────────────────

const STATUS_META: Record<string, [string, string]> = {
  inprogress: ['En cours',   '#FF9800'],
  todo:       ['À faire',    '#2196F3'],
  idea:       ['Idée',       '#607D8B'],
  waiting:    ['En attente', '#9E9E9E'],
  done:       ['Terminée ✓', '#4CAF50'],
};

const STATUS_ORDER: Record<string, number> = {
  inprogress: 0, todo: 1, idea: 2, waiting: 3, done: 4,
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateProjectReportHtml(
  project: Project,
  tasks: Task[],
  summary: string,
): Promise<string> {
  const sorted = [...tasks].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );

  const start     = new Date(project.startDate);
  const due       = new Date(project.dueDate);
  const durDays   = !isNaN(start.getTime()) && !isNaN(due.getTime())
    ? Math.ceil((due.getTime() - start.getTime()) / 86_400_000)
    : null;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  // ── Task sections (async: resize + compress each photo) ───────────────────

  const taskSections: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const task = sorted[i]!;
    const [statusLabel, statusColor] = STATUS_META[task.status] ?? ['?', '#999'];

    const photoParts: string[] = [];
    for (const uri of task.photos) {
      const dataUri = await toDataUri(uri);
      if (!dataUri) continue;
      const ts      = photoTs(uri);
      const dateStr = ts ? fmtDateLong(ts) : '';
      photoParts.push(`
        <div class="photo-wrap">
          <img src="${dataUri}" class="photo-img" />
          ${dateStr ? `<div class="photo-date">${dateStr}</div>` : ''}
        </div>`);
    }

    taskSections.push(`
      <div class="task-card">
        <div class="task-header">
          <span class="task-num">Tâche ${i + 1}</span>
          <span class="badge" style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}80">${statusLabel}</span>
        </div>
        <h3 class="task-title">${esc(task.title)}</h3>
        ${task.description ? `<p class="task-desc">${esc(task.description)}</p>` : ''}
        ${task.notes      ? `<p class="task-notes">📝 ${esc(task.notes)}</p>`      : ''}
        ${task.completedAt ? `<p class="task-done">✅ Terminée le ${esc(task.completedAt)}</p>` : ''}
        ${photoParts.length ? `<div class="photo-grid">${photoParts.join('')}</div>` : ''}
      </div>`);
  }

  const summaryBlock = summary.trim() ? `
    <div class="summary-card">
      <h2 class="summary-title">📋 Résumé &amp; Observations</h2>
      <p class="summary-body">${esc(summary)}</p>
    </div>` : '';

  const generatedOn = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── HTML ──────────────────────────────────────────────────────────────────

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<title>${esc(project.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#121212;color:#e0e0e0}

.cover{
  background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);
  padding:56px 36px 48px;text-align:center;
  border-bottom:3px solid #FFC107;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.cover-eyebrow{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#FFC107;margin-bottom:14px}
.cover-title{font-size:34px;font-weight:800;color:#fff;margin-bottom:10px;line-height:1.2}
.cover-dates{font-size:13px;color:#9e9e9e;margin-bottom:32px}
.stats{display:flex;gap:28px;justify-content:center;flex-wrap:wrap}
.stat{display:flex;flex-direction:column;align-items:center;gap:4px}
.stat-val{font-size:26px;font-weight:700;color:#FFC107}
.stat-lbl{font-size:10px;color:#757575;text-transform:uppercase;letter-spacing:1px}

.content{padding:0 28px 48px}

.task-card{
  background:#1e1e2e;border-radius:14px;padding:24px;margin:24px 0;
  border-left:4px solid #FFC107;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
  page-break-inside:avoid;
}
.task-header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.task-num{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#FFC107}
.badge{font-size:10px;font-weight:600;padding:3px 9px;border-radius:20px}
.task-title{font-size:20px;font-weight:700;color:#fff;margin-bottom:10px}
.task-desc{font-size:14px;color:#bdbdbd;line-height:1.6;margin-bottom:8px}
.task-notes{font-size:13px;color:#9e9e9e;font-style:italic;margin-bottom:8px}
.task-done{font-size:12px;color:#4CAF50;margin-bottom:12px}

.photo-grid{display:flex;flex-wrap:wrap;gap:14px;margin-top:16px}
.photo-wrap{display:flex;flex-direction:column;align-items:center;gap:6px}
.photo-img{width:255px;height:190px;object-fit:cover;border-radius:10px;border:1px solid #333}
.photo-date{font-size:10px;color:#616161;text-align:center;max-width:255px}

.summary-card{
  background:#1a2a3a;border-radius:14px;padding:28px;margin:32px 0;
  border:1px solid #FFC10740;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
  page-break-inside:avoid;
}
.summary-title{font-size:17px;font-weight:700;color:#FFC107;margin-bottom:14px}
.summary-body{font-size:15px;color:#e0e0e0;line-height:1.75;white-space:pre-wrap}

.footer{text-align:center;padding:20px;color:#424242;font-size:11px;border-top:1px solid #2a2a2a}
</style>
</head>
<body>

<div class="cover">
  <div class="cover-eyebrow">Rapport de projet</div>
  <h1 class="cover-title">${esc(project.name)}</h1>
  <div class="cover-dates">
    ${project.startDate ? fmtDateLong(project.startDate) : ''} ${project.startDate && project.dueDate ? '→' : ''} ${project.dueDate ? fmtDateLong(project.dueDate) : ''}
  </div>
  <div class="stats">
    ${durDays != null ? `<div class="stat"><div class="stat-val">${durDays}</div><div class="stat-lbl">Jours</div></div>` : ''}
    ${project.budget > 0 ? `<div class="stat"><div class="stat-val">${project.budget.toLocaleString('fr-FR')} €</div><div class="stat-lbl">Budget</div></div>` : ''}
    <div class="stat"><div class="stat-val">${tasks.length}</div><div class="stat-lbl">Tâches</div></div>
    <div class="stat"><div class="stat-val">${doneCount}</div><div class="stat-lbl">Terminées</div></div>
  </div>
</div>

<div class="content">
  ${taskSections.join('')}
  ${summaryBlock}
</div>

<div class="footer">Yoann 2.0 &nbsp;·&nbsp; ${generatedOn}</div>
</body>
</html>`;
}
