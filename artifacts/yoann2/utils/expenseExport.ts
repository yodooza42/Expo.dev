import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { BankTransaction } from '@/utils/bankStorage';
import type { Project } from '@/types';

function escapeCsv(val: string | number): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function exportExpensesCSV(
  expenses: BankTransaction[],
  projects: Project[],
  label: string
): Promise<void> {
  const header = 'Date,Projet,Libellé,Catégorie,Montant (€),Note';
  const rows = expenses.map(e => {
    const proj = projects.find(p => p.id === e.projectId);
    return [
      escapeCsv(new Date(e.date).toLocaleDateString('fr-FR')),
      escapeCsv(proj?.name ?? ''),
      escapeCsv(e.label),
      escapeCsv(e.category),
      escapeCsv(e.amount.toFixed(2)),
      escapeCsv(e.userNote ?? ''),
    ].join(',');
  });
  const csv = [header, ...rows].join('\n');

  const csvUri = (FileSystem.documentDirectory ?? '') + `depenses_${Date.now()}.csv`;
  await FileSystem.writeAsStringAsync(csvUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(csvUri, {
      mimeType: 'text/csv',
      dialogTitle: `Export dépenses — ${label}`,
      UTI: 'public.comma-separated-values-text',
    });
  }
}

function buildExpensePdfHtml(
  expenses: BankTransaction[],
  projects: Project[],
  label: string
): string {
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  const catRows = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([cat, amt]) =>
        `<tr><td>${cat}</td><td style="text-align:right;font-weight:bold">${amt.toFixed(2)} €</td></tr>`
    )
    .join('');

  const expRows = expenses
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(e => {
      const proj = projects.find(p => p.id === e.projectId);
      return `<tr>
        <td>${new Date(e.date).toLocaleDateString('fr-FR')}</td>
        <td>${proj?.name ?? '—'}</td>
        <td>${e.label}</td>
        <td>${e.category}</td>
        <td style="text-align:right;font-weight:bold">${e.amount.toFixed(2)} €</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a1a; }
  h1 { color: #FFC107; font-size: 22px; margin-bottom: 4px; }
  .sub { color: #777; font-size: 13px; margin-bottom: 20px; }
  .total { font-size: 20px; font-weight: bold; color: #FFC107; margin-bottom: 24px; }
  h2 { font-size: 15px; color: #333; border-bottom: 2px solid #FFC107; padding-bottom: 4px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #FFC107; color: #000; padding: 6px 8px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .footer { margin-top: 32px; font-size: 11px; color: #999; text-align: center; }
</style></head><body>
  <h1>Rapport dépenses — ${label}</h1>
  <div class="sub">Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
  <div class="total">Total : ${total.toFixed(2)} €</div>

  <h2>Par catégorie</h2>
  <table><thead><tr><th>Catégorie</th><th>Montant</th></tr></thead>
  <tbody>${catRows}</tbody></table>

  <h2>Détail des dépenses (${expenses.length})</h2>
  <table><thead><tr><th>Date</th><th>Projet</th><th>Libellé</th><th>Catégorie</th><th>Montant</th></tr></thead>
  <tbody>${expRows}</tbody></table>

  <div class="footer">Yoann2.0 — Rapport dépenses</div>
</body></html>`;
}

export async function exportExpensesPDF(
  expenses: BankTransaction[],
  projects: Project[],
  label: string
): Promise<void> {
  const html = buildExpensePdfHtml(expenses, projects, label);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Export dépenses — ${label}`,
    });
  }
}
