# Inventaire des captures Fiddler

Mis à jour le 16 novembre 2026. Ce document ne contient ni URL complète, ni
identifiant, ni corps HTTP, ni cookie, ni jeton. Les archives `.saz` restent
locales et ignorées par Git.

## Sources examinées

| Capture locale | Horodatage UTC | Objet |
| --- | --- | --- |
| `spotify-initial.saz` | 15 octobre, 02:49 | démarrage et navigation générale |
| `Rust + Tauri, avec une interface TypeScript.saz` | 15 octobre, 02:58 | navigation générale |
| `spotify-jam-create.saz` | 19 octobre, 18:16 | création de Jam |
| `spotify-jam-complete.saz` | 19 octobre, 18:20 | création, état et fermeture de Jam |

Les deux captures du 19 octobre sont les plus récentes. Les appels de navigateur,
Windows, Fiddler, publicité et télémétrie ne sont pas des requêtes à reproduire.

## Déjà étudié ou couvert

- catalogue et recherche (`pathfinder`), métadonnées étendues, pochettes ;
- bibliothèque, favoris, playlists, droits et révisions ;
- appareil actif, file et états Spotify Connect ;
- cycle d’hébergement Jam : état courant, création, notification et fermeture ;
- paroles : la voie native `librespot` est utilisée ; elle ne dépend pas d’un
  jeton extrait de capture et le texte reste seulement en mémoire.

## Requêtes Spotify encore à étudier

| Priorité | Famille observée | Intérêt produit | Décision actuelle |
| --- | --- | --- | --- |
| P1 | résolution de jeton d’invitation Jam | rejoindre un Jam depuis un lien | nécessaire pour finir la participation Jam |
| P1 | état Jam par appareil | suivre précisément l’état de participation | à comparer avec les notifications Connect existantes |
| P2 | reprise de lecture et révision de point de reprise | reprendre un épisode ou titre | hors MVP actuel |
| P2 | récemment écoutés et personnalisation d’accueil | améliorer l’accueil Spotify | hors MVP actuel |
| P2 | couleurs des paroles | fond visuel similaire à Spotify | optionnel ; les paroles synchronisées fonctionnent sans cela |
| P3 | manifeste vidéo, segments et générateur d’URL | Canvas et vidéo | hors périmètre : média additionnel, coût réseau et CPU |
| P3 | contenu hors ligne | téléchargements | hors périmètre : stockage, licences et synchronisation |

## Observé mais volontairement non reproduit

- annonces, capping, configuration distante, mises à jour, diagnostics et
  télémétrie ;
- DRM et certificat Widevine ;
- contrôle de version cliente, restrictions d’intégrations et contrôle réseau ;
- ressources d’images déjà rendues à partir des URL de pochettes fournies par les
  métadonnées.

La prochaine étude utile est donc la résolution d’invitation Jam, suivie du
parcours d’adhésion depuis un second compte. Elle reste distincte de l’hébergement
déjà vérifié.
