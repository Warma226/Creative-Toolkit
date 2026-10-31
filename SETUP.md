# Activer l'espace compte (Google + une adresse IP par compte)

Le site est hébergé sur GitHub Pages, qui n'a pas de serveur. La connexion Google, la règle
« un compte par adresse IP » et le quota de 35 téléchargements par jour sont donc gérés par
**Supabase** (offre gratuite). Compte environ 20 minutes de configuration.

## 1. Créer le projet Supabase
1. Va sur https://supabase.com et crée un compte, puis un nouveau projet (offre gratuite).
2. Note le **Project ref** : c'est la partie `xxxx` de l'adresse `https://xxxx.supabase.co`.

## 2. Créer les tables
1. Dans Supabase : **SQL Editor** > **New query**.
2. Colle tout le contenu de `supabase/schema.sql`, puis clique sur **Run**.

## 3. Créer l'identifiant Google
1. Va sur https://console.cloud.google.com et crée un projet.
2. **API et services** > **Écran de consentement OAuth** : choisis **Externe**, remplis le nom
   de l'appli (Creative Toolkit) et ton adresse e-mail, puis publie l'application.
3. **Identifiants** > **Créer des identifiants** > **ID client OAuth** > **Application Web**.
   - Origines JavaScript autorisées : `https://warma226.github.io`
   - URI de redirection autorisés : `https://xxxx.supabase.co/auth/v1/callback`
     (remplace `xxxx` par ton Project ref)
4. Copie l'**ID client** et le **code secret du client**.

## 4. Brancher Google dans Supabase
1. **Authentication** > **Sign In / Providers** > **Google** : active-le, colle l'ID client
   et le code secret, puis enregistre.
2. **Authentication** > **URL Configuration** :
   - Site URL : `https://warma226.github.io/Creative-Toolkit/`
   - Redirect URLs : ajoute `https://warma226.github.io/Creative-Toolkit/`

## 5. Déployer les fonctions serveur

**Sans terminal (le plus simple)** : dans Supabase, **Edge Functions** > **Deploy a new function** > **Via Editor**.
1. Nomme la fonction `account`, efface le code d'exemple, colle tout `supabase/dashboard/account.ts`, puis **Deploy**.
2. Recommence avec une fonction nommée `download` et le fichier `supabase/dashboard/download.ts`.

**Avec un terminal** : sur ton ordinateur, avec Node.js installé, dans le dossier du projet :

```
npx supabase login
npx supabase link --project-ref xxxx
npx supabase functions deploy account
npx supabase functions deploy download
```

## 6. Relier la page à Supabase
1. Dans Supabase : **Project Settings** > **API**. Copie la **Project URL** et la clé **anon public**.
2. Mets-les dans `docs/config.js`, puis envoie le fichier sur GitHub.
   La clé « anon » est faite pour être publique ; ne mets **jamais** la clé `service_role` dans ce fichier.

## Réglage de la règle IP
Par défaut, un compte ne fonctionne que depuis l'adresse IP de sa première connexion.
Pour seulement empêcher la création de plusieurs comptes depuis la même adresse IP
(sans bloquer un compte si l'IP change) :

```
npx supabase secrets set STRICT_IP=false
```

Pour libérer l'adresse IP d'un utilisateur, supprime sa ligne dans la table `accounts`
(Table Editor). Il sera lié à sa nouvelle adresse IP à sa prochaine connexion.

## Limites à connaître
- **Les adresses IP changent.** Sur réseau mobile, et chez beaucoup de fournisseurs, l'adresse
  change souvent : en mode strict, ces utilisateurs seront bloqués. Plusieurs personnes d'un même
  foyer, d'une école ou d'un café partagent aussi la même adresse : une seule pourra créer un compte.
- **Les fichiers vidéo de `docs/uploads/` restent publics.** Quelqu'un qui connaît le lien direct
  d'un fichier peut le télécharger sans passer par le compteur. Pour l'empêcher, il faudra déplacer
  les vidéos dans Supabase Storage (bucket privé, liens temporaires).
