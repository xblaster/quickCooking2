# Construire et déployer Quick Cooking

Ce guide dit tout ce qu'il faut savoir pour que l'application se construise et se déploie sur le
cluster `catwo`. Il est valable quel que soit le langage choisi pour l'application, tant que le
**contrat de l'image** (§1) est respecté.

---

## 1. Contrat de l'image

L'application doit être livrée sous forme d'**une image Docker** qui :

| Exigence | Détail |
|---|---|
| Écoute en HTTP sur le port `80` | Pas de HTTPS dans le conteneur : Cloudflare termine le TLS. Si un autre port est choisi, changer `containerPort` et `targetPort` dans `deploy/k8s/`. |
| Répond `200` sur `GET /` | Utilisé par les sondes readiness/liveness. Si `/` est lourd, exposer `GET /healthz` et changer le chemin des sondes dans `deployment.yaml`. |
| Démarre en moins de 30 s | Au-delà, augmenter `initialDelaySeconds` des sondes. |
| Est **sans état** par défaut | 2 réplicas tournent en parallèle derrière le Service. Aucune donnée ne doit être écrite sur le disque du conteneur. Pour persister des données, voir §7. |
| Se configure par variables d'environnement | `NODE_ENV=production` est déjà fourni. Les secrets arrivent par un `Secret` Kubernetes (§6). |
| Tient dans **256 Mi de RAM** et **0,2 CPU** | Limites actuelles. Le cluster n'a que 2 nœuds partagés avec d'autres sites : rester sobre. |
| Écrit ses logs sur stdout/stderr | Lus avec `kubectl logs`. |
| Est construite pour `linux/amd64` | Les nœuds OVH sont en amd64. |

Exemple pour un frontend statique (Vite/React…), même schéma que `gregoax-website` :

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.31-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf   # SPA : try_files $uri /index.html;
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Pour une application Node avec serveur (Express, Next.js…), elle doit simplement écouter sur
`0.0.0.0:80` (ou changer le port, voir plus haut).

## 2. Registre et tags

- Registre : **Docker Hub**, dépôt public `xblaster/quick-cooking`. Pas d'`imagePullSecret` nécessaire.
- Tag : `AAAAMMJJ-<sha7>` (date UTC du build + 7 premiers caractères du commit). C'est ce tag qui est
  déployé. La CI pousse aussi `:latest`, mais il n'est jamais référencé dans un manifest.
- Un ancien build de la première version existe encore : `xblaster/quick-cooking:20251127132259`.

### Build et push depuis le poste (sans CI)

```bash
TAG=$(date -u +%Y%m%d)-$(git rev-parse --short=7 HEAD)
docker build --platform linux/amd64 -t xblaster/quick-cooking:$TAG .
docker push xblaster/quick-cooking:$TAG
```

### Build et push par la CI

`.github/workflows/docker.yml` construit et pousse l'image à chaque push sur `main`.
Secrets GitHub requis (Settings → Secrets and variables → Actions) :

| Secret | Contenu |
|---|---|
| `DOCKERHUB_USERNAME` | `xblaster` |
| `DOCKERHUB_TOKEN` | token d'accès Docker Hub (Account settings → Personal access tokens, droit *Read & Write*), **pas** le mot de passe |

## 3. Accès au cluster

Sur le poste de l'opérateur, `kubectl` est déjà configuré : `~/.kube/config`, contexte
`kubernetes-admin@catwo`. Vérifier avant toute action :

```bash
kubectl config current-context        # doit afficher kubernetes-admin@catwo
kubectl get nodes                     # 2 nœuds Ready
```

Ce contexte est **administrateur de tout le cluster** : ne l'utiliser que sur le namespace
`quick-cooking` (voir `AGENTS.md`).

## 4. Premier déploiement

Les manifests sont dans `deploy/k8s/`. Avant d'appliquer, remplacer le tag de l'image dans
`deploy/k8s/deployment.yaml` par le tag réellement poussé.

```bash
# 1. Namespace (vérifier puis créer)
kubectl apply --dry-run=server -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/namespace.yaml

# 2. Application (vérifier puis appliquer)
kubectl apply --dry-run=server -f deploy/k8s/
kubectl apply -f deploy/k8s/

# 3. Attendre et vérifier
kubectl -n quick-cooking rollout status deploy/quick-cooking --timeout=180s
kubectl -n quick-cooking get pods,svc,ingress
curl -sI https://quick-cooking.lo2k.net/        # attendu : HTTP 200
```

`kubectl apply -f deploy/k8s/` ne descend pas dans `deploy/k8s/optionnel/` (pas de `-R`) : l'accès CI
n'est créé que sur demande (§5).

## 5. Mettre à jour, revenir en arrière

