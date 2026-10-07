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
- Avec Supabase, les accès aux données privées doivent être limités côté base par Row Level Security (RLS), et pas uniquement masqués dans l’interface.
- Le diagramme relie également un utilisateur aux aliments qu’il crée. Le statut privé/partagé du catalogue reste une décision de produit et doit être reflété dans les politiques RLS.

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

### 2.4 Recettes

- Une recette est un type de `Food` et contient des `RecipePart`, chacun référençant un aliment et l’une de ses portions.
- Une recette expose une portion de référence à laquelle correspondent ses `NutritionFacts`.
- Il faut choisir une stratégie de versionnement cohérente : si les parties d’une recette sont modifiables, une version d’une recette doit préserver la composition qui a produit ses valeurs nutritionnelles. Le diagramme n’explicite pas encore le rattachement des parties à une version.
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

1. Le frontend choisit un aliment, une version courante, une portion de cette version, une quantité, une date et une catégorie de repas.
2. Une contrainte ou fonction côté base vérifie les références et les autorisations ; le client ne peut pas imposer une version obsolète pour créer une nouvelle entrée.
3. L’entrée conserve la portion/version sélectionnée. Les totaux affichés sont calculés à partir de cette référence historique.

### Recherche par code-barres

Le diagramme prévoit un champ `barcode` sur `Meal`, mais ne précise pas de fournisseur externe. Si un fournisseur est adopté, son intégration doit rester derrière une interface de service côté application/backend ; la source et les règles de cache restent à décider. Une réponse externe ne doit pas être considérée automatiquement comme une donnée vérifiée.

## 4. Calculs et cohérence

- Les valeurs d’une entrée sont obtenues en mettant à l’échelle les valeurs nutritionnelles de la portion référencée selon le ratio consommé.
- La définition exacte de `ratio` (quantité consommée relativement à la portion, et type/échelle numérique) doit être fixée avant le schéma SQL.
- Les totaux journaliers agrègent les entrées par date de consommation et par nutriment.
- Les unités, conversions, arrondis et la convention énergétique doivent être centralisés et cohérents entre les vues. Les règles métier précises sont ouvertes dans [SPECS.md](SPECS.md).

## 5. Sécurité et intégrité

- Activer RLS sur toutes les tables exposées au client.
- Les utilisateurs ne peuvent lire/modifier que leurs données personnelles, sauf décision explicite de partager un catalogue.
- Les écritures versionnées doivent s’exécuter de façon atomique afin d’éviter deux versions courantes concurrentes.
- Les clés étrangères garantissent que les références existent ; les contraintes et fonctions transactionnelles portent les règles inter-entités (portion appartenant à l’aliment/version, version courante à la création, cycles de recettes).
- Les secrets de service Supabase ne doivent jamais être intégrés au client Angular.

## 6. Décisions d’architecture ouvertes

1. Le catalogue est-il privé, partagé ou mixte ? Cela conditionne la propriété, les clés et RLS de `Food` et `RecipePart`.
2. Les parties de recette sont-elles rattachées à `Recipe.id` ou à `Recipe.versionId` ? Une composition historique immuable suggère le rattachement à la version.
3. `Meal` est-il une entité distincte ou simplement un nom alternatif de `Food` ? Le diagramme utilise les deux notions, alors que les besoins parlent d’aliments et de repas.
4. `Quantity` décrit-elle une portion disponible, une quantité consommée, ou les deux ? Le diagramme distingue la portion référencée et le ratio d’`Intake`, mais le nom et le type de `ratio` doivent être clarifiés.
5. Où s’exécutent les intégrations externes (par exemple code-barres) : Edge Function Supabase, serveur dédié, ou appel direct depuis le client ?
6. Les totaux sont-ils calculés à la demande ou matérialisés ? À ce stade, le calcul à la demande est suffisant tant que le volume attendu ne justifie pas d’optimisation.
7. Comment les périodes d’objectifs sont-elles représentées et contraintes ?
8. Quelles langues sont prises en charge pour les libellés du catalogue et quelles données sont localisées ?

## 7. Relation avec le modèle

`model.wsd` documente les concepts et associations, mais ne constitue pas encore un schéma physique. Après résolution des décisions ouvertes, il faudra préciser les types SQL, les clés primaires/étrangères, les contraintes d’unicité, les index, les suppressions autorisées et les politiques RLS. Toute règle de persistance doit préserver les invariants historiques décrits ici et dans [SPECS.md](SPECS.md).
