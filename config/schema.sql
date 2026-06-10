-- Schéma de base de données pour Miage Note
-- Respecte les standards : Tables au pluriel, minuscules, id auto-incrément, ON DELETE CASCADE

-- Désactivation des contraintes pour le nettoyage si nécessaire
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Structure Pédagogique (Maquette)
CREATE TABLE IF NOT EXISTS `annees` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nom` VARCHAR(100) NOT NULL, -- Ex: "Master 1 MIAGE", "Licence 3"
    `cree_le` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `semestres` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `annee_id` INT NOT NULL,
    `nom` VARCHAR(50) NOT NULL, -- Ex: "Semestre 1", "S5"
    `jury_valide` TINYINT(1) NOT NULL DEFAULT 0,
    CONSTRAINT `fk_semestres_annee` FOREIGN KEY (`annee_id`) REFERENCES `annees`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bcc` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `semestre_id` INT NOT NULL,
    `nom` VARCHAR(255) NOT NULL,
    `bcc_annuel_lie_id` INT DEFAULT NULL, -- Pour regrouper BCC S1 et BCC S2
    CONSTRAINT `fk_bcc_semestre` FOREIGN KEY (`semestre_id`) REFERENCES `semestres`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_bcc_annuel` FOREIGN KEY (`bcc_annuel_lie_id`) REFERENCES `bcc`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ue` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `bcc_id` INT NOT NULL,
    `nom` VARCHAR(255) NOT NULL,
    `coefficient` DECIMAL(5,2) DEFAULT 1.0,
    CONSTRAINT `fk_ue_bcc` FOREIGN KEY (`bcc_id`) REFERENCES `bcc`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ecue` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ue_id` INT NOT NULL,
    `nom` VARCHAR(255) NOT NULL,
    `credits` INT DEFAULT 0, -- Utilisé pour calculer les coefficients/crédits (1 crédit = 10h)
    `heures` INT DEFAULT 0,
    CONSTRAINT `fk_ecue_ue` FOREIGN KEY (`ue_id`) REFERENCES `ue`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Étudiants
CREATE TABLE IF NOT EXISTS `etudiants` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nom` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) UNIQUE NOT NULL,
    `annee_inscription` INT NOT NULL, -- Ex: 2026
    `meta_data` JSON DEFAULT NULL, -- Stockage flexible (provenance, colonnes dynamiques)
    `cree_le` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `mis_a_jour_le` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Notes
CREATE TABLE IF NOT EXISTS `notes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `etudiant_id` INT NOT NULL,
    `ecue_id` INT NOT NULL,
    `valeur` DECIMAL(4,2) DEFAULT NULL, -- Note sur 20
    `statut` VARCHAR(10) DEFAULT NULL, -- ABI, ABJ, DEF
    `date_saisie` DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_notes_etudiant` FOREIGN KEY (`etudiant_id`) REFERENCES `etudiants`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_notes_ecue` FOREIGN KEY (`ecue_id`) REFERENCES `ecue`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_note_etudiant_ecue` (`etudiant_id`, `ecue_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3b. Bonus et Malus Semestriels
CREATE TABLE IF NOT EXISTS `notes_bonus_malus` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `etudiant_id` INT NOT NULL,
    `semestre_id` INT NOT NULL,
    `bonus` DECIMAL(4,2) DEFAULT NULL,
    `malus` DECIMAL(4,2) DEFAULT NULL,
    CONSTRAINT `fk_nbm_etudiant` FOREIGN KEY (`etudiant_id`) REFERENCES `etudiants`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_nbm_semestre` FOREIGN KEY (`semestre_id`) REFERENCES `semestres`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_nbm_etudiant_semestre` (`etudiant_id`, `semestre_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Paramétrage et Règles de Validation (Optionnel pour Phase 1)
CREATE TABLE IF NOT EXISTS `regles_validation` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `annee_id` INT NOT NULL,
    `seuil_validation_bcc` DECIMAL(4,2) DEFAULT 10.0,
    `nb_bcc_autorises_sous_seuil` INT DEFAULT 0, -- Ex: "au plus 1 BCC annuel à 9"
    `seuil_minimal_bcc` DECIMAL(4,2) DEFAULT 9.0,
    CONSTRAINT `fk_regles_annee` FOREIGN KEY (`annee_id`) REFERENCES `annees`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Jury et Points de Jury
CREATE TABLE IF NOT EXISTS `notes_jury` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `etudiant_id` INT NOT NULL,
    `semestre_id` INT NOT NULL,
    `element_type` ENUM('ecue', 'ue', 'bcc') NOT NULL,
    `element_id` INT NOT NULL,
    `points` DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT `fk_nj_etudiant` FOREIGN KEY (`etudiant_id`) REFERENCES `etudiants`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_nj_semestre` FOREIGN KEY (`semestre_id`) REFERENCES `semestres`(`id`) ON DELETE CASCADE,
    CONSTRAINT `chk_points` CHECK (`points` >= 0.00 AND `points` <= 0.50),
    UNIQUE KEY `unique_etudiant_semestre_element` (`etudiant_id`, `semestre_id`, `element_type`, `element_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `jury_drafts` (
    `etudiant_id` INT NOT NULL,
    `semestre_id` INT NOT NULL,
    `draft_notes` JSON DEFAULT NULL,
    `draft_points` JSON DEFAULT NULL,
    PRIMARY KEY (`etudiant_id`, `semestre_id`),
    CONSTRAINT `fk_jd_etudiant` FOREIGN KEY (`etudiant_id`) REFERENCES `etudiants`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_jd_semestre` FOREIGN KEY (`semestre_id`) REFERENCES `semestres`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indexation pour les performances
CREATE INDEX `idx_etudiant_email` ON `etudiants`(`email`);
CREATE INDEX `idx_ecue_ue` ON `ecue`(`ue_id`);
CREATE INDEX `idx_ue_bcc` ON `ue`(`bcc_id`);
CREATE INDEX `idx_bcc_semestre` ON `bcc`(`semestre_id`);
CREATE INDEX `idx_semestre_annee` ON `semestres`(`annee_id`);

SET FOREIGN_KEY_CHECKS = 1;
