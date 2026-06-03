<?php
declare(strict_types=1);

/**
 * Point d'entrée de l'API Miage Note
 */

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Gestion des requêtes OPTIONS (Preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config/db.php';

// Analyse de l'URL pour le routage simple
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$scriptName = dirname($_SERVER['SCRIPT_NAME']);
$basePath = ($scriptName === '/' || $scriptName === '\\') ? '' : $scriptName;
$route = str_replace($basePath, '', $requestUri);

// Nettoyage de la route
$route = trim($route, '/');
$parts = explode('/', $route);

// Routage basique vers les fichiers dans /api/
if (empty($parts[0])) {
    echo json_encode([
        "success" => true,
        "message" => "Bienvenue sur l'API Miage Note",
        "version" => "1.0.0"
    ]);
    exit();
}

// Exemple : /api/students -> cherche api/students.php
$apiFile = __DIR__ . '/api/' . $parts[0] . '.php';

if (file_exists($apiFile)) {
    require_once $apiFile;
} else {
    http_response_code(404);
    echo json_encode([
        "success" => false,
        "error" => "Endpoint non trouvé : " . $parts[0]
    ]);
}
