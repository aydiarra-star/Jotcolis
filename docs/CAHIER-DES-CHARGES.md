# JotColis — Cahier des charges fonctionnel

Version de travail 1.0. Les questions juridiques, de transport, de douane et de paiement doivent être validées par des professionnels compétents avant lancement.

## 1. Vision
Mettre en relation expéditeurs, voyageurs transporteurs (GP) et destinataires avec une expérience mobile-first, un suivi transparent et des procédures de gestion des incidents. Signature de travail : « Votre colis voyage avec confiance. » Pilote envisagé : France–Sénégal, sous réserve de validation.

## 2. Objectifs
- Trouver des trajets réellement disponibles.
- Réduire l’incertitude grâce à des preuves et des statuts explicites.
- Éviter sur-réservation et paiement ambigu.
- Traiter annulations et litiges de manière équitable.
- Mesurer qualité, demande et rentabilité par corridor.

## 3. Rôles
| Rôle | Capacités |
|---|---|
| Visiteur | Informations publiques |
| Expéditeur | Demande, recherche, réservation, suivi, incident |
| GP | Profil, trajets, capacité, acceptation/refus, preuves |
| Destinataire | Informations de remise et confirmation |
| Support | Dossiers attribués, preuves et communication |
| Administration opérations | Corridors, comptes, réservations, litiges |
| Finance/conformité | Données strictement nécessaires |
| Administration technique | Configuration et exploitation avec accès limité |

Toutes les permissions sont vérifiées côté serveur et par ressource.

## 4. Modules

### Comptes et profils
Inscription, connexion, confirmation des coordonnées, récupération, statut de compte et préférences. Distinguer identité vérifiée, voyage confirmé et fiabilité issue de livraisons terminées. Ne jamais exposer les documents de vérification dans le profil public.

### Trajets
Origine, destination, dates/fuseaux horaires, capacité en poids et volume, limites, prix, conditions, échéance et statut. Les modifications doivent respecter les réservations existantes.

### Recherche et demande de colis
Recherche par route, date, poids, dimensions, catégorie et prix total. Afficher compatibilité et capacité. Si aucun trajet ne correspond, proposer une demande expirante avec alertes opt-in. Une demande n’est jamais une réservation confirmée.

### Réservation et capacité
Demande au GP, acceptation/refus, expiration et états explicites. Allouer la capacité de manière transactionnelle pour éviter les doubles réservations. Figer prix et conditions acceptés.

### Passeport du colis
Identifiant non devinable et timeline horodatée : demande, acceptation, paiement confirmé, prise en charge, événements de transport, arrivée, remise et clôture. Conserver l’auteur/source et la visibilité de chaque événement. Ajouter une correction à l’historique plutôt que supprimer silencieusement. Distinguer événement déclaré, estimation et GPS disponible.

### Preuves et remise
Preuve de prise en charge, état apparent, date et acteur. Confirmer la remise par code à usage unique ou procédure de secours contrôlée. Photos limitées au nécessaire et stockées en privé. Arrivée et remise sont deux événements différents.

### Paiements
Prestataire adapté au modèle marketplace et aux pays. Afficher prix, commission, frais et conditions. Authentifier les webhooks, vérifier côté serveur et dédupliquer. Éviter de collecter directement les données de carte si un flux hébergé est disponible. Aucun paiement réel simulé. Remboursements et versements suivent les conditions contractuelles du prestataire.

### Annulations, incidents et litiges
Motif, acteur, date et conséquences. Dossiers pour retard, destinataire absent, perte, dommage, contenu non conforme ou paiement contesté. Prévoir pièces, responsable, statut, communications, décision motivée et recours. Une accusation n’est pas automatiquement un fait établi.

### Notifications
Demande reçue, acceptation/refus, paiement, prise en charge, retard, arrivée, remise et incident. Historique d’envoi, gestion des échecs, déduplication et préférences. Ne pas exposer de données sensibles inutilement dans les notifications.

### Administration
Comptes, trajets, demandes, réservations, paiements, litiges et alertes. Matrice de corridors avec sources et dates de vérification. Permissions granulaires, audit des actions sensibles et possibilité de suspendre un corridor sans effacer l’historique.

### Avis et parrainage
Avis uniquement après transaction éligible, modération motivée et droit de réponse. Programme ambassadeur ultérieur, récompense après livraison éligible et mécanismes anti-fraude.

## 5. Cycle de vie
1. Demande créée.
2. Admissibilité préliminaire vérifiée.
3. GP accepte et capacité allouée.
4. Paiement confirmé par le prestataire si requis à cette étape.
5. Prise en charge prouvée.
6. Transport avec événements déclarés et estimations séparées du GPS.
7. Arrivée au point de remise.
8. Destinataire averti.
9. Remise confirmée.
10. Clôture et règlement selon les conditions applicables.

Les parcours d’exception doivent être définis avant le pilote.

## 6. Règles de corridor
Maintenir une matrice par route et catégorie avec source, date et responsable. Bloquer les catégories interdites ou non évaluées. Vérifier les règles douanières, de sécurité et des opérateurs concernés. Un corridor n’est ouvert qu’après validation des obligations, des paiements, du support et des tests de bout en bout.

## 7. UX et accessibilité
Mobile-first, lisible sur réseau mobile, formulaires simples, erreurs compréhensibles, prix total visible, états cohérents, contraste, navigation clavier et compatibilité des principaux navigateurs. Stocker les dates de manière cohérente et les afficher dans le fuseau local pertinent.

## 8. Sécurité et confidentialité
Contrôle d’accès serveur, minimisation, accès restreint aux preuves, GPS sur consentement révocable, secrets hors du code, sessions sécurisées, limitation des tentatives, journaux prudents, sauvegardes et restauration testée. Définir les durées de conservation et les droits des personnes selon les obligations applicables.

## 9. Indicateurs
GP actifs avec trajet futur ; taux de correspondance ; conversion demande-réservation ; taux de livraison achevée ; annulations par acteur ; taux de litige ; délai de réponse support ; répétition ; marge contributive ; coût d’acquisition d’un GP réellement actif ; fraudes confirmées séparées des signalements.

## 10. Critères de réception
- Un utilisateur ne peut pas accéder aux réservations d’un autre.
- Deux réservations concurrentes ne dépassent pas la capacité.
- Un webhook dupliqué ne crée pas de double opération.
- L’arrivée n’est jamais automatiquement assimilée à la remise.
- Un code invalide ou expiré ne confirme pas la livraison.
- Une réclamation peut être suivie et clôturée avec historique.
- La suspension d’un corridor bloque les nouvelles réservations.
- Aucun faux GPS n’est affiché.
- Toute action admin sensible est journalisée.
- Tests et limites connues sont documentés avant lancement.

## 11. Hors périmètre initial
Assurance automatique sans contrat ; séquestre/portefeuille sans validation et partenaire autorisé ; ouverture de tous les pays sans validation ; GPS permanent imposé ; notation opaque ; applications natives avant validation du besoin.

## 12. Décisions ouvertes
Rôle juridique exact ; prestataire de paiement ; catégories pilotes ; vérification d’identité ; politiques de remboursement/perte/dommage ; budget et pile technique ; langues ; capacité du support ; commission ; disponibilité de la marque, du domaine et des réseaux sociaux.
