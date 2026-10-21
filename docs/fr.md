# Bestway Lay-Z-Spa

## Présentation

Cette intégration amène dans Gladys les spas Wi-Fi Bestway (**Lay-Z-Spa**, SaluSpa) et les pompes de filtration Flowclear Smart Touch, par le cloud Bestway, avec le compte de l'application que vous utilisez déjà.

Gladys lit la température de l'eau, la consigne, le chauffage, la filtration, les bulles, les jets et les erreurs, et peut les allumer, les éteindre et changer la consigne. Elle apprend aussi à quelle vitesse votre spa chauffe, pour vous dire quand l'eau sera prête.

Sans lien avec Bestway.

![Les widgets « Spa » et « Courbe du spa » (illustration générée, pas une capture d'écran)](https://raw.githubusercontent.com/William-De71/gladys-bestway/main/docs/assets/widgets.fr.png)

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent, avec un accès à Internet.
- Un spa Wi-Fi Bestway qui fonctionne dans l'une de ces applications, et l'e-mail et le mot de passe de cette application :
  - **Bestway Smart Hub** (modèles jusqu'à 2024 environ, appelés V1 ici) ;
  - **Bestway Connect** (modèles depuis 2025, appelés V2 ici).
- Les comptes de l'application « Lay-Z-Spa Wi-Fi » ne sont pas acceptés : utilisez l'une des deux applications ci-dessus.

## Configuration

### Comptes

Renseignez le compte de votre application :

- **Compte Bestway Smart Hub (V1)** : e-mail, mot de passe et région (Europe ou États-Unis).
- **Compte Bestway Connect (V2)** : e-mail, mot de passe et région (Europe, États-Unis ou Chine). Aucun QR code de partage n'est nécessaire.

Vous pouvez renseigner les deux si vous avez des spas dans les deux applications. Laissez l'autre vide. Enregistrez, puis appuyez sur **Tester les comptes** : l'intégration se connecte et liste chaque spa trouvé, avec son modèle et la température de son eau.

La région est celle choisie à la création du compte : si la connexion échoue ou qu'aucun spa n'est trouvé, essayez l'autre. Après une connexion refusée, l'intégration attend 15 minutes avant de réessayer (puis plus longtemps), pour qu'un mauvais mot de passe ne fasse jamais bloquer votre compte : enregistrer le mot de passe corrigé relance aussitôt la connexion.

### Réglages

**Lire les spas toutes les** : de 30 secondes à 5 minutes (1 minute par défaut).

**Langue des noms et des textes** : la langue des noms des fonctionnalités, des niveaux de bulles et des messages d'erreur.

## Utilisation

### Appareils

Ouvrez l'onglet **Découverte** de l'intégration et ajoutez votre spa. Il prend le nom que vous lui avez donné dans l'application et, selon le modèle :

- **Température de l'eau** et **Température de consigne** (20 à 40 °C ; un spa réglé en Fahrenheit est converti) ;
- **Chauffage** (marche / arrêt) et **Chauffe en cours** ;
- **Alimentation** et **Filtration** ;
- **Bulles** : marche / arrêt, ou arrêt / moyen / maximum sur les modèles V1 qui ont des niveaux ;
- **Jets HydroJet** (modèles HydroJet) et **Verrouillage du panneau** (modèles AirJet) ;
- **Erreurs** : les codes signalés par le spa (`E02`…), voir sa notice pour leur sens.

Une pompe de filtration Flowclear Smart Touch reçoit son alimentation, sa minuterie de filtration, sa cartouche (OK / à changer) et ses erreurs.

Une commande s'affiche aussitôt et reste affichée jusqu'à ce que le cloud la confirme (5 à 30 secondes), puis une lecture 15 secondes plus tard la vérifie. Allumer le chauffage démarre aussi la filtration, comme le fait le spa.

### Widgets

- **Spa** : l'eau et sa consigne, le chauffage (arrêt, chauffe, « prêt vers 20 h 30 », température atteinte), la filtration, les bulles, les jets, les erreurs, et des boutons pour chauffer, pour les bulles et pour changer la consigne d'un degré.
- **Courbe du spa** : les températures de l'eau et de consigne sur 24 heures, 3 ou 7 jours (l'appareil doit être ajouté), et la vitesse de chauffe du spa.

L'heure « prêt vers » apparaît après 45 minutes de chauffe : l'intégration mesure la vitesse de chauffe, puis la retient pour les fois suivantes.

### Scènes

Déclencheurs : **L'eau du spa atteint sa consigne**, **Le spa signale une erreur** (filtre sur un code si vous voulez), **Le spa est injoignable** (5 minutes), **Le spa répond à nouveau**.

Actions : **Lire le spa** (eau, consigne, chauffage, minutes avant la consigne, heure où c'est prêt, erreurs) et **Chauffer le spa à** une température (consigne et chauffage en une seule étape).

Exemples :

- Chaque vendredi à 17 h → **Chauffer le spa à** 38 °C → envoyer un message avec l'heure où il sera prêt.
- L'eau du spa atteint sa consigne → envoyer une notification « Le spa est prêt ».
- Le spa signale une erreur → envoyer une notification avec `{{triggerEvent.data.error_code}}`.

## Dépannage

- **L'e-mail ou le mot de passe est refusé** : vérifiez que vous utilisez le compte de l'application avec laquelle votre spa fonctionne (Smart Hub = V1, Bestway Connect = V2) et la bonne région.
- **« Connecté, mais aucun appareil »** : le spa n'est pas sur ce compte ou dans cette région : essayez l'autre région, ou ajoutez le spa dans l'application.
- **Le spa est injoignable** : vérifiez qu'il fonctionne dans l'application (Wi-Fi du spa, courant).
- **Une commande revient un instant à l'ancienne valeur** : le cloud signale en retard ; l'état réel s'affiche quelques secondes plus tard.
- Le bouton **Tester les comptes** liste ce que voit l'intégration ; l'onglet Logs de l'intégration en dit plus.

Signalez un problème sur [GitHub](https://github.com/William-De71/gladys-bestway/issues) avec votre version de Gladys, la version de l'intégration, le modèle du spa, son application (V1 ou V2), la région et les logs.
