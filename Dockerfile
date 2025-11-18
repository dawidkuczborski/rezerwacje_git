# ─── FRONTEND BUILD ─────────────────────────────────────────────
FROM node:18 AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend .
RUN npm run build


# ─── BACKEND BUILD ─────────────────────────────────────────────
FROM node:18 AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend .


# ─── FINAL IMAGE (NODE + STATIC SERVE) ─────────────────────────
FROM node:18

WORKDIR /app

# Copy backend
COPY --from=backend /app/backend ./

# Copy built frontend into backend public folder
RUN mkdir -p public
COPY --from=frontend /app/frontend/dist ./public

# Install production process manager
RUN npm install -g pm2

EXPOSE 3000

CMD ["pm2-runtime", "index.js"]
