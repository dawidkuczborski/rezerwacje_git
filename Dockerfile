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


# ─── FINAL IMAGE ─────────────────────────────────────────────
FROM node:20

WORKDIR /app
ENV NODE_ENV=production

# Copy backend
COPY --from=backend /app/backend ./backend

# Copy frontend — EXACT PATH backend expects!
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Install pm2
RUN npm install -g pm2

EXPOSE 5000

WORKDIR /app/backend
CMD ["pm2-runtime", "server.js"]
