# Spécifications produit

## 1. But

Nutrifit one permet à une personne de tenir un journal de ses consommations et de les comparer à des objectifs nutritionnels journaliers. Les aliments et recettes peuvent être définis manuellement ou trouvés par code-barres.

Ce document décrit le comportement attendu, indépendamment de l’interface et du schéma SQL. Les éléments marqués **À décider** sont des questions ouvertes, pas des règles déjà validées.

## 2. Périmètre fonctionnel

Le MVP vise à reproduire l’ensemble des capacités de l’application de référence, avec une réalisation plus propre. Les capacités prévues sont :

- connexion avec Google ;
- onboarding du compte ;
- définition d’objectifs nutritionnels ;
- création manuelle d’aliments/repas et création par lecture de code-barres ;
- création de recettes composées d’autres aliments/repas ;
- modification des aliments et recettes ;
- ajout, modification et suppression d’entrées du journal ;
- consultation du journal pour différents jours ;
- suivi de l’énergie et des macronutriments.

Le détail ci-dessous rend ces capacités testables. Les règles de partage des données, de recherche externe et de précision nutritionnelle sont précisées dans les sections suivantes.

## 3. Compte et onboarding

### 3.1 Connexion

- La personne peut s’authentifier avec un compte Google.
- Une session authentifiée est nécessaire pour accéder aux données personnelles et les modifier.
- Le compte applicatif est associé à l’identifiant du compte d’authentification.

### 3.2 Onboarding

- Un compte possède un indicateur `onboarded`.
- Un compte non onboardé est dirigé vers le parcours d’onboarding ; un compte onboardé peut ouvrir le journal.
- À l’onboarding, la personne choisit un objectif initial : perdre, maintenir ou gagner. Chaque choix préremplit des cibles nutritionnelles, que la personne peut ensuite ajuster librement.

## 4. Objectifs nutritionnels

- Un objectif journalier comprend des cibles d’énergie, glucides, lipides et protéines.
- Les objectifs sont associés à une période de validité. Une modification crée une nouvelle période ; elle ne doit pas réécrire les objectifs qui s’appliquaient aux jours passés.
- Pour une date donnée, l’application sélectionne l’objectif valide à cette date. Les règles de période (absence, chevauchement, bornes) et les valeurs exactes des préréglages seront définies lors de l’implémentation.
- Les cibles sont exprimées en kcal et grammes.
- À l’onboarding, modifier un macronutriment recalcule l’énergie avec les facteurs 4 kcal/g pour les glucides et protéines et 9 kcal/g pour les lipides.
- Modifier directement l’énergie redimensionne les trois macronutriments en conservant leurs proportions. Si aucune proportion n’existe encore, la répartition initiale est de 50 % glucides, 30 % lipides et 20 % protéines en énergie.

## 5. Aliments, portions et recettes

### 5.1 Aliment

- Un aliment possède un nom, zéro ou plusieurs portions et les valeurs nutritionnelles associées à chaque portion.
- Un aliment possède une propriété `isPublic` qui indique s’il est visible par tous les utilisateurs. Les aliments privés restent visibles par leur propriétaire.
- Un aliment peut porter un code-barres comme aide à la recherche ; le code-barres n’est pas nécessairement une clé unique.
- Le code-barres d’une fiche produit est immuable après sa création.
- Lorsqu’un résultat Open Food Facts est sélectionné, une fiche `Food` publique est créée avec `isPublic = true` et les caractéristiques disponibles. L’utilisateur qui la crée en est l’auteur et lui seul peut la modifier.
- Une modification nutritionnelle ou descriptive crée une nouvelle version de l’aliment logique. Les versions précédentes sont conservées si elles sont référencées par le journal.
- Une seule version est courante pour un aliment logique donné.
- Seul l’auteur peut modifier une fiche publique.

### 5.2 Portions et nutrition

- Une portion représente une quantité et une unité saisie librement (par exemple `100 g`, `1 pièce` ou `250 ml`).
- Une valeur nutritionnelle décrit l’énergie, les glucides, les lipides et les protéines pour la portion concernée.
- Les valeurs utilisées dans les calculs sont mises à l’échelle linéairement à partir de la portion de référence : valeur consommée = valeur de référence × quantité consommée / quantité de référence.
- Les unités sont des libellés libres ; aucune conversion entre unités n’est effectuée ou nécessaire.

### 5.3 Recette

- Une recette est un aliment composé d’au moins un ingrédient ; un ingrédient référence un aliment et une portion de cet aliment, avec un ratio/une quantité.
- La recette a une portion de référence utilisable au journal.
- Les valeurs nutritionnelles de la recette sont toujours calculées à partir des ingrédients et des quantités ; elles ne sont pas saisies indépendamment.
- La composition est versionnée avec la recette : chaque version conserve ses ingrédients, leurs versions et les quantités utilisées, de sorte qu’une modification ultérieure ne réécrive pas l’historique.
- La composition ne doit pas autoriser de cycle (une recette qui se contient, directement ou indirectement).

