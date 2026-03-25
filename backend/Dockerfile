# ---- Development Stage ----
FROM node:20-alpine AS dev

WORKDIR /app

# Install OpenSSL (required by Prisma schema-engine on Alpine)
RUN apk add --no-cache openssl

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema early for generate
COPY prisma ./prisma
RUN npx prisma generate

# Copy source
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/core/server.js"]
