<?php
require 'config/db.php';

echo "=== FINDING TEST YEARS ===\n";
$stmt = $pdo->query("SELECT id, nom FROM annees WHERE nom LIKE '%Jury%' OR nom LIKE '%Test%'");
$testYears = $stmt->fetchAll(PDO::FETCH_ASSOC);
print_r($testYears);

if (!empty($testYears)) {
    echo "=== DELETING TEST YEARS ===\n";
    foreach ($testYears as $y) {
        $id = (int)$y['id'];
        $nom = $y['nom'];
        echo "Deleting Year ID: $id ($nom)... ";
        // Delete rules
        $pdo->exec("DELETE FROM regles_validation WHERE annee_id = $id");
        // Delete students (will cascade notes and drafts)
        $pdo->exec("DELETE FROM etudiants WHERE annee_id = $id");
        // Delete semestres (will cascade bcc, ue, ecue, and drafts/points)
        $pdo->exec("DELETE FROM semestres WHERE annee_id = $id");
        // Delete year itself
        $pdo->exec("DELETE FROM annees WHERE id = $id");
        echo "Done.\n";
    }
} else {
    echo "No test years found.\n";
}
