<?php
declare(strict_types=1);

session_start();

require_once __DIR__ . '/../config/db.php';
global $pdo;

// Initialize CSRF
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function verifyCsrf(): void {
    if ($_SERVER['REQUEST_METHOD'] === 'GET' || $_SERVER['REQUEST_METHOD'] === 'OPTIONS') return;
    $headers = getallheaders();
    // Support divers formats selon le serveur/client
    $token = $headers['X-CSRF-Token'] ?? $headers['x-csrf-token'] ?? $headers['X-Csrf-Token'] ?? '';
    if (!hash_equals($_SESSION['csrf_token'], $token)) {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "Token CSRF invalide"]);
        exit();
    }
}

function requireAuth(): void {
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(["success" => false, "error" => "Non authentifié"]);
        exit();
    }
}

function requirePermission(string $action, ?int $promoId = null): void {
    requireAuth();
    $role = $_SESSION['user_role'] ?? '';
    $userPromos = $_SESSION['user_promotions'] ?? [];
    
    if ($role === 'ADMIN') return;

    $allowed = false;
    switch ($action) {
        case 'manage_users':
            $allowed = false; // Seul ADMIN
            break;
        case 'manage_curriculum': 
        case 'add_student':
        case 'edit_student':
            $allowed = ($role === 'SCOLARITE');
            break;
        case 'add_grades':
            if ($role === 'ENSEIGNANT_GLOBAL') $allowed = true;
            elseif ($role === 'ENSEIGNANT_PROMO' && $promoId !== null && in_array($promoId, $userPromos)) $allowed = true;
            break;
        case 'view_grades':
            if (in_array($role, ['SCOLARITE', 'ENSEIGNANT_GLOBAL', 'LECTEUR_GLOBAL'])) $allowed = true;
            elseif (in_array($role, ['ENSEIGNANT_PROMO', 'LECTEUR_PROMO']) && $promoId !== null && in_array($promoId, $userPromos)) $allowed = true;
            break;
    }

    if (!$allowed) {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "Accès refusé. Rôle insuffisant."]);
        exit();
    }
}

// Routing direct depuis l'API sans passer par le middleware complet d'index.php
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (basename($uri) === 'auth.php') {
    $action = $_GET['action'] ?? '';
    
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        
        if ($action === 'login') {
            $username = $input['username'] ?? '';
            $password = $input['password'] ?? '';
            
            $stmt = $pdo->prepare("SELECT id, username, password_hash, role, must_change_password FROM users WHERE username = ?");
            $stmt->execute([$username]);
            $user = $stmt->fetch();
            
            if ($user && password_verify($password, $user['password_hash'])) {
                $_SESSION['user_id'] = (int)$user['id'];
                $_SESSION['username'] = $user['username'];
                $_SESSION['user_role'] = $user['role'];
                $_SESSION['must_change_password'] = (bool)$user['must_change_password'];
                
                $stmtPromos = $pdo->prepare("SELECT annee_id FROM user_promotions WHERE user_id = ?");
                $stmtPromos->execute([$user['id']]);
                $_SESSION['user_promotions'] = $stmtPromos->fetchAll(PDO::FETCH_COLUMN) ?: [];
                
                echo json_encode([
                    "success" => true, 
                    "csrf_token" => $_SESSION['csrf_token'],
                    "user" => [
                        "id" => $_SESSION['user_id'],
                        "username" => $_SESSION['username'],
                        "role" => $_SESSION['user_role'],
                        "must_change_password" => $_SESSION['must_change_password']
                    ]
                ]);
            } else {
                http_response_code(401);
                echo json_encode(["success" => false, "error" => "Identifiants invalides"]);
            }
            exit();
        }
        
        if ($action === 'logout') {
            session_destroy();
            echo json_encode(["success" => true]);
            exit();
        }
        
        if ($action === 'change_password') {
            verifyCsrf();
            requireAuth();
            $newPassword = $input['new_password'] ?? '';
            if (strlen($newPassword) < 6) {
                echo json_encode(["success" => false, "error" => "Mot de passe trop court"]);
                exit();
            }
            $hash = password_hash($newPassword, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?");
            $stmt->execute([$hash, $_SESSION['user_id']]);
            $_SESSION['must_change_password'] = false;
            echo json_encode(["success" => true]);
            exit();
        }
    }
    
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if ($action === 'me') {
            if (isset($_SESSION['user_id'])) {
                echo json_encode([
                    "success" => true,
                    "csrf_token" => $_SESSION['csrf_token'],
                    "user" => [
                        "id" => $_SESSION['user_id'],
                        "username" => $_SESSION['username'],
                        "role" => $_SESSION['user_role'],
                        "must_change_password" => $_SESSION['must_change_password']
                    ]
                ]);
            } else {
                http_response_code(401);
                echo json_encode(["success" => false, "error" => "Non authentifié"]);
            }
            exit();
        }
    }
}
