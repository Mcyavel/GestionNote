<?php
declare(strict_types=1);

/**
 * API Grades - Gestion des notes et calculs de moyennes
 */

require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];

/**
 * Récupère les notes d'un étudiant ou pour un ECUE spécifique
 */
if ($method === 'GET') {
    $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
    $ecueId = isset($_GET['ecue_id']) ? (int)$_GET['ecue_id'] : null;

    try {
        if ($ecueId) {
            // Liste des notes pour un ECUE (tous les étudiants)
            $stmt = $pdo->prepare("
                SELECT e.id as student_id, e.nom, e.email, n.valeur, n.id as note_id
                FROM etudiants e
                LEFT JOIN notes n ON e.id = n.etudiant_id AND n.ecue_id = ?
                ORDER BY e.nom ASC
            ");
            $stmt->execute([$ecueId]);
            $data = $stmt->fetchAll();
        } elseif ($studentId) {
            // Relevé complet pour un étudiant avec calculs
            // On récupère la hiérarchie et les notes associées
            $sql = "
                SELECT a.nom as annee_nom, s.nom as semestre_nom, b.id as bcc_id, b.nom as bcc_nom, 
                       u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff,
                       ec.id as ecue_id, ec.nom as ecue_nom, ec.credits as ecue_credits,
                       n.valeur as note
                FROM ecue ec
                JOIN ue u ON ec.ue_id = u.id
                JOIN bcc b ON u.bcc_id = b.id
                JOIN semestres s ON b.semestre_id = s.id
                JOIN annees a ON s.annee_id = a.id
                LEFT JOIN notes n ON ec.id = n.etudiant_id AND n.etudiant_id = ?
                ORDER BY s.id, b.id, u.id, ec.id
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$studentId]);
            $data = $stmt->fetchAll();
        } else {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Paramètres student_id ou ecue_id manquants"]);
            exit();
        }

        echo json_encode([
            "success" => true,
            "data" => $data
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
    }
    exit();
}

/**
 * Sauvegarde ou mise à jour de notes (Batch possible)
 */
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['notes']) || !is_array($input['notes'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Données de notes invalides"]);
        exit();
    }

    try {
        $pdo->beginTransaction();
        $count = 0;

        $stmt = $pdo->prepare("
            INSERT INTO notes (etudiant_id, ecue_id, valeur) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE valeur = VALUES(valeur)
        ");

        foreach ($input['notes'] as $note) {
            if (!isset($note['etudiant_id'], $note['ecue_id'], $note['valeur'])) continue;
            
            $valeur = (float)$note['valeur'];
            if ($valeur < 0 || $valeur > 20) continue;

            $stmt->execute([
                (int)$note['etudiant_id'],
                (int)$note['ecue_id'],
                $valeur
            ]);
            $count++;
        }

        $pdo->commit();
        echo json_encode([
            "success" => true, 
            "message" => "$count notes enregistrées avec succès"
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
    }
    exit();
}
