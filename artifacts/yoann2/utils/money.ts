/**
 * Formate un montant en euros avec séparateur de milliers (espace insécable).
 * Exemples :
 *   fmtEuro(1500000)  → "1 500 000,00 €"
 *   fmtEuro(-8230)    → "-8 230,00 €"
 *   fmtEuro(250)      → "250,00 €"
 */
export function fmtEuro(n: number): string {
  const sign  = n < 0 ? '-' : '';
  const parts = Math.abs(n).toFixed(2).split('.');
  const int   = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return `${sign}${int},${parts[1]}\u00A0€`;
}
