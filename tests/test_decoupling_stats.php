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
    echo "Starting Decoupling Maquettes & Promotions + Temporal Stats Integration Test...\n";

    $baseUrl = "http://localhost/www/Miage_Noteold";
    $testMaquetteName = "Decoupling Test Maquette M1";
    $testPromo1Name = "Decoupling Promo Marseille 2026";
    $testPromo2Name = "Decoupling Promo Aix 2026";
    $email1 = "decoupling.mrs@etu.univ-amu.fr";
    $email2 = "decoupling.aix@etu.univ-amu.fr";

    // 1. Cleanup previous test runs
    echo "Cleaning up leftover test data...\n";
    $stmtCleanup = $pdo->prepare("SELECT id FROM etudiants WHERE email IN (?, ?)");
    $stmtCleanup->execute([$email1, $email2]);
    $studentIds = $stmtCleanup->fetchAll(PDO::FETCH_COLUMN);
    foreach ($studentIds as $id) {
        $pdo->exec("DELETE FROM etudiants WHERE id = " . (int)$id);
    }

    $stmtGetYears = $pdo->prepare("SELECT id FROM annees WHERE nom IN (?, ?, ?)");
    $stmtGetYears->execute([$testMaquetteName, $testPromo1Name, $testPromo2Name]);
    $yearIds = $stmtGetYears->fetchAll(PDO::FETCH_COLUMN);
    foreach ($yearIds as $yId) {
        $pdo->exec("DELETE FROM annees WHERE id = " . (int)$yId);
    }

    // 2. Create Maquette via API
    echo "1. Creating Maquette: '$testMaquetteName'...\n";
    $resMaq = makePostRequest("$baseUrl/api/curriculum.php", [
        'type' => 'annee',
        'nom' => $testMaquetteName
    ]);
    assertTestEquals(true, $resMaq['success'], "Maquette creation should succeed");
    $maqId = (int)$resMaq['id'];

    // Verify is_maquette = 1 and archived = 0 by default in DB
    $stmtCheckMaq = $pdo->prepare("SELECT is_maquette, archived, maquette_id FROM annees WHERE id = ?");
    $stmtCheckMaq->execute([$maqId]);
    $maqRow = $stmtCheckMaq->fetch(PDO::FETCH_ASSOC);
    assertTestEquals(1, (int)$maqRow['is_maquette'], "New year created via generic endpoint should be a maquette (is_maquette = 1)");
    assertTestEquals(0, (int)$maqRow['archived'], "Should not be archived by default");
    assertTestEquals(null, $maqRow['maquette_id'], "maquette_id should be null for a maquette");

    // 3. Create structure for the maquette
    echo "2. Building Maquette structure (Semestre, BCC, UE, ECUE)...\n";
    $resSem = makePostRequest("$baseUrl/api/curriculum.php", [
        'type' => 'semestre',
        'annee_id' => $maqId,
        'nom' => 'Semestre 1'
    ]);
    assertTestEquals(true, $resSem['success'], "Semestre creation should succeed");
    $semId = (int)$resSem['id'];

    $resBcc = makePostRequest("$baseUrl/api/curriculum.php", [
        'type' => 'bcc',
        'semestre_id' => $semId,
        'nom' => 'BCC Scientifique'
    ]);
    assertTestEquals(true, $resBcc['success'], "BCC creation should succeed");
    $bccId = (int)$resBcc['id'];

    $resUe = makePostRequest("$baseUrl/api/curriculum.php", [
        'type' => 'ue',
        'bcc_id' => $bccId,
        'nom' => 'UE Programmation',
        'coefficient' => 2.0
    ]);
    assertTestEquals(true, $resUe['success'], "UE creation should succeed");
    $ueId = (int)$resUe['id'];

    $resEcue = makePostRequest("$baseUrl/api/curriculum.php", [
        'type' => 'ecue',
        'ue_id' => $ueId,
        'nom' => 'ECUE Algorithmie',
        'credits' => 6,
        'heures' => 30
    ]);
    assertTestEquals(true, $resEcue['success'], "ECUE creation should succeed");
    $ecueId = (int)$resEcue['id'];

    // Set validation rules for maquette
    $resRules = makePostRequest("$baseUrl/api/curriculum.php", [
        'action' => 'update_rules',
        'annee_id' => $maqId,
        'seuil_validation_bcc' => 10.0,
        'nb_bcc_autorises_sous_seuil' => 0,
        'seuil_minimal_annuel' => 10.0
    ]);
    assertTestEquals(true, $resRules['success'], "Rules update should succeed");

    // 4. Instantiate Promotion 1 (Marseille 2026) from Maquette
    echo "3. Instantiating Promotion 1: '$testPromo1Name' from Maquette...\n";
    $resPromo1 = makePostRequest("$baseUrl/api/curriculum.php", [
        'action' => 'create_promotion',
        'annee_id' => $maqId,
        'nom' => $testPromo1Name
    ]);
    assertTestEquals(true, $resPromo1['success'], "Promotion 1 creation should succeed");
    $promo1Id = (int)$resPromo1['id'];

    // Verify DB columns for Promo 1
    $stmtCheckPromo1 = $pdo->prepare("SELECT is_maquette, maquette_id, archived FROM annees WHERE id = ?");
    $stmtCheckPromo1->execute([$promo1Id]);
    $promo1Row = $stmtCheckPromo1->fetch(PDO::FETCH_ASSOC);
    assertTestEquals(0, (int)$promo1Row['is_maquette'], "Promo 1 should be a promotion (is_maquette = 0)");
    assertTestEquals($maqId, (int)$promo1Row['maquette_id'], "Promo 1 should reference the maquette ID");
    assertTestEquals(0, (int)$promo1Row['archived'], "Promo 1 should not be archived by default");

    // Verify structure duplication for Promo 1
    $stmtPromo1Sem = $pdo->prepare("SELECT id FROM semestres WHERE annee_id = ?");
    $stmtPromo1Sem->execute([$promo1Id]);
    $promo1SemId = (int)$stmtPromo1Sem->fetchColumn();
    assertTestEquals(true, $promo1SemId > 0, "Semestre should be duplicated for Promo 1");

    $stmtPromo1Bcc = $pdo->prepare("SELECT id, nom FROM bcc WHERE semestre_id = ?");
    $stmtPromo1Bcc->execute([$promo1SemId]);
    $promo1Bcc = $stmtPromo1Bcc->fetch(PDO::FETCH_ASSOC);
    assertTestEquals('BCC Scientifique', $promo1Bcc['nom'], "BCC name should match");
    $promo1BccId = (int)$promo1Bcc['id'];

    $stmtPromo1Ue = $pdo->prepare("SELECT id, nom, coefficient FROM ue WHERE bcc_id = ?");
    $stmtPromo1Ue->execute([$promo1BccId]);
    $promo1Ue = $stmtPromo1Ue->fetch(PDO::FETCH_ASSOC);
    assertTestEquals('UE Programmation', $promo1Ue['nom'], "UE name should match");
    assertTestEquals(2.0, (float)$promo1Ue['coefficient'], "UE coeff should match");
    $promo1UeId = (int)$promo1Ue['id'];

    $stmtPromo1Ecue = $pdo->prepare("SELECT id, nom FROM ecue WHERE ue_id = ?");
    $stmtPromo1Ecue->execute([$promo1UeId]);
    $promo1Ecue = $stmtPromo1Ecue->fetch(PDO::FETCH_ASSOC);
    assertTestEquals('ECUE Algorithmie', $promo1Ecue['nom'], "ECUE name should match");
    $promo1EcueId = (int)$promo1Ecue['id'];

    // Verify validation rules duplication for Promo 1
    $stmtPromo1Rules = $pdo->prepare("SELECT * FROM regles_validation WHERE annee_id = ?");
    $stmtPromo1Rules->execute([$promo1Id]);
    $promo1Rules = $stmtPromo1Rules->fetch(PDO::FETCH_ASSOC);
    assertTestEquals(10.0, (float)$promo1Rules['seuil_validation_bcc'], "Rules should copy threshold correctly");

    // 5. Instantiate Promotion 2 (Aix 2026) from Maquette
    echo "4. Instantiating Promotion 2: '$testPromo2Name' from Maquette...\n";
    $resPromo2 = makePostRequest("$baseUrl/api/curriculum.php", [
        'action' => 'create_promotion',
        'annee_id' => $maqId,
        'nom' => $testPromo2Name
    ]);
    assertTestEquals(true, $resPromo2['success'], "Promotion 2 creation should succeed");
    $promo2Id = (int)$resPromo2['id'];

    // Retrieve ECUE ID for Promo 2
    $stmtPromo2Sem = $pdo->prepare("SELECT id FROM semestres WHERE annee_id = ?");
    $stmtPromo2Sem->execute([$promo2Id]);
    $promo2SemId = (int)$stmtPromo2Sem->fetchColumn();
    $stmtPromo2Bcc = $pdo->prepare("SELECT id FROM bcc WHERE semestre_id = ?");
    $stmtPromo2Bcc->execute([$promo2SemId]);
    $promo2BccId = (int)$stmtPromo2Bcc->fetchColumn();
    $stmtPromo2Ue = $pdo->prepare("SELECT id FROM ue WHERE bcc_id = ?");
    $stmtPromo2Ue->execute([$promo2BccId]);
    $promo2UeId = (int)$stmtPromo2Ue->fetchColumn();
    $stmtPromo2Ecue = $pdo->prepare("SELECT id FROM ecue WHERE ue_id = ?");
    $stmtPromo2Ecue->execute([$promo2UeId]);
    $promo2EcueId = (int)$stmtPromo2Ecue->fetchColumn();

    // 6. Enroll Students & Grade them
    echo "5. Enrolling students and adding grades...\n";
    // Student 1 (Marseille)
    $resStud1 = makePostRequest("$baseUrl/api/students.php", [
        'action' => 'create',
        'nom' => 'MarseilleStudent',
        'prenom' => 'Jean',
        'email' => $email1,
        'annee_inscription' => 2026,
        'provenance' => 'IUT Marseille',
        'annee_id' => $promo1Id
    ]);
    assertTestEquals(true, $resStud1['success'], "Enroll Student 1 should succeed");
    $stud1Id = (int)$resStud1['id'];

    // Student 2 (Aix)
    $resStud2 = makePostRequest("$baseUrl/api/students.php", [
        'action' => 'create',
        'nom' => 'AixStudent',
        'prenom' => 'Paul',
        'email' => $email2,
        'annee_inscription' => 2025, // different year to test chronological sorting order
        'provenance' => 'IUT Aix',
        'annee_id' => $promo2Id
    ]);
    assertTestEquals(true, $resStud2['success'], "Enroll Student 2 should succeed");
    $stud2Id = (int)$resStud2['id'];

    // Add grade 14.5 for student 1 in Promo 1
    $resGrade1 = makePostRequest("$baseUrl/api/grades.php", [
        'action' => 'save',
        'notes' => [
            ['etudiant_id' => $stud1Id, 'ecue_id' => $promo1EcueId, 'valeur' => '14.5']
        ]
    ]);
    assertTestEquals(true, $resGrade1['success'], "Saving Grade 1 should succeed");

    // Add grade 8.0 for student 2 in Promo 2
    $resGrade2 = makePostRequest("$baseUrl/api/grades.php", [
        'action' => 'save',
        'notes' => [
            ['etudiant_id' => $stud2Id, 'ecue_id' => $promo2EcueId, 'valeur' => '8.0']
        ]
    ]);
    assertTestEquals(true, $resGrade2['success'], "Saving Grade 2 should succeed");

    // 7. Verify Academic Logic Calculations for both students
    echo "6. Verifying student status and averages...\n";
    $calc1 = \App\Utils\AcademicLogic::calculateStudentAverageAndStatus($stud1Id, $promo1Id, $pdo);
    assertTestEquals(14.5, $calc1['average'], "Jean average should be 14.5");
    assertTestEquals('ADMIS', $calc1['status'], "Jean status should be ADMIS");

    $calc2 = \App\Utils\AcademicLogic::calculateStudentAverageAndStatus($stud2Id, $promo2Id, $pdo);
    assertTestEquals(8.0, $calc2['average'], "Paul average should be 8.0");
    assertTestEquals('AJOURNÉ', $calc2['status'], "Paul status should be AJOURNÉ");

    // 8. Test Archive Logic
    echo "7. Testing Archiving of Promotion 2...\n";
    $resArchive = makePostRequest("$baseUrl/api/curriculum.php", [
        'action' => 'update',
        'type' => 'annee',
        'id' => $promo2Id,
        'archived' => 1
    ]);
    assertTestEquals(true, $resArchive['success'], "Archiving Promo 2 should succeed");

    // Verify in DB that it is archived
    $stmtCheckArchive = $pdo->prepare("SELECT archived FROM annees WHERE id = ?");
    $stmtCheckArchive->execute([$promo2Id]);
    assertTestEquals(1, (int)$stmtCheckArchive->fetchColumn(), "Promo 2 should be archived in DB");

    // 9. Test Temporal Evolution API
    echo "8. Fetching Temporal Evolution Stats...\n";
    $statsUrl = "$baseUrl/api/stats.php?action=temporal_evolution&annee_ids=$promo1Id,$promo2Id";
    $statsRes = makeGetRequest($statsUrl);
    assertTestEquals(true, $statsRes['success'], "Temporal Evolution API request should succeed");

    $timeline = $statsRes['data']['timeline'];
    assertTestEquals(2, count($timeline), "Timeline should contain 2 promotions");

    // Sorting check: Promo 2 has student registered with annee_inscription = 2025.
    // Promo 1 has student registered with annee_inscription = 2026.
    // Thus Promo 2 (Aix) should be first in the timeline (chronological order)
    assertTestEquals($promo2Id, (int)$timeline[0]['annee_id'], "Promo 2 (Aix, min registration 2025) should be first in timeline");
    assertTestEquals($promo1Id, (int)$timeline[1]['annee_id'], "Promo 1 (Marseille, min registration 2026) should be second in timeline");

    // Verify stats in the timeline
    // Promo 2: 8.0 avg, 0% success (admis_rate), BCC Scientifique avg = 8.0, UE Programmation avg = 8.0
    assertTestEquals(8.0, (float)$timeline[0]['average'], "Promo 2 average should be 8.0");
    assertTestEquals(0.0, (float)$timeline[0]['admis_rate'], "Promo 2 admis_rate should be 0%");
    assertTestEquals(8.0, (float)$timeline[0]['bccs']['BCC Scientifique'], "Promo 2 BCC avg should be 8.0");
    assertTestEquals(8.0, (float)$timeline[0]['ues']['UE Programmation'], "Promo 2 UE avg should be 8.0");

    // Promo 1: 14.5 avg, 100% success, BCC Scientifique avg = 14.5, UE Programmation avg = 14.5
    assertTestEquals(14.5, (float)$timeline[1]['average'], "Promo 1 average should be 14.5");
    assertTestEquals(100.0, (float)$timeline[1]['admis_rate'], "Promo 1 admis_rate should be 100%");
    assertTestEquals(14.5, (float)$timeline[1]['bccs']['BCC Scientifique'], "Promo 1 BCC avg should be 14.5");
    assertTestEquals(14.5, (float)$timeline[1]['ues']['UE Programmation'], "Promo 1 UE avg should be 14.5");

    // Verify all_ue_names list contains the UE
    assertTestEquals(true, in_array('UE Programmation', $statsRes['data']['all_ue_names']), "all_ue_names list should contain 'UE Programmation'");

    // 10. Cleanup all test data
    echo "9. Cleaning up test data...\n";
    $pdo->exec("DELETE FROM notes WHERE etudiant_id IN ($stud1Id, $stud2Id)");
    $pdo->exec("DELETE FROM etudiants WHERE id IN ($stud1Id, $stud2Id)");
    $pdo->exec("DELETE FROM regles_validation WHERE annee_id IN ($maqId, $promo1Id, $promo2Id)");
    
    // Deleting promotions and maquette will cascade/need to delete sub structures
    $pdo->exec("DELETE FROM ecue WHERE id IN ($ecueId, $promo1EcueId, $promo2EcueId)");
    $pdo->exec("DELETE FROM ue WHERE id IN ($ueId, $promo1UeId, $promo2UeId)");
    $pdo->exec("DELETE FROM bcc WHERE id IN ($bccId, $promo1BccId, $promo2BccId)");
    $pdo->exec("DELETE FROM semestres WHERE id IN ($semId, $promo1SemId, $promo2SemId)");
    $pdo->exec("DELETE FROM annees WHERE id IN ($maqId, $promo1Id, $promo2Id)");

    echo "🎉 DECOUPLING & TEMPORAL STATS INTEGRATION TEST PASSED SUCCESSFULLY! 🎉\n";

} catch (Exception $e) {
    echo "❌ TEST FAILED: " . $e->getMessage() . "\n";
    // Attempt cleanup in catch block
    if (isset($stud1Id)) $pdo->exec("DELETE FROM notes WHERE etudiant_id = $stud1Id");
    if (isset($stud2Id)) $pdo->exec("DELETE FROM notes WHERE etudiant_id = $stud2Id");
    if (isset($stud1Id)) $pdo->exec("DELETE FROM etudiants WHERE id = $stud1Id");
    if (isset($stud2Id)) $pdo->exec("DELETE FROM etudiants WHERE id = $stud2Id");
    if (isset($maqId)) $pdo->exec("DELETE FROM annees WHERE id = $maqId");
    if (isset($promo1Id)) $pdo->exec("DELETE FROM annees WHERE id = $promo1Id");
    if (isset($promo2Id)) $pdo->exec("DELETE FROM annees WHERE id = $promo2Id");
    exit(1);
}
