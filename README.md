# Avis Employes (React + Tailwind + Supabase)

## 1. Installer

```bash
npm install
```

## 2. Configurer Supabase

1. Copier `.env.example` vers `.env`
2. Renseigner:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (ou `VITE_SUPABASE_PUBLISHABLE_KEY`)

## 3. Creer la base

Dans l'editeur SQL Supabase, executer le script `supabase/schema.sql`.

## 4. Creer le compte directeur

Dans Supabase > Authentication > Users, creer un utilisateur (email + mot de passe).
Ce compte servira a la connexion directeur.

## 5. Lancer

```bash
npm run dev
```

## Fonctionnement

- Espace Employe: envoi d'avis (nom, prenom, departement, type, message)
- Espace Directeur: connexion par email/mot de passe, lecture des avis, filtre, statistiques
- Traitement directeur: statut, priorite, assignation, date limite
- Commentaires internes par avis
- Historique d actions (audit log)
- Impression PDF via navigateur
- Recherche avancee (texte, date, departement, statut, priorite)
- Option avis anonyme cote employe

## Depannage Supabase

- Si l'erreur indique que la table `avis` n'existe pas: executer `supabase/schema.sql` dans SQL Editor.
- Si l'erreur parle de policy/RLS: reexecuter `supabase/schema.sql` pour recreer les policies.
- Si l'erreur est `Failed to fetch`: verifier la connexion internet, `VITE_SUPABASE_URL` et la cle API.

## Verification avant publication publique

1. Reexecuter `supabase/schema.sql` apres mise a jour.
2. Tester le parcours employe: creation normale + creation anonyme.
3. Tester le parcours directeur: connexion, filtres, edition, commentaire, suppression, impression.
4. Verifier que `.env` n est pas commite (conserver seulement `.env.example` en public).
5. Activer Email confirmation/Security Settings dans Supabase Auth si necessaire.
