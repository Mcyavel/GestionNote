<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/AcademicLogic.php';
use App\Utils\AcademicLogic;

function assertEquals($expected, $actual, $message) {
    if ($expected === $actual) {
        echo "✅ PASS: $message\n";
    } else {
        echo "❌ FAIL: $message (Expected " . var_export($expected, true) . ", got " . var_export($actual, true) . ")\n";
        exit(1);
    }
}

echo "Running Academic Logic Tests...\n";

// Test calculateAnnualBccAverage
assertEquals(11.0, AcademicLogic::calculateAnnualBccAverage(10.0, 12.0), "Average of 10 and 12 should be 11");
assertEquals(10.0, AcademicLogic::calculateAnnualBccAverage(10.0, null), "Average with null should be 10");
assertEquals(null, AcademicLogic::calculateAnnualBccAverage(null, null), "Average of two nulls should be null");
assertEquals('DEF', AcademicLogic::calculateAnnualBccAverage(10.0, 'DEF'), "Average with one DEF should be DEF");
assertEquals('DEF', AcademicLogic::calculateAnnualBccAverage('DEF', null), "Average with DEF and null should be DEF");

// Test calculateYearValidation
$rules = [
    'seuil_validation_bcc' => 10.0,
    'nb_bcc_autorises_sous_seuil' => 1,
    'seuil_minimal_annuel' => 9.0
];

assertEquals('ADMIS', AcademicLogic::calculateYearValidation([10.0, 12.0, 15.0], $rules), "All >= 10 should be ADMIS");
assertEquals('ADMIS', AcademicLogic::calculateYearValidation([10.0, 9.5, 15.0], $rules), "1 between 9 and 10 should be ADMIS");
assertEquals('AJOURNÉ', AcademicLogic::calculateYearValidation([10.0, 9.5, 9.2], $rules), "2 between 9 and 10 should be AJOURNÉ");
assertEquals('AJOURNÉ', AcademicLogic::calculateYearValidation([10.0, 8.9, 15.0], $rules), "Any < 9 should be AJOURNÉ");
assertEquals('INCOMPLET', AcademicLogic::calculateYearValidation([10.0, null, 15.0], $rules), "Any null should be INCOMPLET");
assertEquals('DÉFAILLANT', AcademicLogic::calculateYearValidation([10.0, 'DEF', 15.0], $rules), "Any DEF should make the year DÉFAILLANT");
assertEquals('DÉFAILLANT', AcademicLogic::calculateYearValidation(['DEF', null, 15.0], $rules), "DEF should override INCOMPLET");

echo "All tests passed successfully!\n";
