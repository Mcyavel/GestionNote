<?php
declare(strict_types=1);

/**
 * Point d'entrée de l'API et du Frontend Miage Note
 */

// Analyse de l'URL pour le routage
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$scriptName = $_SERVER['SCRIPT_NAME'];
$basePath = dirname($scriptName);
if ($basePath === DIRECTORY_SEPARATOR || $basePath === '/') {
    $basePath = '';
}

$route = str_replace($basePath, '', $requestUri);
$route = trim($route, '/');

// 1. Gestion des fichiers statiques du Frontend (JS, CSS, images)
$publicFile = __DIR__ . '/frontend/dist/' . ltrim($route, '/');
$realPath = realpath($publicFile);
$allowedDir = realpath(__DIR__ . '/frontend/dist');

if (!empty($route) && $realPath && strpos($realPath, $allowedDir) === 0 && !is_dir($realPath)) {
    $extension = pathinfo($publicFile, PATHINFO_EXTENSION);
    $mimeTypes = [
        'js'   => 'application/javascript',
        'css'  => 'text/css',
        'svg'  => 'image/svg+xml',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'json' => 'application/json',
        'ico'  => 'image/x-icon'
    ];
    
    header('Content-Type: ' . ($mimeTypes[$extension] ?? 'application/octet-stream'));
    readfile($publicFile);
    exit();
}

$parts = explode('/', $route);

// 2. Est-ce une requête API ? (ex: /api/students ou juste /students si le fichier existe)
$apiName = $parts[0] === 'api' ? ($parts[1] ?? '') : $parts[0];
$apiFile = __DIR__ . '/api/' . $apiName . '.php';

if (!empty($apiName) && file_exists($apiFile)) {
    header("X-Content-Type-Options: nosniff");
    header("X-Frame-Options: DENY");
    header("X-XSS-Protection: 1; mode=block");

    $allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $allowedOrigins)) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    } else {
        header("Access-Control-Allow-Origin: http://localhost:5173");
        header("Access-Control-Allow-Credentials: true");
    }

    header("Content-Type: application/json; charset=UTF-8");
    header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Csrf-Token");

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }

    require_once __DIR__ . '/api/auth.php';

    if ($apiName !== 'auth' && $apiName !== 'health') {
        verifyCsrf();
        requireAuth();
        if (!empty($_SESSION['must_change_password'])) {
            http_response_code(403);
            echo json_encode(["success" => false, "error" => "Changement de mot de passe requis", "code" => "MUST_CHANGE_PASSWORD"]);
            exit();
        }
    }

    require_once $apiFile;
    exit();
}

// 3. Sinon, on sert le Frontend (React)
$frontendIndex = __DIR__ . '/frontend/dist/index.html';
if (file_exists($frontendIndex)) {
    header("Content-Type: text/html; charset=UTF-8");
    $html = file_get_contents($frontendIndex);
    
    // Correction dynamique des chemins d'assets dans le HTML
    $html = str_replace('href="/', 'href="' . $basePath . '/', $html);
    $html = str_replace('src="/', 'src="' . $basePath . '/', $html);
    
    echo $html;
    exit();
}

// 4. Si rien n'est trouvé
http_response_code(404);
header("Content-Type: application/json");
echo json_encode(["success" => false, "error" => "Ressource non trouvée : " . $route]);
