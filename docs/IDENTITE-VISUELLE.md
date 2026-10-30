# JotColis — Direction artistique et système visuel

## Intention
Créer une marque chaleureuse, claire et fiable, pensée pour les usages mobiles, les échanges entre pays et des utilisateurs qui ne sont pas nécessairement à l’aise avec les outils numériques. L’interface doit rassurer par la clarté, pas par des promesses absolues.

## Positionnement visuel
- Sérieux sans être froid.
- Humain et accessible.
- Moderne mais léger, adapté aux connexions mobiles.
- Priorité à la lisibilité et à l’action principale.

## Palette de départ — à tester
- **Bleu pétrole profond** : titres, navigation et actions principales.
- **Ivoire clair** : arrière-plans de pages et zones de lecture.
- **Blanc** : surfaces de formulaire et cartes.
- **Ambre doux** : accent pour attirer l’attention sur une action secondaire ou une information importante.
- **Vert discret** : succès confirmé uniquement.
- **Rouge sobre** : erreurs, blocages et alertes critiques.
- **Gris neutre** : textes secondaires, bordures et états désactivés.

Les couleurs ne doivent jamais être le seul moyen de distinguer un état. Ajouter un libellé et, si utile, une icône.

## Typographie
- Utiliser une police sans sérif lisible et largement disponible.
- Hiérarchie simple : titre de page, titre de section, corps, aide et métadonnées.
- Éviter les paragraphes compacts, les petites polices et les titres sur plusieurs lignes lorsque cela nuit à la lecture.
- Les montants, dates et statuts doivent rester faciles à comparer.

## Composants
- Bouton principal : une action principale clairement identifiable par écran.
- Bouton secondaire : action moins prioritaire, visuellement plus discrète.
- Champs : libellé permanent, exemple utile, validation et message d’erreur explicite.
- Cartes de trajet : route, date, capacité restante, prix total et niveau de vérification.
- Badges de statut : libellé explicite ; jamais une couleur seule.
- Timeline du passeport : date, événement, source et éventuelle preuve.
- Alertes : expliquer le problème et l’action corrective.
- Navigation mobile : accès direct à Rechercher, Mes colis, Publier un trajet et Profil selon le rôle.

## Principes UX
1. Afficher les coûts et conditions avant la confirmation.
2. Ne jamais masquer un état important derrière une icône seule.
3. Séparer les états confirmés des estimations et des déclarations utilisateur.
4. Réduire les demandes d’informations au strict nécessaire.
5. Demander confirmation avant une action irréversible.
6. Prévoir les états vide, chargement, erreur, hors ligne et succès.
7. Ne pas afficher d’avis ou de badge de fiabilité sans données suffisantes.
8. Afficher un libellé « Démonstration » pour les données et paiements fictifs.

## Écrans à concevoir en priorité
1. Accueil public.
2. Recherche de trajets.
3. Résultats et comparaison.
4. Formulaire de demande de colis.
5. Détail d’un trajet et profil GP.
6. Tableau de bord GP.
7. Détail d’une réservation.
8. Passeport du colis.
9. Confirmation de remise.
10. Ouverture et suivi d’un incident.
11. Connexion / création de compte.
12. Console support/admin.

## Accessibilité et adaptation mobile
- Contraste lisible, focus clavier visible, libellés explicites et ordre de tabulation logique.
- Zones tactiles confortables.
- Formulaires testés sur petit écran.
- Ne pas dépendre du survol pour expliquer une information essentielle.
- Respecter la préférence de réduction des animations lorsque des animations seront ajoutées.

## Déclinaison premium — corridor Dakar–Paris
La prévisualisation applique une direction « grand voyage » en bleu nuit, or et laiton, sans modifier les parcours de recherche, de compte, de publication brouillon, de corridors ni de passeport déjà présents.

- Les pictogrammes importants (itinéraire, colis, recherche, confiance et avion) sont des SVG dégradés avec relief, lisibles à toutes les tailles.
- Le globe de l’accueil utilise une projection sphérique Canvas, que l’on peut faire pivoter au doigt ou à la souris ; des commandes permettent aussi de le tourner et de le recentrer.
- Le globe est rendu strictement en noir et blanc : océan blanc, continents noirs et trames blanches, sans aucune teinte chaude. L’avion est signalé par un insigne bicolore (disque noir liseré de blanc, avion blanc orienté selon le cap) qui reste lisible aussi bien au-dessus de l’océan que des continents ; il est dessiné en dernier pour rester au premier plan.
- L’avion alterne entre Paris et Dakar avec de courtes escales. Cette animation est décorative, explicitement signalée comme démonstration et ne représente ni un vol réel ni une position GPS.
- La mise en page conserve les formulaires et navigations existants, s’adapte aux écrans étroits et respecte `prefers-reduced-motion`.

## À valider
Tester la palette et les textes avec de vrais utilisateurs ; vérifier les contrastes ; tester la compréhension de la différence entre trajet, demande, réservation, arrivée et livraison.
