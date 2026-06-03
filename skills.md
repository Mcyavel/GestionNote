# ANTIGRAVITY SKILLS : Guide d'Exécution et d'Automatisation (PHP / JS / SQL)

## SKILL 1 : Gestion et Automatisation de Git
* **Outils requis :** `git` (CLI)
* **Déclencheur :** Initialisation du projet OU détection du mot-clé "commit" / "sauvegarde" dans les instructions de l'utilisateur.
* **Procédures d'exécution :**
    1. **Vérification du dépôt :** Exécuter `git status`. Si une erreur indique que le dépôt n'existe pas, exécuter immédiatement `git init`.
    2. **Cycle de Commit Automatique :** Dès que le mot-clé "commit" est invoqué :
        * **Étape A :** Déclencher obligatoirement les compétences de validation syntaxique (SKILL 3), de tests unitaires (SKILL 5) et de simulation d'exécution (SKILL 6).
        * **Étape B :** Si et seulement si toutes les étapes précédentes renvoient un succès (code de retour `0`), exécuter `git add .`.
        * **Étape C :** Exécuter `git commit -m "[Antigravity] <Description concise et technique des modifications apportées>"`. En cas d'échec des tests, avorter le commit, analyser l'erreur et corriger le code.

## SKILL 2 : Initialisation et Validation SQL
* **Outils requis :** `mysql` (CLI), scripts d'analyse de structures
* **Déclencheur :** Création ou modification du fichier `schema.sql` ou des requêtes en BDD.
* **Procédures d'exécution :**
    1. **Génération de la Structure :** Créer et structurer les tables (`utilisateurs`, `notes`) en respectant les types de données, les indexations et les clés primaires/étrangères.
    2. **Analyse de Conformité :** Vérifier l'existence systématique des contraintes d'intégrité référentielle (`FOREIGN KEY`) associées à une clause de comportement (ex: `ON DELETE CASCADE`).
    3. **Simulation d'import :** Si un serveur MySQL local est accessible, valider la syntaxe du fichier via une exécution de test sur une base temporaire.

## SKILL 3 : "Compilation" et Analyse Syntaxique (Linting)
* **Outils requis :** `php -l`, validation de syntaxe JS, `PHP_CodeSniffer` (phpcs), `Prettier`
* **Déclencheur :** À chaque modification ou création de fichier, avant toute tentative d'exécution ou de commit.
* **Procédures d'exécution :**
    1. **Vérification PHP (Linter) :** Exécuter `php -l <chemin_du_fichier.php>`. Si le résultat contient une erreur de syntaxe (*Parse error*), bloquer le processus et corriger immédiatement la ligne incriminée.
    2. **Vérification JS :** Analyser le fichier JavaScript pour s'assurer de l'absence d'erreurs de structure (accolades, parenthèses ou points-virgules manquants pouvant bloquer l'interpréteur du navigateur).
    3. **Formatage du Code :** * PHP : Exécuter `vendor/bin/phpcs --standard=PSR12 <chemin_du_fichier.php>` pour valider la conformité PSR-12.
        * JS : Exécuter `npx prettier --write <chemin_du_fichier.js>`.

## SKILL 4 : Analyse de Sécurité Statique
* **Outils requis :** `PHPStan`, Expressions régulières (Regex) de scan
* **Déclencheur :** Modification de la couche d'accès aux données ou traitement de variables superglobales (`$_POST`, `$_GET`, `$_COOKIE`).
* **Procédures d'exécution :**
    1. **Analyse Statique PHP :** Exécuter `vendor/bin/phpstan analyse <chemin_du_fichier.php> --level=5`.
    2. **Scan Anti-Injection SQL :** Analyser le code à la recherche de concaténations de variables dans les chaînes SQL. Bloquer et réécrire la fonction avec des requêtes préparées PDO si une vulnérabilité est détectée.
    3. **Scan XSS :** Vérifier que l'affichage de variables dynamiques dans le DOM utilise `textContent` en JS ou `htmlspecialchars()` en PHP.

## SKILL 5 : Tests Unitaires et Fonctionnels
* **Outils requis :** `PHPUnit` (Backend), `Jest` ou `Mocha` (Frontend)
* **Déclencheur :** Phase de pré-commit (SKILL 1) ou demande explicite de validation.
* **Procédures d'exécution :**
    1. **Exécution des tests PHP :** Lancer la commande `vendor/bin/phpunit`. Analyser la console : si un seul test échoue (`FAILURES!`), le code est considéré comme défectueux.
    2. **Exécution des tests JS :** Lancer la suite de tests configurée via `npm test`. Intercepter le code de sortie du processus (bloquer si différent de `0`).

## SKILL 6 : Test de Lancement et Détection des Erreurs d'Exécution (Runtime)
* **Outils requis :** `php -S localhost:8000`, `curl`, Journal d'erreurs (`php_errors.log`)
* **Déclencheur :** Modification d'un endpoint de l'API REST dans `/api/` ou de la logique globale d'une page.
* **Procédures d'exécution :**
    1. **Gestion du Serveur de Test :** Vérifier si un serveur local tourne. Si ce n'est pas le cas, instancier en tâche de fond le serveur interne PHP : `php -S localhost:8000 -t .`.
    2. **Simulation d'Appel API :** Exécuter une requête HTTP isolée via `curl` pour tester le comportement de la modification. 
       * *Exemple :* `curl -i -X POST -d "titre=Test&contenu=Exemple" http://localhost:8000/api/create_note.php`
    3. **Analyse de la Réponse et des Logs :**
        * Intercepter le code d'état HTTP. Si la réponse renvoie une erreur `500 Internal Server Error`, inspecter immédiatement le fichier de log local (`php_errors.log` ou sortie standard du serveur) pour identifier la *Fatal Error* ou l'exception non capturée.
        * Valider la structure de la réponse : s'assurer que le header contient `Content-Type: application/json` et que le corps JSON respecte le format standardisé exigé par le projet (`{"success": true/false, "data": ..., "error": "..."}`).
