<?php
declare(strict_types=1);

/**
 * API Students - Gestion des étudiants et imports
 */

require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $stmt = $pdo->query("SELECT * FROM etudiants ORDER BY nom ASC");
        $students = $stmt->fetchAll();
        
        // Décoder le JSON meta_data pour le frontend
        foreach ($students as &$student) {
            if ($student['meta_data']) {
                $student['meta_data'] = json_decode($student['meta_data'], true);
            }
        }

        echo json_encode([
            "success" => true,
            "data" => $students
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
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

    if ($input['action'] === 'import') {
        $data = $input['data'] ?? [];
        $mapping = $input['mapping'] ?? []; // Mapping: { file_column: db_column }
        
        if (empty($data)) {
            echo json_encode(["success" => false, "error" => "Aucune donnée à importer"]);
            exit();
        }

        try {
            $pdo->beginTransaction();
            $count = 0;
            
            foreach ($data as $row) {
                $nom = "";
                $email = "";
                $annee = (int)date('Y');
                $meta = [];

                foreach ($row as $colName => $value) {
                    $target = $mapping[$colName] ?? null;
                    
                    if ($target === 'nom') $nom = $value;
                    elseif ($target === 'email') $email = $value;
                    elseif ($target === 'annee_inscription') $annee = (int)$value;
                    elseif ($target === 'meta_data') {
                        // Si l'utilisateur a choisi de mettre une colonne spécifique dans le meta
                        $meta[$colName] = $value;
                    } else {
                        // Par défaut, tout ce qui n'est pas mappé aux champs fixes va dans meta
                        $meta[$colName] = $value;
                    }
                }

                if (empty($email)) continue;

                $stmt = $pdo->prepare("
                    INSERT INTO etudiants (nom, email, annee_inscription, meta_data) 
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        nom = VALUES(nom), 
                        annee_inscription = VALUES(annee_inscription),
                        meta_data = VALUES(meta_data)
                ");
                
                $stmt->execute([$nom, $email, $annee, json_encode($meta)]);
                $count++;
            }

            $pdo->commit();
            echo json_encode(["success" => true, "message" => "$count étudiants importés/mis à jour"]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(["success" => false, "error" => $e->getMessage()]);
        }
        exit();
    }
}
