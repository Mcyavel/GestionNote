<?php
declare(strict_types=1);

/**
 * API Jury - Gestion des délibérations, saisie des points de jury, brouillons et validation
 */

if (!function_exists('requirePermission')) {
    require_once __DIR__ . '/auth.php';
}
global $pdo;

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    $semestreId = isset($_GET['semestre_id']) ? (int)$_GET['semestre_id'] : null;

    if (!$semestreId) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Semestre non spécifié"]);
        exit();
    }

    try {
        if ($action === 'get_session') {
            // 1. Get semester and year info
            $stmtSem = $pdo->prepare("SELECT id, annee_id, nom, jury_valide FROM semestres WHERE id = ?");
            $stmtSem->execute([$semestreId]);
            $semestre = $stmtSem->fetch();

            if (!$semestre) {
                http_response_code(404);
                echo json_encode(["success" => false, "error" => "Semestre introuvable"]);
                exit();
            }

            $anneeId = (int)$semestre['annee_id'];

            // 2. Get Rules
            $stmtRules = $pdo->prepare("SELECT * FROM regles_validation WHERE annee_id = ?");
            $stmtRules->execute([$anneeId]);
            $rules = $stmtRules->fetch() ?: [
                'seuil_validation_bcc' => 10.0,
                'nb_bcc_autorises_sous_seuil' => 1,
                'seuil_minimal_bcc' => 9.50,
                'seuil_minimal_annuel' => 9.50
            ];

            // 3. Get pedagogical structure of the semester
            $sqlStructure = "
                SELECT s.id as semestre_id, b.id as bcc_id, b.nom as bcc_nom, b.bcc_annuel_lie_id,
                       u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff,
                       ec.id as ecue_id, ec.nom as ecue_nom
                FROM semestres s
                JOIN bcc b ON s.id = b.semestre_id
                JOIN ue u ON b.id = u.bcc_id
                JOIN ecue ec ON u.id = ec.ue_id
                WHERE s.id = ?
                ORDER BY b.id, u.id, ec.id
            ";
            $stmt = $pdo->prepare($sqlStructure);
            $stmt->execute([$semestreId]);
            $rows = $stmt->fetchAll();

            $structure = ['bcc' => []];
            $ecueIds = [];
            foreach ($rows as $row) {
                $ecueIds[] = (int)$row['ecue_id'];
                if (!isset($structure['bcc'][$row['bcc_id']])) {
                    $structure['bcc'][$row['bcc_id']] = [
                        'id' => $row['bcc_id'],
                        'nom' => $row['bcc_nom'],
                        'semestre_id' => (int)$row['semestre_id'],
                        'twin_id' => $row['bcc_annuel_lie_id'] ? (int)$row['bcc_annuel_lie_id'] : null,
                        'ue' => []
                    ];
                }
                if (!isset($structure['bcc'][$row['bcc_id']]['ue'][$row['ue_id']])) {
                    $structure['bcc'][$row['bcc_id']]['ue'][$row['ue_id']] = [
                        'id' => $row['ue_id'],
                        'nom' => $row['ue_nom'],
                        'coeff' => (float)$row['ue_coeff'],
                        'ecue' => []
                    ];
                }
                $structure['bcc'][$row['bcc_id']]['ue'][$row['ue_id']]['ecue'][] = [
                    'id' => $row['ecue_id'],
                    'nom' => $row['ecue_nom']
                ];
            }
            foreach ($structure['bcc'] as &$b) {
                $b['ue'] = array_values($b['ue']);
            }
            $structure['bcc'] = array_values($structure['bcc']);

            // 4. Get students of that year
            $sqlStudents = "SELECT id, nom, prenom, meta_data FROM etudiants WHERE annee_id = ? ORDER BY nom ASC, prenom ASC";
            $stmtStudents = $pdo->prepare($sqlStudents);
            $stmtStudents->execute([$anneeId]);
            $allStudents = $stmtStudents->fetchAll();

            // 5. Get current notes of this semester's ECUEs
            $notesMap = [];
            if (!empty($ecueIds)) {
                $placeholders = implode(',', array_fill(0, count($ecueIds), '?'));
                $sqlNotes = "SELECT etudiant_id, ecue_id, valeur, statut FROM notes WHERE ecue_id IN ($placeholders)";
                $stmtNotes = $pdo->prepare($sqlNotes);
                $stmtNotes->execute($ecueIds);
                foreach ($stmtNotes->fetchAll() as $n) {
                    $notesMap[$n['etudiant_id']][$n['ecue_id']] = [
                        'valeur' => $n['valeur'] !== null ? (float)$n['valeur'] : null,
                        'statut' => $n['statut']
                    ];
                }
            }

            // 6. Get validated jury points for this semester
            $juryPointsMap = [];
            $stmtJury = $pdo->prepare("SELECT etudiant_id, element_type, element_id, points FROM notes_jury WHERE semestre_id = ?");
            $stmtJury->execute([$semestreId]);
            foreach ($stmtJury->fetchAll() as $j) {
                $juryPointsMap[$j['etudiant_id']][$j['element_type']][$j['element_id']] = (float)$j['points'];
            }

            // 7. Get drafts for this semester
            $draftsMap = [];
            $stmtDrafts = $pdo->prepare("SELECT etudiant_id, draft_notes, draft_points FROM jury_drafts WHERE semestre_id = ?");
            $stmtDrafts->execute([$semestreId]);
            foreach ($stmtDrafts->fetchAll() as $d) {
                $draftsMap[$d['etudiant_id']] = [
                    'draft_notes' => json_decode($d['draft_notes'] ?? '{}', true),
                    'draft_points' => json_decode($d['draft_points'] ?? '{}', true)
                ];
            }

            // Assemble student data
            $studentsData = [];
            foreach ($allStudents as $s) {
                $meta = json_decode($s['meta_data'] ?? '{}', true);
                $studentLoc = $meta['Provenance'] ?? $meta['provenance'] ?? $meta['Lieu'] ?? $meta['lieu'] ?? '';

                $etudiantId = (int)$s['id'];
                $studentsData[] = [
                    'id' => $etudiantId,
                    'nom' => $s['nom'],
                    'prenom' => $s['prenom'],
                    'provenance' => $studentLoc,
                    'notes' => $notesMap[$etudiantId] ?? (object)[],
                    'jury_points' => $juryPointsMap[$etudiantId] ?? (object)[],
                    'draft_notes' => $draftsMap[$etudiantId]['draft_notes'] ?? null,
                    'draft_points' => $draftsMap[$etudiantId]['draft_points'] ?? null
                ];
            }

            echo json_encode([
                "success" => true,
                "data" => [
                    "semestre" => [
                        "id" => (int)$semestre['id'],
                        "nom" => $semestre['nom'],
                        "annee_id" => (int)$semestre['annee_id'],
                        "jury_valide" => (int)$semestre['jury_valide']
                    ],
                    "rules" => $rules,
                    "structure" => $structure,
                    "students" => $studentsData
                ]
            ]);
        } else {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Action inconnue"]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
    }
    exit();
}

