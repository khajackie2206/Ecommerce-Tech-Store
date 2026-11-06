# Production image for the NestJS API (multi-stage build)

# 1. Install all dependencies (including dev tools needed to build)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Compile TypeScript to dist/, then drop dev dependencies
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# 3. Small runtime image: compiled code + production dependencies only
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# Never run as root inside the container
USER node
EXPOSE 3000
# Start node directly (not via npm) so it receives SIGTERM and shuts down gracefully
CMD ["node", "dist/main.js"]
