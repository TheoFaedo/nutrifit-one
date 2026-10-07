# Architecture

## 1. Vue d’ensemble

- **Frontend :** application Angular, responsable de l’interface, des parcours de saisie et de l’affichage des totaux.
- **Backend :** Supabase, utilisé pour PostgreSQL, l’authentification et les politiques d’accès aux données.
- **Authentification :** OAuth Google via Supabase Auth.
- **Modèle conceptuel :** voir [model.wsd](model.wsd).

Le diagramme est conceptuel : les noms et cardinalités devront être traduits en tables, clés étrangères, contraintes et politiques RLS. Il ne définit pas à lui seul les choix ouverts ci-dessous.

## 2. Principes de données

### 2.1 Compte et isolation

- `User` représente le profil applicatif rattaché à `auth.users.id` ; l’identifiant d’authentification est la clé de rattachement.
- Les données personnelles (journal et objectifs) sont rattachées à leur propriétaire.
- `Food.isPublic` indique si une fiche est lisible par tous les utilisateurs ; les aliments privés restent visibles par leur propriétaire. Seul l’auteur peut modifier une fiche publique. Un résultat Open Food Facts devient un `Food` public seulement après sélection par un utilisateur, qui en devient l’auteur.
- Avec Supabase, les accès aux données privées doivent être limités côté base par Row Level Security (RLS), et pas uniquement masqués dans l’interface.
- Le diagramme relie également un utilisateur aux aliments qu’il crée. Les politiques RLS doivent tenir compte de `isPublic` et des droits du propriétaire.

### 2.2 Versions des aliments

- `Food.id` identifie l’aliment logique ; `Food.versionId` identifie une version de cet aliment.
- Une nouvelle modification produit une nouvelle version plutôt qu’une mise à jour destructive de la version déjà référencée.
- Une seule version est courante par aliment logique. Cette unicité doit être garantie en base, par exemple avec une contrainte adaptée sur l’identifiant logique et l’indicateur de version courante.
- Les versions référencées par des `Intake` doivent être conservées pour maintenir les valeurs nutritionnelles historiques.
- `Quantity` et `NutritionFacts` sont rattachés à la version de `Food` à laquelle ils s’appliquent. Toute référence de journal doit donc pointer vers une portion de cette même version.

### 2.3 Journal et objectifs

- `Intake` appartient à un utilisateur, référence une version de `Food` via une `Quantity`, et porte une date de consommation, une quantité consommée (`ratio`) et une catégorie de repas.
- À la création d’un `Intake`, la version référencée doit être courante. Après création, la référence historique reste stable même si une version plus récente devient courante.
- `DailyGoal` appartient à un utilisateur et contient les cibles de `NutritionFacts` applicables à une période. Les règles d’absence, de chevauchement et de bornes des périodes sont à définir avant d’ajouter les contraintes SQL correspondantes.
- À l’onboarding, l’un des préréglages perdre, maintenir ou gagner préremplit les cibles ; la personne peut ensuite les modifier. Les valeurs initiales exactes restent à définir.

### 2.4 Recettes

- Une recette est un type de `Food` et contient des `RecipePart`, chacun référençant une version précise d’un aliment et l’une de ses portions.
- Une recette expose une portion de référence à laquelle correspondent ses `NutritionFacts`.
- Les valeurs nutritionnelles d’une recette sont calculées depuis ses ingrédients. Chaque version de recette conserve sa composition et les versions précises des ingrédients ; les modifications créent une nouvelle version de recette au lieu de réécrire l’historique.
- Les cycles de recettes doivent être empêchés. Une simple clé étrangère ne suffit pas pour détecter les cycles transitifs ; la validation peut se faire dans une transaction serveur ou dans une fonction PostgreSQL.

## 3. Flux principaux

### Connexion et profil

1. Angular lance OAuth Google via Supabase Auth.
2. Après authentification, le frontend récupère ou crée le profil applicatif associé à `auth.users.id`.
3. Le champ `onboarded` dirige l’utilisateur vers l’onboarding ou vers le journal.

### Création d’un aliment ou d’une recette

1. Le frontend soumet les données au backend Supabase.
2. Le backend valide les valeurs requises et l’appartenance des portions aux bons aliments.
3. Une création ou modification versionnée publie la nouvelle version courante de manière atomique.
4. Les versions antérieures nécessaires aux références historiques sont conservées.

