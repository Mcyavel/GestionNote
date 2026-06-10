export interface GradeRules {
  seuil_validation_bcc: number;
  nb_bcc_autorises_sous_seuil: number;
  seuil_minimal_annuel: number;
}

export interface BCCGrade {
  id: number;
  moyenne: number | null;
  twin_id?: number | null;
}

export type ValidationStatus = 'ADMIS' | 'AJOURNÉ' | 'INCOMPLET';

/**
 * Calcule le statut de validation annuel basé sur les moyennes des BCC jumeaux.
 */
export function calculateYearValidation(
  annualBccAverages: (number | null)[],
  rules: GradeRules
): ValidationStatus {
  let nbBccSousSeuil = 0;
  let allBccAboveMin = true;
  let hasIncomplete = false;

  if (annualBccAverages.length === 0) return 'INCOMPLET';

  for (const moy of annualBccAverages) {
    if (moy === null) {
      hasIncomplete = true;
      continue;
    }
    
    if (moy < rules.seuil_validation_bcc) {
      nbBccSousSeuil++;
      if (moy < rules.seuil_minimal_annuel) {
        allBccAboveMin = false;
      }
    }
  }

  if (hasIncomplete) return 'INCOMPLET';
  
  if (allBccAboveMin && nbBccSousSeuil <= rules.nb_bcc_autorises_sous_seuil) {
    return 'ADMIS';
  }
  
  return 'AJOURNÉ';
}

/**
 * Calcule la moyenne d'un BCC annuel à partir de ses jumeaux.
 */
export function calculateAnnualBccAverage(m1: number | null, m2: number | null): number | null {
  if (m1 !== null && m2 !== null) return Math.round(((m1 + m2) / 2) * 100) / 100;
  if (m1 !== null) return m1;
  if (m2 !== null) return m2;
  return null;
}
