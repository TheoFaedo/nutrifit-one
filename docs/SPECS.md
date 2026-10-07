# Spécifications produit

## 1. But

Nutrifit one permet à une personne de tenir un journal de ses consommations et de les comparer à des objectifs nutritionnels journaliers. Les aliments et recettes peuvent être définis manuellement ou trouvés par code-barres.

Ce document décrit le comportement attendu, indépendamment de l’interface et du schéma SQL. Les éléments marqués **À décider** sont des questions ouvertes, pas des règles déjà validées.

## 2. Périmètre fonctionnel

Le README identifie les capacités suivantes comme souhaitées :

- connexion avec Google ;
- onboarding du compte ;
- définition d’objectifs nutritionnels ;
- création manuelle d’aliments/repas et création par lecture de code-barres ;
- création de recettes composées d’autres aliments/repas ;
- modification des aliments et recettes ;
- ajout, modification et suppression d’entrées du journal ;
- consultation du journal pour différents jours ;
- suivi de l’énergie et des macronutriments.

Le détail ci-dessous rend ces capacités testables. Les règles de partage des données, de recherche externe et de précision nutritionnelle restent à arbitrer (section 8).

## 3. Compte et onboarding

### 3.1 Connexion

- La personne peut s’authentifier avec un compte Google.
- Une session authentifiée est nécessaire pour accéder aux données personnelles et les modifier.
- Le compte applicatif est associé à l’identifiant du compte d’authentification.

### 3.2 Onboarding

- Un compte possède un indicateur `onboarded`.
- Un compte non onboardé est dirigé vers le parcours d’onboarding ; un compte onboardé peut ouvrir le journal.
- L’onboarding permet au minimum de renseigner les éléments nécessaires à l’utilisation initiale de l’application. **À décider :** champs obligatoires et possibilité de terminer sans objectif.

## 4. Objectifs nutritionnels

- Un objectif journalier comprend des cibles d’énergie, glucides, lipides et protéines.
- Les objectifs sont associés à une période de validité. Une modification crée une nouvelle période ; elle ne doit pas réécrire les objectifs qui s’appliquaient aux jours passés.
- Pour une date donnée, l’application sélectionne l’objectif valide à cette date. **À décider :** autoriser des périodes sans objectif ou qui se chevauchent, et définir les bornes inclusives.
- Les unités et la convention de calcul énergétique doivent être uniques et affichées de manière cohérente. Proposition à valider : kcal et grammes.

## 5. Aliments, portions et recettes

### 5.1 Aliment

- Un aliment possède un nom, zéro ou plusieurs portions et les valeurs nutritionnelles associées à chaque portion.
- Un aliment peut porter un code-barres lorsqu’il s’agit d’un produit identifié de cette manière.
- Une modification nutritionnelle ou descriptive crée une nouvelle version de l’aliment logique. Les versions précédentes sont conservées si elles sont référencées par le journal.
- Une seule version est courante pour un aliment logique donné.
- La propriété d’un aliment et son éventuel partage sont à décider (section 8).

### 5.2 Portions et nutrition

- Une portion représente une quantité et son unité (par exemple `100 g`, `1 pièce` ou `250 ml`).
- Une valeur nutritionnelle décrit l’énergie, les glucides, les lipides et les protéines pour la portion concernée.
- Les valeurs utilisées dans les calculs sont mises à l’échelle linéairement à partir de la portion de référence : valeur consommée = valeur de référence × quantité consommée / quantité de référence. **À valider**, notamment pour les unités non convertibles ou les unités de volume.
- L’application ne doit pas supposer qu’une portion en pièces peut être convertie en grammes sans donnée de conversion explicite.

### 5.3 Recette

- Une recette est un aliment composé d’au moins un ingrédient ; un ingrédient référence un aliment et une portion de cet aliment, avec un ratio/une quantité.
- La recette a elle-même une ou plusieurs portions utilisables au journal. Le modèle courant en impose exactement une portion de référence ; ce point est à confirmer avant de le traiter comme une contrainte produit.
- Les valeurs nutritionnelles de la recette sont calculées à partir des ingrédients et des quantités. **À décider :** recalcul automatique à la modification d’un ingrédient ou instantané conservé à la création de la recette.
- La composition ne doit pas autoriser de cycle (une recette qui se contient, directement ou indirectement).

## 6. Journal de consommation

- Une entrée de journal référence un aliment/une recette, une portion, une quantité consommée, une date de consommation et une catégorie de repas (petit-déjeuner, déjeuner, dîner ou collation).
- La portion choisie doit appartenir à la version de l’aliment choisie.
- Lors de l’ajout, la version sélectionnée est la version courante de l’aliment. L’entrée conserve ensuite sa référence à cette version afin qu’une modification ultérieure du catalogue ne change pas rétroactivement les valeurs affichées pour cette consommation.
- La personne peut ajouter, modifier et supprimer ses entrées, et consulter les entrées d’une date donnée.
- Les totaux d’une journée sont la somme des valeurs nutritionnelles des entrées de cette journée, ramenées aux quantités consommées.
- La date de consommation est une date civile ; la règle de fuseau horaire et la gestion d’un changement de fuseau sont à préciser.
- **À décider :** autoriser une quantité nulle/négative, les fractions de portion et les entrées datées dans le futur.

## 7. Recherche par code-barres

- La personne peut lancer une lecture ou saisir un code-barres.
- Si le produit est trouvé, ses informations sont présentées avant ajout au journal ou enregistrement dans les aliments de la personne.
- Si le produit est inconnu, l’application propose une saisie manuelle.
- Les données reçues d’une source externe doivent être distinguées des données saisies ou corrigées par la personne.
- **À décider :** fournisseur de données, politique de cache, attribution des corrections et traitement des doublons.

## 8. Décisions ouvertes

À résoudre avant de figer l’implémentation et les contraintes de données :

1. **Catalogue :** aliments et recettes privés, partagés entre comptes, ou combinaison des deux ? Qui peut modifier une entrée partagée ?
2. **Périmètre de livraison :** les fonctionnalités du README constituent-elles toutes la première version, ou faut-il un MVP ordonné ?
3. **Code-barres :** quelle source externe utiliser, ou le catalogue doit-il être interne uniquement ?
4. **Recettes :** la portion de référence est-elle unique ? Les valeurs sont-elles toujours dérivées des ingrédients, ou peut-on les saisir/surcharger ?
5. **Historique des recettes :** une version de recette fige-t-elle aussi les versions des aliments ingrédients ?
6. **Unités :** unités prises en charge, conversion entre masse/volume/pièces, arrondis et précision d’affichage.
7. **Objectifs :** quels champs d’onboarding et cibles sont obligatoires ? Comment traiter les périodes sans objectif ?
8. **Temps :** fuseau de référence du journal et définition d’une journée lors d’un voyage.
9. **Langues :** le modèle prévoit FR et EN ; faut-il localiser les libellés d’aliments, unités et catégories, ou seulement l’interface ?

## 9. Hors périmètre explicite à ce stade

Aucune exigence n’est encore spécifiée concernant les rappels, le partage social, les recommandations médicales, les activités sportives, les exportations ou le fonctionnement hors ligne. Leur présence dans une version future reste possible, mais n’est pas présumée ici.
