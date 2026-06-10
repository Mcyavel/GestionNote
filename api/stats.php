<?php
declare(strict_types=1);

/**
 * API Stats - Calculs agrégés, statistiques et propagation de défaillances
 */

if (!function_exists('requirePermission')) {
    require_once __DIR__ . '/auth.php';
}
global $pdo;
require_once __DIR__ . '/../includes/AcademicLogic.php';

use App\Utils\AcademicLogic;

function calculateMedian(array $numbers) {
    if (empty($numbers)) return null;
    sort($numbers);
    $count = count($numbers);
    $middle = (int)($count / 2);
    if ($count % 2 !== 0) {
        return $numbers[$middle];
    } else {
        return ($numbers[$middle - 1] + $numbers[$middle]) / 2.0;
    }
}

function calculateStdDev(array $numbers) {
    $count = count($numbers);
    if ($count <= 1) return 0.0;
    $mean = array_sum($numbers) / $count;
    $sumSq = 0.0;
    foreach ($numbers as $val) {
        $sumSq += pow($val - $mean, 2);
    }
    return sqrt($sumSq / $count);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'overview';

    try {
        if ($action === 'distribution') {
            $ecueId = (int)$_GET['ecue_id'];
            $sql = "
                SELECT FLOOR(valeur / 2) * 2 as tranche, COUNT(*) as count 
                FROM notes 
                WHERE ecue_id = ? AND valeur IS NOT NULL
                GROUP BY tranche 
                ORDER BY tranche ASC
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$ecueId]);
            $data = $stmt->fetchAll();
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
        elseif ($action === 'global_ledger') {
            $anneeId = isset($_GET['annee_id']) ? (int)$_GET['annee_id'] : null;
            $location = $_GET['location'] ?? null;

            if (!$anneeId) throw new Exception("Année non spécifiée");

            $stmtRules = $pdo->prepare("SELECT * FROM regles_validation WHERE annee_id = ?");
            $stmtRules->execute([$anneeId]);
            $rules = $stmtRules->fetch(PDO::FETCH_ASSOC) ?: [
                'seuil_validation_bcc' => 10.0,
                'nb_bcc_autorises_sous_seuil' => 1,
                'seuil_minimal_annuel' => 9.0
            ];

            $sqlStructure = "
                SELECT s.id as semestre_id, b.id as bcc_id, b.nom as bcc_nom, b.bcc_annuel_lie_id,
                       u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff,
                       ec.id as ecue_id, ec.nom as ecue_nom
                FROM semestres s
                JOIN bcc b ON s.id = b.semestre_id
                JOIN ue u ON b.id = u.bcc_id
                JOIN ecue ec ON u.id = ec.ue_id
                WHERE s.annee_id = ?
                ORDER BY s.id, b.id, u.id, ec.id
            ";
            $stmt = $pdo->prepare($sqlStructure);
            $stmt->execute([$anneeId]);
            $rows = $stmt->fetchAll();

            $structure = ['bcc' => []];
            foreach ($rows as $row) {
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
                        'id' => $row['ue_id'], 'nom' => $row['ue_nom'], 'coeff' => (float)$row['ue_coeff'], 'ecue' => []
                    ];
                }
                $structure['bcc'][$row['bcc_id']]['ue'][$row['ue_id']]['ecue'][] = ['id' => $row['ecue_id'], 'nom' => $row['ecue_nom']];
            }
            foreach ($structure['bcc'] as &$b) { $b['ue'] = array_values($b['ue']); }
            $structure['bcc'] = array_values($structure['bcc']);

            $sqlStudents = "SELECT id, nom, prenom, meta_data FROM etudiants WHERE annee_id = ? ORDER BY nom ASC, prenom ASC";
            $stmtStudents = $pdo->prepare($sqlStudents);
            $stmtStudents->execute([$anneeId]);
            $allStudents = $stmtStudents->fetchAll();
            $students = [];

            // Récupérer les semestres de cette année
            $stmtSemesters = $pdo->prepare("SELECT id, nom, jury_valide FROM semestres WHERE annee_id = ?");
            $stmtSemesters->execute([$anneeId]);
            $semestersInfo = $stmtSemesters->fetchAll();
            $allSemesterIds = [];
            $semestersJuryState = [];
            foreach ($semestersInfo as $sem) {
                $allSemesterIds[] = (int)$sem['id'];
                $semestersJuryState[(int)$sem['id']] = (int)$sem['jury_valide'];
            }

            // Fetch all validated jury points for this year's semesters
            $juryPointsMap = [];
            if (!empty($allSemesterIds)) {
                $placeholders = implode(',', array_fill(0, count($allSemesterIds), '?'));
                $stmtJury = $pdo->prepare("
                    SELECT etudiant_id, semestre_id, element_type, element_id, points 
                    FROM notes_jury 
                    WHERE semestre_id IN ($placeholders)
                ");
                $stmtJury->execute($allSemesterIds);
                foreach ($stmtJury->fetchAll() as $row) {
                    $juryPointsMap[(int)$row['etudiant_id']][(int)$row['semestre_id']][$row['element_type']][(int)$row['element_id']] = (float)$row['points'];
                }
            }

            // Fetch all bonus/malus for students in this year
            $stmtBM = $pdo->prepare("
                SELECT etudiant_id, semestre_id, bonus, malus
                FROM notes_bonus_malus
                WHERE etudiant_id IN (SELECT id FROM etudiants WHERE annee_id = ?)
            ");
            $stmtBM->execute([$anneeId]);
            $bmRows = $stmtBM->fetchAll();

            $bonusMalusMap = [];
            foreach ($bmRows as $bm) {
                $key = $bm['etudiant_id'] . '|' . $bm['semestre_id'];
                $bonusMalusMap[$key] = [
                    'bonus' => $bm['bonus'] !== null ? (float)$bm['bonus'] : null,
                    'malus' => $bm['malus'] !== null ? (float)$bm['malus'] : null
                ];
            }

            foreach ($allStudents as $s) {
                $meta = json_decode($s['meta_data'] ?? '{}', true);
                $studentLoc = $meta['Provenance'] ?? $meta['provenance'] ?? $meta['Lieu'] ?? $meta['lieu'] ?? '';
                if ($location && stripos($studentLoc, $location) === false) continue;
                $students[] = [
                    'id' => $s['id'], 'nom' => $s['nom'], 'prenom' => $s['prenom'], 'provenance' => $studentLoc,
                    'grades' => ['ecue' => [], 'ue' => [], 'bcc' => [], 'bcc_annuel' => [], 'year' => 0],
                    'raw_grades' => ['ecue' => [], 'ue' => [], 'bcc' => [], 'bcc_annuel' => [], 'year' => 0],
                    'validation' => ['status' => 'AJOURNÉ']
                ];
            }

            $studentIds = array_column($students, 'id');
            $allNotesMap = [];
            if (!empty($studentIds)) {
                $placeholders = implode(',', array_fill(0, count($studentIds), '?'));
                $stmtAllNotes = $pdo->prepare("SELECT etudiant_id, ecue_id, valeur, statut FROM notes WHERE etudiant_id IN ($placeholders)");
                $stmtAllNotes->execute($studentIds);
                foreach ($stmtAllNotes->fetchAll() as $n) {
                    $allNotesMap[$n['etudiant_id']][$n['ecue_id']] = $n;
                }
            }

            foreach ($students as &$student) {
                // Remplir les bonus/malus de l'étudiant
                $student['bonus_malus'] = [];
                foreach ($allSemesterIds as $semId) {
                    $bmKey = $student['id'] . '|' . $semId;
                    $student['bonus_malus'][$semId] = [
                        'bonus' => isset($bonusMalusMap[$bmKey]) ? $bonusMalusMap[$bmKey]['bonus'] : null,
                        'malus' => isset($bonusMalusMap[$bmKey]) ? $bonusMalusMap[$bmKey]['malus'] : null
                    ];
                }

                foreach ($structure['bcc'] as $bcc) {
                    $bccSum = 0; $bccCoeff = 0;
                    $bccDef = false;
                    $semId = (int)$bcc['semestre_id'];
                    $isJuryValide = isset($semestersJuryState[$semId]) && $semestersJuryState[$semId] === 1;

                    foreach ($bcc['ue'] as $ue) {
                        $ueSum = 0; $ueCount = 0;
                        $ueDef = false;

                        foreach ($ue['ecue'] as $ecue) {
                            $rowNote = isset($allNotesMap[$student['id']][$ecue['id']]) ? $allNotesMap[$student['id']][$ecue['id']] : false;
                            if ($rowNote !== false) {
                                if ($rowNote['statut'] !== null) {
                                    $stat = $rowNote['statut'];
                                    $student['grades']['ecue'][$ecue['id']] = $stat;
                                    $student['raw_grades']['ecue'][$ecue['id']] = $stat;
                                    if ($stat === 'DEF') {
                                        $ueDef = true;
                                    } elseif ($stat === 'ABI') {
                                        $ueSum += 0.0;
                                        $ueCount++;
                                    }
                                    // ABJ: Neutralisé (rien à ajouter, pas d'incrément de count)
                                } else {
                                    $val = (float)$rowNote['valeur'];
                                    $student['raw_grades']['ecue'][$ecue['id']] = $val;

                                    if ($isJuryValide) {
                                        $pts = $juryPointsMap[$student['id']][$semId]['ecue'][$ecue['id']] ?? 0.0;
                                        $val_adjusted = min(20.0, $val + $pts);
                                        $student['grades']['ecue'][$ecue['id']] = round($val_adjusted, 2);
                                        $ueSum += $val_adjusted;
                                    } else {
                                        $student['grades']['ecue'][$ecue['id']] = $val;
                                        $ueSum += $val;
                                    }
                                    $ueCount++;
                                }
                            } else {
                                $student['grades']['ecue'][$ecue['id']] = null;
                                $student['raw_grades']['ecue'][$ecue['id']] = null;
                            }
                        }

                        if ($ueDef) {
                            $student['grades']['ue'][$ue['id']] = 'DEF';
                            $student['raw_grades']['ue'][$ue['id']] = 'DEF';
                            $bccDef = true;
                        } elseif ($ueCount > 0) {
                            // First compute the RAW UE average (from raw ECUE notes)
                            $rawUeSum = 0; $rawUeCount = 0;
                            foreach ($ue['ecue'] as $ecue) {
                                $nVal = $student['raw_grades']['ecue'][$ecue['id']] ?? null;
                                if ($nVal !== null && $nVal !== 'DEF' && $nVal !== 'ABJ') {
                                    if ($nVal === 'ABI') {
                                        $rawUeSum += 0.0;
                                    } else {
                                        $rawUeSum += (float)$nVal;
                                    }
                                    $rawUeCount++;
                                }
                            }
                            $rawUeAvg = ($rawUeCount > 0) ? round($rawUeSum / $rawUeCount, 2) : null;
                            $student['raw_grades']['ue'][$ue['id']] = $rawUeAvg;

                            // Now compute adjusted UE average
                            $moyenneUe = round($ueSum / $ueCount, 2);
                            if ($isJuryValide) {
                                $ptsUe = $juryPointsMap[$student['id']][$semId]['ue'][$ue['id']] ?? 0.0;
                                $moyenneUe = min(20.0, $moyenneUe + $ptsUe);
                            }
                            $student['grades']['ue'][$ue['id']] = round($moyenneUe, 2);

                            $bccSum += ($moyenneUe * $ue['coeff']);
                            $bccCoeff += $ue['coeff'];
                        } else {
                            $student['grades']['ue'][$ue['id']] = null;
                            $student['raw_grades']['ue'][$ue['id']] = null;
                        }
                    }

                    if ($bccDef) {
                        $student['grades']['bcc'][$bcc['id']] = 'DEF';
                        $student['raw_grades']['bcc'][$bcc['id']] = 'DEF';
                    } else {
                        // Compute raw BCC average
                        $rawBccSum = 0; $rawBccCoeff = 0;
                        foreach ($bcc['ue'] as $ue) {
                            $rawUe = $student['raw_grades']['ue'][$ue['id']] ?? null;
                            if ($rawUe !== null && $rawUe !== 'DEF') {
                                $rawBccSum += ((float)$rawUe * $ue['coeff']);
                                $rawBccCoeff += $ue['coeff'];
                            }
                        }
                        $rawBccAvgNoBM = ($rawBccCoeff > 0) ? ($rawBccSum / $rawBccCoeff) : null;
                        if ($rawBccAvgNoBM !== null) {
                            $bmKey = $student['id'] . '|' . $bcc['semestre_id'];
                            $bonusVal = isset($bonusMalusMap[$bmKey]) && $bonusMalusMap[$bmKey]['bonus'] !== null ? $bonusMalusMap[$bmKey]['bonus'] : 0.0;
                            $malusVal = isset($bonusMalusMap[$bmKey]) && $bonusMalusMap[$bmKey]['malus'] !== null ? $bonusMalusMap[$bmKey]['malus'] : 0.0;
                            $rawBccAvg = max(0.0, min(20.0, $rawBccAvgNoBM + $bonusVal - $malusVal));
                            $student['raw_grades']['bcc'][$bcc['id']] = round($rawBccAvg, 2);
                        } else {
                            $student['raw_grades']['bcc'][$bcc['id']] = null;
                        }

                        // Compute adjusted BCC average
                        $rawBccAvgCalculated = ($bccCoeff > 0) ? ($bccSum / $bccCoeff) : null;
                        if ($rawBccAvgCalculated !== null) {
                            $bmKey = $student['id'] . '|' . $bcc['semestre_id'];
                            $bonusVal = isset($bonusMalusMap[$bmKey]) && $bonusMalusMap[$bmKey]['bonus'] !== null ? $bonusMalusMap[$bmKey]['bonus'] : 0.0;
                            $malusVal = isset($bonusMalusMap[$bmKey]) && $bonusMalusMap[$bmKey]['malus'] !== null ? $bonusMalusMap[$bmKey]['malus'] : 0.0;
                            $adjustedAvg = max(0.0, min(20.0, $rawBccAvgCalculated + $bonusVal - $malusVal));
                            
                            if ($isJuryValide) {
                                $ptsBcc = $juryPointsMap[$student['id']][$semId]['bcc'][$bcc['id']] ?? 0.0;
                                $adjustedAvg = min(20.0, $adjustedAvg + $ptsBcc);
                            }
                            $student['grades']['bcc'][$bcc['id']] = round($adjustedAvg, 2);
                        } else {
                            $student['grades']['bcc'][$bcc['id']] = null;
                        }
                    }
                }

                $annualBccs = [];
                $rawAnnualBccs = [];
                $processedIds = [];
                $bccMapById = [];
                foreach ($structure['bcc'] as $b) {
                    $bccMapById[$b['id']] = $b;
                }

                foreach ($structure['bcc'] as $bcc) {
                    if (in_array($bcc['id'], $processedIds)) continue;
                    
                    $twinId = $bcc['twin_id'];
                    $processedIds[] = $bcc['id'];
                    if ($twinId) {
                        $processedIds[] = $twinId;
                    }

                    // Gather all UEs from both BCCs
                    $annualUes = $bcc['ue'];
                    if ($twinId && isset($bccMapById[$twinId])) {
                        foreach ($bccMapById[$twinId]['ue'] as $ue) {
                            $annualUes[] = $ue;
                        }
                    }

                    // Active (Adjusted)
                    $totalSum = 0; $totalCoeff = 0; $isDef = false;
                    foreach ($annualUes as $ue) {
                        $ueVal = $student['grades']['ue'][$ue['id']] ?? null;
                        if ($ueVal === 'DEF') {
                            $isDef = true;
                        } elseif ($ueVal !== null) {
                            $totalSum += ((float)$ueVal * $ue['coeff']);
                            $totalCoeff += $ue['coeff'];
                        }
                    }
                    if ($isDef) {
                        $moyAnnuelle = 'DEF';
                    } else {
                        $moyAnnuelle = ($totalCoeff > 0) ? round($totalSum / $totalCoeff, 2) : null;
                    }
                    $annualBccs[] = $moyAnnuelle;
                    $student['grades']['bcc_annuel'][$bcc['id']] = $moyAnnuelle;
                    if ($twinId) $student['grades']['bcc_annuel'][$twinId] = $moyAnnuelle;

                    // Raw
                    $totalRawSum = 0; $totalRawCoeff = 0; $isRawDef = false;
                    foreach ($annualUes as $ue) {
                        $ueRawVal = $student['raw_grades']['ue'][$ue['id']] ?? null;
                        if ($ueRawVal === 'DEF') {
                            $isRawDef = true;
                        } elseif ($ueRawVal !== null) {
                            $totalRawSum += ((float)$ueRawVal * $ue['coeff']);
                            $totalRawCoeff += $ue['coeff'];
                        }
                    }
                    if ($isRawDef) {
                        $rawMoyAnnuelle = 'DEF';
                    } else {
                        $rawMoyAnnuelle = ($totalRawCoeff > 0) ? round($totalRawSum / $totalRawCoeff, 2) : null;
                    }
                    $rawAnnualBccs[] = $rawMoyAnnuelle;
                    $student['raw_grades']['bcc_annuel'][$bcc['id']] = $rawMoyAnnuelle;
                    if ($twinId) $student['raw_grades']['bcc_annuel'][$twinId] = $rawMoyAnnuelle;
                }

                $student['validation']['status'] = AcademicLogic::calculateYearValidation($annualBccs, $rules);
                $student['validation']['status_raw'] = AcademicLogic::calculateYearValidation($rawAnnualBccs, $rules);
            }
            echo json_encode(["success" => true, "data" => [
                "structure" => $structure, 
                "students" => $students, 
                "rules" => $rules, 
                "semesters_jury_valide" => $semestersJuryState,
                "jury_points" => $juryPointsMap
            ]]);
        }
        elseif ($action === 'academic_overview') {
            $anneeId = isset($_GET['annee_id']) ? (int)$_GET['annee_id'] : null;
            $location = $_GET['location'] ?? null;
            if (!$anneeId) throw new Exception("Année non spécifiée");
            $sql = "
                SELECT s.id as semestre_id, s.nom as semestre_nom, b.id as bcc_id, b.nom as bcc_nom, 
                       u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff, 
                       ec.id as ecue_id, ec.nom as ecue_nom, et.id as etudiant_id, 
                       et.nom, et.prenom, et.meta_data, n.valeur as note, n.statut
                FROM annees a
                JOIN semestres s ON a.id = s.annee_id
                JOIN bcc b ON s.id = b.semestre_id
                JOIN ue u ON b.id = u.bcc_id
                JOIN ecue ec ON u.id = ec.ue_id
                JOIN notes n ON ec.id = n.ecue_id
                JOIN etudiants et ON n.etudiant_id = et.id
                WHERE a.id = ? AND et.annee_id = ?
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$anneeId, $anneeId]);
            $rows = $stmt->fetchAll();
            $results = ['semestres' => [], 'total_year' => ['sum' => 0, 'count' => 0, 'average' => 0]];
            foreach ($rows as $row) {
                if ($location) {
                    $meta = json_decode($row['meta_data'], true);
                    $studentLoc = $meta['Provenance'] ?? $meta['provenance'] ?? $meta['Lieu'] ?? $meta['lieu'] ?? '';
                    if (stripos($studentLoc, $location) === false) continue;
                }
                $sId = $row['semestre_id'];
                if (!isset($results['semestres'][$sId])) $results['semestres'][$sId] = ['nom' => $row['semestre_nom'], 'bcc' => [], 'average' => 0, 'sum' => 0, 'count' => 0];
                $bId = $row['bcc_id'];
                if (!isset($results['semestres'][$sId]['bcc'][$bId])) $results['semestres'][$sId]['bcc'][$bId] = ['nom' => $row['bcc_nom'], 'sum' => 0, 'count' => 0, 'average' => 0];
                
                $statut = $row['statut'];
                if ($statut !== null) {
                    if ($statut === 'ABI' || $statut === 'DEF') {
                        $val = 0.0;
                    } else {
                        // ABJ est neutralisé
                        continue;
                    }
                } else {
                    $val = (float)$row['note'];
                }
                
                $results['semestres'][$sId]['bcc'][$bId]['sum'] += $val;
                $results['semestres'][$sId]['bcc'][$bId]['count']++;
                $results['semestres'][$sId]['sum'] += $val;
                $results['semestres'][$sId]['count']++;
                $results['total_year']['sum'] += $val;
                $results['total_year']['count']++;
            }
            foreach ($results['semestres'] as &$s) {
                if ($s['count'] > 0) $s['average'] = round($s['sum'] / $s['count'], 2);
                foreach ($s['bcc'] as &$b) { if ($b['count'] > 0) $b['average'] = round($b['sum'] / $b['count'], 2); }
                $s['bcc'] = array_values($s['bcc']);
            }
            if ($results['total_year']['count'] > 0) $results['total_year']['average'] = round($results['total_year']['sum'] / $results['total_year']['count'], 2);
            $results['semestres'] = array_values($results['semestres']);
            echo json_encode(["success" => true, "data" => $results]);
        }
        elseif ($action === 'advanced_stats') {
            $anneeIdsStr = isset($_GET['annee_ids']) ? $_GET['annee_ids'] : '';
            $anneeId = isset($_GET['annee_id']) ? (int)$_GET['annee_id'] : null;
            
            $anneeIds = [];
            if (!empty($anneeIdsStr)) {
                $anneeIds = array_map('intval', explode(',', $anneeIdsStr));
            } elseif ($anneeId) {
                $anneeIds = [$anneeId];
            }

            if (empty($anneeIds)) throw new Exception("Aucune promotion spécifiée");

            $placeholders = implode(',', array_fill(0, count($anneeIds), '?'));

            // 1. Charger tous les étudiants de ces promotions
            $stmtStudents = $pdo->prepare("SELECT id, nom, prenom, email, provenance, meta_data, annee_id FROM etudiants WHERE annee_id IN ($placeholders)");
            $stmtStudents->execute($anneeIds);
            $students = $stmtStudents->fetchAll(PDO::FETCH_ASSOC);

            // 2. Calculer pour chaque étudiant sa moyenne et son statut via AcademicLogic
            $studentResults = [];
            foreach ($students as $s) {
                $prov = $s['provenance'];
                if (empty($prov) && $s['meta_data']) {
                    $meta = json_decode($s['meta_data'], true);
                    $prov = $meta['Provenance'] ?? $meta['provenance'] ?? $meta['Lieu'] ?? $meta['lieu'] ?? '';
                }
                $prov = trim((string)$prov);
                if (empty($prov)) $prov = 'Non spécifiée';

                $calc = AcademicLogic::calculateStudentAverageAndStatus((int)$s['id'], (int)$s['annee_id'], $pdo);
                $studentResults[] = [
                    'id' => $s['id'],
                    'nom' => $s['nom'],
                    'prenom' => $s['prenom'],
                    'email' => $s['email'],
                    'provenance' => $prov,
                    'average' => $calc['average'],
                    'status' => $calc['status']
                ];
            }

            // 3. Agrégation par Provenance
            $provenanceStats = [];
            foreach ($studentResults as $sr) {
                $p = $sr['provenance'];
                if (!isset($provenanceStats[$p])) {
                    $provenanceStats[$p] = [
                        'provenance' => $p,
                        'count' => 0,
                        'admis_count' => 0,
                        'averages' => []
                    ];
                }
                $provenanceStats[$p]['count']++;
                if ($sr['status'] === 'ADMIS') {
                    $provenanceStats[$p]['admis_count']++;
                }
                if ($sr['average'] !== null && $sr['average'] !== 'DEF') {
                    $provenanceStats[$p]['averages'][] = (float)$sr['average'];
                }
            }

            $formattedProvenance = [];
            foreach ($provenanceStats as $p => $stats) {
                $avg = null;
                $median = null;
                $stddev = null;
                $min = null;
                $max = null;
                $vals = $stats['averages'];
                if (count($vals) > 0) {
                    $avg = round(array_sum($vals) / count($vals), 2);
                    $median = round(calculateMedian($vals), 2);
                    $stddev = round(calculateStdDev($vals), 2);
                    $min = round(min($vals), 2);
                    $max = round(max($vals), 2);
                }
                $rate = 0.0;
                if ($stats['count'] > 0) {
                    $rate = round(($stats['admis_count'] / $stats['count']) * 100, 1);
                }
                $formattedProvenance[] = [
                    'provenance' => $p,
                    'count' => $stats['count'],
                    'average' => $avg,
                    'median' => $median,
                    'stddev' => $stddev,
                    'min' => $min,
                    'max' => $max,
                    'admis_rate' => $rate
                ];
            }

            // 4. Agrégation globale de la promotion
            $promoStats = [
                'total_students' => count($studentResults),
                'admis' => 0,
                'ajourne' => 0,
                'incomplet' => 0,
                'defaillant' => 0,
                'average' => null,
                'median' => null,
                'stddev' => null,
                'min' => null,
                'max' => null
            ];
            $validAverages = [];
            foreach ($studentResults as $sr) {
                if ($sr['status'] === 'ADMIS') $promoStats['admis']++;
                elseif ($sr['status'] === 'AJOURNÉ') $promoStats['ajourne']++;
                elseif ($sr['status'] === 'INCOMPLET') $promoStats['incomplet']++;
                elseif ($sr['status'] === 'DÉFAILLANT') $promoStats['defaillant']++;

                if ($sr['average'] !== null && $sr['average'] !== 'DEF') {
                    $validAverages[] = (float)$sr['average'];
                }
            }
            if (count($validAverages) > 0) {
                $promoStats['average'] = round(array_sum($validAverages) / count($validAverages), 2);
                $promoStats['median'] = round(calculateMedian($validAverages), 2);
                $promoStats['stddev'] = round(calculateStdDev($validAverages), 2);
                $promoStats['min'] = round(min($validAverages), 2);
                $promoStats['max'] = round(max($validAverages), 2);
            }

            // 5. Statistiques par ECUE (Groupées par Nom)
            $stmtGrades = $pdo->prepare("
                SELECT n.valeur, n.statut, ec.nom as ecue_nom, u.nom as ue_nom
                FROM notes n
                JOIN ecue ec ON n.ecue_id = ec.id
                JOIN ue u ON ec.ue_id = u.id
                WHERE n.etudiant_id IN (SELECT id FROM etudiants WHERE annee_id IN ($placeholders))
            ");
            $stmtGrades->execute($anneeIds);
            $allGrades = $stmtGrades->fetchAll(PDO::FETCH_ASSOC);

            $ecueGroups = [];
            foreach ($allGrades as $g) {
                $name = trim($g['ecue_nom']);
                $ueName = trim($g['ue_nom']);
                if (!isset($ecueGroups[$name])) {
                    $ecueGroups[$name] = [
                        'nom' => $name,
                        'ue_nom' => $ueName,
                        'passed' => 0,
                        'failed' => 0,
                        'values' => []
                    ];
                }
                if ($g['statut'] !== null) {
                    if ($g['statut'] === 'ABI' || $g['statut'] === 'DEF') {
                        $ecueGroups[$name]['failed']++;
                        $ecueGroups[$name]['values'][] = 0.0;
                    }
                } else {
                    $v = (float)$g['valeur'];
                    $ecueGroups[$name]['values'][] = $v;
                    if ($v >= 10.0) {
                        $ecueGroups[$name]['passed']++;
                    } else {
                        $ecueGroups[$name]['failed']++;
                    }
                }
            }

            $ecueStats = [];
            foreach ($ecueGroups as $name => $group) {
                $vals = $group['values'];
                $count = count($vals);
                $avg = null;
                $median = null;
                $stddev = null;
                $min = null;
                $max = null;
                if ($count > 0) {
                    $avg = round(array_sum($vals) / $count, 2);
                    $median = round(calculateMedian($vals), 2);
                    $stddev = round(calculateStdDev($vals), 2);
                    $min = round(min($vals), 2);
                    $max = round(max($vals), 2);
                }
                $successRate = $count > 0 ? round(($group['passed'] / $count) * 100, 1) : 0.0;
                $ecueStats[] = [
                    'id' => md5($name),
                    'nom' => $name,
                    'ue_nom' => $group['ue_nom'],
                    'average' => $avg,
                    'median' => $median,
                    'stddev' => $stddev,
                    'min' => $min,
                    'max' => $max,
                    'success_rate' => $successRate,
                    'count' => $count
                ];
            }

            $bestEcues = $ecueStats;
            usort($bestEcues, function($a, $b) {
                if ($a['average'] === null) return 1;
                if ($b['average'] === null) return -1;
                return $b['average'] <=> $a['average'];
            });
            $worstEcues = array_filter($ecueStats, function($x) { return $x['average'] !== null; });
            usort($worstEcues, function($a, $b) {
                return $a['average'] <=> $b['average'];
            });

            // 6. Suivi des redoublants et progressions individuelles
            $studentHistories = [];
            foreach ($students as $s) {
                $email = $s['email'];
                if (empty($email)) continue;

                $stmtCount = $pdo->prepare("SELECT COUNT(*) FROM etudiants WHERE email = ?");
                $stmtCount->execute([$email]);
                $cnt = (int)$stmtCount->fetchColumn();

                if ($cnt > 1) {
                    $stmtRegs = $pdo->prepare("
                        SELECT e.id, e.annee_inscription, a.nom as annee_nom, e.annee_id
                        FROM etudiants e
                        LEFT JOIN annees a ON e.annee_id = a.id
                        WHERE e.email = ?
                        ORDER BY e.annee_inscription ASC, e.id ASC
                    ");
                    $stmtRegs->execute([$email]);
                    $regs = $stmtRegs->fetchAll(PDO::FETCH_ASSOC);

                    $progression = [];
                    foreach ($regs as $reg) {
                        $calc = AcademicLogic::calculateStudentAverageAndStatus((int)$reg['id'], (int)$reg['annee_id'], $pdo);
                        $progression[] = [
                            'annee_nom' => $reg['annee_nom'] ?: 'Inconnue',
                            'annee_inscription' => $reg['annee_inscription'],
                            'average' => $calc['average'],
                            'status' => $calc['status']
                        ];
                    }

                    // Éviter d'ajouter plusieurs fois le même étudiant si la multi-sélection inclut plusieurs de ses inscriptions
                    $found = false;
                    foreach ($studentHistories as $existing) {
                        if ($existing['email'] === $email) {
                            $found = true;
                            break;
                        }
                    }
                    if (!$found) {
                        $studentHistories[] = [
                            'nom' => $s['nom'],
                            'prenom' => $s['prenom'],
                            'email' => $email,
                            'progression' => $progression
                        ];
                    }
                }
            }

            echo json_encode([
                "success" => true,
                "data" => [
                    "provenance" => $formattedProvenance,
                    "promo" => $promoStats,
                    "best_ecues" => array_slice($bestEcues, 0, 5),
                    "worst_ecues" => array_slice($worstEcues, 0, 5),
                    "student_progressions" => $studentHistories
                ]
            ]);
        }
        elseif ($action === 'temporal_evolution') {
            $anneeIdsStr = isset($_GET['annee_ids']) ? $_GET['annee_ids'] : '';
            if (empty($anneeIdsStr)) throw new Exception("Aucune promotion spécifiée");
            $anneeIds = array_map('intval', explode(',', $anneeIdsStr));

            $placeholders = implode(',', array_fill(0, count($anneeIds), '?'));
            
            // Trier chronologiquement selon le premier étudiant inscrit
            $sqlYears = "
                SELECT a.id, a.nom, COALESCE(MIN(e.annee_inscription), 0) as year_inscr
                FROM annees a
                LEFT JOIN etudiants e ON a.id = e.annee_id
                WHERE a.id IN ($placeholders)
                GROUP BY a.id, a.nom
                ORDER BY year_inscr ASC, a.id ASC
            ";
            $stmtYears = $pdo->prepare($sqlYears);
            $stmtYears->execute($anneeIds);
            $orderedYears = $stmtYears->fetchAll(PDO::FETCH_ASSOC);

            $timeline = [];
            $allBccNames = [];
            $allUeNames = [];

            foreach ($orderedYears as $oy) {
                $yId = (int)$oy['id'];

                // 1. Charger les règles de cette promotion
                $stmtRules = $pdo->prepare("SELECT * FROM regles_validation WHERE annee_id = ?");
                $stmtRules->execute([$yId]);
                $rules = $stmtRules->fetch(PDO::FETCH_ASSOC) ?: [
                    'seuil_validation_bcc' => 10.0,
                    'nb_bcc_autorises_sous_seuil' => 1,
                    'seuil_minimal_annuel' => 9.0
                ];

                // 2. Charger la structure
                $sqlStructure = "
                    SELECT s.id as semestre_id, b.id as bcc_id, b.nom as bcc_nom, b.bcc_annuel_lie_id,
                           u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff,
                           ec.id as ecue_id, ec.nom as ecue_nom
                    FROM semestres s
                    JOIN bcc b ON s.id = b.semestre_id
                    JOIN ue u ON b.id = u.bcc_id
                    JOIN ecue ec ON u.id = ec.ue_id
                    WHERE s.annee_id = ?
                ";
                $stmt = $pdo->prepare($sqlStructure);
                $stmt->execute([$yId]);
                $structureRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                if (empty($structureRows)) {
                    continue;
                }

                $semestersJuryState = [];
                $allSemesterIds = [];
                $stmtSemesters = $pdo->prepare("SELECT id, jury_valide FROM semestres WHERE annee_id = ?");
                $stmtSemesters->execute([$yId]);
                foreach ($stmtSemesters->fetchAll() as $sem) {
                    $allSemesterIds[] = (int)$sem['id'];
                    $semestersJuryState[(int)$sem['id']] = (int)$sem['jury_valide'];
                }

                // Charger les notes de jury
                $juryPointsMap = [];
                if (!empty($allSemesterIds)) {
                    $placeholdersSem = implode(',', array_fill(0, count($allSemesterIds), '?'));
                    $stmtJury = $pdo->prepare("
                        SELECT etudiant_id, semestre_id, element_type, element_id, points 
                        FROM notes_jury 
                        WHERE semestre_id IN ($placeholdersSem)
                    ");
                    $stmtJury->execute($allSemesterIds);
                    foreach ($stmtJury->fetchAll() as $row) {
                        $juryPointsMap[(int)$row['etudiant_id']][(int)$row['semestre_id']][$row['element_type']][(int)$row['element_id']] = (float)$row['points'];
                    }
                }

                // Charger bonus/malus
                $stmtBM = $pdo->prepare("
                    SELECT etudiant_id, semestre_id, bonus, malus
                    FROM notes_bonus_malus
                    WHERE etudiant_id IN (SELECT id FROM etudiants WHERE annee_id = ?)
                ");
                $stmtBM->execute([$yId]);
                $bonusMalusMap = [];
                foreach ($stmtBM->fetchAll() as $bm) {
                    $key = $bm['etudiant_id'] . '|' . $bm['semestre_id'];
                    $bonusMalusMap[$key] = [
                        'bonus' => $bm['bonus'] !== null ? (float)$bm['bonus'] : 0.0,
                        'malus' => $bm['malus'] !== null ? (float)$bm['malus'] : 0.0
                    ];
                }

                // Organiser la structure
                $structure = ['bcc' => []];
                foreach ($structureRows as $row) {
                    if (!isset($structure['bcc'][$row['bcc_id']])) {
                        $structure['bcc'][$row['bcc_id']] = [
                            'id' => $row['bcc_id'],
                            'nom' => trim($row['bcc_nom']),
                            'semestre_id' => (int)$row['semestre_id'],
                            'twin_id' => $row['bcc_annuel_lie_id'] ? (int)$row['bcc_annuel_lie_id'] : null,
                            'ue' => []
                        ];
                        if (!in_array(trim($row['bcc_nom']), $allBccNames)) {
                            $allBccNames[] = trim($row['bcc_nom']);
                        }
                    }
                    if (!isset($structure['bcc'][$row['bcc_id']]['ue'][$row['ue_id']])) {
                        $structure['bcc'][$row['bcc_id']]['ue'][$row['ue_id']] = [
                            'id' => $row['ue_id'], 'nom' => $row['ue_nom'], 'coeff' => (float)$row['ue_coeff'], 'ecue' => []
                        ];
                        $trimmedUeName = trim($row['ue_nom']);
                        if (!in_array($trimmedUeName, $allUeNames)) {
                            $allUeNames[] = $trimmedUeName;
                        }
                    }
                    $structure['bcc'][$row['bcc_id']]['ue'][$row['ue_id']]['ecue'][] = ['id' => $row['ecue_id'], 'nom' => $row['ecue_nom']];
                }

                // Charger les étudiants de cette promotion
                $stmtStudents = $pdo->prepare("SELECT id FROM etudiants WHERE annee_id = ?");
                $stmtStudents->execute([$yId]);
                $students = $stmtStudents->fetchAll(PDO::FETCH_ASSOC);

                $admisCount = 0;
                $promoAverages = [];
                $bccScoresByName = [];
                $ueScoresByName = [];

                foreach ($students as $student) {
                    $sId = (int)$student['id'];
                    $studentGrades = ['bcc' => [], 'bcc_annuel' => []];
                    $studentUeGrades = [];

                    foreach ($structure['bcc'] as $bcc) {
                        $bccSum = 0; $bccCoeff = 0;
                        $bccDef = false;
                        $semId = (int)$bcc['semestre_id'];
                        $isJuryValide = isset($semestersJuryState[$semId]) && $semestersJuryState[$semId] === 1;

                        foreach ($bcc['ue'] as $ue) {
                            $ueSum = 0; $ueCount = 0;
                            $ueDef = false;

                            foreach ($ue['ecue'] as $ecue) {
                                $stmtNote = $pdo->prepare("SELECT valeur, statut FROM notes WHERE etudiant_id = ? AND ecue_id = ?");
                                $stmtNote->execute([$sId, $ecue['id']]);
                                $rowNote = $stmtNote->fetch();
                                if ($rowNote !== false) {
                                    if ($rowNote['statut'] !== null) {
                                        if ($rowNote['statut'] === 'DEF') {
                                            $ueDef = true;
                                        } elseif ($rowNote['statut'] === 'ABI') {
                                            $ueSum += 0.0;
                                            $ueCount++;
                                        }
                                    } else {
                                        $val = (float)$rowNote['valeur'];
                                        if ($isJuryValide) {
                                            $pts = $juryPointsMap[$sId][$semId]['ecue'][$ecue['id']] ?? 0.0;
                                            $val = min(20.0, $val + $pts);
                                        }
                                        $ueSum += $val;
                                        $ueCount++;
                                    }
                                }
                            }

                            if ($ueDef) {
                                $bccDef = true;
                                $studentUeGrades[$ue['id']] = 'DEF';
                            } elseif ($ueCount > 0) {
                                $ueAvg = round($ueSum / $ueCount, 2);
                                if ($isJuryValide) {
                                    $ptsUe = $juryPointsMap[$sId][$semId]['ue'][$ue['id']] ?? 0.0;
                                    $ueAvg = min(20.0, $ueAvg + $ptsUe);
                                }
                                $bccSum += ($ueAvg * $ue['coeff']);
                                $bccCoeff += $ue['coeff'];

                                $ueName = trim($ue['nom']);
                                $ueScoresByName[$ueName][] = $ueAvg;
                                $studentUeGrades[$ue['id']] = $ueAvg;
                            } else {
                                $studentUeGrades[$ue['id']] = null;
                            }
                        }

                        if ($bccDef) {
                            $studentGrades['bcc'][$bcc['id']] = 'DEF';
                        } else {
                            $bccAvgCalculated = ($bccCoeff > 0) ? ($bccSum / $bccCoeff) : null;
                            if ($bccAvgCalculated !== null) {
                                $bmKey = $sId . '|' . $bcc['semestre_id'];
                                $bonusVal = isset($bonusMalusMap[$bmKey]) ? $bonusMalusMap[$bmKey]['bonus'] : 0.0;
                                $malusVal = isset($bonusMalusMap[$bmKey]) ? $bonusMalusMap[$bmKey]['malus'] : 0.0;
                                $adjustedAvg = max(0.0, min(20.0, $bccAvgCalculated + $bonusVal - $malusVal));

                                if ($isJuryValide) {
                                    $ptsBcc = $juryPointsMap[$sId][$semId]['bcc'][$bcc['id']] ?? 0.0;
                                    $adjustedAvg = min(20.0, $adjustedAvg + $ptsBcc);
                                }
                                $studentGrades['bcc'][$bcc['id']] = round($adjustedAvg, 2);
                            } else {
                                $studentGrades['bcc'][$bcc['id']] = null;
                            }
                        }
                    }

                    // Calculer les BCC annuels
                    $processedIds = [];
                    $bccMapById = [];
                    foreach ($structure['bcc'] as $b) {
                        $bccMapById[$b['id']] = $b;
                    }

                    foreach ($structure['bcc'] as $bcc) {
                        if (in_array($bcc['id'], $processedIds)) continue;

                        $twinId = $bcc['twin_id'];
                        $processedIds[] = $bcc['id'];
                        if ($twinId) {
                            $processedIds[] = $twinId;
                        }

                        // Gather all UEs from both BCCs
                        $annualUes = $bcc['ue'];
                        if ($twinId && isset($bccMapById[$twinId])) {
                            foreach ($bccMapById[$twinId]['ue'] as $ue) {
                                $annualUes[] = $ue;
                            }
                        }

                        $totalSum = 0; $totalCoeff = 0; $isDef = false;
                        foreach ($annualUes as $ue) {
                            $ueVal = $studentUeGrades[$ue['id']] ?? null;
                            if ($ueVal === 'DEF') {
                                $isDef = true;
                            } elseif ($ueVal !== null) {
                                $totalSum += ((float)$ueVal * $ue['coeff']);
                                $totalCoeff += $ue['coeff'];
                            }
                        }

                        if ($isDef) {
                            $moyAnnuelle = 'DEF';
                        } else {
                            $moyAnnuelle = ($totalCoeff > 0) ? round($totalSum / $totalCoeff, 2) : null;
                        }

                        $studentGrades['bcc_annuel'][$bcc['id']] = $moyAnnuelle;
                        if ($twinId) {
                            $studentGrades['bcc_annuel'][$twinId] = $moyAnnuelle;
                        }

                        $bccName = $bcc['nom'];
                        if ($moyAnnuelle !== null && $moyAnnuelle !== 'DEF') {
                            $bccScoresByName[$bccName][] = $moyAnnuelle;
                        }
                    }

                    $status = AcademicLogic::calculateYearValidation($studentGrades['bcc_annuel'], $rules);
                    if ($status === 'ADMIS') {
                        $admisCount++;
                    }

                    $validScores = array_filter($studentGrades['bcc_annuel'], function($avg) {
                        return $avg !== null && $avg !== 'DEF';
                    });
                    if (!empty($validScores)) {
                        $studAvg = array_sum($validScores) / count($validScores);
                        $promoAverages[] = $studAvg;
                    }
                }

                $promoAvg = null;
                $promoMedian = null;
                $promoStdDev = null;
                $promoMin = null;
                $promoMax = null;
                if (count($promoAverages) > 0) {
                    $promoAvg = round(array_sum($promoAverages) / count($promoAverages), 2);
                    $promoMedian = round(calculateMedian($promoAverages), 2);
                    $promoStdDev = round(calculateStdDev($promoAverages), 2);
                    $promoMin = round(min($promoAverages), 2);
                    $promoMax = round(max($promoAverages), 2);
                }
                $admisRate = count($students) > 0 ? round(($admisCount / count($students)) * 100, 1) : 0.0;

                $bccAverages = [];
                foreach ($bccScoresByName as $name => $scores) {
                    if (count($scores) > 0) {
                        $bccAverages[$name] = round(array_sum($scores) / count($scores), 2);
                    }
                }

                $ueAverages = [];
                foreach ($ueScoresByName as $name => $scores) {
                    if (count($scores) > 0) {
                        $ueAverages[$name] = round(array_sum($scores) / count($scores), 2);
                    }
                }

                $timeline[] = [
                    'annee_id' => $yId,
                    'annee_nom' => $oy['nom'],
                    'year_inscr' => (int)$oy['year_inscr'],
                    'average' => $promoAvg,
                    'median' => $promoMedian,
                    'stddev' => $promoStdDev,
                    'min' => $promoMin,
                    'max' => $promoMax,
                    'admis_rate' => $admisRate,
                    'bccs' => $bccAverages,
                    'ues' => $ueAverages
                ];
            }

            echo json_encode([
                "success" => true,
                "data" => [
                    "timeline" => $timeline,
                    "all_bcc_names" => $allBccNames,
                    "all_ue_names" => $allUeNames
                ]
            ]);
        }
        else {
            $sql = "
                SELECT ec.nom, 
                       AVG(CASE WHEN n.statut IN ('ABI', 'DEF') THEN 0.0 WHEN n.statut = 'ABJ' THEN NULL ELSE n.valeur END) as moyenne, 
                       COUNT(n.id) as nb_notes 
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
