<?php
declare(strict_types=1);

namespace App\Utils;

class AcademicLogic {
    /**
     * Calcule le statut de validation annuel.
     */
    public static function calculateYearValidation(array $annualBccAverages, array $rules): string {
        $nbBccSousSeuil = 0;
        $allBccAboveMin = true;
        $hasIncomplete = false;
        $hasDef = false;

        if (empty($annualBccAverages)) return 'INCOMPLET';

        foreach ($annualBccAverages as $moy) {
            if ($moy === 'DEF') {
                $hasDef = true;
                continue;
            }
            if ($moy === null) {
                $hasIncomplete = true;
                continue;
            }
            
            $moyVal = (float)$moy;
            if ($moyVal < (float)$rules['seuil_validation_bcc']) {
                $nbBccSousSeuil++;
                if ($moyVal < (float)$rules['seuil_minimal_annuel']) {
                    $allBccAboveMin = false;
                }
            }
        }

        if ($hasDef) return 'DÉFAILLANT';
        if ($hasIncomplete) return 'INCOMPLET';
        
        if ($allBccAboveMin && $nbBccSousSeuil <= (int)$rules['nb_bcc_autorises_sous_seuil']) {
            return 'ADMIS';
        }
        
        return 'AJOURNÉ';
    }

    /**
     * Calcule la moyenne d'un BCC annuel à partir de ses jumeaux.
     * Peut retourner un float, null, ou la chaîne 'DEF'.
     *
     * @param float|string|null $m1
     * @param float|string|null $m2
     * @return float|string|null
     */
    public static function calculateAnnualBccAverage($m1, $m2) {
        if ($m1 === 'DEF' || $m2 === 'DEF') return 'DEF';
        
        $val1 = ($m1 !== null) ? (float)$m1 : null;
        $val2 = ($m2 !== null) ? (float)$m2 : null;
        
        if ($val1 !== null && $val2 !== null) return round(($val1 + $val2) / 2, 2);
        if ($val1 !== null) return $val1;
        if ($val2 !== null) return $val2;
        return null;
    }

    public static function isSameYearType(string $name1, string $name2): bool {
        $clean = function(string $s) {
            $s = mb_strtolower($s, 'UTF-8');
            // Enlever les accents
            $utf8 = [
                '/[áàâãäå]/u' => 'a',
                '/[ç]/u' => 'c',
                '/[éèêë]/u' => 'e',
                '/[íìîï]/u' => 'i',
                '/[ñ]/u' => 'n',
                '/[óòôõöø]/u' => 'o',
                '/[úùûü]/u' => 'u',
                '/[ýÿ]/u' => 'y',
            ];
            $s = preg_replace(array_keys($utf8), array_values($utf8), $s);
            // Enlever les années comme 2024, 2025, 2026, 2024-2025, 2024/2025
            $s = preg_replace('/\b\d{4}([-\/\:\.]\d{2,4})?\b/', '', $s);
            // Enlever les suffixes courants
            $s = preg_replace('/\b(copie|copy|promo|promotion|annee|semestre|jury)\b/u', '', $s);
            // Nettoyer les caractères spéciaux et espaces
            $s = preg_replace('/[^a-z0-9]/', '', $s);
            return trim($s);
        };
        return $clean($name1) === $clean($name2);
    }

