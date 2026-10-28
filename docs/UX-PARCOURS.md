# JotColis — Parcours utilisateurs et structure des écrans

## 1. Navigation publique
- Accueil
- Comment ça marche
- Rechercher un trajet
- Publier un trajet
- Aide et sécurité
- Connexion / inscription

Les pages publiques ne doivent pas afficher de données privées ou de disponibilités fictives comme si elles étaient réelles.

## 2. Accueil
Objectif : expliquer le service en quelques secondes et guider vers l’action.
- Titre proposé : « Envoyez votre colis sur le bon trajet. »
- Sous-titre : « Trouvez un voyageur, clarifiez les conditions et suivez chaque étape de la remise. »
- Action principale : « Rechercher un trajet »
- Action secondaire : « Je voyage et je transporte »
- Barre de recherche : départ, destination, date et type de colis.
- Bloc explicatif : rechercher, réserver, remettre, suivre.
- Bloc confiance : preuve de remise, statuts explicites, assistance — sans prétendre à une garantie inexistante.
- Bloc d’aide : catégories et corridors disponibles seulement après validation.

## 3. Recherche
Champs :
- Départ et destination.
- Date ou plage de dates.
- Poids et dimensions.
- Catégorie et description nécessaire.
- Option de notifications lorsqu’aucun trajet n’est disponible.

Résultats :
- Route et dates.
- Capacité disponible confirmée.
- Prix total et éléments qui le composent.
- Statuts de vérification distincts.
- Conditions de remise et d’annulation.
- Dernière mise à jour.
- Action « Voir le trajet ».

Si aucun résultat :
- Expliquer qu’aucun trajet compatible n’a été trouvé.
- Proposer de créer une demande de colis.
- Ne pas afficher de faux résultat ni promettre qu’un GP répondra.

## 4. Détail d’un trajet
- Identité publique du GP et niveaux de vérification.
- Départ, destination, horaires et éventuelles étapes.
- Capacité restante et limites.
- Catégories prises en charge selon les règles vérifiées.
- Prix total, frais et conditions.
- Procédure de prise en charge et de remise.
- Demande de réservation avec récapitulatif avant envoi.

## 5. Espace expéditeur
Navigation :
- Mes demandes
- Mes réservations
- Mes colis
- Notifications
- Profil et préférences
- Aide

Une réservation affiche le statut actuel, la prochaine action, les conditions acceptées, les preuves accessibles et l’option de signaler un problème.

## 6. Espace GP
Navigation :
- Tableau de bord
- Mes trajets
- Demandes reçues
- Réservations
- Passeports de colis
- Revenus et versements (uniquement si intégrés réellement)
- Profil et vérification
- Aide

Le tableau de bord priorise les prochains départs, les demandes en attente, la capacité restante et les actions nécessaires. Les revenus de démonstration sont clairement étiquetés.

## 7. Passeport du colis
En-tête :
- Identifiant de colis.
- Origine et destination.
- Statut actuel et heure de mise à jour.
- Parties visibles selon le rôle.

Timeline :
- Demande créée.
- GP a accepté.
- Paiement confirmé, uniquement si vérifié.
- Prise en charge confirmée.
- Étapes de transport.
- Arrivée au point de remise.
- Destinataire averti.
- Remise confirmée.
- Clôture.

Chaque événement indique s’il est confirmé par le système, déclaré par un utilisateur ou estimé. Une position GPS ne s’affiche que si elle est réellement disponible et consentie.

## 8. Confirmation de remise
- Récapitulatif du colis et des parties.
- Code à usage unique ou mécanisme de secours contrôlé.
- Confirmation explicite.
- État de livraison mis à jour après vérification.
- Option de signaler immédiatement un colis manquant ou endommagé.

## 9. Incidents et litiges
- Choisir une catégorie.
- Décrire les faits et joindre des preuves si nécessaires.
- Afficher ce qui se passe ensuite et le statut du dossier.
- Permettre les réponses des parties et une décision motivée.
- Ne pas exposer les notes internes du support.
- Distinguer accusation, éléments disponibles et décision.

## 10. États d’interface à concevoir
Pour chaque écran : chargement, vide, erreur, accès refusé, hors ligne, action en cours, succès confirmé et état expiré. Ne pas présenter une action comme terminée avant confirmation du serveur ou du prestataire concerné.

## 11. Microtextes de référence
- Aucun trajet : « Aucun trajet compatible pour ces critères. Vous pouvez enregistrer une demande et recevoir une alerte si un trajet correspondant est publié. »
- GPS indisponible : « Position non disponible. Dernière étape enregistrée : [événement] à [heure]. »
- Arrivée : « Le colis est arrivé au point de remise. La livraison sera confirmée séparément. »
- Paiement en attente : « Paiement en attente de confirmation. Ne relancez pas le paiement avant la mise à jour du statut. »
- Incident ouvert : « Votre dossier est enregistré. Vous pouvez suivre ici les mises à jour et les demandes de pièces complémentaires. »
- Mode démo : « Démonstration — aucune réservation ni transaction réelle n’est effectuée. »

## 12. Prototype et validation
Le prototype doit être testé sur téléphone et ordinateur avec des utilisateurs représentant les trois rôles. Vérifier qu’ils comprennent la différence entre une demande, une réservation acceptée, un paiement confirmé, l’arrivée et la remise. Noter les incompréhensions avant d’ajouter des fonctions secondaires.
