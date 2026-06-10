<?php
declare(strict_types=1);

/**
 * API Students - Gestion des étudiants et imports
 */

if (!function_exists('requirePermission')) {
    require_once __DIR__ . '/auth.php';
}

$method = $_SERVER['REQUEST_METHOD'];

// Migration silencieuse
try { 
    $cols = $pdo->query("DESCRIBE etudiants")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('prenom', $cols)) { $pdo->exec("ALTER TABLE etudiants ADD prenom VARCHAR(255) NULL AFTER nom"); }
    if (!in_array('annee_id', $cols)) { $pdo->exec("ALTER TABLE etudiants ADD annee_id INT NULL"); }
    if (!in_array('provenance', $cols)) { $pdo->exec("ALTER TABLE etudiants ADD provenance VARCHAR(255) NULL AFTER annee_id"); }

    // Migration de la clé unique sur email pour permettre le multi-cursus (email, annee_id)
    $indexes = $pdo->query("SHOW INDEX FROM etudiants")->fetchAll(PDO::FETCH_ASSOC);
    $hasUniqueEmailAnnee = false;
    $hasEmailUnique = false;
    foreach ($indexes as $index) {
        if ($index['Key_name'] === 'unique_email_annee') {
            $hasUniqueEmailAnnee = true;
        }
        if (strtolower($index['Key_name']) === 'email' && !$index['Non_unique']) {
            $hasEmailUnique = true;
        }
    }
    if ($hasEmailUnique) {
        $pdo->exec("ALTER TABLE etudiants DROP INDEX email");
    }
    if (!$hasUniqueEmailAnnee) {
        $pdo->exec("ALTER TABLE etudiants ADD UNIQUE KEY unique_email_annee (email, annee_id)");
    }
} catch (Exception $e) {}