if ($method === 'POST') {
    $input = isset($GLOBALS['JURY_TEST_INPUT']) ? $GLOBALS['JURY_TEST_INPUT'] : json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['action']) || !isset($input['semestre_id'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Données manquantes ou invalides"]);
        exit();
    }

    $action = $input['action'];
    $semestreId = (int)$input['semestre_id'];

    try {
        // Fetch semester state
        $stmtSem = $pdo->prepare("SELECT jury_valide, annee_id FROM semestres WHERE id = ?");
        $stmtSem->execute([$semestreId]);
        $semestre = $stmtSem->fetch();

        if (!$semestre) {
            http_response_code(404);
            echo json_encode(["success" => false, "error" => "Semestre introuvable"]);
            exit();
        }

        $juryValide = (int)$semestre['jury_valide'];

        if ($action === 'save_draft') {
            if ($juryValide === 1) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Le jury est déjà validé, impossible de sauvegarder le brouillon."]);
                exit();
            }

            $drafts = $input['drafts'] ?? [];
            
            $pdo->beginTransaction();
            foreach ($drafts as $draft) {
                $etudiantId = (int)$draft['etudiant_id'];
                $draftNotes = $draft['draft_notes'] ?? [];
                $draftPoints = $draft['draft_points'] ?? [];

                // Validate points (0.0 to 0.5, non-negative)
                foreach ($draftPoints as $key => $pts) {
                    if ($pts !== null && $pts !== '') {
                        $fPts = (float)$pts;
                        if ($fPts < 0.0 || $fPts > 0.5) {
                            $pdo->rollBack();
                            http_response_code(400);
                            echo json_encode(["success" => false, "error" => "Les points de jury doivent être compris entre 0.0 et 0.5."]);
                            exit();
                        }
                    }
                }

                // Insert/Update jury_drafts
                $stmt = $pdo->prepare("
                    INSERT INTO jury_drafts (etudiant_id, semestre_id, draft_notes, draft_points)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE draft_notes = VALUES(draft_notes), draft_points = VALUES(draft_points)
                ");
                $stmt->execute([
                    $etudiantId,
                    $semestreId,
                    json_encode($draftNotes),
                    json_encode($draftPoints)
                ]);
            }
            $pdo->commit();
            echo json_encode(["success" => true, "message" => "Brouillon enregistré avec succès."]);
            exit();
        }

        if ($action === 'validate_jury') {
            if ($juryValide === 1) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Le jury est déjà validé."]);
                exit();
            }

            // Save first (if drafts are provided)
            $drafts = $input['drafts'] ?? [];
            if (!empty($drafts)) {
                $pdo->beginTransaction();
                foreach ($drafts as $draft) {
                    $etudiantId = (int)$draft['etudiant_id'];
                    $draftNotes = $draft['draft_notes'] ?? [];
                    $draftPoints = $draft['draft_points'] ?? [];

                    foreach ($draftPoints as $key => $pts) {
                        if ($pts !== null && $pts !== '') {
                            $fPts = (float)$pts;
                            if ($fPts < 0.0 || $fPts > 0.5) {
                                $pdo->rollBack();
                                http_response_code(400);
                                echo json_encode(["success" => false, "error" => "Les points de jury doivent être compris entre 0.0 et 0.5."]);
                                exit();
                            }
                        }
                    }

                    $stmt = $pdo->prepare("
                        INSERT INTO jury_drafts (etudiant_id, semestre_id, draft_notes, draft_points)
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE draft_notes = VALUES(draft_notes), draft_points = VALUES(draft_points)
                    ");
                    $stmt->execute([
                        $etudiantId,
                        $semestreId,
                        json_encode($draftNotes),
                        json_encode($draftPoints)
                    ]);
                }
                $pdo->commit();
            }

            // Now perform full validation: write drafts to main tables
            $pdo->beginTransaction();

            // Load drafts
            $stmtGetDrafts = $pdo->prepare("SELECT etudiant_id, draft_notes, draft_points FROM jury_drafts WHERE semestre_id = ?");
            $stmtGetDrafts->execute([$semestreId]);
            $allDrafts = $stmtGetDrafts->fetchAll();

            foreach ($allDrafts as $d) {
                $etudiantId = (int)$d['etudiant_id'];
                $draftNotes = json_decode($d['draft_notes'] ?? '{}', true);
                $draftPoints = json_decode($d['draft_points'] ?? '{}', true);

                // Write notes to main notes table
                foreach ($draftNotes as $ecueId => $val) {
                    $ecueId = (int)$ecueId;
                    if ($val === null || $val === '') {
                        // Delete note if cleared
                        $stmtDel = $pdo->prepare("DELETE FROM notes WHERE etudiant_id = ? AND ecue_id = ?");
                        $stmtDel->execute([$etudiantId, $ecueId]);
                    } elseif (in_array($val, ['ABI', 'ABJ', 'DEF'])) {
                        // Statut note
                        $stmtNote = $pdo->prepare("
                            INSERT INTO notes (etudiant_id, ecue_id, valeur, statut)
                            VALUES (?, ?, NULL, ?)
                            ON DUPLICATE KEY UPDATE valeur = NULL, statut = VALUES(statut)
                        ");
                        $stmtNote->execute([$etudiantId, $ecueId, $val]);
                    } else {
                        // Numeric note
                        $valNote = (float)$val;
                        $stmtNote = $pdo->prepare("
                            INSERT INTO notes (etudiant_id, ecue_id, valeur, statut)
                            VALUES (?, ?, ?, NULL)
                            ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), statut = NULL
                        ");
                        $stmtNote->execute([$etudiantId, $ecueId, $valNote]);
                    }
                }

                // Write jury points to notes_jury
                foreach ($draftPoints as $key => $pts) {
                    // key is "element_type|element_id" e.g. "ecue|12"
                    $parts = explode('|', (string)$key);
                    if (count($parts) !== 2) continue;
                    $elemType = $parts[0];
                    $elemId = (int)$parts[1];

                    if ($pts === null || $pts === '' || (float)$pts === 0.0) {
                        // Delete/remove if points is 0 or null
                        $stmtDel = $pdo->prepare("
                            DELETE FROM notes_jury 
                            WHERE etudiant_id = ? AND semestre_id = ? AND element_type = ? AND element_id = ?
                        ");
                        $stmtDel->execute([$etudiantId, $semestreId, $elemType, $elemId]);
                    } else {
                        // Save points
                        $fPts = (float)$pts;
                        $stmtJuryPts = $pdo->prepare("
                            INSERT INTO notes_jury (etudiant_id, semestre_id, element_type, element_id, points)
                            VALUES (?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE points = VALUES(points)
                        ");
                        $stmtJuryPts->execute([$etudiantId, $semestreId, $elemType, $elemId, $fPts]);
                    }
                }
            }

            // Set jury_valide to 1
            $stmtSetValide = $pdo->prepare("UPDATE semestres SET jury_valide = 1 WHERE id = ?");
            $stmtSetValide->execute([$semestreId]);

            // Clear the drafts
            $stmtClearDrafts = $pdo->prepare("DELETE FROM jury_drafts WHERE semestre_id = ?");
            $stmtClearDrafts->execute([$semestreId]);

            $pdo->commit();
            echo json_encode(["success" => true, "message" => "Jury validé avec succès. Les notes et points de jury sont enregistrés."]);
            exit();
        }

        if ($action === 'reopen_jury') {
            if ($juryValide === 0) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Le jury est déjà en mode brouillon."]);
                exit();
            }

            $pdo->beginTransaction();

            // Set jury_valide to 0
            $stmtSetDraft = $pdo->prepare("UPDATE semestres SET jury_valide = 0 WHERE id = ?");
            $stmtSetDraft->execute([$semestreId]);

            // Copy current notes/jury points to jury_drafts so they are ready as editable draft
            // First get all student ids for this semester's year
            $anneeId = (int)$semestre['annee_id'];
            $stmtStuds = $pdo->prepare("SELECT id FROM etudiants WHERE annee_id = ?");
            $stmtStuds->execute([$anneeId]);
            $studentIds = $stmtStuds->fetchAll(PDO::FETCH_COLUMN);

            // Fetch this semester's ECUEs
            $stmtEcues = $pdo->prepare("
                SELECT ec.id
                FROM ecue ec
                JOIN ue u ON ec.ue_id = u.id
                JOIN bcc b ON u.bcc_id = b.id
                WHERE b.semestre_id = ?
            ");
            $stmtEcues->execute([$semestreId]);
            $ecueIds = $stmtEcues->fetchAll(PDO::FETCH_COLUMN);

            if (!empty($studentIds)) {
                // Clear any leftover drafts first
                $stmtClearDrafts = $pdo->prepare("DELETE FROM jury_drafts WHERE semestre_id = ?");
                $stmtClearDrafts->execute([$semestreId]);

                foreach ($studentIds as $etudiantId) {
                    $draftNotes = [];
                    $draftPoints = [];

                    // Fetch current notes
                    if (!empty($ecueIds)) {
                        $placeholders = implode(',', array_fill(0, count($ecueIds), '?'));
                        $stmtNotes = $pdo->prepare("
                            SELECT ecue_id, valeur, statut 
                            FROM notes 
                            WHERE etudiant_id = ? AND ecue_id IN ($placeholders)
                        ");
                        $stmtNotes->execute(array_merge([$etudiantId], $ecueIds));
                        foreach ($stmtNotes->fetchAll() as $n) {
                            $draftNotes[$n['ecue_id']] = $n['statut'] !== null ? $n['statut'] : ($n['valeur'] !== null ? (float)$n['valeur'] : null);
                        }
                    }

                    // Fetch current jury points
                    $stmtJuryPts = $pdo->prepare("
                        SELECT element_type, element_id, points 
                        FROM notes_jury 
                        WHERE etudiant_id = ? AND semestre_id = ?
                    ");
                    $stmtJuryPts->execute([$etudiantId, $semestreId]);
                    foreach ($stmtJuryPts->fetchAll() as $j) {
                        $key = $j['element_type'] . '|' . $j['element_id'];
                        $draftPoints[$key] = (float)$j['points'];
                    }

                    // Insert into jury_drafts if there's anything to save
                    if (!empty($draftNotes) || !empty($draftPoints)) {
                        $stmtInsDraft = $pdo->prepare("
                            INSERT INTO jury_drafts (etudiant_id, semestre_id, draft_notes, draft_points)
                            VALUES (?, ?, ?, ?)
                        ");
                        $stmtInsDraft->execute([
                            $etudiantId,
                            $semestreId,
                            json_encode($draftNotes),
                            json_encode($draftPoints)
                        ]);
                    }
                }
            }

            $pdo->commit();
            echo json_encode(["success" => true, "message" => "Jury réouvert avec succès."]);
            exit();
        }

        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Action inconnue"]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
    }
    exit();
}
