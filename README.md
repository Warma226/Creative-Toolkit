# Banque de vidéos — version 1

Site de catalogue avec téléchargement limité à **35 par jour et par utilisateur**.

## Lancer
```
node server.js
```
Puis ouvrir http://localhost:3000

Aucune dépendance à installer (Node.js 18 ou plus récent suffit).

## Ajouter une vidéo
1. Copier le fichier dans `public/uploads/`.
2. Ajouter une entrée dans `data/videos.json` (id unique, titre, catégorie, description, nom du fichier).

## Quota
- Compté par cookie anonyme, stocké dans `data/quota.json`, remis à zéro chaque jour.
- Limite modifiable via `DAILY_LIMIT` dans `server.js`.

## À prévoir pour la suite
- Comptes utilisateurs et paiement (abonnement).
- Stockage et diffusion vidéo externes (Cloudflare R2 + Stream, ou Mux) pour les gros fichiers.
- Miniatures réelles dans `thumbnail`.
