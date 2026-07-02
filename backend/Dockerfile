# Stage 1: Build environment
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Ensure the Cypher schema is copied to the dist directory for the applySchema script
RUN mkdir -p dist/db && cp src/db/schema.cypher dist/db/ 2>/dev/null || true

# Stage 2: Production environment
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/app.js"]
