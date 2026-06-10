<?php
declare(strict_types=1);

if (!function_exists('requirePermission')) {
    require_once __DIR__ . '/auth.php';
}

requirePermission('manage_users'); // Only ADMIN

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->query("
        SELECT u.id, u.username, u.role, u.must_change_password, u.created_at,
               GROUP_CONCAT(p.annee_id) as annee_ids,
               GROUP_CONCAT(a.nom SEPARATOR ', ') as annee_nom
        FROM users u 
        LEFT JOIN user_promotions p ON u.id = p.user_id
        LEFT JOIN annees a ON p.annee_id = a.id
        GROUP BY u.id
        ORDER BY u.id DESC
    ");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($users as &$u) {
        $u['annee_ids'] = $u['annee_ids'] ? array_map('intval', explode(',', $u['annee_ids'])) : [];
    }
    echo json_encode(["success" => true, "data" => $users]);
    exit();
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $input['action'] ?? '';
    
    if ($action === 'create') {
        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';
        $role = $input['role'] ?? 'LECTEUR_GLOBAL';
        $anneeIds = $input['annee_ids'] ?? [];
        
        if (empty($username) || empty($password)) {
            echo json_encode(["success" => false, "error" => "Nom d'utilisateur et mot de passe requis"]);
            exit();
        }
        
        $hash = password_hash($password, PASSWORD_DEFAULT);
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, ?, 1)");
            $stmt->execute([$username, $hash, $role]);
            $userId = $pdo->lastInsertId();
            
            if (!empty($anneeIds) && is_array($anneeIds)) {
                $stmtPromo = $pdo->prepare("INSERT IGNORE INTO user_promotions (user_id, annee_id) VALUES (?, ?)");
                foreach ($anneeIds as $aid) {
                    $stmtPromo->execute([$userId, (int)$aid]);
                }
            }
            $pdo->commit();
            echo json_encode(["success" => true, "id" => $userId]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            echo json_encode(["success" => false, "error" => "Erreur création utilisateur (nom déjà pris ?)"]);
        }
        exit();
    }
    
    if ($action === 'update') {
        $id = (int)($input['id'] ?? 0);
        $role = $input['role'] ?? 'LECTEUR_GLOBAL';
        $anneeIds = $input['annee_ids'] ?? [];
        
        if ($id === $_SESSION['user_id'] && $role !== 'ADMIN') {
            echo json_encode(["success" => false, "error" => "Impossible de retirer ses propres droits admin"]);
            exit();
        }
        
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("UPDATE users SET role = ? WHERE id = ?");
            $stmt->execute([$role, $id]);
            
            $pdo->prepare("DELETE FROM user_promotions WHERE user_id = ?")->execute([$id]);
            if (!empty($anneeIds) && is_array($anneeIds)) {
                $stmtPromo = $pdo->prepare("INSERT IGNORE INTO user_promotions (user_id, annee_id) VALUES (?, ?)");
                foreach ($anneeIds as $aid) {
                    $stmtPromo->execute([$id, (int)$aid]);
                }
            }
            $pdo->commit();
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            echo json_encode(["success" => false, "error" => "Erreur lors de la mise à jour"]);
        }
        exit();
    }
    
    if ($action === 'reset_password') {
        $id = (int)($input['id'] ?? 0);
        $password = $input['password'] ?? '';
        if (empty($password)) {
            echo json_encode(["success" => false, "error" => "Mot de passe requis"]);
            exit();
        }
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?");
        $stmt->execute([$hash, $id]);
        echo json_encode(["success" => true]);
        exit();
    }
    
    if ($action === 'delete') {
        $id = (int)($input['id'] ?? 0);
        if ($id === $_SESSION['user_id']) {
            echo json_encode(["success" => false, "error" => "Impossible de supprimer son propre compte"]);
            exit();
        }
        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(["success" => true]);
        exit();
    }
}
