<?php
<?php
declare(strict_types=1);

/**
 * Endpoint de test pour vérifier la connexion BDD
 */

try {
    if (!function_exists('requirePermission')) {
        require_once __DIR__ . '/auth.php';
    }
    global $pdo;
    // Tentative de requête simple
    $stmt = $pdo->query("SELECT 1");
    $dbStatus = $stmt ? "Connecté" : "Erreur";

    echo json_encode([
        "success" => true,
        "data" => [
            "status" => "API Opérationnelle",
            "database" => $dbStatus,
            "php_version" => PHP_VERSION
        ]
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Erreur BDD : " . $e->getMessage()
    ]);
}