La création d’une recette doit aussi valider l’absence de cycle et enregistrer une composition cohérente avec la version créée.

### Ajout au journal

1. Le journal affiche quatre sections, une par `MealType` (petit-déjeuner, déjeuner, dîner, collation), avec une action d’ajout dans chaque section. Cette action ouvre une boîte de dialogue listant les aliments disponibles, triables par récence (du plus récent au moins récent) et par date de création. La sélection d’un aliment affiche ses détails et un sélecteur de quantité ; la confirmation crée l’entrée dans la catégorie de repas de la section d’origine.
2. Une contrainte ou fonction côté base vérifie les références et les autorisations ; le client ne peut pas imposer une version obsolète pour créer une nouvelle entrée.
3. L’entrée conserve la portion/version sélectionnée. Les totaux affichés sont calculés à partir de cette référence historique.

### Recherche par code-barres

La recherche par code-barres récupère le résultat Open Food Facts et les `Food` publics du catalogue ayant ce code-barres. La première ligne est une vue de la réponse Open Food Facts, qui n’est pas encore un `Food` ; les lignes suivantes sont des vues des fiches publiques déjà créées par des utilisateurs à partir de cette source. Sélectionner le résultat Open Food Facts crée une nouvelle fiche produit publique attribuée à l’utilisateur, en transmettant le code-barres lors de la création ; sélectionner une fiche du catalogue choisit le `Food` existant. Le code-barres d’une fiche est immuable après création. L’intégration Open Food Facts doit rester derrière une interface de service côté application/backend. Les réponses externes ne sont pas mises en cache ; si le service est indisponible, seuls les résultats locaux sont affichés.

## 4. Calculs et cohérence

- Les valeurs d’une entrée sont obtenues en mettant à l’échelle les valeurs nutritionnelles de la portion référencée selon le ratio consommé.
- Le ratio consommé est strictement positif et saisissable au dixième près.
- Le libellé d’unité est libre et aucune conversion entre unités n’est effectuée.
- La définition exacte de `ratio` (quantité consommée relativement à la portion, et type/échelle numérique) doit être fixée avant le schéma SQL.
- Les totaux journaliers agrègent les entrées par date de consommation et par nutriment, selon le fuseau `Europe/Paris`.
- Les libellés d’unité sont libres et ne sont pas convertis. Les arrondis et l’affichage des valeurs nutritionnelles doivent rester cohérents entre les vues ; les règles métier précises sont décrites dans [SPECS.md](SPECS.md).

## 5. Sécurité et intégrité

- Activer RLS sur toutes les tables exposées au client.
- Les utilisateurs ne peuvent lire/modifier que leurs données personnelles ; les fiches `Food` publiques sont lisibles par tous et modifiables par leur auteur uniquement.
- Les écritures versionnées doivent s’exécuter de façon atomique afin d’éviter deux versions courantes concurrentes.
- Les clés étrangères garantissent que les références existent ; les contraintes et fonctions transactionnelles portent les règles inter-entités (portion appartenant à l’aliment/version, version courante à la création, cycles de recettes).
- Les secrets de service Supabase ne doivent jamais être intégrés au client Angular.

## 6. Décisions d’architecture ouvertes

1. Où s’exécute l’intégration Open Food Facts : Edge Function Supabase, serveur dédié, ou appel direct depuis le client ?
2. Les totaux sont-ils calculés à la demande ou matérialisés ? À ce stade, le calcul à la demande est suffisant tant que le volume attendu ne justifie pas d’optimisation.
3. Comment les périodes d’objectifs sont-elles représentées et contraintes ?
4. L’interface du MVP est en anglais. La localisation des libellés du catalogue pourra être précisée ultérieurement.

## 7. Relation avec le modèle

`model.wsd` documente les concepts et associations, mais ne constitue pas encore un schéma physique. Après résolution des décisions ouvertes, il faudra préciser les types SQL, les clés primaires/étrangères, les contraintes d’unicité, les index, les suppressions autorisées et les politiques RLS. Toute règle de persistance doit préserver les invariants historiques décrits ici et dans [SPECS.md](SPECS.md).
