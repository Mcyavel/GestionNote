<?php
declare(strict_types=1);

/**
 * Endpoint de test pour vérifier la connexion BDD
 */

try {
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
