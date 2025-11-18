# ─── FRONTEND BUILD ─────────────────────────────────────────────
FROM node:20 AS frontend
WORKDIR /app
COPY ./frontend/package*.json ./
RUN npm install
COPY ./frontend .
RUN npm run build


# ─── BACKEND BUILD ─────────────────────────────────────────────
FROM node:20 AS backend
WORKDIR /app
COPY ./backend/package*.json ./
RUN npm install --omit=dev
COPY ./backend .


# ─── FINAL IMAGE (NODE + STATIC SERVE) ─────────────────────────
FROM node:20

WORKDIR /app
ENV NODE_ENV=production

# Copy backend app
COPY --from=backend /app ./

# Copy built frontend into backend public folder
COPY --from=frontend /app/dist ./public

# Install PM2
RUN npm install -g pm2

EXPOSE 5000

CMD ["pm2-runtime", "server.js"]
