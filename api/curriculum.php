<?php
declare(strict_types=1);

/**
 * API Curriculum - Gestion de la maquette pédagogique
 */

global $pdo;

if (!function_exists('requirePermission')) {
    require_once __DIR__ . '/auth.php';
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' || $method === 'DELETE') {
    requirePermission('manage_curriculum');
}

if ($method === 'GET') {
    try {
        $sql = "SELECT a.id as annee_id, a.nom as annee_nom, a.is_maquette, a.maquette_id, a.archived,
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
                $stmtRules = $pdo->prepare("SELECT * FROM regles_validation WHERE annee_id = ?");
                $stmtRules->execute([$aId]);
                $rules = $stmtRules->fetch(PDO::FETCH_ASSOC) ?: [
                    'seuil_validation_bcc' => 10.0,
                    'nb_bcc_autorises_sous_seuil' => 1,
                    'seuil_minimal_annuel' => 9.0
                ];
                $curriculum[$aId] = [
                    'id' => $aId, 
                    'nom' => $row['annee_nom'], 
                    'is_maquette' => (int)$row['is_maquette'],
                    'maquette_id' => $row['maquette_id'] !== null ? (int)$row['maquette_id'] : null,
                    'archived' => (int)$row['archived'],
                    'rules' => $rules, 
                    'semestres' => []
                ];
            }
            $sId = $row['semestre_id'];
            if (!$sId) continue;
            if (!isset($curriculum[$aId]['semestres'][$sId])) {
                $curriculum[$aId]['semestres'][$sId] = ['id' => $sId, 'nom' => $row['semestre_nom'], 'bcc' => []];
            }
            $bId = $row['bcc_id'];
            if (!$bId) continue;
            if (!isset($curriculum[$aId]['semestres'][$sId]['bcc'][$bId])) {
                $curriculum[$aId]['semestres'][$sId]['bcc'][$bId] = ['id' => $bId, 'nom' => $row['bcc_nom'], 'bcc_annuel_lie_id' => $row['bcc_annuel_lie_id'], 'ue' => []];
            }
            $uId = $row['ue_id'];
            if (!$uId) continue;
            if (!isset($curriculum[$aId]['semestres'][$sId]['bcc'][$bId]['ue'][$uId])) {
                $curriculum[$aId]['semestres'][$sId]['bcc'][$bId]['ue'][$uId] = ['id' => $uId, 'nom' => $row['ue_nom'], 'coefficient' => $row['ue_coeff'], 'ecue' => []];
            }
            $eId = $row['ecue_id'];
            if (!$eId) continue;
            $curriculum[$aId]['semestres'][$sId]['bcc'][$bId]['ue'][$uId]['ecue'][] = ['id' => $eId, 'nom' => $row['ecue_nom'], 'credits' => $row['ecue_credits'], 'heures' => $row['ecue_heures']];
        }
        
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

        echo json_encode(["success" => true, "data" => $finalData]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
    }
    exit();
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) { exit(); }
    $action = $input['action'] ?? 'create';

    if ($action === 'duplicate' || $action === 'create_promotion') {
        $anneeId = (int)$input['annee_id'];
        $newNom = $input['nom'] ?? '';
        if (!$anneeId || !$newNom) {
            echo json_encode(["success" => false, "error" => "Paramètres manquants"]);
            exit();
        }

        try {
            $pdo->beginTransaction();

            // 1. Insérer l'année (Promotion ou Duplication)
            if ($action === 'create_promotion') {
                $stmtInsertAnnee = $pdo->prepare("INSERT INTO annees (nom, is_maquette, maquette_id) VALUES (?, 0, ?)");
                $stmtInsertAnnee->execute([$newNom, $anneeId]);
            } else {
                // Duplication simple (conserve le type maquette / promo)
                $stmtType = $pdo->prepare("SELECT is_maquette, maquette_id FROM annees WHERE id = ?");
                $stmtType->execute([$anneeId]);
                $typeRow = $stmtType->fetch();
                $isMaq = $typeRow ? (int)$typeRow['is_maquette'] : 1;
                $maqId = $typeRow && $typeRow['maquette_id'] !== null ? (int)$typeRow['maquette_id'] : null;

                $stmtInsertAnnee = $pdo->prepare("INSERT INTO annees (nom, is_maquette, maquette_id) VALUES (?, ?, ?)");
                $stmtInsertAnnee->execute([$newNom, $isMaq, $maqId]);
            }
            $newAnneeId = (int)$pdo->lastInsertId();

            // 2. Dupliquer les règles de validation
            $stmtRules = $pdo->prepare("SELECT * FROM regles_validation WHERE annee_id = ?");
            $stmtRules->execute([$anneeId]);
            $rules = $stmtRules->fetch(PDO::FETCH_ASSOC);
            if ($rules) {
                $cols = ['annee_id' => $newAnneeId];
                if (isset($rules['seuil_validation_bcc'])) $cols['seuil_validation_bcc'] = $rules['seuil_validation_bcc'];
                if (isset($rules['nb_bcc_autorises_sous_seuil'])) $cols['nb_bcc_autorises_sous_seuil'] = $rules['nb_bcc_autorises_sous_seuil'];
                if (isset($rules['seuil_minimal_bcc'])) $cols['seuil_minimal_bcc'] = $rules['seuil_minimal_bcc'];
                if (isset($rules['seuil_minimal_annuel'])) $cols['seuil_minimal_annuel'] = $rules['seuil_minimal_annuel'];

                $keys = array_keys($cols);
                $placeholders = array_fill(0, count($keys), '?');
                $sqlInsertRules = "INSERT INTO regles_validation (" . implode(', ', $keys) . ") VALUES (" . implode(', ', $placeholders) . ")";
                $pdo->prepare($sqlInsertRules)->execute(array_values($cols));
            }

            // 3. Dupliquer récursivement la maquette (Semestres, BCC, UE, ECUE)
            $bccMap = [];
            $bccTwinsToUpdate = [];

            $stmtSemestres = $pdo->prepare("SELECT * FROM semestres WHERE annee_id = ?");
            $stmtSemestres->execute([$anneeId]);
            $semestres = $stmtSemestres->fetchAll(PDO::FETCH_ASSOC);

            foreach ($semestres as $semestre) {
                $stmtInsertSem = $pdo->prepare("INSERT INTO semestres (annee_id, nom) VALUES (?, ?)");
                $stmtInsertSem->execute([$newAnneeId, $semestre['nom']]);
                $newSemId = (int)$pdo->lastInsertId();

                $stmtBccs = $pdo->prepare("SELECT * FROM bcc WHERE semestre_id = ?");
                $stmtBccs->execute([$semestre['id']]);
                $bccs = $stmtBccs->fetchAll(PDO::FETCH_ASSOC);

                foreach ($bccs as $bcc) {
                    $stmtInsertBcc = $pdo->prepare("INSERT INTO bcc (semestre_id, nom) VALUES (?, ?)");
                    $stmtInsertBcc->execute([$newSemId, $bcc['nom']]);
                    $newBccId = (int)$pdo->lastInsertId();

                    $bccMap[$bcc['id']] = $newBccId;
                    if ($bcc['bcc_annuel_lie_id']) {
                        $bccTwinsToUpdate[$newBccId] = (int)$bcc['bcc_annuel_lie_id'];
                    }

                    $stmtUes = $pdo->prepare("SELECT * FROM ue WHERE bcc_id = ?");
                    $stmtUes->execute([$bcc['id']]);
                    $ues = $stmtUes->fetchAll(PDO::FETCH_ASSOC);

                    foreach ($ues as $ue) {
                        $stmtInsertUe = $pdo->prepare("INSERT INTO ue (bcc_id, nom, coefficient) VALUES (?, ?, ?)");
                        $stmtInsertUe->execute([$newBccId, $ue['nom'], $ue['coefficient']]);
                        $newUeId = (int)$pdo->lastInsertId();

                        $stmtEcues = $pdo->prepare("SELECT * FROM ecue WHERE ue_id = ?");
                        $stmtEcues->execute([$ue['id']]);
                        $ecues = $stmtEcues->fetchAll(PDO::FETCH_ASSOC);

                        foreach ($ecues as $ecue) {
                            $stmtInsertEcue = $pdo->prepare("INSERT INTO ecue (ue_id, nom, credits, heures) VALUES (?, ?, ?, ?)");
                            $stmtInsertEcue->execute([$newUeId, $ecue['nom'], $ecue['credits'], $ecue['heures']]);
                        }
                    }
                }
            }

            // Ré-associer les BCC jumeaux
            foreach ($bccTwinsToUpdate as $newBccId => $oldTwinId) {
                if (isset($bccMap[$oldTwinId])) {
                    $newTwinId = $bccMap[$oldTwinId];
                    $stmtUpdateTwin = $pdo->prepare("UPDATE bcc SET bcc_annuel_lie_id = ? WHERE id = ?");
                    $stmtUpdateTwin->execute([$newTwinId, $newBccId]);
                }
            }

            $pdo->commit();
            echo json_encode(["success" => true, "id" => $newAnneeId]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(["success" => false, "error" => $e->getMessage()]);
        }
        exit();
    }

    if ($action === 'link_bcc') {
        $bccId = (int)$input['bcc_id'];
        $twinId = empty($input['twin_id']) ? null : (int)$input['twin_id'];
        try {
            $stmt = $pdo->prepare("UPDATE bcc SET bcc_annuel_lie_id = NULL WHERE bcc_annuel_lie_id = ? OR id = ?");
            $stmt->execute([$bccId, $bccId]);
            if ($twinId) {
                $pdo->prepare("UPDATE bcc SET bcc_annuel_lie_id = ? WHERE id = ?")->execute([$twinId, $bccId]);
                $pdo->prepare("UPDATE bcc SET bcc_annuel_lie_id = ? WHERE id = ?")->execute([$bccId, $twinId]);
            }
            echo json_encode(["success" => true]);
        } catch (Exception $e) { 
            error_log($e->getMessage()); 
            echo json_encode(["success" => false, "error" => "Erreur DB"]); 
        }
        exit();
    }

    if ($action === 'update_rules') {
        $anneeId = (int)$input['annee_id'];
        $valSeuil = (float)str_replace(',', '.', (string)$input['seuil_validation_bcc']);
        $nbAutorises = (int)$input['nb_bcc_autorises_sous_seuil'];
        $seuilMin = (float)str_replace(',', '.', (string)$input['seuil_minimal_annuel']);
        
        try {
            $check = $pdo->prepare("SELECT id FROM regles_validation WHERE annee_id = ?");
            $check->execute([$anneeId]);
            $exists = $check->fetch();

            if ($exists) {
                $sql = "UPDATE regles_validation SET seuil_validation_bcc = ?, nb_bcc_autorises_sous_seuil = ?, seuil_minimal_annuel = ?, seuil_minimal_bcc = ? WHERE annee_id = ?";
                $pdo->prepare($sql)->execute([$valSeuil, $nbAutorises, $seuilMin, $seuilMin, $anneeId]);
            } else {
                $sql = "INSERT INTO regles_validation (annee_id, seuil_validation_bcc, nb_bcc_autorises_sous_seuil, seuil_minimal_annuel, seuil_minimal_bcc) VALUES (?, ?, ?, ?, ?)";
                $pdo->prepare($sql)->execute([$anneeId, $valSeuil, $nbAutorises, $seuilMin, $seuilMin]);
            }
            echo json_encode(["success" => true]);
        } catch (Exception $e) { echo json_encode(["success" => false, "error" => $e->getMessage()]); }
        exit();
    }

    // --- ACTION UPDATE (Générique) ---
    if ($action === 'update') {
        $type = $input['type'] ?? '';
        $id = (int)($input['id'] ?? 0);
        $nom = $input['nom'] ?? '';
        
        try {
            switch ($type) {
                case 'annee': 
                    if (isset($input['archived'])) {
                        $pdo->prepare("UPDATE annees SET archived = ? WHERE id = ?")->execute([(int)$input['archived'], $id]);
                    } else {
                        $pdo->prepare("UPDATE annees SET nom = ? WHERE id = ?")->execute([$nom, $id]);
                    }
                    break;
                case 'semestre': $pdo->prepare("UPDATE semestres SET nom = ? WHERE id = ?")->execute([$nom, $id]); break;
                case 'bcc': $pdo->prepare("UPDATE bcc SET nom = ? WHERE id = ?")->execute([$nom, $id]); break;
                case 'ue': 
                    $coeff = (float)($input['coefficient'] ?? 1.0);
                    $pdo->prepare("UPDATE ue SET nom = ?, coefficient = ? WHERE id = ?")->execute([$nom, $coeff, $id]); 
                    break;
                case 'ecue': 
                    $credits = (int)($input['credits'] ?? 0);
                    $pdo->prepare("UPDATE ecue SET nom = ?, credits = ? WHERE id = ?")->execute([$nom, $credits, $id]); 
                    break;
            }
            echo json_encode(["success" => true]);
        } catch (Exception $e) { echo json_encode(["success" => false, "error" => $e->getMessage()]); }
        exit();
    }

    $type = $input['type'] ?? '';
    try {
        switch ($type) {
            case 'annee': 
                // Par défaut, créer une Maquette (is_maquette = 1)
                $pdo->prepare("INSERT INTO annees (nom, is_maquette) VALUES (?, 1)")->execute([$input['nom']]); 
                break;
            case 'semestre': $pdo->prepare("INSERT INTO semestres (annee_id, nom) VALUES (?, ?)")->execute([$input['annee_id'], $input['nom']]); break;
            case 'bcc': $pdo->prepare("INSERT INTO bcc (semestre_id, nom) VALUES (?, ?)")->execute([$input['semestre_id'], $input['nom']]); break;
            case 'ue': $pdo->prepare("INSERT INTO ue (bcc_id, nom, coefficient) VALUES (?, ?, ?)")->execute([$input['bcc_id'], $input['nom'], $input['coefficient'] ?? 1.0]); break;
            case 'ecue': $pdo->prepare("INSERT INTO ecue (ue_id, nom, credits, heures) VALUES (?, ?, ?, ?)")->execute([$input['ue_id'], $input['nom'], $input['credits'] ?? 0, $input['heures'] ?? 0]); break;
        }
        echo json_encode(["success" => true, "id" => $pdo->lastInsertId()]);
    } catch (Exception $e) { echo json_encode(["success" => false, "error" => $e->getMessage()]); }
    exit();
}

if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $type = $input['type'] ?? '';
    $id = (int)($input['id'] ?? 0);
    try {
        $allowedTables = ['annee' => 'annees', 'semestre' => 'semestres', 'bcc' => 'bcc', 'ue' => 'ue', 'ecue' => 'ecue'];
        $table = $allowedTables[$type] ?? null;
        if ($table && $id) { 
            $pdo->prepare("DELETE FROM {$table} WHERE id = ?")->execute([$id]); 
            echo json_encode(["success" => true]); 
        } else {
            echo json_encode(["success" => false, "error" => "Type invalide"]);
        }
    } catch (Exception $e) { 
        error_log($e->getMessage()); 
        echo json_encode(["success" => false, "error" => "Erreur DB"]); 
    }
    exit();
}
