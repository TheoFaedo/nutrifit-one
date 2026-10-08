# Schéma Supabase — décisions et limites actuelles

La migration initiale est `supabase/migrations/20261008063655_initial_schema.sql`.
Elle suppose les schémas `auth` et les rôles `anon`/`authenticated` fournis par Supabase.

## Modèle retenu

- `daily_goals` conserve l’historique des objectifs. `valid_from` et `valid_to` sont inclusifs ; les périodes successives ne se chevauchent pas. `complete_onboarding` calcule le début initial côté serveur dans `Europe/Paris`. `update_daily_goal` ferme la période précédente à la veille du jour parisien courant et crée la nouvelle période. Une nouvelle sauvegarde le même jour met à jour la ligne déjà commencée ce jour-là ; les dates antérieures sont conservées.
- `foods` porte l’identité logique, l’auteur et la visibilité ; `food_versions` porte les instantanés nommés et typés. La contrainte partielle autorise au plus une version courante. La RPC `save_food_snapshot` (migration `20261008130000_food_catalogue_rpc.sql`) crée une fiche complète ou verrouille une fiche existante, désactive sa version courante, puis insère l’instantané et toutes ses portions dans une seule transaction. Une erreur annule l’ensemble. L’appelant doit être authentifié et seul l’auteur peut publier une nouvelle version.
- La migration `20261008140000_fix_recipe_snapshot_trigger.sql` corrige l’accès au champ `NEW` dans le déclencheur différé de validation des recettes, partagé entre `food_versions` et `recipe_parts`.
- `quantities` contient à la fois la portion et ses nutriments. Les clés étrangères composites du journal et des compositions de recettes garantissent que la portion appartient à la version référencée. Les valeurs nutritionnelles nulles permettent de conserver une donnée incomplète ; une recette dont les ingrédients n’ont pas de nutriments complets peut donc produire des totaux nuls/incomplets.
- `product_details` porte le code-barres sur l’instantané produit. Une mise à jour de cette valeur est refusée et le code-barres n’est pas unique. `source` et `source_payload` conservent facultativement la provenance d’une création, notamment l’import depuis Open Food Facts ; leur format n’est pas normalisé et aucune synchronisation/correction ultérieure avec OFF n’est prévue. Le client consulte OFF directement par code-barres. Une panne OFF ne bloque pas la recherche locale.
- `intakes.ratio` est un multiplicateur strictement positif, stocké avec un chiffre décimal. `consumed_at` est un instant avec fuseau ; `consumed_on` est une date générée dans `Europe/Paris`.
- `recipe_nutrition` expose la somme des nutriments des portions d’ingrédients mises à l’échelle par le ratio des composants. Les composants pointent vers des versions précises. L’application doit créer une version de recette avec sa portion de référence et ses composants dans une transaction.

## Choix en attente

- Les valeurs des préréglages perte/maintien/gain ne sont pas définies. Les dates d’objectifs sont stockées sans règle de chevauchement ni convention de bornes ; `valid_to` inclusif est la convention implicite du stockage, pas une garantie de sélection automatique.
- La provenance Open Food Facts et le traitement des corrections ne sont pas encore spécifiés. Les colonnes de provenance ne constituent pas une politique de synchronisation.
- Aucune règle ne bloque les consommations futures.
- La précision d’une portion est enregistrée au millième, tandis que le ratio du journal est au dixième. Les ratios de recette sont au millième.
- La migration interdit les modifications destructives des portions et composants. `save_food_snapshot` publie atomiquement une version d’aliment et ses portions ; les anciennes versions et portions restent référencées par le journal et ne doivent pas être supprimées. Le code-barres existant est transmis inchangé lors d’une édition.
- Une recette doit avoir au moins un composant et une portion de référence pour être exploitable ; ces deux invariants sont vérifiés par le flux de création transactionnel côté serveur/app, car ils ne peuvent pas être validés à chaque insertion intermédiaire d’une transaction multi-ligne par une contrainte simple.

## RLS

Les profils, objectifs et journaux sont limités au propriétaire. Les clients lisent les objectifs applicables selon `valid_from <= date` et (`valid_to` est nul ou `valid_to >= date`). Les RPC d’onboarding et de mise à jour s’exécutent avec l’identité appelante et les politiques RLS ; la mise à jour verrouille le profil du propriétaire avant de modifier ses périodes. Les aliments publics sont lisibles sans session ; les aliments privés sont lisibles par leur auteur. Seul l’auteur peut créer/modifier les entités de catalogue. Le code-barres n’est pas unique. Les tables du catalogue, y compris ses versions et portions, ont RLS activée.