## 6. Journal de consommation

- Une entrée de journal référence un aliment/une recette, une portion, une quantité consommée, une date de consommation et une catégorie de repas (petit-déjeuner, déjeuner, dîner ou collation).
- La portion choisie doit appartenir à la version de l’aliment choisie.
- Lors de l’ajout, la version sélectionnée est la version courante de l’aliment. L’entrée conserve ensuite sa référence à cette version afin qu’une modification ultérieure du catalogue ne change pas rétroactivement les valeurs affichées pour cette consommation.
- La personne peut ajouter, modifier et supprimer ses entrées, et consulter les entrées d’une date donnée.
- Les totaux d’une journée sont la somme des valeurs nutritionnelles des entrées de cette journée, ramenées aux quantités consommées.
- Le journal d’une journée est présenté en quatre sections, une par catégorie : petit-déjeuner, déjeuner, dîner et collation.
- Chaque section permet de lancer l’ajout d’une entrée. L’ajout ouvre une boîte de dialogue présentant les aliments disponibles ; la liste peut être triée par récence (du plus récent au moins récent) et par date de création.
- La sélection d’un aliment affiche ses détails et un sélecteur de quantité. Un bouton permet ensuite de l’ajouter au journal dans la section correspondante.
- La date de consommation est déterminée selon le fuseau `Europe/Paris`.
- Une quantité consommée doit être strictement positive et peut être saisie au dixième près. La possibilité de dater une entrée dans le futur reste à préciser lors de l’implémentation.

## 7. Recherche par code-barres

- La personne peut lancer une lecture ou saisir un code-barres.
- La recherche par code-barres consulte Open Food Facts et les `Food` publics du catalogue qui portent ce code-barres.
- La première ligne est une vue du résultat Open Food Facts ; ce résultat externe n’est pas encore un `Food` du catalogue. Les lignes suivantes sont des vues des `Food` publics déjà créés par des utilisateurs à partir d’Open Food Facts et portant ce code-barres.
- Sélectionner la ligne Open Food Facts crée une nouvelle fiche produit publique avec le code-barres transmis lors de la création ; l’utilisateur devient son auteur. Sélectionner une ligne du catalogue choisit le `Food` existant. Dans les deux cas, les détails et le sélecteur de quantité permettent de poursuivre l’ajout au journal.
- Le code-barres sert d’aide à la recherche et ne constitue pas une clé unique.
- Le code-barres de la fiche est immuable après sa création.
- Si le produit est inconnu, l’application propose une saisie manuelle.
- Les données reçues d’une source externe doivent être distinguées des données saisies ou corrigées par la personne. La provenance est conservée par version : l’import initial garde la réponse OFF, une correction publiée ensuite porte la source `Author correction` sans remplacer l’instantané importé.
- Open Food Facts est la source retenue pour les recherches par code-barres. L’interface est en anglais pour le MVP.
- Si Open Food Facts est indisponible, seuls les résultats du catalogue de l’application sont affichés. Les réponses Open Food Facts ne sont pas mises en cache.

## 8. Décisions de cadrage et précisions restantes

Les règles ci-dessous sont retenues ; les points explicitement indiqués restent à préciser avant de figer l’implémentation et les contraintes de données :

1. **Catalogue :** `isPublic` distingue les aliments visibles par tous des aliments privés visibles par leur propriétaire. Seul l’auteur peut modifier une fiche publique.
2. **Périmètre de livraison :** le MVP comprend toutes les fonctionnalités de l’application de référence ; l’ordre de réalisation reste à planifier.
3. **Code-barres :** afficher d’abord une vue du résultat Open Food Facts (qui n’est pas encore un `Food`), puis les `Food` publics existants avec ce code-barres. La sélection du résultat Open Food Facts crée un `Food` public dont l’utilisateur devient l’auteur. `source` et `source_payload` décrivent la provenance de chaque version ; une correction ultérieure est attribuée à l’auteur.
4. **Recettes :** les valeurs nutritionnelles sont dérivées des ingrédients et chaque version de recette historise la composition et les versions des ingrédients. Une recette a une portion de référence.
5. **Unités :** le libellé est libre et aucune conversion n’est effectuée.
6. **Objectifs :** l’onboarding propose perdre, maintenir ou gagner, avec des cibles préremplies modifiables. Les valeurs exactes des préréglages et les règles des périodes seront définies lors de l’implémentation.
7. **Temps :** le fuseau du journal est `Europe/Paris`.
8. **Langue :** l’interface du MVP est en anglais.

## 9. Hors périmètre explicite à ce stade

Aucune exigence n’est encore spécifiée concernant les rappels, le partage social, les recommandations médicales, les activités sportives, les exportations ou le fonctionnement hors ligne. Leur présence dans une version future reste possible, mais n’est pas présumée ici.
