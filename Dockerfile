# Quick Cooking — Node sans dépendance, HTTP sur le port 80 (voir docs/deploiement.md §1).
FROM node:22-alpine
ENV NODE_ENV=production PORT=80 DATA_DIR=/app/data
WORKDIR /app
COPY package.json server.mjs ./
COPY lib ./lib
COPY public ./public
COPY exemple ./exemple
RUN mkdir -p /app/data
EXPOSE 80
CMD ["node", "server.mjs"]