    public static function calculateStudentAverageAndStatus(int $studentId, int $anneeId, \PDO $pdo): array {
        $stmtRules = $pdo->prepare("SELECT * FROM regles_validation WHERE annee_id = ?");
        $stmtRules->execute([$anneeId]);
        $rules = $stmtRules->fetch(\PDO::FETCH_ASSOC) ?: [
            'seuil_validation_bcc' => 10.0,
            'nb_bcc_autorises_sous_seuil' => 1,
            'seuil_minimal_annuel' => 9.0
        ];

        $sqlStructure = "
            SELECT s.id as semestre_id, b.id as bcc_id, b.bcc_annuel_lie_id,
                   u.id as ue_id, u.coefficient as ue_coeff, ec.id as ecue_id
            FROM semestres s
            JOIN bcc b ON s.id = b.semestre_id
            JOIN ue u ON b.id = u.bcc_id
            JOIN ecue ec ON u.id = ec.ue_id
            WHERE s.annee_id = ?
        ";
        $stmt = $pdo->prepare($sqlStructure);
        $stmt->execute([$anneeId]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        if (empty($rows)) {
            return ['average' => null, 'status' => 'INCOMPLET'];
        }

        $semesters = [];
        $bccs = [];
        $ecueIds = [];
        foreach ($rows as $row) {
            $ecueIds[] = (int)$row['ecue_id'];
            $semesters[(int)$row['semestre_id']] = true;
            if (!isset($bccs[(int)$row['bcc_id']])) {
                $bccs[(int)$row['bcc_id']] = [
                    'id' => (int)$row['bcc_id'],
                    'twin_id' => $row['bcc_annuel_lie_id'] ? (int)$row['bcc_annuel_lie_id'] : null,
                    'semestre_id' => (int)$row['semestre_id'],
                    'ues' => []
                ];
            }
            if (!isset($bccs[(int)$row['bcc_id']]['ues'][(int)$row['ue_id']])) {
                $bccs[(int)$row['bcc_id']]['ues'][(int)$row['ue_id']] = [
                    'id' => (int)$row['ue_id'],
                    'coeff' => (float)$row['ue_coeff'],
                    'ecues' => []
                ];
            }
            $bccs[(int)$row['bcc_id']]['ues'][(int)$row['ue_id']]['ecues'][] = (int)$row['ecue_id'];
        }

        $semesterIds = array_keys($semesters);

        $notesMap = [];
        if (!empty($ecueIds)) {
            $placeholders = implode(',', array_fill(0, count($ecueIds), '?'));
            $stmtNotes = $pdo->prepare("SELECT ecue_id, valeur, statut FROM notes WHERE etudiant_id = ? AND ecue_id IN ($placeholders)");
            $params = array_merge([$studentId], $ecueIds);
            $stmtNotes->execute($params);
            foreach ($stmtNotes->fetchAll(\PDO::FETCH_ASSOC) as $n) {
                $notesMap[(int)$n['ecue_id']] = [
                    'valeur' => $n['valeur'] !== null ? (float)$n['valeur'] : null,
                    'statut' => $n['statut']
                ];
            }
        }

        $juryPointsMap = [];
        if (!empty($semesterIds)) {
            $placeholders = implode(',', array_fill(0, count($semesterIds), '?'));
            $stmtJury = $pdo->prepare("SELECT element_type, element_id, points, semestre_id FROM notes_jury WHERE etudiant_id = ? AND semestre_id IN ($placeholders)");
            $params = array_merge([$studentId], $semesterIds);
            $stmtJury->execute($params);
            foreach ($stmtJury->fetchAll(\PDO::FETCH_ASSOC) as $j) {
                $juryPointsMap[(int)$j['semestre_id']][$j['element_type']][(int)$j['element_id']] = (float)$j['points'];
            }
        }

        $bonusMalusMap = [];
        if (!empty($semesterIds)) {
            $placeholders = implode(',', array_fill(0, count($semesterIds), '?'));
            $stmtBM = $pdo->prepare("SELECT semestre_id, bonus, malus FROM notes_bonus_malus WHERE etudiant_id = ? AND semestre_id IN ($placeholders)");
            $params = array_merge([$studentId], $semesterIds);
            $stmtBM->execute($params);
            foreach ($stmtBM->fetchAll(\PDO::FETCH_ASSOC) as $bm) {
                $bonusMalusMap[(int)$bm['semestre_id']] = [
                    'bonus' => $bm['bonus'] !== null ? (float)$bm['bonus'] : 0.0,
                    'malus' => $bm['malus'] !== null ? (float)$bm['malus'] : 0.0
                ];
            }
        }

        $semestersJuryState = [];
        if (!empty($semesterIds)) {
            $placeholders = implode(',', array_fill(0, count($semesterIds), '?'));
            $stmtSemState = $pdo->prepare("SELECT id, jury_valide FROM semestres WHERE id IN ($placeholders)");
            $stmtSemState->execute($semesterIds);
            foreach ($stmtSemState->fetchAll(\PDO::FETCH_ASSOC) as $sem) {
                $semestersJuryState[(int)$sem['id']] = (int)$sem['jury_valide'];
            }
        }

        $ueAverages = [];
        foreach ($bccs as $bccId => $bcc) {
            $semId = $bcc['semestre_id'];
            $isJuryValide = isset($semestersJuryState[$semId]) && $semestersJuryState[$semId] === 1;

            foreach ($bcc['ues'] as $ueId => $ue) {
                $ueSum = 0; $ueCount = 0;
                $ueDef = false;
                foreach ($ue['ecues'] as $ecueId) {
                    if (isset($notesMap[$ecueId])) {
                        $n = $notesMap[$ecueId];
                        if ($n['statut'] !== null) {
                            if ($n['statut'] === 'DEF') {
                                $ueDef = true;
                            } elseif ($n['statut'] === 'ABI') {
                                $ueSum += 0.0;
                                $ueCount++;
                            }
                        } else {
                            $val = (float)$n['valeur'];
                            if ($isJuryValide) {
                                $pts = $juryPointsMap[$semId]['ecue'][$ecueId] ?? 0.0;
                                $val = min(20.0, $val + $pts);
                            }
                            $ueSum += $val;
                            $ueCount++;
                        }
                    }
                }

                if ($ueDef) {
                    $ueAverages[$ueId] = 'DEF';
                } elseif ($ueCount > 0) {
                    $moyUe = round($ueSum / $ueCount, 2);
                    if ($isJuryValide) {
                        $ptsUe = $juryPointsMap[$semId]['ue'][$ueId] ?? 0.0;
                        $moyUe = min(20.0, $moyUe + $ptsUe);
                    }
                    $ueAverages[$ueId] = $moyUe;
                } else {
                    $ueAverages[$ueId] = null;
                }
            }
        }

        $bccAverages = [];
        foreach ($bccs as $bccId => $bcc) {
            $bccSum = 0; $bccCoeff = 0;
            $bccDef = false;
            $semId = $bcc['semestre_id'];
            $isJuryValide = isset($semestersJuryState[$semId]) && $semestersJuryState[$semId] === 1;

            foreach ($bcc['ues'] as $ueId => $ue) {
                if (isset($ueAverages[$ueId])) {
                    if ($ueAverages[$ueId] === 'DEF') {
                        $bccDef = true;
                    } elseif ($ueAverages[$ueId] !== null) {
                        $bccSum += ($ueAverages[$ueId] * $ue['coeff']);
                        $bccCoeff += $ue['coeff'];
                    }
                }
            }

            if ($bccDef) {
                $bccAverages[$bccId] = 'DEF';
            } else {
                $bccAvgCalculated = ($bccCoeff > 0) ? ($bccSum / $bccCoeff) : null;
                if ($bccAvgCalculated !== null) {
                    $bonus = $bonusMalusMap[$semId]['bonus'] ?? 0.0;
                    $malus = $bonusMalusMap[$semId]['malus'] ?? 0.0;
                    $avg = max(0.0, min(20.0, $bccAvgCalculated + $bonus - $malus));
                    if ($isJuryValide) {
                        $ptsBcc = $juryPointsMap[$semId]['bcc'][$bccId] ?? 0.0;
                        $avg = min(20.0, $avg + $ptsBcc);
                    }
                    $bccAverages[$bccId] = round($avg, 2);
                } else {
                    $bccAverages[$bccId] = null;
                }
            }
        }

        $annualBccs = [];
        $processedIds = [];
        foreach ($bccs as $bccId => $bcc) {
            if (in_array($bccId, $processedIds)) continue;
            
            $twinId = $bcc['twin_id'];
            $processedIds[] = $bccId;
            if ($twinId) {
                $processedIds[] = $twinId;
            }

            // Gather all UEs for this annual BCC (from both twin BCCs)
            $annualUes = $bcc['ues'];
            if ($twinId && isset($bccs[$twinId])) {
                foreach ($bccs[$twinId]['ues'] as $ueId => $ue) {
                    $annualUes[$ueId] = $ue;
                }
            }

            $annualBccSum = 0;
            $annualBccCoeff = 0;
            $isDef = false;

            foreach ($annualUes as $ueId => $ue) {
                if (isset($ueAverages[$ueId])) {
                    if ($ueAverages[$ueId] === 'DEF') {
                        $isDef = true;
                    } elseif ($ueAverages[$ueId] !== null) {
                        $annualBccSum += ($ueAverages[$ueId] * $ue['coeff']);
                        $annualBccCoeff += $ue['coeff'];
                    }
                }
            }

            if ($isDef) {
                $moyAnnuelle = 'DEF';
            } elseif ($annualBccCoeff > 0) {
                $moyAnnuelle = round($annualBccSum / $annualBccCoeff, 2);
            } else {
                $moyAnnuelle = null;
            }

            $annualBccs[] = $moyAnnuelle;
        }

        $totalStudentUeSum = 0;
        $totalStudentUeCoeff = 0;
        $studentDef = false;
        $processedUeIds = [];

        foreach ($bccs as $bccId => $bcc) {
            foreach ($bcc['ues'] as $ueId => $ue) {
                if (in_array($ueId, $processedUeIds)) continue;
                $processedUeIds[] = $ueId;

                $ueVal = $ueAverages[$ueId] ?? null;
                if ($ueVal === 'DEF') {
                    $studentDef = true;
                } elseif ($ueVal !== null) {
                    $totalStudentUeSum += ((float)$ueVal * $ue['coeff']);
                    $totalStudentUeCoeff += $ue['coeff'];
                }
            }
        }

        if ($studentDef) {
            $average = 'DEF';
        } elseif ($totalStudentUeCoeff > 0) {
            $average = round($totalStudentUeSum / $totalStudentUeCoeff, 2);
        } else {
            $average = null;
        }

        $status = self::calculateYearValidation($annualBccs, $rules);

        return [
            'average' => $average,
            'status' => $status
        ];
    }

    public static function getValidatedEcueIdsFromPreviousYear(string $email, int $targetAnneeId, \PDO $pdo): array {
        $stmtTarget = $pdo->prepare("SELECT nom FROM annees WHERE id = ?");
        $stmtTarget->execute([$targetAnneeId]);
        $targetName = $stmtTarget->fetchColumn() ?: '';

        $stmtPrev = $pdo->prepare("
            SELECT e.id, e.annee_id, a.nom as annee_nom 
            FROM etudiants e 
            JOIN annees a ON e.annee_id = a.id 
            WHERE e.email = ? AND e.annee_id != ? 
            ORDER BY e.annee_inscription DESC, e.id DESC
        ");
        $stmtPrev->execute([$email, $targetAnneeId]);
        $prevRegistrations = $stmtPrev->fetchAll(\PDO::FETCH_ASSOC);

        $matchingPrev = null;
        foreach ($prevRegistrations as $prev) {
            if (self::isSameYearType($prev['annee_nom'], $targetName)) {
                $matchingPrev = $prev;
                break;
            }
        }
        if (!$matchingPrev) return [];

        $oldStudentId = (int)$matchingPrev['id'];
        $oldAnneeId = (int)$matchingPrev['annee_id'];

        $sqlOldStructure = "
            SELECT u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff,
                   ec.id as ecue_id, ec.nom as ecue_nom,
                   s.id as semestre_id, s.jury_valide
            FROM semestres s
            JOIN bcc b ON s.id = b.semestre_id
            JOIN ue u ON b.id = u.bcc_id
            JOIN ecue ec ON u.id = ec.ue_id
            WHERE s.annee_id = ?
        ";
        $stmt = $pdo->prepare($sqlOldStructure);
        $stmt->execute([$oldAnneeId]);
        $oldRows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        if (empty($oldRows)) return [];

        $oldEcues = [];
        foreach ($oldRows as $r) {
            $oldEcues[] = (int)$r['ecue_id'];
        }

        $oldNotes = [];
        if (!empty($oldEcues)) {
            $placeholders = implode(',', array_fill(0, count($oldEcues), '?'));
            $stmtNotes = $pdo->prepare("SELECT ecue_id, valeur, statut FROM notes WHERE etudiant_id = ? AND ecue_id IN ($placeholders)");
            $stmtNotes->execute(array_merge([$oldStudentId], $oldEcues));
            foreach ($stmtNotes->fetchAll(\PDO::FETCH_ASSOC) as $n) {
                $oldNotes[(int)$n['ecue_id']] = [
                    'valeur' => $n['valeur'] !== null ? (float)$n['valeur'] : null,
                    'statut' => $n['statut']
                ];
            }
        }

        $oldSemesters = array_unique(array_column($oldRows, 'semestre_id'));
        $oldJuryPoints = [];
        if (!empty($oldSemesters)) {
            $placeholders = implode(',', array_fill(0, count($oldSemesters), '?'));
            $stmtJury = $pdo->prepare("SELECT element_type, element_id, points, semestre_id FROM notes_jury WHERE etudiant_id = ? AND semestre_id IN ($placeholders)");
            $stmtJury->execute(array_merge([$oldStudentId], $oldSemesters));
            foreach ($stmtJury->fetchAll(\PDO::FETCH_ASSOC) as $j) {
                $oldJuryPoints[(int)$j['semestre_id']][$j['element_type']][(int)$j['element_id']] = (float)$j['points'];
            }
        }

        $oldUes = [];
        foreach ($oldRows as $r) {
            $ueId = (int)$r['ue_id'];
            if (!isset($oldUes[$ueId])) {
                $oldUes[$ueId] = [
                    'id' => $ueId,
                    'nom' => $r['ue_nom'],
                    'coeff' => (float)$r['ue_coeff'],
                    'semestre_id' => (int)$r['semestre_id'],
                    'jury_valide' => (int)$r['jury_valide'],
                    'ecues' => []
                ];
            }
            $oldUes[$ueId]['ecues'][] = [
                'id' => (int)$r['ecue_id'],
                'nom' => $r['ecue_nom']
            ];
        }

        $validatedUeNames = [];
        foreach ($oldUes as $ueId => $ue) {
            $ueSum = 0; $ueCount = 0;
            $ueDef = false;
            $isJuryValide = ($ue['jury_valide'] === 1);
            $semId = $ue['semestre_id'];

            foreach ($ue['ecues'] as $ec) {
                $ecId = $ec['id'];
                $valeur = null; $statut = null;
                if (isset($oldNotes[$ecId])) {
                    $valeur = $oldNotes[$ecId]['valeur'];
                    $statut = $oldNotes[$ecId]['statut'];
                }

                if ($statut !== null) {
                    if ($statut === 'DEF') {
                        $ueDef = true;
                    } elseif ($statut === 'ABI') {
                        $ueSum += 0.0;
                        $ueCount++;
                    }
                } else {
                    if ($valeur !== null) {
                        $val = $valeur;
                        if ($isJuryValide) {
                            $pts = $oldJuryPoints[$semId]['ecue'][$ecId] ?? 0.0;
                            $val = min(20.0, $val + $pts);
                        }
                        $ueSum += $val;
                        $ueCount++;
                    }
                }
            }

            $ueAverage = null;
            if (!$ueDef && $ueCount > 0) {
                $ueAverage = round($ueSum / $ueCount, 2);
                if ($isJuryValide) {
                    $ptsUe = $oldJuryPoints[$semId]['ue'][$ueId] ?? 0.0;
                    $ueAverage = min(20.0, $ueAverage + $ptsUe);
                }
            }

            if ($ueAverage !== null && $ueAverage >= 10.0) {
                $validatedUeNames[] = mb_strtolower(trim($ue['nom']), 'UTF-8');
            }
        }

        $sqlNewStructure = "
            SELECT u.nom as ue_nom, ec.id as ecue_id
            FROM semestres s
            JOIN bcc b ON s.id = b.semestre_id
            JOIN ue u ON b.id = u.bcc_id
            JOIN ecue ec ON u.id = ec.ue_id
            WHERE s.annee_id = ?
        ";
        $stmt = $pdo->prepare($sqlNewStructure);
        $stmt->execute([$targetAnneeId]);
        $newRows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $validatedEcueIds = [];
        foreach ($newRows as $newRow) {
            $ueNom = mb_strtolower(trim($newRow['ue_nom']), 'UTF-8');
            if (in_array($ueNom, $validatedUeNames)) {
                $validatedEcueIds[] = (int)$newRow['ecue_id'];
            }
        }

        return $validatedEcueIds;
    }

    public static function syncRepeatingStudentNotes(int $studentId, int $targetAnneeId, \PDO $pdo): int {
        $stmt = $pdo->prepare("SELECT email FROM etudiants WHERE id = ?");
        $stmt->execute([$studentId]);
        $email = $stmt->fetchColumn();
        if (!$email) return 0;

        $stmtTarget = $pdo->prepare("SELECT nom FROM annees WHERE id = ?");
        $stmtTarget->execute([$targetAnneeId]);
        $targetName = $stmtTarget->fetchColumn() ?: '';

        $stmtPrev = $pdo->prepare("
            SELECT e.id, e.annee_id, a.nom as annee_nom 
            FROM etudiants e 
            JOIN annees a ON e.annee_id = a.id 
            WHERE e.email = ? AND e.annee_id != ? 
            ORDER BY e.annee_inscription DESC, e.id DESC
        ");
        $stmtPrev->execute([$email, $targetAnneeId]);
        $prevRegistrations = $stmtPrev->fetchAll(\PDO::FETCH_ASSOC);

        $matchingPrev = null;
        foreach ($prevRegistrations as $prev) {
            if (self::isSameYearType($prev['annee_nom'], $targetName)) {
                $matchingPrev = $prev;
                break;
            }
        }
        if (!$matchingPrev) return 0;

        $oldStudentId = (int)$matchingPrev['id'];
        $oldAnneeId = (int)$matchingPrev['annee_id'];

        $sqlOldStructure = "
            SELECT u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff,
                   ec.id as ecue_id, ec.nom as ecue_nom,
                   s.id as semestre_id, s.jury_valide
            FROM semestres s
            JOIN bcc b ON s.id = b.semestre_id
            JOIN ue u ON b.id = u.bcc_id
            JOIN ecue ec ON u.id = ec.ue_id
            WHERE s.annee_id = ?
        ";
        $stmt = $pdo->prepare($sqlOldStructure);
        $stmt->execute([$oldAnneeId]);
        $oldRows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        if (empty($oldRows)) return 0;

        $oldEcues = [];
        foreach ($oldRows as $r) {
            $oldEcues[] = (int)$r['ecue_id'];
        }

        $oldNotes = [];
        if (!empty($oldEcues)) {
            $placeholders = implode(',', array_fill(0, count($oldEcues), '?'));
            $stmtNotes = $pdo->prepare("SELECT ecue_id, valeur, statut FROM notes WHERE etudiant_id = ? AND ecue_id IN ($placeholders)");
            $stmtNotes->execute(array_merge([$oldStudentId], $oldEcues));
            foreach ($stmtNotes->fetchAll(\PDO::FETCH_ASSOC) as $n) {
                $oldNotes[(int)$n['ecue_id']] = [
                    'valeur' => $n['valeur'] !== null ? (float)$n['valeur'] : null,
                    'statut' => $n['statut']
                ];
            }
        }

        $oldSemesters = array_unique(array_column($oldRows, 'semestre_id'));
        $oldJuryPoints = [];
        if (!empty($oldSemesters)) {
            $placeholders = implode(',', array_fill(0, count($oldSemesters), '?'));
            $stmtJury = $pdo->prepare("SELECT element_type, element_id, points, semestre_id FROM notes_jury WHERE etudiant_id = ? AND semestre_id IN ($placeholders)");
            $stmtJury->execute(array_merge([$oldStudentId], $oldSemesters));
            foreach ($stmtJury->fetchAll(\PDO::FETCH_ASSOC) as $j) {
                $oldJuryPoints[(int)$j['semestre_id']][$j['element_type']][(int)$j['element_id']] = (float)$j['points'];
            }
        }

        $oldUes = [];
        foreach ($oldRows as $r) {
            $ueId = (int)$r['ue_id'];
            if (!isset($oldUes[$ueId])) {
                $oldUes[$ueId] = [
                    'id' => $ueId,
                    'nom' => $r['ue_nom'],
                    'coeff' => (float)$r['ue_coeff'],
                    'semestre_id' => (int)$r['semestre_id'],
                    'jury_valide' => (int)$r['jury_valide'],
                    'ecues' => []
                ];
            }
            $oldUes[$ueId]['ecues'][] = [
                'id' => (int)$r['ecue_id'],
                'nom' => $r['ecue_nom']
            ];
        }

        $validatedUeNames = [];
        $oldEcueGradesByName = [];
        foreach ($oldUes as $ueId => $ue) {
            $ueSum = 0; $ueCount = 0;
            $ueDef = false;
            $isJuryValide = ($ue['jury_valide'] === 1);
            $semId = $ue['semestre_id'];

            foreach ($ue['ecues'] as $ec) {
                $ecId = $ec['id'];
                $valeur = null; $statut = null;
                if (isset($oldNotes[$ecId])) {
                    $valeur = $oldNotes[$ecId]['valeur'];
                    $statut = $oldNotes[$ecId]['statut'];
                }

                $oldEcueGradesByName[mb_strtolower(trim($ec['nom']), 'UTF-8')] = [
                    'valeur' => $valeur,
                    'statut' => $statut,
                    'ue_validated' => false
                ];

                if ($statut !== null) {
                    if ($statut === 'DEF') {
                        $ueDef = true;
                    } elseif ($statut === 'ABI') {
                        $ueSum += 0.0;
                        $ueCount++;
                    }
                } else {
                    if ($valeur !== null) {
                        $val = $valeur;
                        if ($isJuryValide) {
                            $pts = $oldJuryPoints[$semId]['ecue'][$ecId] ?? 0.0;
                            $val = min(20.0, $val + $pts);
                        }
                        $ueSum += $val;
                        $ueCount++;
                    }
                }
            }

            $ueAverage = null;
            if (!$ueDef && $ueCount > 0) {
                $ueAverage = round($ueSum / $ueCount, 2);
                if ($isJuryValide) {
                    $ptsUe = $oldJuryPoints[$semId]['ue'][$ueId] ?? 0.0;
                    $ueAverage = min(20.0, $ueAverage + $ptsUe);
                }
            }

            $isValidated = ($ueAverage !== null && $ueAverage >= 10.0);
            if ($isValidated) {
                $validatedUeNames[] = mb_strtolower(trim($ue['nom']), 'UTF-8');
            }

            foreach ($ue['ecues'] as $ec) {
                $ecNameKey = mb_strtolower(trim($ec['nom']), 'UTF-8');
                if (isset($oldEcueGradesByName[$ecNameKey])) {
                    $oldEcueGradesByName[$ecNameKey]['ue_validated'] = $isValidated;
                }
            }
        }

        $sqlNewStructure = "
            SELECT u.id as ue_id, u.nom as ue_nom, ec.id as ecue_id, ec.nom as ecue_nom
            FROM semestres s
            JOIN bcc b ON s.id = b.semestre_id
            JOIN ue u ON b.id = u.bcc_id
            JOIN ecue ec ON u.id = ec.ue_id
            WHERE s.annee_id = ?
        ";
        $stmt = $pdo->prepare($sqlNewStructure);
        $stmt->execute([$targetAnneeId]);
        $newRows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $stmtInsertNewNote = $pdo->prepare("
            INSERT INTO notes (etudiant_id, ecue_id, valeur, statut) 
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), statut = VALUES(statut)
        ");

        $copiedCount = 0;
        foreach ($newRows as $newRow) {
            $newEcueId = (int)$newRow['ecue_id'];
            $newEcueNom = mb_strtolower(trim($newRow['ecue_nom']), 'UTF-8');

            if (isset($oldEcueGradesByName[$newEcueNom])) {
                $oldGrade = $oldEcueGradesByName[$newEcueNom];
                $oldVal = $oldGrade['valeur'];
                $oldStat = $oldGrade['statut'];

                if ($oldVal === null && $oldStat === null) {
                    continue;
                }

                // Copy ONLY if the parent UE of the old ECUE was validated
                if ($oldGrade['ue_validated']) {
                    $stmtInsertNewNote->execute([$studentId, $newEcueId, $oldVal, $oldStat]);
                    $copiedCount++;
                }
            }
        }

        return $copiedCount;
    }
}