```bash
# Nouvelle version (tag daté, jamais latest)
kubectl -n quick-cooking set image deploy/quick-cooking quick-cooking=xblaster/quick-cooking:<tag>
kubectl -n quick-cooking rollout status deploy/quick-cooking --timeout=180s

# Retour à la version précédente
kubectl -n quick-cooking rollout undo deploy/quick-cooking

# Diagnostic
kubectl -n quick-cooking get pods
kubectl -n quick-cooking describe pod <pod>
kubectl -n quick-cooking logs deploy/quick-cooking --tail=100
```

Reporter ensuite le nouveau tag dans `deploy/k8s/deployment.yaml` (pour que le dépôt reste la
vérité) et dans le runbook d'infrastructure.

### Déploiement automatique (optionnel)

Pour que la CI déploie elle-même après le build :

1. Un humain crée l'accès restreint : `kubectl apply -f deploy/k8s/optionnel/ci-rbac.yaml`. Il donne
   au compte `quick-cooking-deployer` le droit de modifier **uniquement** les Deployments du namespace
   `quick-cooking` (rien d'autre dans le cluster).
2. Il génère un kubeconfig pour ce compte (procédure en tête de `ci-rbac.yaml`) et le stocke dans le
   secret GitHub `KUBECONFIG_QUICK_COOKING`.
3. Il crée la variable GitHub `DEPLOY_ENABLED` = `true`.

Le job `deploy` du workflow fait alors `kubectl set image` puis `rollout status` ; si le rollout
échoue, il fait `rollout undo`.

## 6. Secrets et configuration

- Variables non sensibles : bloc `env:` de `deploy/k8s/deployment.yaml`.
- Secrets (clés d'API, mots de passe, URL de base de données) : un `Secret` Kubernetes **créé à la
  main**, jamais commité :

```bash
# fichier local hors dépôt, ex. ~/quick-cooking.env  (CLE=valeur, une par ligne)
kubectl -n quick-cooking create secret generic quick-cooking-secrets --from-env-file=$HOME/quick-cooking.env
```

  puis décommenter le bloc `envFrom` dans `deployment.yaml`. Documenter le **nom** et le **rôle** de
  chaque clé (jamais la valeur) dans le runbook d'infrastructure, section 5.
- Clé d'API d'un LLM : uniquement des modèles **gratuits** ; le propriétaire refuse toute dépense
  LLM sans accord explicite.

## 7. Si l'application a besoin de données persistantes

Par défaut l'application est sans état. Si elle doit stocker quelque chose :

- Stockage disponible : StorageClass `csi-cinder-high-speed` (OVH Cinder), **ReadWriteOnce**,
  **reclaim policy `Delete`**.
- Un volume RWO ne se monte que sur **un seul pod** : passer à `replicas: 1` et à la stratégie
  `Recreate` (sinon le nouveau pod reste bloqué en attente du volume).
- Il n'y a **pas de base de données partagée** dans le cluster. Options : SQLite sur le PVC (simple),
  ou un PostgreSQL dédié dans le namespace (chart Helm, plus lourd). À décider avec le propriétaire.
- Les sauvegardes sont faites par `scripts/backup/backup-all.ps1` du dépôt d'infrastructure ; prévenir
  pour que le nouveau PVC y soit inclus.

## 8. DNS et TLS

- `quick-cooking.lo2k.net` existe déjà chez Cloudflare, proxifié (orange) vers l'ingress du cluster.
  Sans application déployée, il répond `404` (backend par défaut d'ingress-nginx). **Aucune action DNS
  n'est nécessaire.**
- TLS : terminé par Cloudflare. L'Ingress garde `ssl-redirect: "false"`, sinon Cloudflare et nginx se
  renvoient la redirection en boucle. Pas de cert-manager dans le cluster.
- Taille maximale des requêtes : 50 Mo (`proxy-body-size`). L'augmenter dans `ingress.yaml` si
  l'application reçoit de gros fichiers (photos de recettes…).
- Si le DNS a été supprimé entre-temps : enregistrement `A quick-cooking` → `146.59.242.169`, proxifié.
  C'est une action humaine dans Cloudflare.

## 9. Liste de contrôle avant de dire « déployé »

- [ ] Image poussée avec un tag daté, construite pour `linux/amd64`.
- [ ] `deploy/k8s/deployment.yaml` référence ce tag (pas `latest`).
- [ ] `--dry-run=server` sans erreur, puis `apply`.
- [ ] `rollout status` OK, 2/2 pods `Running`, aucun redémarrage en boucle.
- [ ] `curl -sI https://quick-cooking.lo2k.net/` → `200`.
- [ ] Runbook `lo2k_infrastructure/namespaces/quick-cooking/README.md` mis à jour (statut, tag, Journal).
