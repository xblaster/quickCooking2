# AGENTS.md — Quick Cooking

Lis ce fichier en entier avant de construire ou de déployer quoi que ce soit.

## 1. Le projet en une page

| Élément | Valeur |
|---|---|
| Nom | Quick Cooking |
| URL publique | `https://quick-cooking.lo2k.net` |
| Hébergement | cluster Kubernetes OVH `catwo` (le même que les autres sites lo2k) |
| Namespace | `quick-cooking` (à créer, voir `docs/deploiement.md`) |
| Image | `docker.io/xblaster/quick-cooking:<tag>`, publique sur Docker Hub |
| Port du conteneur | `80` (HTTP) |
| Entrée HTTP | `ingress-nginx`, IngressClass `nginx`, IP `146.59.242.169` |
| TLS | géré par Cloudflare (proxy orange) ; pas de certificat dans le cluster |
| Source de vérité infra | `C:\Users\nospa\OneDrive\Commun\PERSO J\dev\lo2k_infrastructure` (runbook `namespaces/quick-cooking/README.md`) |

Première ébauche de l'application en place (Node 22 sans dépendance, voir [`README.md`](README.md)) :
consultation des menus et des courses de la période en cours, choix de la période à venir. Les données
viennent du projet « batch cooking » selon [`docs/donnees-entree-batch-cooking.md`](docs/donnees-entree-batch-cooking.md) (guide destiné à l'IA de « batch cooking », API d'envoi comprise).
Ce dépôt contient aussi tout ce qu'il faut pour **construire l'image** et **la déployer** :

| Fichier | Rôle |
|---|---|
| [`docs/deploiement.md`](docs/deploiement.md) | Guide complet : contrat de l'image, build, déploiement, DNS, secrets, rollback |
| [`deploy/k8s/`](deploy/k8s/) | Manifests Kubernetes prêts à appliquer (namespace, deployment, service, ingress) |
| [`deploy/k8s/optionnel/`](deploy/k8s/optionnel/) | Accès restreint pour un déploiement automatique depuis GitHub Actions |
| [`Dockerfile`](Dockerfile) | Image `node:22-alpine`, port 80, `/healthz` pour les sondes |
| [`.github/workflows/docker.yml`](.github/workflows/docker.yml) | CI : build + push Docker Hub à chaque push sur `main` (+ déploiement si activé) |

## 2. Règles (garde-fous)

Ces règles reprennent celles du dépôt d'infrastructure (`AGENTS.md` de `lo2k_infrastructure`).

1. **Lecture d'abord.** Diagnostiquer (`kubectl get/describe/logs`) avant de modifier le cluster.
2. **`--dry-run=server` avant tout `kubectl apply`.**
3. **Aucune action destructive sans confirmation humaine explicite** : `delete`, scale à 0, suppression
   de PVC, changement DNS, rotation de secret. Le cluster héberge d'autres sites en production.
4. **Ne toucher qu'au namespace `quick-cooking`.** Jamais `ingress-nginx`, `kube-system` ni les autres
   namespaces.
5. **Jamais de tag `:latest` dans les manifests.** Toujours un tag daté (`AAAAMMJJ-<sha7>`), pour des
   rollbacks fiables. `:latest` est poussé par la CI pour info, mais n'est pas déployé.
6. **Aucun secret dans ce dépôt** (ni dans le code, ni dans les manifests, ni dans la CI en clair).
   Les secrets vont dans un `Secret` Kubernetes créé à la main, ou dans les secrets GitHub.
7. **Les PVC sont en reclaim policy `Delete`** : supprimer le PVC ou le namespace détruit les données
   définitivement.
8. **Après chaque déploiement**, mettre à jour le runbook `namespaces/quick-cooking/README.md` du dépôt
   d'infrastructure (sections concernées + Journal).

## 3. Ce qui demande un humain

- Créer les secrets GitHub `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` (et `KUBECONFIG_QUICK_COOKING` si le
  déploiement automatique est activé).
- Toute modification DNS Cloudflare.
- Toute action destructive (voir règle 3).
