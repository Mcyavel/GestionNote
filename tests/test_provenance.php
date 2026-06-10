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

function makePostRequest($url, $data) {
    $options = [
        'http' => [
            'header'  => "Content-Type: application/json\r\n",
            'method'  => 'POST',
            'content' => json_encode($data),
            'ignore_errors' => true
        ]
    ];
    $context  = stream_context_create($options);
    $res = file_get_contents($url, false, $context);
    if ($res === false) {
        throw new Exception("POST request failed for URL: $url");
    }
    return json_decode($res, true);
}

try {
    echo "Starting Provenance Field Integration Test...\n";

    $baseUrl = "http://localhost/www/Miage_Noteold";
    $testEmail = "provenancetest@etu.univ-amu.fr";

    // 1. Cleanup previous runs
    $stmt = $pdo->prepare("DELETE FROM etudiants WHERE email = ?");
    $stmt->execute([$testEmail]);

    // 2. Create student with provenance via API
    echo "Creating student with provenance 'IUT Marseille'...\n";
    $createResponse = makePostRequest("$baseUrl/api/students.php", [
        'action' => 'create',
        'nom' => 'ProvenanceStudent',
        'prenom' => 'Test',
        'email' => $testEmail,
        'annee_inscription' => 2026,
        'provenance' => 'IUT Marseille'
    ]);
    assertTestEquals(true, $createResponse['success'], "Student creation should succeed");
    $studentId = (int)$createResponse['id'];

    // 3. Query DB directly to verify
    $stmtCheck = $pdo->prepare("SELECT provenance FROM etudiants WHERE id = ?");
    $stmtCheck->execute([$studentId]);
    $dbProvenance = $stmtCheck->fetchColumn();
    assertTestEquals('IUT Marseille', $dbProvenance, "Provenance column in DB should store 'IUT Marseille'");

    // 4. Update provenance via API
    echo "Updating student provenance to 'Lycée Cézanne'...\n";
    $updateResponse = makePostRequest("$baseUrl/api/students.php", [
        'action' => 'update',
        'id' => $studentId,
        'nom' => 'ProvenanceStudent',
        'prenom' => 'Test',
        'email' => $testEmail,
        'annee_inscription' => 2026,
        'provenance' => 'Lycée Cézanne'
    ]);
    assertTestEquals(true, $updateResponse['success'], "Student update should succeed");

    // 5. Query DB directly again to verify update
    $stmtCheck->execute([$studentId]);
    $dbProvenanceUpdated = $stmtCheck->fetchColumn();
    assertTestEquals('Lycée Cézanne', $dbProvenanceUpdated, "Provenance column in DB should be updated to 'Lycée Cézanne'");

    // 6. Cleanup
    $pdo->prepare("DELETE FROM etudiants WHERE id = ?")->execute([$studentId]);
    echo "Cleaned up test student.\n";

    echo "🎉 PROVENANCE FIELD INTEGRATION TEST PASSED SUCCESSFULLY! 🎉\n";

} catch (Exception $e) {
    echo "❌ TEST FAILED: " . $e->getMessage() . "\n";
    exit(1);
}
