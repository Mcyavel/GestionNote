<?php
declare(strict_types=1);

/**
 * Configuration de la base de données (PDO)
 */

// À adapter selon votre environnement Laragon
$host = 'localhost';
$dbname = 'miage_note';
$username = 'root';
$password = '';

try {
    $dsn = "mysql:host=$host;dbname=$dbname;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    
    $pdo = new PDO($dsn, $username, $password, $options);
} catch (PDOException $e) {
    // En production, ne pas afficher le message d'erreur détaillé
    die("Erreur de connexion à la base de données : " . $e->getMessage());
}
