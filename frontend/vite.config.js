# Używamy Node 20, bo Vite wymaga min. Node 20.19+
FROM node:20-alpine

# Umożliwia budowę frontendu bez błędów (CI=true powoduje przerwanie builda)
ENV CI=false

WORKDIR /app

# ---------------- BACKEND ----------------
COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend ./

# ---------------- FRONTEND ----------------
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install --omit=dev

# kopiujemy frontend
COPY frontend ./

# Budujemy frontend (tu powstaje /app/frontend/dist)
RUN npm run build

# ---------------- MERGE FRONT + BACKEND ----------------
WORKDIR /app
RUN mkdir -p public
RUN cp -r frontend/dist/* public/

# ---------------- RUNTIME ----------------
ENV PORT=5000
ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "server.js"]
