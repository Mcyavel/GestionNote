<?php
declare(strict_types=1);

/**
 * API Grades - Gestion des notes, imports Apogée et saisie de statuts
 */

global $pdo;

if (!function_exists('requirePermission')) {
    require_once __DIR__ . '/auth.php';
}

$method = $_SERVER['REQUEST_METHOD'] ?? (getenv('REQUEST_METHOD') ?: 'GET');

/**
 * Récupère les notes d'un étudiant ou pour un ECUE spécifique
 */
if ($method === 'GET') {
    $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : null;
    $ecueIdStr = isset($_GET['ecue_id']) ? $_GET['ecue_id'] : null;

    try {
        if ($ecueIdStr) {
            if (preg_match('/^(bonus|malus)_(\d+)$/', (string)$ecueIdStr, $matches)) {
                $type = $matches[1];
                $semestreId = (int)$matches[2];

                $sqlAnnee = "SELECT annee_id FROM semestres WHERE id = ?";
                $stmtAnnee = $pdo->prepare($sqlAnnee);
                $stmtAnnee->execute([$semestreId]);
                $anneeId = $stmtAnnee->fetchColumn();
                if (!$anneeId) { echo json_encode(["success" => true, "data" => []]); exit(); }

                $stmt = $pdo->prepare("
                    SELECT e.id as student_id, e.nom, e.prenom, e.email, bm.{$type} as valeur, bm.id as note_id
                    FROM etudiants e
                    LEFT JOIN notes_bonus_malus bm ON e.id = bm.etudiant_id AND bm.semestre_id = ?
                    WHERE e.annee_id = ?
                    ORDER BY e.nom ASC, e.prenom ASC
                ");
                $stmt->execute([$semestreId, $anneeId]);
                $data = $stmt->fetchAll();
            } else {
                $ecueId = (int)$ecueIdStr;
                $sqlAnnee = "
                    SELECT s.annee_id 
                    FROM ecue ec
                    JOIN ue u ON ec.ue_id = u.id
                    JOIN bcc b ON u.bcc_id = b.id
                    JOIN semestres s ON b.semestre_id = s.id
                    WHERE ec.id = ?
                ";
                $stmtAnnee = $pdo->prepare($sqlAnnee);
                $stmtAnnee->execute([$ecueId]);
                $anneeId = $stmtAnnee->fetchColumn();
                if (!$anneeId) { echo json_encode(["success" => true, "data" => []]); exit(); }

                $stmt = $pdo->prepare("
                    SELECT e.id as student_id, e.nom, e.prenom, e.email, COALESCE(n.statut, n.valeur) as valeur, n.id as note_id
                    FROM etudiants e
                    LEFT JOIN notes n ON e.id = n.etudiant_id AND n.ecue_id = ?
                    WHERE e.annee_id = ?
                    ORDER BY e.nom ASC, e.prenom ASC
                ");
                $stmt->execute([$ecueId, $anneeId]);
                $data = $stmt->fetchAll();
            }
        } elseif ($studentId) {
            $sql = "
                SELECT a.nom as annee_nom, s.nom as semestre_nom, b.id as bcc_id, b.nom as bcc_nom, 
                       u.id as ue_id, u.nom as ue_nom, u.coefficient as ue_coeff,
                       ec.id as ecue_id, ec.nom as ecue_nom, ec.credits as ecue_credits,
                       COALESCE(n.statut, n.valeur) as note
                FROM ecue ec
                JOIN ue u ON ec.ue_id = u.id
                JOIN bcc b ON u.bcc_id = b.id
                JOIN semestres s ON b.semestre_id = s.id
                JOIN annees a ON s.annee_id = a.id
                LEFT JOIN notes n ON ec.id = n.ecue_id AND n.etudiant_id = ?
                WHERE a.id = (SELECT annee_id FROM etudiants WHERE id = ?)
                ORDER BY s.id, b.id, u.id, ec.id
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$studentId, $studentId]);
            $data = $stmt->fetchAll();
        } else {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Paramètres manquants"]);
            exit();
        }
        echo json_encode(["success" => true, "data" => $data]);
    } catch (Exception $e) {
        http_response_code(500);
        error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
    }
    exit();
}

/**
 * Sauvegarde ou IMPORT de notes
 */