if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    if ($action === 'history') {
        $studentId = (int)($_GET['student_id'] ?? 0);
        try {
            $stmt = $pdo->prepare("SELECT email FROM etudiants WHERE id = ?");
            $stmt->execute([$studentId]);
            $email = $stmt->fetchColumn();
            if (!$email) {
                echo json_encode(["success" => true, "data" => []]);
                exit();
            }
            
            $stmtHistory = $pdo->prepare("
                SELECT e.id, e.annee_inscription, a.nom as annee_nom, e.annee_id 
                FROM etudiants e 
                LEFT JOIN annees a ON e.annee_id = a.id 
                WHERE e.email = ?
                ORDER BY e.annee_inscription DESC, e.id DESC
            ");
            $stmtHistory->execute([$email]);
            $registrations = $stmtHistory->fetchAll(PDO::FETCH_ASSOC);
            
            require_once __DIR__ . '/../includes/AcademicLogic.php';
            foreach ($registrations as &$reg) {
                $calc = \App\Utils\AcademicLogic::calculateStudentAverageAndStatus((int)$reg['id'], (int)$reg['annee_id'], $pdo);
                $reg['average'] = $calc['average'];
                $reg['status'] = $calc['status'];
            }
            echo json_encode(["success" => true, "data" => $registrations]);
        } catch (Exception $e) {
            http_response_code(500);
            error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
        }
        exit();
    }

    try {
        $stmtCount = $pdo->query("SELECT email, COUNT(*) as cnt FROM etudiants GROUP BY email");
        $counts = [];
        foreach ($stmtCount->fetchAll() as $row) {
            if ($row['email']) {
                $counts[$row['email']] = (int)$row['cnt'];
            }
        }

        $stmt = $pdo->query("SELECT e.*, a.nom as annee_nom FROM etudiants e LEFT JOIN annees a ON e.annee_id = a.id ORDER BY e.nom ASC, e.prenom ASC");
        $students = $stmt->fetchAll();
        foreach ($students as &$student) {
            if ($student['meta_data']) $student['meta_data'] = json_decode($student['meta_data'], true);
            $student['has_history'] = ($student['email'] && isset($counts[$student['email']]) && $counts[$student['email']] > 1);
        }
        echo json_encode(["success" => true, "data" => $students]);
    } catch (Exception $e) {
        http_response_code(500);
        error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
    }
    exit();
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['action'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Action non spécifiée"]);
        exit();
    }

    // --- CRÉATION ---
    if ($input['action'] === 'create') {
        $nom = $input['nom'] ?? '';
        $prenom = $input['prenom'] ?? '';
        $email = $input['email'] ?? '';
        $annee_id = empty($input['annee_id']) ? null : (int)$input['annee_id'];
        $annee_inscription = (int)($input['annee_inscription'] ?? date('Y'));
        $provenance = empty($input['provenance']) ? null : trim((string)$input['provenance']);
        $meta = $input['meta_data'] ?? [];

        if (empty($nom) || empty($email)) { echo json_encode(["success" => false, "error" => "Nom et Email obligatoires"]); exit(); }

        try {
            $stmt = $pdo->prepare("INSERT INTO etudiants (nom, prenom, email, annee_inscription, annee_id, provenance, meta_data) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$nom, $prenom, $email, $annee_inscription, $annee_id, $provenance, json_encode($meta)]);
            $studentId = (int)$pdo->lastInsertId();
            if ($annee_id) {
                require_once __DIR__ . '/../includes/AcademicLogic.php';
                \App\Utils\AcademicLogic::syncRepeatingStudentNotes($studentId, $annee_id, $pdo);
            }
            echo json_encode(["success" => true, "id" => $studentId]);
        } catch (Exception $e) {
            http_response_code(500);
            error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
        }
        exit();
    }

    // --- MISE À JOUR COMPLÈTE ---
    if ($input['action'] === 'update') {
        $id = (int)($input['id'] ?? 0);
        $nom = $input['nom'] ?? '';
        $prenom = $input['prenom'] ?? '';
        $email = $input['email'] ?? '';
        $annee_id = empty($input['annee_id']) ? null : (int)$input['annee_id'];
        $annee_inscription = (int)($input['annee_inscription'] ?? date('Y'));
        $provenance = empty($input['provenance']) ? null : trim((string)$input['provenance']);

        if (!$id || empty($nom) || empty($email)) {
            echo json_encode(["success" => false, "error" => "ID, Nom et Email obligatoires"]);
            exit();
        }

        try {
            $stmt = $pdo->prepare("UPDATE etudiants SET nom = ?, prenom = ?, email = ?, annee_inscription = ?, annee_id = ?, provenance = ? WHERE id = ?");
            $stmt->execute([$nom, $prenom, $email, $annee_inscription, $annee_id, $provenance, $id]);
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            http_response_code(500);
            error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
        }
        exit();
    }

    // --- MISE À JOUR RAPIDE (ANNÉE UNIQUEMENT) ---
    if ($input['action'] === 'update_annee') {
        $id = (int)($input['id'] ?? 0);
        $annee_id = empty($input['annee_id']) ? null : (int)$input['annee_id'];
        try {
            $stmt = $pdo->prepare("UPDATE etudiants SET annee_id = ? WHERE id = ?");
            $stmt->execute([$annee_id, $id]);
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            http_response_code(500);
            error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
        }
        exit();
    }

    // --- IMPORT (Excel/CSV) ---
    if ($input['action'] === 'import') {
        $data = $input['data'] ?? [];
        $mapping = $input['mapping'] ?? []; 
        if (empty($data)) { echo json_encode(["success" => false, "error" => "Aucune donnée"]); exit(); }

        try {
            $pdo->beginTransaction();
            $count = 0;
            foreach ($data as $row) {
                $nom = ""; $prenom = ""; $email = ""; $annee_inscr = (int)date('Y'); $annee_id = null; $provenance = null; $meta = [];
                foreach ($row as $colName => $value) {
                    $target = $mapping[$colName] ?? null;
                    if ($target === 'nom') $nom = trim((string)$value);
                    elseif ($target === 'prenom') $prenom = trim((string)$value);
                    elseif ($target === 'email') $email = trim((string)$value);
                    elseif ($target === 'annee_inscription') $annee_inscr = (int)$value;
                    elseif ($target === 'annee_id') $annee_id = empty($value) ? null : (int)$value;
                    elseif ($target === 'provenance') $provenance = empty($value) ? null : trim((string)$value);
                    else $meta[$colName] = $value;
                }
                if (empty($nom)) continue;
                if (empty($email)) {
                    $clean = function($str) {
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
                    $emailNom = $clean($nom);
                    $emailPrenom = $clean($prenom);
                    if (empty($emailNom)) {
                        $emailNom = 'student_' . rand(1000, 9999);
                    }
                    $email = ($emailPrenom ? "$emailPrenom." : "") . $emailNom . "@etu.univ-amu.fr";
                }
                $stmt = $pdo->prepare("
                    INSERT INTO etudiants (nom, prenom, email, annee_inscription, annee_id, provenance, meta_data) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE nom = VALUES(nom), prenom = VALUES(prenom), annee_inscription = VALUES(annee_inscription), annee_id = VALUES(annee_id), provenance = VALUES(provenance), meta_data = VALUES(meta_data)
                ");
                $stmt->execute([$nom, $prenom, $email, $annee_inscr, $annee_id, $provenance, json_encode($meta)]);
                
                $stmtGetId = $pdo->prepare("SELECT id FROM etudiants WHERE email = ? AND annee_id = ?");
                $stmtGetId->execute([$email, $annee_id]);
                $studentId = (int)$stmtGetId->fetchColumn();

                if ($studentId && $annee_id) {
                    require_once __DIR__ . '/../includes/AcademicLogic.php';
                    \App\Utils\AcademicLogic::syncRepeatingStudentNotes($studentId, $annee_id, $pdo);
                }
                $count++;
            }
            $pdo->commit();
            echo json_encode(["success" => true, "message" => "$count étudiants traités"]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
        }
        exit();
    }
}

if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = (int)($input['id'] ?? 0);
    if ($id) {
        try {
            $stmt = $pdo->prepare("DELETE FROM etudiants WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            http_response_code(500);
            error_log($e->getMessage()); echo json_encode(["success" => false, "error" => "Erreur interne"]);
        }
    }
    exit();
}

