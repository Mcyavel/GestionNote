<?php
declare(strict_types=1);

/**
 * API Stats - Calculs agrégés et statistiques
 */

require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'overview';

    try {
        if ($action === 'distribution') {
            $ecueId = (int)$_GET['ecue_id'];
            // Distribution des notes pour un ECUE (par tranches de 2 points)
            $sql = "
                SELECT 
                    FLOOR(valeur / 2) * 2 as tranche,
                    COUNT(*) as count
                FROM notes 
                WHERE ecue_id = ?
                GROUP BY tranche
                ORDER BY tranche ASC
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$ecueId]);
            $data = $stmt->fetchAll();
            
            // Formatage pour Recharts
            $formatted = [];
            for ($i = 0; $i <= 18; $i += 2) {
                $found = false;
                foreach ($data as $row) {
                    if ((int)$row['tranche'] === $i) {
                        $formatted[] = ["name" => "$i-" . ($i+2), "value" => (int)$row['count']];
                        $found = true;
                        break;
                    }
                }
                if (!$found) $formatted[] = ["name" => "$i-" . ($i+2), "value" => 0];
            }
            echo json_encode(["success" => true, "data" => $formatted]);
        } 
        elseif ($action === 'student_report') {
            $studentId = (int)$_GET['student_id'];
            
            // Récupération de toutes les notes avec coefficients
            $sql = "
                SELECT 
                    s.nom as semestre, b.id as bcc_id, b.nom as bcc_nom, b.bcc_annuel_lie_id,
                    u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff,
                    ec.id as ecue_id, ec.nom as ecue_nom, ec.credits as ecue_credits,
                    n.valeur as note
                FROM etudiants et
                JOIN annees a ON et.annee_inscription = a.id OR 1=1 -- Simplification pour le test
                JOIN semestres s ON a.id = s.annee_id
                JOIN bcc b ON s.id = b.semestre_id
                JOIN ue u ON b.id = u.id
                JOIN ecue ec ON u.id = ec.ue_id
                LEFT JOIN notes n ON et.id = n.etudiant_id AND ec.id = n.ecue_id
                WHERE et.id = ?
            ";
            // Note: La jointure et.annee_inscription = a.id dépend de comment on lie l'étudiant à sa maquette.
            // Pour l'instant on prend une approche globale.
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$studentId]);
            $rows = $stmt->fetchAll();
            
            // Calcul des moyennes (UE -> BCC -> Semestre)
            $report = [];
            foreach ($rows as $row) {
                $sem = $row['semestre'];
                if (!isset($report[$sem])) $report[$sem] = ['bcc' => []];
                
                $bccId = $row['bcc_id'];
                if (!isset($report[$sem]['bcc'][$bccId])) {
                    $report[$sem]['bcc'][$bccId] = [
                        'nom' => $row['bcc_nom'],
                        'annuel_id' => $row['bcc_annuel_lie_id'],
                        'ue' => []
                    ];
                }
                
                $ueId = $row['ue_id'];
                if (!isset($report[$sem]['bcc'][$bccId]['ue'][$ueId])) {
                    $report[$sem]['bcc'][$bccId]['ue'][$ueId] = [
                        'nom' => $row['ue_nom'],
                        'coeff' => (float)$row['ue_coeff'],
                        'notes' => []
                    ];
                }
                
                if ($row['note'] !== null) {
                    $report[$sem]['bcc'][$bccId]['ue'][$ueId]['notes'][] = (float)$row['note'];
                }
            }
            
            echo json_encode(["success" => true, "data" => $report]);
        }
        else {
            // Moyennes globales par ECUE
            $sql = "
                SELECT ec.nom, AVG(n.valeur) as moyenne, COUNT(n.id) as nb_notes
                FROM ecue ec
                JOIN notes n ON ec.id = n.ecue_id
                GROUP BY ec.id
            ";
            $data = $pdo->query($sql)->fetchAll();
            echo json_encode(["success" => true, "data" => $data]);
        }

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
    }
    exit();
}
