<?php
declare(strict_types=1);

/**
 * API Curriculum - Gestion de la maquette pédagogique
 * GET /api/curriculum : Récupère toute la structure
 * POST /api/curriculum/import : Importe une maquette via JSON
 */

require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];

// Pour les besoins de l'ordre, on traite d'abord la récupération (GET)
if ($method === 'GET') {
    try {
        // Récupération de toute la hiérarchie en une structure imbriquée
        // Note: Pour de très grosses structures, on pourrait optimiser, mais ici l'arborescence est limitée.
        
        $sql = "SELECT a.id as annee_id, a.nom as annee_nom,
                       s.id as semestre_id, s.nom as semestre_nom,
                       b.id as bcc_id, b.nom as bcc_nom, b.bcc_annuel_lie_id,
                       u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff,
                       e.id as ecue_id, e.nom as ecue_nom, e.credits as ecue_credits, e.heures as ecue_heures
                FROM annees a
                LEFT JOIN semestres s ON a.id = s.annee_id
                LEFT JOIN bcc b ON s.id = b.semestre_id
                LEFT JOIN ue u ON b.id = u.bcc_id
                LEFT JOIN ecue e ON u.id = e.ue_id
                ORDER BY a.id, s.id, b.id, u.id, e.id";
        
        $stmt = $pdo->query($sql);
        $rows = $stmt->fetchAll();
        
        $curriculum = [];
        
        foreach ($rows as $row) {
            $aId = $row['annee_id'];
            if (!$aId) continue;
            
            if (!isset($curriculum[$aId])) {
                $curriculum[$aId] = [
                    'id' => $aId,
                    'nom' => $row['annee_nom'],
                    'semestres' => []
                ];
            }
            
            $sId = $row['semestre_id'];
            if (!$sId) continue;
            
            if (!isset($curriculum[$aId]['semestres'][$sId])) {
                $curriculum[$aId]['semestres'][$sId] = [
                    'id' => $sId,
                    'nom' => $row['semestre_nom'],
                    'bcc' => []
                ];
            }
            
            $bId = $row['bcc_id'];
            if (!$bId) continue;
            
            if (!isset($curriculum[$aId]['semestres'][$sId]['bcc'][$bId])) {
                $curriculum[$aId]['semestres'][$sId]['bcc'][$bId] = [
                    'id' => $bId,
                    'nom' => $row['bcc_nom'],
                    'bcc_annuel_lie_id' => $row['bcc_annuel_lie_id'],
                    'ue' => []
                ];
            }
            
            $uId = $row['ue_id'];
            if (!$uId) continue;
            
            if (!isset($curriculum[$aId]['semestres'][$sId]['bcc'][$bId]['ue'][$uId])) {
                $curriculum[$aId]['semestres'][$sId]['bcc'][$bId]['ue'][$uId] = [
                    'id' => $uId,
                    'nom' => $row['ue_nom'],
                    'coefficient' => $row['ue_coeff'],
                    'ecue' => []
                ];
            }
            
            $eId = $row['ecue_id'];
            if (!$eId) continue;
            
            $curriculum[$aId]['semestres'][$sId]['bcc'][$bId]['ue'][$uId]['ecue'][] = [
                'id' => $eId,
                'nom' => $row['ecue_nom'],
                'credits' => $row['ecue_credits'],
                'heures' => $row['ecue_heures']
            ];
        }
        
        // Re-indexer pour enlever les clés associatives et avoir des tableaux propres pour le JSON
        $finalData = array_values(array_map(function($annee) {
            $annee['semestres'] = array_values(array_map(function($semestre) {
                $semestre['bcc'] = array_values(array_map(function($bcc) {
                    $bcc['ue'] = array_values($bcc['ue']);
                    return $bcc;
                }, $semestre['bcc']));
                return $semestre;
            }, $annee['semestres']));
            return $annee;
        }, $curriculum));

        echo json_encode([
            "success" => true,
            "data" => $finalData
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => "Erreur lors de la récupération de la maquette : " . $e->getMessage()
        ]);
    }
    exit();
}

if ($method === 'POST') {
    // Importation d'une maquette complète
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['maquette'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Données invalides"]);
        exit();
    }
    
    try {
        $pdo->beginTransaction();
        
        // Pour l'import, on peut choisir d'écraser ou d'ajouter. 
        // Ici, on va implémenter une logique simplifiée d'ajout/mise à jour.
        
        foreach ($input['maquette'] as $anneeData) {
            // Upsert Année
            $stmt = $pdo->prepare("INSERT INTO annees (nom) VALUES (?) ON DUPLICATE KEY UPDATE nom = VALUES(nom)");
            $stmt->execute([$anneeData['nom']]);
            $anneeId = (int)$pdo->lastInsertId();
            if ($anneeId === 0) { // Si mise à jour, on récupère l'id par le nom
                $s = $pdo->prepare("SELECT id FROM annees WHERE nom = ?");
                $s->execute([$anneeData['nom']]);
                $anneeId = (int)$s->fetchColumn();
            }
            
            foreach ($anneeData['semestres'] as $semestreData) {
                $stmt = $pdo->prepare("INSERT INTO semestres (annee_id, nom) VALUES (?, ?) ON DUPLICATE KEY UPDATE nom = VALUES(nom)");
                $stmt->execute([$anneeId, $semestreData['nom']]);
                $semestreId = (int)$pdo->lastInsertId();
                if ($semestreId === 0) {
                    $s = $pdo->prepare("SELECT id FROM semestres WHERE annee_id = ? AND nom = ?");
                    $s->execute([$anneeId, $semestreData['nom']]);
                    $semestreId = (int)$s->fetchColumn();
                }
                
                foreach ($semestreData['bcc'] as $bccData) {
                    $stmt = $pdo->prepare("INSERT INTO bcc (semestre_id, nom) VALUES (?, ?)");
                    $stmt->execute([$semestreId, $bccData['nom']]);
                    $bccId = (int)$pdo->lastInsertId();
                    
                    foreach ($bccData['ue'] as $ueData) {
                        $stmt = $pdo->prepare("INSERT INTO ue (bcc_id, nom, coefficient) VALUES (?, ?, ?)");
                        $stmt->execute([$bccId, $ueData['nom'], $ueData['coefficient'] ?? 1.0]);
                        $ueId = (int)$pdo->lastInsertId();
                        
                        foreach ($ueData['ecue'] as $ecueData) {
                            $stmt = $pdo->prepare("INSERT INTO ecue (ue_id, nom, credits, heures) VALUES (?, ?, ?, ?)");
                            $stmt->execute([$ueId, $ecueData['nom'], $ecueData['credits'] ?? 0, $ecueData['heures'] ?? 0]);
                        }
                    }
                }
            }
        }
        
        $pdo->commit();
        echo json_encode(["success" => true, "message" => "Maquette importée avec succès"]);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Erreur lors de l'importation : " . $e->getMessage()]);
    }
    exit();
}
