/** Human-readable unique household ID, e.g. W01-S03-H0045-F01 (used by server and offline client). */
export function householdCode({ wardNo, settlementCode, houseNo, familyNo }) {
  const clean = String(settlementCode).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'S';
  return `W${String(wardNo).padStart(2, '0')}-${clean}-H${String(houseNo).padStart(4, '0')}-F${String(familyNo).padStart(2, '0')}`;
}
