# Build stage
FROM node:22-alpine AS builder

# OpenSSL is required by Prisma on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Configure npm for better reliability in Docker
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Build both frontend and backend
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

# Set environment variable
ENV NODE_ENV=production
ENV PORT=3000

# Install only production dependencies
COPY package*.json ./
# Need prisma to run migrations in production
RUN npm ci --omit=dev && npm cache clean --force

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Run migrations and start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
