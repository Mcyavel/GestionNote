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
    echo "Starting Jury Integration Test Suite via HTTP...\n";

    // --- SETUP TEST RECORDS ---
    // Pre-cleanup in case of duplicate entry from aborted run
    $stmtCleanup = $pdo->prepare("SELECT id FROM etudiants WHERE email = ?");
    $stmtCleanup->execute(['jurystudent@etu.univ-amu.fr']);
    $oldStudId = $stmtCleanup->fetchColumn();
    if ($oldStudId) {
        $pdo->exec("DELETE FROM etudiants WHERE id = " . (int)$oldStudId);
        echo "Cleaned up leftover test student.\n";
    }

    // Start clean transaction
    $pdo->beginTransaction();

    // Insert Year
    $pdo->exec("INSERT INTO annees (nom) VALUES ('Year Integration Test Jury')");
    $anneeId = (int)$pdo->lastInsertId();

    // Insert Semester
    $pdo->exec("INSERT INTO semestres (annee_id, nom, jury_valide) VALUES ($anneeId, 'Semestre Test 1', 0)");
    $semestreId = (int)$pdo->lastInsertId();

    // Insert BCC
    $pdo->exec("INSERT INTO bcc (semestre_id, nom) VALUES ($semestreId, 'BCC Test 1')");
    $bccId = (int)$pdo->lastInsertId();

    // Insert UE
    $pdo->exec("INSERT INTO ue (bcc_id, nom, coefficient) VALUES ($bccId, 'UE Test 1', 1.0)");
    $ueId = (int)$pdo->lastInsertId();

    // Insert ECUE
    $pdo->exec("INSERT INTO ecue (ue_id, nom, credits) VALUES ($ueId, 'ECUE Test 1', 6)");
    $ecueId = (int)$pdo->lastInsertId();

    // Insert Student
    $pdo->exec("INSERT INTO etudiants (nom, prenom, email, annee_inscription, annee_id, meta_data) VALUES ('JuryStudent', 'Test', 'jurystudent@etu.univ-amu.fr', 2026, $anneeId, '{\"Provenance\":\"Marseille\"}')");
    $etudiantId = (int)$pdo->lastInsertId();

    // Insert raw note
    $pdo->exec("INSERT INTO notes (etudiant_id, ecue_id, valeur, statut) VALUES ($etudiantId, $ecueId, 9.20, NULL)");

    // Insert Rules: BCC validation threshold = 10.0, allowed bccs below threshold = 1, minimal threshold = 9.5, minimal annual = 9.5
    $pdo->exec("INSERT INTO regles_validation (annee_id, seuil_validation_bcc, nb_bcc_autorises_sous_seuil, seuil_minimal_bcc, seuil_minimal_annuel) VALUES ($anneeId, 10.00, 1, 9.50, 9.50)");

    $pdo->commit();
    echo "1. Pedagogical structure and student registered in database.\n";

    $baseUrl = "http://localhost/www/Miage_Noteold";

    // --- TEST 1: Initial state ---
    echo "2. Testing initial state...\n";
    $session = makeGetRequest("$baseUrl/api/jury?action=get_session&semestre_id=$semestreId")['data'];
    assertTestEquals(0, $session['semestre']['jury_valide'], "Jury should be not validated initially");
    assertTestEquals(9.20, (float)$session['students'][0]['notes'][$ecueId]['valeur'], "Student initial note should be 9.20");
    assertTestEquals(null, $session['students'][0]['draft_notes'], "Student draft notes should be null");

    $ledger = makeGetRequest("$baseUrl/api/stats?action=global_ledger&annee_id=$anneeId")['data'];
    assertTestEquals('AJOURNÉ', $ledger['students'][0]['validation']['status'], "Validation status should be AJOURNÉ (9.20 is below 10.0 and minimal BCC threshold doesn't apply because it's not validated)");
    assertTestEquals(9.20, (float)$ledger['students'][0]['grades']['ecue'][$ecueId], "Active ECUE grade in ledger should be 9.20");
    assertTestEquals(9.20, (float)$ledger['students'][0]['grades']['bcc'][$bccId], "Active BCC grade in ledger should be 9.20");

    // --- TEST 2: Save Draft ---
    echo "3. Saving draft notes and jury points...\n";
    $postRes = makePostRequest("$baseUrl/api/jury", [
        'action' => 'save_draft',
        'semestre_id' => $semestreId,
        'drafts' => [
            [
                'etudiant_id' => $etudiantId,
                'draft_notes' => [
                    (string)$ecueId => 9.40
                ],
                'draft_points' => [
                    "ecue|$ecueId" => 0.30
                ]
            ]
        ]
    ]);
    assertTestEquals(true, $postRes['success'], "Save draft should succeed");

    // Check that draft was saved
    $session = makeGetRequest("$baseUrl/api/jury?action=get_session&semestre_id=$semestreId")['data'];
    assertTestEquals(9.40, (float)$session['students'][0]['draft_notes'][$ecueId], "Student draft note should be saved as 9.40");
    assertTestEquals(0.30, (float)$session['students'][0]['draft_points']["ecue|$ecueId"], "Student draft points should be saved as 0.30");

    // Ledger should still use raw grades (9.20) because draft is not validated yet!
    $ledger = makeGetRequest("$baseUrl/api/stats?action=global_ledger&annee_id=$anneeId")['data'];
    assertTestEquals(9.20, (float)$ledger['students'][0]['grades']['ecue'][$ecueId], "Ledger active grade should remain 9.20");
    assertTestEquals('AJOURNÉ', $ledger['students'][0]['validation']['status'], "Ledger status should remain AJOURNÉ");

    // --- TEST 3: Validate Jury ---
    echo "4. Validating the jury session...\n";
    $postRes = makePostRequest("$baseUrl/api/jury", [
        'action' => 'validate_jury',
        'semestre_id' => $semestreId
    ]);
    assertTestEquals(true, $postRes['success'], "Validate jury should succeed");

    // Verify semester status
    $session = makeGetRequest("$baseUrl/api/jury?action=get_session&semestre_id=$semestreId")['data'];
    assertTestEquals(1, $session['semestre']['jury_valide'], "Jury should be validated");
    assertTestEquals(null, $session['students'][0]['draft_notes'], "Drafts should be cleared upon validation");

    // Verify main tables updated
    $stmtNote = $pdo->prepare("SELECT valeur FROM notes WHERE etudiant_id = ? AND ecue_id = ?");
    $stmtNote->execute([$etudiantId, $ecueId]);
    assertTestEquals(9.40, (float)$stmtNote->fetchColumn(), "Main notes table should be updated to 9.40");

    $stmtJuryPts = $pdo->prepare("SELECT points FROM notes_jury WHERE etudiant_id = ? AND semestre_id = ? AND element_type = 'ecue' AND element_id = ?");
    $stmtJuryPts->execute([$etudiantId, $semestreId, $ecueId]);
    assertTestEquals(0.30, (float)$stmtJuryPts->fetchColumn(), "Main notes_jury table should have 0.30 points");

    // Ledger should now show adjusted notes and averages!
    $ledger = makeGetRequest("$baseUrl/api/stats?action=global_ledger&annee_id=$anneeId")['data'];
    // raw ECUE should be 9.40
    assertTestEquals(9.40, (float)$ledger['students'][0]['raw_grades']['ecue'][$ecueId], "Raw grade in ledger should be 9.40");
    // active ECUE should be 9.40 + 0.30 = 9.70
    assertTestEquals(9.70, (float)$ledger['students'][0]['grades']['ecue'][$ecueId], "Active grade in ledger should be 9.70");
    // active BCC average should be 9.70
    assertTestEquals(9.70, (float)$ledger['students'][0]['grades']['bcc'][$bccId], "Active BCC average in ledger should be 9.70");
    // status should be ADMIS (BCC average is 9.70, which is >= 9.50 minimal BCC rules threshold)
    assertTestEquals('ADMIS', $ledger['students'][0]['validation']['status'], "Validation status should be ADMIS");

    // --- TEST 4: Reopen Jury ---
    echo "5. Reopening the jury...\n";
    $postRes = makePostRequest("$baseUrl/api/jury", [
        'action' => 'reopen_jury',
        'semestre_id' => $semestreId
    ]);
    assertTestEquals(true, $postRes['success'], "Reopen jury should succeed");

    $session = makeGetRequest("$baseUrl/api/jury?action=get_session&semestre_id=$semestreId")['data'];
    assertTestEquals(0, $session['semestre']['jury_valide'], "Jury should be back in draft mode");
    assertTestEquals(9.40, (float)$session['students'][0]['draft_notes'][$ecueId], "Reopened draft note should copy current note (9.40)");
    assertTestEquals(0.30, (float)$session['students'][0]['draft_points']["ecue|$ecueId"], "Reopened draft points should copy current points (0.30)");

    // Ledger should revert back to raw grades (now 9.40) without jury points!
    $ledger = makeGetRequest("$baseUrl/api/stats?action=global_ledger&annee_id=$anneeId")['data'];
    assertTestEquals(9.40, (float)$ledger['students'][0]['grades']['ecue'][$ecueId], "Ledger active grade should revert to 9.40 (no jury points)");
    assertTestEquals('AJOURNÉ', $ledger['students'][0]['validation']['status'], "Ledger status should revert to AJOURNÉ");

    // --- CLEANUP TEST RECORDS ---
    echo "6. Cleaning up test database records...\n";
    $pdo->beginTransaction();
    $pdo->exec("DELETE FROM jury_drafts WHERE semestre_id = $semestreId");
    $pdo->exec("DELETE FROM notes_jury WHERE semestre_id = $semestreId");
    $pdo->exec("DELETE FROM notes WHERE etudiant_id = $etudiantId");
    $pdo->exec("DELETE FROM etudiants WHERE id = $etudiantId");
    $pdo->exec("DELETE FROM ecue WHERE id = $ecueId");
    $pdo->exec("DELETE FROM ue WHERE id = $ueId");
    $pdo->exec("DELETE FROM bcc WHERE id = $bccId");
    $pdo->exec("DELETE FROM semestres WHERE id = $semestreId");
    $pdo->exec("DELETE FROM regles_validation WHERE annee_id = $anneeId");
    $pdo->exec("DELETE FROM annees WHERE id = $anneeId");
    $pdo->commit();

    echo "🎉 INTEGRATION TESTS PASSED SUCCESSFULLY!\n";
} catch (Exception $e) {
    // Attempt rollback if in transaction
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "❌ INTEGRATION TESTS FAILED: " . $e->getMessage() . "\n";
    exit(1);
}
