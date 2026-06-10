<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/db.php';

function assertTestEquals($expected, $actual, $message) {
    if ($expected === $actual) {
        echo "   ✅ PASS: $message\n";
    } else {
        echo "   ❌ FAIL: $message (Expected " . var_export($expected, true) . ", got " . var_export($actual, true) . ")\n";
        exit(1);
    }
}

try {
    echo "Starting Advanced Stats API Integration Test...\n";

    $baseUrl = "http://localhost/www/Miage_Noteold";

    // 1. Récupérer les années disponibles depuis la DB pour tester avec une vraie année
    global $pdo;
    $stmt = $pdo->query("SELECT id, nom FROM annees LIMIT 1");
    $annee = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$annee) {
        echo "⚠️ WARNING: Aucune année trouvée en base de données pour exécuter le test. Création d'une année de test...\n";
        
        $pdo->exec("INSERT INTO annees (nom) VALUES ('Année Test Stats')");
        $anneeId = (int)$pdo->lastInsertId();
        
        // Créer un semestre
        $pdo->exec("INSERT INTO semestres (annee_id, nom) VALUES ($anneeId, 'Semestre 1')");
        $semId = (int)$pdo->lastInsertId();

        // Créer un BCC
        $pdo->exec("INSERT INTO bcc (semestre_id, nom) VALUES ($semId, 'BCC Test')");
        $bccId = (int)$pdo->lastInsertId();

        // Créer une UE
        $pdo->exec("INSERT INTO ue (bcc_id, nom, coefficient) VALUES ($bccId, 'UE Test', 1.0)");
        $ueId = (int)$pdo->lastInsertId();

        // Créer un ECUE
        $pdo->exec("INSERT INTO ecue (ue_id, nom) VALUES ($ueId, 'ECUE Test')");
        $ecueId = (int)$pdo->lastInsertId();

        // Créer un étudiant
        $pdo->exec("INSERT INTO etudiants (annee_id, nom, prenom, email, provenance, annee_inscription) VALUES ($anneeId, 'StatStudent', 'Test', 'stats.test@etu.fr', 'IUT Aix', 2026)");
        $studId = (int)$pdo->lastInsertId();

        // Ajouter une note
        $pdo->exec("INSERT INTO notes (etudiant_id, ecue_id, valeur) VALUES ($studId, $ecueId, 12.5)");

        $anneeCreated = true;
    } else {
        $anneeId = (int)$annee['id'];
        $anneeCreated = false;
        echo "Testing with existing year: " . $annee['nom'] . " (ID: $anneeId)\n";
    }

    // 2. Faire la requête GET sur l'action advanced_stats
    $url = "$baseUrl/api/stats.php?action=advanced_stats&annee_id=$anneeId";
    echo "Querying API: $url\n";
    
    $res = file_get_contents($url);
    if ($res === false) {
        throw new Exception("GET request failed for URL: $url");
    }

    $response = json_decode($res, true);

    // 3. Valider la structure de la réponse
    assertTestEquals(true, $response['success'], "API request should return success = true");
    assertTestEquals(true, isset($response['data']), "API response should contain 'data' key");
    
    $data = $response['data'];
    assertTestEquals(true, isset($data['provenance']), "Data should contain 'provenance' key");
    assertTestEquals(true, isset($data['promo']), "Data should contain 'promo' key");
    assertTestEquals(true, isset($data['best_ecues']), "Data should contain 'best_ecues' key");
    assertTestEquals(true, isset($data['worst_ecues']), "Data should contain 'worst_ecues' key");
    assertTestEquals(true, isset($data['student_progressions']), "Data should contain 'student_progressions' key");

    // Valider les détails de la promo
    $promo = $data['promo'];
    assertTestEquals(true, isset($promo['total_students']), "Promo details should include 'total_students'");
    assertTestEquals(true, isset($promo['admis']), "Promo details should include 'admis'");
    assertTestEquals(true, isset($promo['ajourne']), "Promo details should include 'ajourne'");

    // Si on a créé une année temporaire, on valide les valeurs exactes
    if ($anneeCreated) {
        assertTestEquals(1, $promo['total_students'], "Promo total students should be 1");
        assertTestEquals(1, $promo['admis'], "Promo admis should be 1");
        assertTestEquals(12.5, $promo['average'], "Promo average should be 12.5");
        
        // Provenance
        assertTestEquals(1, count($data['provenance']), "There should be exactly 1 provenance entry");
        assertTestEquals('IUT Aix', $data['provenance'][0]['provenance'], "Provenance should be 'IUT Aix'");
        assertTestEquals(12.5, $data['provenance'][0]['average'], "Provenance average should be 12.5");
        assertTestEquals(100.0, $data['provenance'][0]['admis_rate'], "Provenance success rate should be 100%");

        // Nettoyer la base de données
        echo "Cleaning up temporary test data...\n";
        $pdo->exec("DELETE FROM notes WHERE etudiant_id = $studId");
        $pdo->exec("DELETE FROM etudiants WHERE id = $studId");
        $pdo->exec("DELETE FROM ecue WHERE id = $ecueId");
        $pdo->exec("DELETE FROM ue WHERE id = $ueId");
        $pdo->exec("DELETE FROM bcc WHERE id = $bccId");
        $pdo->exec("DELETE FROM semestres WHERE id = $semId");
        $pdo->exec("DELETE FROM annees WHERE id = $anneeId");
    }

    echo "🎉 ADVANCED STATS API INTEGRATION TEST PASSED SUCCESSFULLY! 🎉\n";

} catch (Exception $e) {
    echo "❌ TEST FAILED: " . $e->getMessage() . "\n";
    exit(1);
}
