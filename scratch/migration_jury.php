<?php
require 'config/db.php';

try {
    echo "Starting migration...\n";

    // 1. Add jury_valide to semestres
    $stmt = $pdo->query("SHOW COLUMNS FROM semestres LIKE 'jury_valide'");
    if ($stmt->fetch() === false) {
        $pdo->exec("ALTER TABLE semestres ADD COLUMN jury_valide TINYINT(1) NOT NULL DEFAULT 0");
        echo "Added 'jury_valide' column to 'semestres' table.\n";
    } else {
        echo "'jury_valide' column already exists in 'semestres' table.\n";
    }

    // 2. Create notes_jury table
    $pdo->exec("
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
    ");
    echo "Created or verified 'notes_jury' table.\n";

    // 3. Create jury_drafts table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `jury_drafts` (
            `etudiant_id` INT NOT NULL,
            `semestre_id` INT NOT NULL,
            `draft_notes` JSON DEFAULT NULL,
            `draft_points` JSON DEFAULT NULL,
            PRIMARY KEY (`etudiant_id`, `semestre_id`),
            CONSTRAINT `fk_jd_etudiant` FOREIGN KEY (`etudiant_id`) REFERENCES `etudiants`(`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_jd_semestre` FOREIGN KEY (`semestre_id`) REFERENCES `semestres`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "Created or verified 'jury_drafts' table.\n";

    echo "Migration completed successfully!\n";
} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
}
