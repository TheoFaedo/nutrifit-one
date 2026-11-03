# Reprise du développement MCP Nutrifit

Le périmètre validé est le plan « MCP Nutrifit connecté à ChatGPT ». Le développement a été repris le 3 novembre 2026. Les changements sont présents dans le working tree, sans commit ni déploiement.

## État de l’implémentation

- `supabase/functions/mcp/` contient le serveur Streamable HTTP sans état, la validation JWT, les outils `search_foods`, `get_food`, `get_day_summary`, `preview_food` et `create_food`, ainsi que les instructions de confirmation. Le mode connexion seule (`MCP_PROBE_ONLY=true`) reste activé par défaut.
- La migration `20261030100000_mcp_oauth.sql` ajoute le registre privé des clients OAuth, l’audience via hook, le contrôle des sessions, les restrictions RLS et les RPC MCP. La création d’aliment est privée, atomique et idempotente.
- Angular fournit le consentement `/oauth/consent`, la reprise de destination après connexion Google et onboarding, la consultation/révocation des applications connectées, et l’affichage de la provenance des aliments.
- `docs/CHATGPT-MCP.md`, `docs/ARCHITECTURE.md` et `docs/DATABASE.md` documentent la configuration et le modèle d’accès. `scripts/mcp/test-sql.sh` exécute les tests SQL sur PostgreSQL jetable.

## Vérifications effectuées

- `bunx deno task check` et `bunx deno task test` : réussite, 8 tests Deno.
- `scripts/mcp/test-sql.sh` : réussite, tests d’isolation, restrictions d’écriture, nutrition, dates/DST, hook OAuth et idempotence.
- `bun run test` : réussite, 8 fichiers et 42 tests Angular.
- `bun run lint` : réussite.
- `git diff --check` : les fichiers modifiés pour cette fonctionnalité ne présentent pas d’erreur d’espacement. Le fichier `AGENTS.md` déjà modifié dans le working tree contient une ligne vide finale signalée par Git.
- Les fichiers sous `nutrifit-app/src/environments/` n’ont pas été modifiés.

## Points restant à valider

- Le build Angular de production référence `src/environments/environment.production.ts`, absent du dépôt local. Le build de développement Angular a également terminé en `SIGABRT` sans diagnostic utile. Aucun fichier d’environnement n’a été créé ni modifié pour contourner cela.
- L’échange OAuth réel entre ChatGPT et Supabase (découverte, audience, `resource`, renouvellement/révocation) reste à vérifier sur les services hébergés. Aucun client OAuth réel n’est enregistré par défaut. Garder `MCP_PROBE_ONLY=true` jusqu’à validation de la connexion réelle.
- Après validation du serveur minimal, enregistrer explicitement le client OAuth autorisé et activer les outils métier selon le guide `docs/CHATGPT-MCP.md`.
