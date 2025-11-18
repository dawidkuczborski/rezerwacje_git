# ─── FRONTEND BUILD ─────────────────────────────────────────────
FROM node:20 AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend .
RUN npm run build


# ─── BACKEND BUILD ─────────────────────────────────────────────
FROM node:20 AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend .


# ─── FINAL IMAGE (NODE + STATIC SERVE) ─────────────────────────
FROM node:20

WORKDIR /app
ENV NODE_ENV=production

# Copy backend
COPY --from=backend /app/backend ./

# Copy frontend build (your folder is dev-dist)
COPY --from=frontend /app/frontend/dev-dist ./public

# Install PM2
RUN npm install -g pm2

EXPOSE 5000

CMD ["pm2-runtime", "server.js"]