if ($method === 'POST') {
    $stream = (php_sapi_name() === 'cli') ? 'php://stdin' : 'php://input';
    $input = json_decode(file_get_contents($stream) ?: '', true);
    if ((empty($input) || !is_array($input)) && isset($GLOBALS['MOCK_INPUT'])) {
        $input = $GLOBALS['MOCK_INPUT'];
    }
    if (!$input) { http_response_code(400); exit(); }

    $action = $input['action'] ?? 'save';

    if ($action === 'import_apogee') {
        $rawData = $input['data'] ?? [];
        if (empty($rawData)) {
            echo json_encode(["success" => false, "error" => "Données vides"]);
            exit();
        }

        // Normalisation pour recherche robuste d'étudiants (sans casse ni accents ni caractères spéciaux)
        $normalizeName = function(string $str): string {
            $str = mb_strtolower(trim($str), 'UTF-8');
            $utf8 = [
                '/[áàâãäå]/u' => 'a',
                '/[æ]/u' => 'ae',
                '/[ç]/u' => 'c',
                '/[éèêë]/u' => 'e',
                '/[íìîï]/u' => 'i',
                '/[ñ]/u' => 'n',
                '/[óòôõöø]/u' => 'o',
                '/[œ]/u' => 'oe',
                '/[úùûü]/u' => 'u',
                '/[ýÿ]/u' => 'y',
                '/[^a-z0-9]/u' => ''
            ];
            return preg_replace(array_keys($utf8), array_values($utf8), $str);
        };

        // Algorithme d'appariement sémantique pour ECUEs
        $matchEcueName = function(string $elpName, array $dbEcues) {
            $cleanElp = trim($elpName);
            if (preg_match('/^[A-Z0-9]+\s*-\s*(.*)$/u', $cleanElp, $matches)) {
                $cleanElp = trim($matches[1]);
            }
            $cleanElpLower = mb_strtolower($cleanElp);
            
            // 1. Correspondance exacte
            foreach ($dbEcues as $ecue) {
                $ecNameLower = mb_strtolower(trim($ecue['ecue_nom']));
                if ($ecNameLower === $cleanElpLower) {
                    return (int)$ecue['id'];
                }
            }
            
            // 2. Correspondance d'acronyme (ex: POO -> Programmation orientée objet)
            foreach ($dbEcues as $ecue) {
                $ecName = trim($ecue['ecue_nom']);
                $words = preg_split('/[\s\-\']+/u', $ecName);
                $acronym = '';
                foreach ($words as $w) {
                    if (mb_strlen($w) > 0) {
                        $lw = mb_strtolower($w);
                        if (in_array($lw, ['de', 'des', 'en', 'pour', 'le', 'la', 'les', 'et', 'd', 'l'])) {
                            continue;
                        }
                        $acronym .= mb_substr($w, 0, 1);
                    }
                }
                if (mb_strlen($acronym) > 1 && mb_strtolower($acronym) === $cleanElpLower) {
                    return (int)$ecue['id'];
                }
            }
            
            // 3. Abréviations courantes et préfixes
            foreach ($dbEcues as $ecue) {
                $ecName = mb_strtolower(trim($ecue['ecue_nom']));
                $elpTokens = preg_split('/[\s\-\'\.\&\+\,]+/u', $cleanElpLower, -1, PREG_SPLIT_NO_EMPTY);
                $ecTokens = preg_split('/[\s\-\'\.\&\+\,]+/u', $ecName, -1, PREG_SPLIT_NO_EMPTY);
                
                $stopwords = ['de', 'des', 'en', 'pour', 'le', 'la', 'les', 'et', 'd', 'l', 'un', 'une'];
                $elpTokens = array_values(array_filter($elpTokens, function($t) use ($stopwords) { return !in_array($t, $stopwords); }));
                $ecTokens = array_values(array_filter($ecTokens, function($t) use ($stopwords) { return !in_array($t, $stopwords); }));
                
                $elpTokensTranslated = array_map(function($t) {
                    if ($t === 'bdr') return 'base';
                    if ($t === 'av') return 'avanc';
                    if ($t === 'gest') return 'gestion';
                    if ($t === 'fi') return 'financ';
                    if ($t === 'proj') return 'projet';
                    if ($t === 'entre') return 'entreprise';
                    if ($t === 'expl') return 'exploit';
                    if ($t === 'don') return 'donn';
                    if ($t === 'donn') return 'donn';
                    if ($t === 'tech') return 'techniq';
                    if ($t === 'an') return 'analys';
                    if ($t === 'ingé') return 'ingénier';
                    return $t;
                }, $elpTokens);

                $matchedCount = 0;
                foreach ($elpTokensTranslated as $et) {
                    foreach ($ecTokens as $ect) {
                        if (mb_strpos($ect, $et) === 0 || mb_strpos($et, $ect) === 0) {
                            $matchedCount++;
                            break;
                        }
                    }
                }
                
                if (count($elpTokens) > 0 && $matchedCount >= count($elpTokens) * 0.7) {
                    return (int)$ecue['id'];
                }
            }
            
            // 4. Sous-chaîne
            foreach ($dbEcues as $ecue) {
                $ecName = mb_strtolower(trim($ecue['ecue_nom']));
                if (mb_strpos($ecName, $cleanElpLower) !== false || mb_strpos($cleanElpLower, $ecName) !== false) {
                    return (int)$ecue['id'];
                }
            }

            // 5. Distance de Levenshtein
            $bestScore = 999;
            $bestId = null;
            foreach ($dbEcues as $ecue) {
                $ecName = mb_strtolower(trim($ecue['ecue_nom']));
                $score = levenshtein($cleanElpLower, $ecName);
                if ($score < $bestScore && $score < 8) {
                    $bestScore = $score;
                    $bestId = (int)$ecue['id'];
                }
            }
            return $bestId;
        };

        try {
            // Détection des lignes structurelles
            $typeRow = null;
            $elpRow = null;
            $studentHeaderRow = null;
            $studentStartIdx = null;

            foreach ($rawData as $idx => $row) {
                if (empty($row)) continue;
                if (isset($row[0]) && trim((string)$row[0]) === 'Type Rés.') {
                    $typeRow = $row;
                }
                if ($typeRow !== null && $elpRow === null && $idx === array_search($typeRow, $rawData) + 1) {
                    $elpRow = $row;
                }
                if (isset($row[0], $row[1]) && trim((string)$row[0]) === 'Numéro' && trim((string)$row[1]) === 'Nom') {
                    $studentHeaderRow = $row;
                    $studentStartIdx = $idx + 1;
                }
            }

            if (!$typeRow || !$elpRow || !$studentHeaderRow || $studentStartIdx === null) {
                throw new Exception("Structure de fichier Apogée invalide (Type Rés., ELP ou lignes d'étudiants manquants).");
            }

            // Extraction des colonnes de notes
            $currentElp = '';
            $noteColumns = [];
            for ($col = 0; $col < max(count($typeRow), count($elpRow)); $col++) {
                if (!empty($elpRow[$col])) {
                    $currentElp = trim((string)$elpRow[$col]);
                }
                $type = isset($typeRow[$col]) ? trim((string)$typeRow[$col]) : '';
                if ($type === 'N') {
                    $noteColumns[] = [
                        'index' => $col,
                        'elp' => $currentElp
                    ];
                }
            }

            if (empty($noteColumns)) {
                throw new Exception("Aucune colonne de notes ('N') détectée.");
            }

            // Helper de tokenisation triée pour une recherche ultra-robuste
            $getSortedTokens = function(string $nom, string $prenom): string {
                $str = mb_strtolower(trim($nom . ' ' . $prenom), 'UTF-8');
                $utf8 = [
                    '/[áàâãäå]/u' => 'a',
                    '/[æ]/u' => 'ae',
                    '/[ç]/u' => 'c',
                    '/[éèêë]/u' => 'e',
                    '/[íìîï]/u' => 'i',
                    '/[ñ]/u' => 'n',
                    '/[óòôõöø]/u' => 'o',
                    '/[œ]/u' => 'oe',
                    '/[úùûü]/u' => 'u',
                    '/[ýÿ]/u' => 'y',
                ];
                $str = preg_replace(array_keys($utf8), array_values($utf8), $str);
                $str = preg_replace('/[^a-z0-9 ]/u', ' ', $str);
                $words = preg_split('/\s+/u', $str, -1, PREG_SPLIT_NO_EMPTY);
                sort($words);
                return implode('|', $words);
            };

            // Chargement des étudiants en base
            $stmt = $pdo->query("SELECT id, nom, prenom, annee_id, email FROM etudiants");
            $dbStudents = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Indexation directe et par tokens triés
            $studentsMapDirect = [];
            $studentsMapTokens = [];

            foreach ($dbStudents as $s) {
                $keyDirect = $normalizeName($s['nom']) . '|' . $normalizeName($s['prenom'] ?? '');
                $studentsMapDirect[$keyDirect] = $s;

                $keyTokens = $getSortedTokens($s['nom'], $s['prenom'] ?? '');
                $studentsMapTokens[$keyTokens] = $s;
            }

            $fixMismatchedYears = isset($input['fix_mismatched_years']) ? (bool)$input['fix_mismatched_years'] : null;

            // 1. Déterminer l'année de formation cible
            $targetAnneeId = null;
            $stmtYears = $pdo->query("SELECT id, nom FROM annees");
            $dbYears = $stmtYears->fetchAll(PDO::FETCH_ASSOC);
            
            if (isset($rawData[2][1])) {
                $fileDesc = mb_strtolower((string)$rawData[2][1]);
                // Extraction de l'année à 4 chiffres si présente
                $fileYear = null;
                if (preg_match('/\b\d{4}\b/', $fileDesc, $m)) {
                    $fileYear = $m[0];
                }
                
                foreach ($dbYears as $y) {
                    $yName = mb_strtolower($y['nom']);
                    
                    // Si le fichier contient une année, s'assurer que le nom de l'année en BDD contient la même année
                    if ($fileYear !== null) {
                        if (strpos($yName, $fileYear) === false) {
                            continue;
                        }
                    }

                    if (strpos($yName, 'aix') !== false && strpos($fileDesc, 'aix') !== false) {
                        $targetAnneeId = (int)$y['id'];
                        break;
                    }
                    if ((strpos($yName, 'marseille') !== false || strpos($yName, 'mrs') !== false) && 
                        (strpos($fileDesc, 'mrs') !== false || strpos($fileDesc, 'marseille') !== false)) {
                        $targetAnneeId = (int)$y['id'];
                        break;
                    }
                }
            }

            if (!$targetAnneeId) {
                // Recherche de l'année cible à partir des étudiants existants
                $guessAnneeIds = [];
                for ($i = $studentStartIdx; $i < count($rawData); $i++) {
                    $row = $rawData[$i];
                    if (empty($row) || !isset($row[0]) || empty($row[0])) continue;
                    $numEtudiant = trim((string)$row[0]);
                    if (!preg_match('/^\d{8}$/', $numEtudiant)) continue;

                    $nom = isset($row[1]) ? trim((string)$row[1]) : '';
                    $prenom = isset($row[2]) ? trim((string)$row[2]) : '';
                    
                    $keyDirect = $normalizeName($nom) . '|' . $normalizeName($prenom);
                    $keyInverted = $normalizeName($prenom) . '|' . $normalizeName($nom);
                    $keyTokens = $getSortedTokens($nom, $prenom);

                    foreach ($dbStudents as $s) {
                        if (($keyDirect === ($normalizeName($s['nom']) . '|' . $normalizeName($s['prenom'] ?? ''))) ||
                            ($keyInverted === ($normalizeName($s['nom']) . '|' . $normalizeName($s['prenom'] ?? ''))) ||
                            ($keyTokens === $getSortedTokens($s['nom'], $s['prenom'] ?? ''))) {
                            if ($s['annee_id']) {
                                $guessAnneeIds[] = (int)$s['annee_id'];
                            }
                        }
                    }
                }
                if (!empty($guessAnneeIds)) {
                    $anneeCounts = array_count_values($guessAnneeIds);
                    arsort($anneeCounts);
                    $targetAnneeId = key($anneeCounts);
                }
            }

            if (!$targetAnneeId && !empty($dbYears)) {
                $targetAnneeId = (int)$dbYears[0]['id'];
            }

            if (!$targetAnneeId) {
                throw new Exception("Impossible d'identifier l'année de formation pour cet import.");
            }

            // Identification de la promotion cible et correspondances
            $studentMatches = [];

            for ($i = $studentStartIdx; $i < count($rawData); $i++) {
                $row = $rawData[$i];
                if (empty($row) || !isset($row[0]) || empty($row[0])) continue;
                $numEtudiant = trim((string)$row[0]);
                if (!preg_match('/^\d{8}$/', $numEtudiant)) continue;

                $nom = isset($row[1]) ? trim((string)$row[1]) : '';
                $prenom = isset($row[2]) ? trim((string)$row[2]) : '';
                
                $keyDirect = $normalizeName($nom) . '|' . $normalizeName($prenom);
                $keyInverted = $normalizeName($prenom) . '|' . $normalizeName($nom);
                $keyTokens = $getSortedTokens($nom, $prenom);

                $targetMatch = null;
                $otherMatch = null;

                $nomKey = $normalizeName($nom);
                $prenomKey = $normalizeName($prenom);

                foreach ($dbStudents as $s) {
                    $dbNom = $normalizeName($s['nom']);
                    $dbPrenom = $normalizeName($s['prenom'] ?? '');
                    $dbTokens = $getSortedTokens($s['nom'], $s['prenom'] ?? '');

                    $isMatch = ($keyDirect === ($dbNom . '|' . $dbPrenom)) ||
                               ($keyInverted === ($dbNom . '|' . $dbPrenom)) ||
                               ($keyTokens === $dbTokens) ||
                               ($dbNom === $nomKey || $dbNom === $prenomKey);

                    if ($isMatch) {
                        if ($targetAnneeId && (int)$s['annee_id'] === (int)$targetAnneeId) {
                            $targetMatch = $s;
                            break;
                        } else {
                            $otherMatch = $s;
                        }
                    }
                }

                $dbS = $targetMatch ?: $otherMatch;

                if ($dbS) {
                    $studentMatches[$i] = $dbS;
                }
            }

            $mismatchedStudents = [];

            // Chargement des ECUEs de la promo
            $stmt = $pdo->prepare("
                SELECT ec.id, ec.nom as ecue_nom, u.id as ue_id, s.id as semestre_id
                FROM ecue ec
                JOIN ue u ON ec.ue_id = u.id
                JOIN bcc b ON u.bcc_id = b.id
                JOIN semestres s ON b.semestre_id = s.id
                WHERE s.annee_id = ?
            ");
            $stmt->execute([$targetAnneeId]);
            $dbEcues = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Mappage des colonnes (y compris bonus/malus semestriels)
            $columnToEcueMap = [];
            $mappingReport = [];
            $bonusColIdx = null;
            $malusColIdx = null;

            foreach ($noteColumns as $nc) {
                $ecueId = $matchEcueName($nc['elp'], $dbEcues);
                if ($ecueId) {
                    $columnToEcueMap[$nc['index']] = $ecueId;
                    $ecName = '';
                    foreach ($dbEcues as $e) {
                        if ((int)$e['id'] === $ecueId) {
                            $ecName = $e['ecue_nom'];
                            break;
                        }
                    }
                    $mappingReport[] = ["column" => $nc['elp'], "ecue" => $ecName, "matched" => true];
                } else {
                    $colNameLower = mb_strtolower($nc['elp']);
                    if (mb_strpos($colNameLower, 'bonus') !== false) {
                        $bonusColIdx = $nc['index'];
                        $mappingReport[] = ["column" => $nc['elp'], "ecue" => "Bonus Semestriel", "matched" => true];
                    } elseif (mb_strpos($colNameLower, 'malus') !== false) {
                        $malusColIdx = $nc['index'];
                        $mappingReport[] = ["column" => $nc['elp'], "ecue" => "Malus Semestriel", "matched" => true];
                    } else {
                        $mappingReport[] = ["column" => $nc['elp'], "ecue" => "Ignoré", "matched" => false];
                    }
                }
            }

            // Déterminer le semestre concerné par l'import
            $detectedSemestreId = null;
            if (!empty($columnToEcueMap)) {
                $matchedSemestreIds = [];
                foreach ($columnToEcueMap as $colIdx => $ecueId) {
                    $stmtSem = $pdo->prepare("
                        SELECT b.semestre_id 
                        FROM ecue ec
                        JOIN ue u ON ec.ue_id = u.id
                        JOIN bcc b ON u.bcc_id = b.id
                        WHERE ec.id = ?
                    ");
                    $stmtSem->execute([$ecueId]);
                    $semId = $stmtSem->fetchColumn();
                    if ($semId) {
                        $matchedSemestreIds[] = (int)$semId;
                    }
                }
                if (!empty($matchedSemestreIds)) {
                    $semCounts = array_count_values($matchedSemestreIds);
                    arsort($semCounts);
                    $detectedSemestreId = key($semCounts);
                }
            }

            // Mappage des ECUEs aux UEs parentes et Semestres
            $ecueToUeMap = [];
            $allUeSemestres = []; // ue_id => semestre_id
            foreach ($dbEcues as $ec) {
                $ecueToUeMap[(int)$ec['id']] = [
                    'ue_id' => (int)$ec['ue_id'],
                    'semestre_id' => (int)$ec['semestre_id']
                ];
                $allUeSemestres[(int)$ec['ue_id']] = (int)$ec['semestre_id'];
            }

            // Analyse des notes du fichier pour détecter les options par semestre
            $studentUesWithGrades = [];
            $allStudentsCount = 0;
            $ueGradesCount = []; // ue_id => count of students with grades

            for ($i = $studentStartIdx; $i < count($rawData); $i++) {
                $row = $rawData[$i];
                if (empty($row) || !isset($row[0]) || empty($row[0])) continue;
                $numEtudiant = trim((string)$row[0]);
                if (!preg_match('/^\d{8}$/', $numEtudiant)) continue;
                
                $allStudentsCount++;
                $studentUesWithGrades[$i] = [];
                
                foreach ($columnToEcueMap as $colIdx => $ecueId) {
                    if (!isset($row[$colIdx])) continue;
                    
                    $valRaw = trim((string)$row[$colIdx]);
                    if ($valRaw === '' || in_array($valRaw, ['ABI', 'ABJ', 'DEF'])) continue;
                    
                    $valClean = str_replace(',', '.', $valRaw);
                    if (is_numeric($valClean)) {
                        $valFloat = (float)$valClean;
                        if ($valFloat >= 0.0 && $valFloat <= 20.0) {
                            if (isset($ecueToUeMap[$ecueId])) {
                                $ueId = $ecueToUeMap[$ecueId]['ue_id'];
                                $studentUesWithGrades[$i][$ueId] = true;
                            }
                        }
                    }
                }

                foreach (array_keys($studentUesWithGrades[$i]) as $ueId) {
                    if (!isset($ueGradesCount[$ueId])) $ueGradesCount[$ueId] = 0;
                    $ueGradesCount[$ueId]++;
                }
            }

            // Déterminer les UEs d'options par semestre (Ues où moins de 80% des étudiants ont des notes)
            $optionUesBySemestre = []; // semestre_id => array of ue_ids
            if ($allStudentsCount > 0) {
                foreach ($allUeSemestres as $ueId => $semId) {
                    $count = $ueGradesCount[$ueId] ?? 0;
                    $pct = ($count / $allStudentsCount) * 100;
                    if ($pct < 80.0) {
                        if (!isset($optionUesBySemestre[$semId])) {
                            $optionUesBySemestre[$semId] = [];
                        }
                        $optionUesBySemestre[$semId][] = $ueId;
                    }
                }
            }

            // Insertion des notes
            $pdo->beginTransaction();
            $notesCount = 0;
            $studentsNotFound = [];

            // Si l'utilisateur a validé la correction des affectations, on les met à jour en BDD
            if ($fixMismatchedYears === true && !empty($mismatchedStudents)) {
                $stmtUpdateAnnee = $pdo->prepare("UPDATE etudiants SET annee_id = ? WHERE id = ?");
                foreach ($mismatchedStudents as $ms) {
                    $stmtUpdateAnnee->execute([$targetAnneeId, (int)$ms['id']]);
                }
            }

            $stmtInsert = $pdo->prepare("
                INSERT INTO notes (etudiant_id, ecue_id, valeur, statut) 
                VALUES (?, ?, ?, ?) 
                ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), statut = VALUES(statut)
            ");

            $stmtBM = $pdo->prepare("
                INSERT INTO notes_bonus_malus (etudiant_id, semestre_id, bonus, malus)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE bonus = VALUES(bonus), malus = VALUES(malus)
            ");

            $cleanForEmail = function(string $str) {
                $unwanted_array = array(
                    'Š'=>'S', 'š'=>'s', 'Ž'=>'Z', 'ž'=>'z', 'À'=>'A', 'Á'=>'A', 'Â'=>'A', 'Ã'=>'A', 'Ä'=>'A', 'Å'=>'A', 'Æ'=>'A', 'Ç'=>'C', 'È'=>'E', 'É'=>'E',
                    'Ê'=>'E', 'Ë'=>'E', 'Ì'=>'I', 'Í'=>'I', 'Î'=>'I', 'Ï'=>'I', 'Ñ'=>'N', 'Ò'=>'O', 'Ó'=>'O', 'Ô'=>'O', 'Õ'=>'O', 'Ö'=>'O', 'Ø'=>'O', 'Ù'=>'U',
                    'Ú'=>'U', 'Û'=>'U', 'Ü'=>'U', 'Ý'=>'Y', 'Þ'=>'B', 'ß'=>'Ss', 'à'=>'a', 'á'=>'a', 'â'=>'a', 'ã'=>'a', 'ä'=>'a', 'å'=>'a', 'æ'=>'a', 'ç'=>'c',
                    'è'=>'e', 'é'=>'e', 'ê'=>'e', 'ë'=>'e', 'ì'=>'i', 'í'=>'i', 'î'=>'i', 'ï'=>'i', 'ð'=>'o', 'ñ'=>'n', 'ò'=>'o', 'ó'=>'o', 'ô'=>'o', 'õ'=>'o',
                    'ö'=>'o', 'ø'=>'o', 'ù'=>'u', 'û'=>'u', 'ý'=>'y', 'þ'=>'b', 'ÿ'=>'y'
                );
                $str = strtr($str, $unwanted_array);
                return preg_replace('/[^a-z0-9]/', '', strtolower(str_replace(' ', '', $str)));
            };

            for ($i = $studentStartIdx; $i < count($rawData); $i++) {
                $row = $rawData[$i];
                if (empty($row) || !isset($row[0]) || empty($row[0])) continue;
                $numEtudiant = trim((string)$row[0]);
                if (!preg_match('/^\d{8}$/', $numEtudiant)) continue;

                $nom = isset($row[1]) ? trim((string)$row[1]) : '';
                $prenom = isset($row[2]) ? trim((string)$row[2]) : '';

                $studentId = null;
                $validatedEcueIds = [];

                if (!isset($studentMatches[$i])) {
                    try {
                        $emailNom = $cleanForEmail($nom);
                        $emailPrenom = $cleanForEmail($prenom);
                        if (empty($emailNom)) {
                            $emailNom = 'student_' . rand(1000, 9999);
                        }
                        $email = ($emailPrenom ? "$emailPrenom." : "") . $emailNom . "@etu.univ-amu.fr";
                        
                        $stmtCheck = $pdo->prepare("SELECT id, nom, prenom, annee_id, email FROM etudiants WHERE email = ?");
                        $stmtCheck->execute([$email]);
                        $existing = $stmtCheck->fetch();
                        
                        if ($existing) {
                            if ((int)$existing['annee_id'] === (int)$targetAnneeId) {
                                $studentId = (int)$existing['id'];
                            } else {
                                $stmtCreate = $pdo->prepare("
                                    INSERT INTO etudiants (nom, prenom, email, annee_inscription, annee_id, meta_data)
                                    VALUES (?, ?, ?, ?, ?, ?)
                                ");
                                $stmtCreate->execute([
                                    $nom, 
                                    $prenom, 
                                    $email, 
                                    (int)date('Y'), 
                                    $targetAnneeId, 
                                    json_encode(['Provenance' => 'Import Apogée automatique'])
                                ]);
                                $studentId = (int)$pdo->lastInsertId();
                                require_once __DIR__ . '/../includes/AcademicLogic.php';
                                \App\Utils\AcademicLogic::syncRepeatingStudentNotes($studentId, $targetAnneeId, $pdo);
                            }
                        } else {
                            $stmtCreate = $pdo->prepare("
                                INSERT INTO etudiants (nom, prenom, email, annee_inscription, annee_id, meta_data)
                                VALUES (?, ?, ?, ?, ?, ?)
                            ");
                            $stmtCreate->execute([
                                $nom, 
                                $prenom, 
                                $email, 
                                (int)date('Y'), 
                                $targetAnneeId, 
                                json_encode(['Provenance' => 'Import Apogée automatique'])
                            ]);
                            $studentId = (int)$pdo->lastInsertId();
                            require_once __DIR__ . '/../includes/AcademicLogic.php';
                            \App\Utils\AcademicLogic::syncRepeatingStudentNotes($studentId, $targetAnneeId, $pdo);
                        }
                        
                        $studentMatches[$i] = [
                            'id' => $studentId,
                            'nom' => $nom,
                            'prenom' => $prenom,
                            'annee_id' => $targetAnneeId
                        ];
                    } catch (Exception $eCreate) {
                        $studentsNotFound[] = "$nom $prenom ($numEtudiant) - Erreur création: " . $eCreate->getMessage();
                        continue;
                    }
                } else {
                    $dbS = $studentMatches[$i];
                    
                    if ((int)$dbS['annee_id'] !== (int)$targetAnneeId) {
                        try {
                            $stmtCreate = $pdo->prepare("
                                INSERT INTO etudiants (nom, prenom, email, annee_inscription, annee_id, meta_data)
                                VALUES (?, ?, ?, ?, ?, ?)
                            ");
                            $stmtCreate->execute([
                                $dbS['nom'], 
                                $dbS['prenom'] ?? '', 
                                $dbS['email'], 
                                (int)date('Y'), 
                                $targetAnneeId, 
                                json_encode(['Provenance' => 'Import Apogée automatique'])
                            ]);
                            $studentId = (int)$pdo->lastInsertId();
                            
                            $studentMatches[$i] = [
                                'id' => $studentId,
                                'nom' => $dbS['nom'],
                                'prenom' => $dbS['prenom'] ?? '',
                                'annee_id' => $targetAnneeId,
                                'email' => $dbS['email']
                            ];
                            
                            require_once __DIR__ . '/../includes/AcademicLogic.php';
                            \App\Utils\AcademicLogic::syncRepeatingStudentNotes($studentId, $targetAnneeId, $pdo);
                        } catch (Exception $eCreate) {
                            $studentsNotFound[] = "{$dbS['nom']} {$dbS['prenom']} ($numEtudiant) - Erreur réinscription: " . $eCreate->getMessage();
                            continue;
                        }
                    } else {
                        $studentId = (int)$dbS['id'];
                    }
                }

                // Charger la liste des ECUEs validés l'année d'avant
                $stmtEmail = $pdo->prepare("SELECT email FROM etudiants WHERE id = ?");
                $stmtEmail->execute([$studentId]);
                $studentEmail = $stmtEmail->fetchColumn();
                if ($studentEmail) {
                    require_once __DIR__ . '/../includes/AcademicLogic.php';
                    $validatedEcueIds = \App\Utils\AcademicLogic::getValidatedEcueIdsFromPreviousYear($studentEmail, $targetAnneeId, $pdo);
                }

                // Identification des options non suivies par cet étudiant spécifique
                $studentUes = array_keys($studentUesWithGrades[$i] ?? []);
                $conflictingUeIds = [];
                
                foreach ($optionUesBySemestre as $semId => $optUeIds) {
                    $followedOptUeId = null;
                    foreach ($optUeIds as $optUeId) {
                        if (in_array($optUeId, $studentUes)) {
                            $followedOptUeId = $optUeId;
                            break;
                        }
                    }
                    if ($followedOptUeId !== null) {
                        foreach ($optUeIds as $optUeId) {
                            if ($optUeId !== $followedOptUeId) {
                                $conflictingUeIds[] = $optUeId;
                            }
                        }
                    }
                }

                // Nettoyage des notes obsolètes ou conflictuelles de l'autre option en BDD
                if (!empty($conflictingUeIds)) {
                    $conflictingEcueIds = [];
                    foreach ($dbEcues as $ec) {
                        if (in_array((int)$ec['ue_id'], $conflictingUeIds)) {
                            $conflictingEcueIds[] = (int)$ec['id'];
                        }
                    }
                    if (!empty($conflictingEcueIds)) {
                        $stmtDeleteEcueNote = $pdo->prepare("DELETE FROM notes WHERE etudiant_id = ? AND ecue_id = ?");
                        foreach ($conflictingEcueIds as $delEcueId) {
                            $stmtDeleteEcueNote->execute([$studentId, $delEcueId]);
                        }
                    }
                }

                foreach ($columnToEcueMap as $colIdx => $ecueId) {
                    // Ignorer les colonnes de l'option non suivie
                    if (isset($ecueToUeMap[$ecueId])) {
                        $ueId = $ecueToUeMap[$ecueId]['ue_id'];
                        if (in_array($ueId, $conflictingUeIds)) {
                            continue;
                        }
                    }
                    
                    // Si l'ECUE appartient à une UE validée l'année d'avant, on refuse d'écraser la note
                    if (in_array($ecueId, $validatedEcueIds)) {
                        continue;
                    }
                    if (!isset($row[$colIdx])) continue;
                    
                    $valRaw = trim((string)$row[$colIdx]);
                    if ($valRaw === '') continue;

                    if (in_array($valRaw, ['ABI', 'ABJ', 'DEF'])) {
                        $stmtInsert->execute([$studentId, $ecueId, null, $valRaw]);
                        $notesCount++;
                    } else {
                        $valClean = str_replace(',', '.', $valRaw);
                        if (is_numeric($valClean)) {
                            $valFloat = (float)$valClean;
                            if ($valFloat >= 0.0 && $valFloat <= 20.0) {
                                $stmtInsert->execute([$studentId, $ecueId, $valFloat, null]);
                                $notesCount++;
                            }
                        }
                    }
                }

                // Import des bonus / malus semestriels
                if ($detectedSemestreId !== null) {
                    $bonusVal = null;
                    $malusVal = null;

                    if ($bonusColIdx !== null && isset($row[$bonusColIdx])) {
                        $valRaw = trim((string)$row[$bonusColIdx]);
                        if ($valRaw !== '') {
                            $valClean = str_replace(',', '.', $valRaw);
                            if (is_numeric($valClean)) {
                                $bonusVal = (float)$valClean;
                            }
                        }
                    }
                    if ($malusColIdx !== null && isset($row[$malusColIdx])) {
                        $valRaw = trim((string)$row[$malusColIdx]);
                        if ($valRaw !== '') {
                            $valClean = str_replace(',', '.', $valRaw);
                            if (is_numeric($valClean)) {
                                $malusVal = (float)$valClean;
                            }
                        }
                    }

                    if ($bonusVal !== null || $malusVal !== null) {
                        $stmtGet = $pdo->prepare("SELECT bonus, malus FROM notes_bonus_malus WHERE etudiant_id = ? AND semestre_id = ?");
                        $stmtGet->execute([$studentId, $detectedSemestreId]);
                        $existing = $stmtGet->fetch();

                        $bonus = $bonusVal !== null ? $bonusVal : ($existing ? $existing['bonus'] : null);
                        $malus = $malusVal !== null ? $malusVal : ($existing ? $existing['malus'] : null);

                        $stmtBM->execute([$studentId, $detectedSemestreId, $bonus, $malus]);
                    }
                }
            }

            $pdo->commit();

            echo json_encode([
                "success" => true,
                "message" => "Importation terminée ! $notesCount notes importées/mises à jour.",
                "mapping" => $mappingReport,
                "not_found" => $studentsNotFound
            ]);

        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
        }
        exit();
    }

    if ($action === 'import') {
        // Rétrocompatibilité avec l'ancien import
        $data = $input['data'] ?? [];
        $mapping = $input['mapping'] ?? [];
        $fixedEcueId = $input['ecue_id'] ?? null;
        if (empty($data)) { echo json_encode(["success" => false, "error" => "Données vides"]); exit(); }
        try {
            $pdo->beginTransaction();
            $count = 0; $notFound = [];
            foreach ($data as $row) {
                $email = ""; $nom = ""; $prenom = ""; $valeurRaw = null; $ecueId = $fixedEcueId;
                foreach ($row as $colName => $value) {
                    $target = $mapping[$colName] ?? null;
                    if ($target === 'email') $email = trim((string)$value);
                    elseif ($target === 'nom') $nom = trim((string)$value);
                    elseif ($target === 'prenom') $prenom = trim((string)$value);
                    elseif ($target === 'valeur') $valeurRaw = trim((string)$value);
                    elseif ($target === 'ecue_id' && !$fixedEcueId) $ecueId = (int)$value;
                }
                if ($valeurRaw === null || !$ecueId) continue;
                $studentId = null;
                if (!empty($email)) {
                    $stmt = $pdo->prepare("SELECT id FROM etudiants WHERE email = ?");
                    $stmt->execute([$email]);
                    $studentId = $stmt->fetchColumn();
                }
                if (!$studentId && !empty($nom)) {
                    $escapeLike = function(string $s): string {
                        return str_replace(['%', '_'], ['\\%', '\\_'], $s);
                    };
                    $safeNom = "%" . $escapeLike($nom) . "%";
                    if (!empty($prenom)) {
                        $safePrenom = "%" . $escapeLike($prenom) . "%";
                        $stmt = $pdo->prepare("SELECT id FROM etudiants WHERE (nom LIKE ? AND prenom LIKE ?) OR (nom LIKE ? AND prenom LIKE ?)");
                        $stmt->execute([$safeNom, $safePrenom, $safePrenom, $safeNom]);
                        $studentId = $stmt->fetchColumn();
                    } else {
                        $stmt = $pdo->prepare("SELECT id FROM etudiants WHERE nom LIKE ?");
                        $stmt->execute([$safeNom]);
                        $studentId = $stmt->fetchColumn();
                    }
                }
                if ($studentId) {
                    $stmt = $pdo->prepare("
                        INSERT INTO notes (etudiant_id, ecue_id, valeur, statut) 
                        VALUES (?, ?, ?, ?) 
                        ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), statut = VALUES(statut)
                    ");
                    if (in_array($valeurRaw, ['ABI', 'ABJ', 'DEF'])) {
                        $stmt->execute([(int)$studentId, (int)$ecueId, null, $valeurRaw]);
                    } else {
                        $val = (float)str_replace(',', '.', $valeurRaw);
                        if ($val >= 0 && $val <= 20) {
                            $stmt->execute([(int)$studentId, (int)$ecueId, $val, null]);
                        }
                    }
                    $count++;
                } else { $notFound[] = $nom ?: $email ?: "Inconnu"; }
            }
            $pdo->commit();
            $msg = "$count notes importées.";
            if (count($notFound) > 0) { $msg .= " Attention : " . count($notFound) . " étudiants non trouvés."; }
            echo json_encode(["success" => true, "message" => $msg]);
        } catch (Exception $e) { $pdo->rollBack(); error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]); }
        exit();
    }

    if ($action === 'save' || isset($input['notes'])) {
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("
                INSERT INTO notes (etudiant_id, ecue_id, valeur, statut) 
                VALUES (?, ?, ?, ?) 
                ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), statut = VALUES(statut)
            ");
            
            $stmtBM = $pdo->prepare("
                INSERT INTO notes_bonus_malus (etudiant_id, semestre_id, bonus, malus)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE bonus = VALUES(bonus), malus = VALUES(malus)
            ");

            $studentValidatedEcues = [];

            foreach ($input['notes'] as $note) {
                if (!isset($note['etudiant_id'], $note['ecue_id'], $note['valeur'])) continue;
                
                $studentId = (int)$note['etudiant_id'];
                $ecueIdStr = $note['ecue_id'];
                $valRaw = trim((string)$note['valeur']);

                if (preg_match('/^(bonus|malus)_(\d+)$/', (string)$ecueIdStr, $matches)) {
                    $type = $matches[1];
                    $semestreId = (int)$matches[2];
                    $valFloat = $valRaw === '' ? null : (float)str_replace(',', '.', $valRaw);

                    if ($valFloat !== null && ($valFloat < 0 || $valFloat > 20)) continue;

                    $stmtGet = $pdo->prepare("SELECT bonus, malus FROM notes_bonus_malus WHERE etudiant_id = ? AND semestre_id = ?");
                    $stmtGet->execute([$studentId, $semestreId]);
                    $existing = $stmtGet->fetch();

                    $bonus = $type === 'bonus' ? $valFloat : ($existing ? $existing['bonus'] : null);
                    $malus = $type === 'malus' ? $valFloat : ($existing ? $existing['malus'] : null);

                    $stmtBM->execute([$studentId, $semestreId, $bonus, $malus]);
                } else {
                    $ecueId = (int)$ecueIdStr;

                    if (!isset($studentValidatedEcues[$studentId])) {
                        $stmtEmail = $pdo->prepare("SELECT email, annee_id FROM etudiants WHERE id = ?");
                        $stmtEmail->execute([$studentId]);
                        $stInfo = $stmtEmail->fetch();
                        if ($stInfo && $stInfo['email'] && $stInfo['annee_id']) {
                            require_once __DIR__ . '/../includes/AcademicLogic.php';
                            $studentValidatedEcues[$studentId] = \App\Utils\AcademicLogic::getValidatedEcueIdsFromPreviousYear($stInfo['email'], (int)$stInfo['annee_id'], $pdo);
                        } else {
                            $studentValidatedEcues[$studentId] = [];
                        }
                    }

                    if (in_array($ecueId, $studentValidatedEcues[$studentId])) {
                        // Protection : ne pas écraser les notes d'ECUEs validés l'année d'avant
                        continue;
                    }

                    if ($valRaw === '') {
                        $stmtDel = $pdo->prepare("DELETE FROM notes WHERE etudiant_id = ? AND ecue_id = ?");
                        $stmtDel->execute([$studentId, $ecueId]);
                        continue;
                    }

                    if (in_array($valRaw, ['ABI', 'ABJ', 'DEF'])) {
                        $stmt->execute([$studentId, $ecueId, null, $valRaw]);
                    } else {
                        $val = (float)str_replace(',', '.', $valRaw);
                        if ($val < 0 || $val > 20) continue;
                        $stmt->execute([$studentId, $ecueId, $val, null]);
                    }
                }
            }
            $pdo->commit();
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
        }
        exit();
    }
}

