# Schéma Supabase — décisions et limites actuelles

La migration initiale est `supabase/migrations/20261008063655_initial_schema.sql`.
Elle suppose les schémas `auth` et les rôles `anon`/`authenticated` fournis par Supabase.

## Modèle retenu

- `foods` porte l’identité logique, l’auteur et la visibilité ; `food_versions` porte les instantanés nommés et typés. La contrainte partielle autorise au plus une version courante. Lors d’une évolution, le client doit désactiver l’ancienne version puis insérer la nouvelle dans la même transaction.
- `quantities` contient à la fois la portion et ses nutriments. Les clés étrangères composites du journal et des compositions de recettes garantissent que la portion appartient à la version référencée. Les valeurs nutritionnelles nulles permettent de conserver une donnée incomplète ; une recette dont les ingrédients n’ont pas de nutriments complets peut donc produire des totaux nuls/incomplets.
- `product_details` porte le code-barres sur l’instantané produit. Une mise à jour de cette valeur est refusée. `source` et `source_payload` sont des emplacements de provenance ; leur format n’est pas encore défini.
- `intakes.ratio` est un multiplicateur strictement positif, stocké avec un chiffre décimal. `consumed_at` est un instant avec fuseau ; `consumed_on` est une date générée dans `Europe/Paris`.
- `recipe_nutrition` expose la somme des nutriments des portions d’ingrédients mises à l’échelle par le ratio des composants. Les composants pointent vers des versions précises. L’application doit créer une version de recette avec sa portion de référence et ses composants dans une transaction.

## Choix en attente

- Les valeurs des préréglages perte/maintien/gain ne sont pas définies. Les dates d’objectifs sont stockées sans règle de chevauchement ni convention de bornes ; `valid_to` inclusif est la convention implicite du stockage, pas une garantie de sélection automatique.
- La provenance Open Food Facts et le traitement des corrections ne sont pas encore spécifiés. Les colonnes de provenance ne constituent pas une politique de synchronisation.
- Aucune règle ne bloque les consommations futures.
- La précision d’une portion est enregistrée au millième, tandis que le ratio du journal est au dixième. Les ratios de recette sont au millième.
- La migration interdit les modifications destructives des portions et composants, mais la publication complète d’une nouvelle version (désactivation de l’ancienne, insertion, portions, détails et composants) reste une transaction orchestrée par l’application. Les versions anciennes restent référencées et ne doivent pas être supprimées.
- Une recette doit avoir au moins un composant et une portion de référence pour être exploitable ; ces deux invariants sont vérifiés par le flux de création transactionnel côté serveur/app, car ils ne peuvent pas être validés à chaque insertion intermédiaire d’une transaction multi-ligne par une contrainte simple.

## RLS

Les profils, objectifs et journaux sont limités au propriétaire. Les aliments publics sont lisibles sans session ; les aliments privés sont lisibles par leur auteur. Seul l’auteur peut créer/modifier les entités de catalogue. Le code-barres n’est pas unique. Les tables du catalogue, y compris ses versions et portions, ont RLS activée.
