# REGLES DU PROJET : Système de Gestion des Notes (PHP / JS / SQL)

## 1. Architecture & Organisation du Code
* **Séparation des responsabilités (MVC adapté) :**
    * Le PHP gère uniquement la logique métier, les API REST (JSON) et la persistance des données.
    * Le HTML/JS (Frontend) gère exclusivement l'affichage et l'interactivité. Aucun rendu HTML ne doit être généré directement via `echo` en PHP.
* **Structure des fichiers :**
    * `/api/` : Scripts PHP traitant les requêtes AJAX (Retournent du JSON).
    * `/config/` : Connexion BDD (`db.php`) et constantes globales.
    * `/js/` : Logique Frontend (modules JS modernes).
    * `/css/` : Feuilles de style.
    * `/includes/` : Composants HTML réutilisables (header, footer).

## 2. Standards Backend (PHP)
* **Version :** PHP 8.x+ strict type (`declare(strict_types=1);` au début de chaque fichier).
* **Sécurité impérative :**
    * Toutes les requêtes SQL *doivent* utiliser des requêtes préparées avec PDO (interdiction formelle d'injecter des variables directement dans les chaînes SQL).
    * Hachage des mots de passe obligatoire via `password_hash()` avec `PASSWORD_BCRYPT`.
    * Protection CSRF sur tous les formulaires d'action.
    * Validation stricte et nettoyage (*sanitization*) des entrées utilisateur (`filter_input()`, `htmlspecialchars()`).
* **Gestion des sessions :** Sessions sécurisées (`session_start()` avec options `cookie_secure`, `cookie_httponly`, `samesite`).
* **Réponses API :** Toujours renvoyer un header `Content-Type: application/json` avec un code statut HTTP approprié (200, 400, 401, 403, 500) et une structure constante : `{"success": true/false, "data": ..., "error": "message"}`.

## 3. Standards Base de Données (SQL)
* **Moteur :** MySQL / MariaDB (InnoDB).
* **Conception :**
    * Noms de tables en minuscules, au pluriel (ex: `utilisateurs`, `notes`).
    * Clés primaires auto-incrémentées nommées `id`.
    * Clés étrangères explicites avec contraintes de suppression/mise à jour (`ON DELETE CASCADE` si pertinent).
    * Utilisation de types de données appropriés (`VARCHAR`, `TEXT`, `DATETIME`, `INT`).
* **Indexation :** Index obligatoires sur les clés étrangères et les colonnes fréquemment recherchées ou filtrées.

## 4. Standards Frontend (JavaScript & UI)
* **Standard :** ES6+ (Utilisation de `const`/`let`, `arrow functions`, `async/await` pour l'asynchrone).
* **Communication :** Utilisation exclusive de l'API `fetch()` pour interagir avec les endpoints PHP.
* **Sécurité DOM :** Utilisation de `textContent` ou de mécanismes d'échappement pour insérer des données utilisateur dans le DOM afin d'éviter les failles XSS. Interdiction d'utiliser `innerHTML` directement avec des variables non sécurisées.
* **Expérience Utilisateur (UX) :** Gestion systématique des états de chargement (*spinners*) et affichage clair des messages d'erreur à l'utilisateur sans casser l'interface.

## 5. Instructions de Documentation & Format
* Chaque fonction (PHP et JS) doit être documentée avec un bloc de commentaires clair (PHPDoc / JSDoc) spécifiant le rôle, les paramètres (`@param`) et le type de retour (`@return`).
* Le code doit être propre, indenté avec 4 espaces, et suivre les recommandations PSR-12 pour PHP.
