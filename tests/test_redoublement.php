<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/AcademicLogic.php';

function assertTestEquals($expected, $actual, $message) {
    if ($expected === $actual) {
        echo "   ✅ PASS: $message\n";
    } else {
        echo "   ❌ FAIL: $message (Expected " . var_export($expected, true) . ", got " . var_export($actual, true) . ")\n";
        exit(1);
    }
}

function makeGetRequest($url) {
    $res = file_get_contents($url);
    if ($res === false) {
        throw new Exception("GET request failed for URL: $url");
    }
    return json_decode($res, true);
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
    echo "Starting Multi-Year / Redoublement Integration Test Suite...\n";

    $baseUrl = "http://localhost/www/Miage_Noteold";
    $testEmail = "redoublant.test@etu.univ-amu.fr";

    // 1. Clean up existing records for this test email
    $stmtCleanup = $pdo->prepare("SELECT id FROM etudiants WHERE email = ?");
    $stmtCleanup->execute([$testEmail]);
    $studentIds = $stmtCleanup->fetchAll(PDO::FETCH_COLUMN);
    foreach ($studentIds as $id) {
        $pdo->exec("DELETE FROM etudiants WHERE id = " . (int)$id);
    }
    // Cleanup years
    $pdo->exec("DELETE FROM annees WHERE nom IN ('Master 1 Aix 2024', 'Master 1 Aix 2025')");
    echo "Cleaned up leftover test data.\n";

    // Start clean transaction
    $pdo->beginTransaction();

    // 2. Setup Year 2024
    $pdo->exec("INSERT INTO annees (nom) VALUES ('Master 1 Aix 2024')");
    $annee2024Id = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO semestres (annee_id, nom, jury_valide) VALUES ($annee2024Id, 'Semestre 1 - 2024', 0)");
    $semS1_2024 = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO bcc (semestre_id, nom) VALUES ($semS1_2024, 'BCC 1 - 2024')");
    $bcc_2024 = (int)$pdo->lastInsertId();

    // UE 1 (will be validated with 12.0)
    $pdo->exec("INSERT INTO ue (bcc_id, nom, coefficient) VALUES ($bcc_2024, 'UE Validated 2024', 1.0)");
    $ueVal_2024 = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO ecue (ue_id, nom, credits) VALUES ($ueVal_2024, 'ECUE Validated 1', 3)");
    $ecueVal1_2024 = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO ecue (ue_id, nom, credits) VALUES ($ueVal_2024, 'ECUE Validated 2', 3)");
    $ecueVal2_2024 = (int)$pdo->lastInsertId();

    // UE 2 (will fail with 8.0)
    $pdo->exec("INSERT INTO ue (bcc_id, nom, coefficient) VALUES ($bcc_2024, 'UE Failed 2024', 1.0)");
    $ueFail_2024 = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO ecue (ue_id, nom, credits) VALUES ($ueFail_2024, 'ECUE Failed 1', 6)");
    $ecueFail1_2024 = (int)$pdo->lastInsertId();

    // Setup Year 2025
    $pdo->exec("INSERT INTO annees (nom) VALUES ('Master 1 Aix 2025')");
    $annee2025Id = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO semestres (annee_id, nom, jury_valide) VALUES ($annee2025Id, 'Semestre 1 - 2025', 0)");
    $semS1_2025 = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO bcc (semestre_id, nom) VALUES ($semS1_2025, 'BCC 1 - 2025')");
    $bcc_2025 = (int)$pdo->lastInsertId();

    // UE 1 (same name as 2024)
    $pdo->exec("INSERT INTO ue (bcc_id, nom, coefficient) VALUES ($bcc_2025, 'UE Validated 2024', 1.0)");
    $ueVal_2025 = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO ecue (ue_id, nom, credits) VALUES ($ueVal_2025, 'ECUE Validated 1', 3)");
    $ecueVal1_2025 = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO ecue (ue_id, nom, credits) VALUES ($ueVal_2025, 'ECUE Validated 2', 3)");
    $ecueVal2_2025 = (int)$pdo->lastInsertId();

    // UE 2 (same name as 2024)
    $pdo->exec("INSERT INTO ue (bcc_id, nom, coefficient) VALUES ($bcc_2025, 'UE Failed 2024', 1.0)");
    $ueFail_2025 = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO ecue (ue_id, nom, credits) VALUES ($ueFail_2025, 'ECUE Failed 1', 6)");
    $ecueFail1_2025 = (int)$pdo->lastInsertId();

    $pdo->commit();
    echo "2. Setup promotions and structures in database.\n";

    // 3. Create Student in 2024 via API
    echo "3. Creating student in 2024...\n";
    $createResponse = makePostRequest("$baseUrl/api/students.php", [
        'action' => 'create',
        'nom' => 'Redoublant',
        'prenom' => 'Test',
        'email' => $testEmail,
        'annee_inscription' => 2024,
        'annee_id' => $annee2024Id
    ]);
    assertTestEquals(true, $createResponse['success'], "Student creation should succeed");
    $student2024Id = (int)$createResponse['id'];

    // 4. Save grades for student in 2024 via API (UE Validated = 12.0, UE Failed = 8.0)
    echo "4. Saving grades for student in 2024...\n";
    $saveResponse = makePostRequest("$baseUrl/api/grades.php", [
        'action' => 'save',
        'notes' => [
            ['etudiant_id' => $student2024Id, 'ecue_id' => $ecueVal1_2024, 'valeur' => '11.50'],
            ['etudiant_id' => $student2024Id, 'ecue_id' => $ecueVal2_2024, 'valeur' => '12.50'],
            ['etudiant_id' => $student2024Id, 'ecue_id' => $ecueFail1_2024, 'valeur' => '5.00']
        ]
    ]);
    assertTestEquals(true, $saveResponse['success'], "Grades save should succeed");

    // 5. Inscribe the student in 2025 via API (Redoublant)
    echo "5. Re-registering student in 2025...\n";
    $reRegisterResponse = makePostRequest("$baseUrl/api/students.php", [
        'action' => 'create',
        'nom' => 'Redoublant',
        'prenom' => 'Test',
        'email' => $testEmail,
        'annee_inscription' => 2025,
        'annee_id' => $annee2025Id
    ]);
    assertTestEquals(true, $reRegisterResponse['success'], "Student re-registration should succeed");
    $student2025Id = (int)$reRegisterResponse['id'];

    // 6. Verify that notes of validated UE are copied, but failed UE are not
    echo "6. Verifying synchronized notes for 2025...\n";
    $stmtNotes = $pdo->prepare("SELECT ecue_id, valeur FROM notes WHERE etudiant_id = ?");
    $stmtNotes->execute([$student2025Id]);
    $notes2025 = $stmtNotes->fetchAll(PDO::FETCH_KEY_PAIR);

    // ECUE Validated 1 & 2 should have 11.50 and 12.50
    assertTestEquals(11.50, isset($notes2025[$ecueVal1_2025]) ? (float)$notes2025[$ecueVal1_2025] : null, "ECUE Validated 1 note should be copied");
    assertTestEquals(12.50, isset($notes2025[$ecueVal2_2025]) ? (float)$notes2025[$ecueVal2_2025] : null, "ECUE Validated 2 note should be copied");
    // ECUE Failed 1 should not exist in notes for 2025
    assertTestEquals(false, isset($notes2025[$ecueFail1_2025]), "ECUE Failed 1 note should NOT be copied");

    // 7. Verify Cursus History Endpoint
    echo "7. Verifying history endpoint...\n";
    $historyResponse = makeGetRequest("$baseUrl/api/students.php?action=history&student_id=$student2025Id");
    assertTestEquals(true, $historyResponse['success'], "History fetching should succeed");
    assertTestEquals(2, count($historyResponse['data']), "There should be two registrations in history");
    assertTestEquals('AJOURNÉ', $historyResponse['data'][1]['status'], "2024 status should be calculated"); // UE1=12, UE2=8 -> average=10, but UE2 is below validation threshold (8.0 < 10.0), so AJOURNE

    // 8. Try to overwrite validated UE grades in 2025 via manual save and check that they are preserved/locked
    echo "8. Trying to manually overwrite validated UE note in 2025...\n";
    $saveOverwriteResponse = makePostRequest("$baseUrl/api/grades.php", [
        'action' => 'save',
        'notes' => [
            ['etudiant_id' => $student2025Id, 'ecue_id' => $ecueVal1_2025, 'valeur' => '18.00'], // Attempt overwrite
            ['etudiant_id' => $student2025Id, 'ecue_id' => $ecueFail1_2025, 'valeur' => '10.00']  // Fresh note for non-validated UE
        ]
    ]);
    assertTestEquals(true, $saveOverwriteResponse['success'], "Save request should complete");

    // Retrieve again to see if overwrite was blocked but fresh note was saved
    $stmtNotes->execute([$student2025Id]);
    $notes2025PostSave = $stmtNotes->fetchAll(PDO::FETCH_KEY_PAIR);
    assertTestEquals(11.50, (float)$notes2025PostSave[$ecueVal1_2025], "ECUE Validated 1 note must NOT be overwritten by manual save");
    assertTestEquals(10.00, (float)$notes2025PostSave[$ecueFail1_2025], "ECUE Failed 1 note should be saved because it wasn't validated");

    // 9. Try to overwrite validated UE grades via Apogee Excel Import simulator
    echo "9. Simulating Apogee Excel import overwrite attempt...\n";
    // Mock Apogee layout row:
    // Header row: Numéro, Nom, Prénom, [N (Type Rés)], [N (Type Rés)], [N (Type Rés)]
    // ELP row: '', '', '', 'ECUE Validated 1', 'ECUE Validated 2', 'ECUE Failed 1'
    // Student row: '12345678', 'Redoublant', 'Test', '19.00', '19.00', '14.00'
    $importApogeeResponse = makePostRequest("$baseUrl/api/grades.php", [
        'action' => 'import_apogee',
        'data' => [
            ['Type Rés.', '', '', 'N', 'N', 'N'],
            ['', '', '', 'ECUE Validated 1', 'ECUE Validated 2', 'ECUE Failed 1'],
            ['Description', 'Master 1 Aix 2025', '', '', '', ''],
            ['Numéro', 'Nom', 'Prénom', '', '', ''],
            ['12345678', 'Redoublant', 'Test', '19.00', '19.00', '14.00']
        ]
    ]);
    assertTestEquals(true, $importApogeeResponse['success'], "Apogee import request should complete");

    // Retrieve notes to check if locked notes were protected but other notes were updated
    $stmtNotes->execute([$student2025Id]);
    $notes2025PostImport = $stmtNotes->fetchAll(PDO::FETCH_KEY_PAIR);
    assertTestEquals(11.50, (float)$notes2025PostImport[$ecueVal1_2025], "ECUE Validated 1 note must NOT be overwritten by Apogee import");
    assertTestEquals(12.50, (float)$notes2025PostImport[$ecueVal2_2025], "ECUE Validated 2 note must NOT be overwritten by Apogee import");
    assertTestEquals(14.00, (float)$notes2025PostImport[$ecueFail1_2025], "ECUE Failed 1 note should be updated by Apogee import");

    echo "🎉 ALL MULTI-YEAR & REDOUBLEMENT INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n";

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "❌ TEST FAILED: " . $e->getMessage() . "\n";
    exit(1);
}
