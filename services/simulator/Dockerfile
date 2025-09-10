FROM node:20-bullseye-slim

WORKDIR /usr/src/app

# Copiá manifest y lock si existe
COPY package.json package-lock.json* ./

# Si hay lockfile -> npm ci; si no -> npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Código
COPY . .

EXPOSE 5174
CMD ["node", "server.js"]
