# JotColis

**Votre colis voyage avec confiance.** *(signature de travail à valider)*

JotColis est un projet mobile-first destiné à mettre en relation expéditeurs, voyageurs transporteurs (GP) et destinataires. L’objectif est de faciliter la recherche de trajets, de clarifier les conditions et d’améliorer la traçabilité.

> **État actuel : prototype et fondations backend en développement.** L’authentification Supabase et la recherche de trajets publiés sont intégrées au frontend. La recherche réelle n’affiche que les trajets futurs publiés sur des corridors actifs. Les corridors sont actuellement désactivés : aucun résultat réel n’est donc attendu. Des parcours de démonstration peuvent utiliser des données locales explicitement signalées comme fictives. La création d’un brouillon GP est encadrée côté serveur. La publication, les réservations, les paiements et la livraison réelle ne sont pas encore opérationnels.

## Principes

- Confiance vérifiable : identité, voyage et fiabilité sont des statuts distincts.
- Suivi honnête : événements déclarés, estimations et GPS consenti ne sont jamais confondus.
- Transparence : prix total, frais et conditions doivent être affichés avant confirmation.
- Traçabilité : passeport de colis et historique horodaté, avec auteur et heure contrôlés côté serveur.
- Confidentialité : minimisation des données et permissions par rôle.
- International progressif : chaque corridor est activé après validation juridique, douanière et opérationnelle.
- Paiements et remboursements jamais présentés comme réels tant qu’ils ne sont pas intégrés et testés.

## État fonctionnel

- **Authentification :** inscription et connexion via Supabase Auth avec clé publique destinée au navigateur.
- **Recherche :** consultation des trajets futurs publiés sur les corridors actifs uniquement.
- **Brouillon de trajet :** fonction serveur avec validation des champs, du compte et de la date.
- **Publication GP :** réservée aux comptes actifs agréés et aux corridors actifs ; elle n’est pas ouverte à tous.
- **Passeport colis :** fonction serveur de déclaration d’étapes pour les voyageurs agréés sur leurs propres réservations. Elle n’atteste pas à elle seule qu’une remise a réellement eu lieu.
- **Réservation et paiement :** désactivés. Aucun flux transactionnel de réservation ou de paiement n’est annoncé comme opérationnel.
- **Corridors :** inactifs tant que leur validation opérationnelle n’est pas terminée.

## Prévisualisation en ligne

La prévisualisation est disponible sur [jotcolis-preview.onrender.com](https://jotcolis-preview.onrender.com). Le service Render est configuré pour suivre la branche `feature/fondations-jotcolis`. Le site reste une prévisualisation de développement, et non un service de livraison prêt pour le public.

Les données fictives locales ne sont pas partagées entre utilisateurs et ne constituent pas des offres. Une recherche connectée sans résultat ne doit pas être interprétée comme une indisponibilité définitive du marché.

## Lancer les tests et compiler

Prérequis : Node.js 20 ou supérieur. Aucune dépendance npm externe n’est nécessaire.

```bash
npm test
npm run build
```

Le site statique généré se trouve dans `dist/`.

## Documentation

- [Prompt maître](docs/PROMPT-MAITRE.md)
- [Cahier des charges fonctionnel](docs/CAHIER-DES-CHARGES.md)
- [Architecture cible](docs/ARCHITECTURE.md)
- [Plan backend MVP et sécurité](docs/PLAN-BACKEND-MVP.md)
- [Feuille de route](docs/ROADMAP.md)
- [Parcours UX](docs/UX-PARCOURS.md)
- [Identité visuelle](docs/IDENTITE-VISUELLE.md)
- [Prototype visuel (HTML)](prototype/index.html)

## Prochaines étapes prioritaires

1. Vérifier et configurer les redirections de confirmation e-mail Supabase pour l’URL de prévisualisation.
2. Exécuter des tests d’intégration authentifiés sur les fonctions de brouillon, publication et passeport.
3. Construire un flux de réservation transactionnel qui verrouille et vérifie la capacité afin d’éviter les doubles réservations.
4. Ajouter les rôles et outils d’administration nécessaires à l’agrément GP et à la gestion des incidents.
5. Valider le corridor pilote France–Sénégal avant d’activer une disponibilité réelle.
6. Intégrer les paiements uniquement après validation du prestataire, des obligations légales et des procédures de remboursement.

## Contribution et sécurité

Travailler dans une branche dédiée et ouvrir une pull request. Ne jamais commiter de secrets ou de données personnelles réelles. Les fonctions privilégiées doivent vérifier l’identité et les droits côté serveur ; les changements d’état et de capacité doivent être transactionnels. Ne pas activer de corridor ni de réservation sans tests et validation opérationnelle.
