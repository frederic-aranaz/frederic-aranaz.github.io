/**
 * Service worker — Portail EKAYE
 *
 * Son seul rôle : que le portail S'OUVRE sans réseau. Sur un stand sans 4G,
 * l'écran d'accueil du téléphone n'a plus qu'une icône EKAYE : si elle ouvre
 * une page blanche, on a perdu l'accès à « Vendre » et à « Découverte », qui
 * eux fonctionnent hors ligne. Le portail doit donc être aussi solide qu'eux.
 *
 * PRÉCAUTION IMPORTANTE : ce worker peut avoir la portée « / » (site racine),
 * donc couvrir aussi /ekaye-vente-scan/ et /ekaye-decouverte/, qui ont chacun
 * LEUR propre service worker. On n'intercepte donc QUE nos propres fichiers,
 * listés nommément : tout le reste passe sans qu'on y touche, et chaque appli
 * garde la main sur son propre cache.
 *
 * À CHAQUE PUBLICATION D'UNE NOUVELLE VERSION DE LA PAGE, incrémenter VERSION.
 * Sans cela, les téléphones qui ont déjà installé le portail continueront de
 * servir l'ancienne indéfiniment : c'est le seul piège de ce fichier.
 */

var VERSION = 'v3';   // v3 : tuile Trello + le ménage des caches ne touche plus
                      //      qu'aux nôtres (26/08/2026)
                      // v2 : liens Google en nouvel onglet (24/08/2026)
                      // v1 : création du portail (24/08/2026)
var CACHE = 'ekaye-portail-' + VERSION;

var FICHIERS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icone.svg',
  'icone-maskable.svg',
  'apple-touch-icon.png'
];

// Chemins absolus de nos fichiers, calculés une fois : c'est la liste blanche
// des requêtes que ce worker s'autorise à intercepter.
var NOTRES = FICHIERS.map(function (f) {
  return new URL(f, self.location.href).pathname;
});

self.addEventListener('install', function (e) {
  // skipWaiting : la nouvelle version prend la main au prochain chargement plutôt
  // qu'après fermeture de tous les onglets. Sur un téléphone, « tous les onglets »
  // peut vouloir dire jamais.
  e.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(FICHIERS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (noms) {
        return Promise.all(noms.map(function (nom) {
          // Le préfixe n'est pas un détail : `caches` est partagé par TOUTE
          // l'origine. Sans lui, activer une nouvelle version du portail
          // effaçait aussi les caches de la page de vente, de Découverte et du
          // portail LAM — c'est-à-dire exactement ce que ce worker existe pour
          // protéger. Même précaution que dans `lam/sw.js`.
          if (nom !== CACHE && nom.indexOf('ekaye-portail-') === 0) {
            return caches.delete(nom);
          }
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var requete = e.request;

  if (requete.method !== 'GET') return;

  var url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // Un fichier d'une autre appli EKAYE hébergée sur le même domaine : on laisse
  // passer, sans respondWith. Son propre service worker fait son travail.
  if (NOTRES.indexOf(url.pathname) === -1) return;

  // Réseau d'abord, cache en secours : en ligne, on a toujours la dernière
  // version publiée ; hors ligne, le portail s'ouvre quand même.
  e.respondWith(
    fetch(requete)
      .then(function (reponse) {
        if (reponse && reponse.status === 200 && reponse.type === 'basic') {
          var copie = reponse.clone();
          caches.open(CACHE).then(function (cache) { cache.put(requete, copie); });
        }
        return reponse;
      })
      .catch(function () {
        return caches.match(requete).then(function (enCache) {
          if (enCache) return enCache;
          if (requete.mode === 'navigate') return caches.match('index.html');
          return Response.error();
        });
      })
  );
});
