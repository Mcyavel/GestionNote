import { describe, it, expect } from 'vitest';
import { calculateYearValidation, calculateAnnualBccAverage } from './academic';
import type { GradeRules } from './academic';

describe('Academic Logic Utilities', () => {
  
  describe('calculateAnnualBccAverage', () => {
    it('should return the average of two numbers', () => {
      expect(calculateAnnualBccAverage(10, 12)).toBe(11);
      expect(calculateAnnualBccAverage(9.5, 10.5)).toBe(10);
    });

    it('should return the single value if one is null', () => {
      expect(calculateAnnualBccAverage(10, null)).toBe(10);
      expect(calculateAnnualBccAverage(null, 15)).toBe(15);
    });

    it('should return null if both are null', () => {
      expect(calculateAnnualBccAverage(null, null)).toBe(null);
    });
  });

  describe('calculateYearValidation', () => {
    const defaultRules: GradeRules = {
      seuil_validation_bcc: 10,
      nb_bcc_autorises_sous_seuil: 1,
      seuil_minimal_annuel: 9
    };

    it('should validate if all BCC are >= 10', () => {
      expect(calculateYearValidation([10, 12, 15], defaultRules)).toBe('ADMIS');
    });

    it('should validate if 1 BCC is between 9 and 10', () => {
      expect(calculateYearValidation([10, 9.5, 15], defaultRules)).toBe('ADMIS');
    });

    it('should fail if 2 BCC are between 9 and 10', () => {
      expect(calculateYearValidation([10, 9.5, 9.2], defaultRules)).toBe('AJOURNÉ');
    });

    it('should fail if any BCC is < 9', () => {
      expect(calculateYearValidation([10, 8.9, 15], defaultRules)).toBe('AJOURNÉ');
    });

    it('should be incomplete if any BCC is missing', () => {
      expect(calculateYearValidation([10, null, 15], defaultRules)).toBe('INCOMPLET');
    });
  });
});
