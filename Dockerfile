FROM node:20-alpine

WORKDIR /app

# ------- BACKEND -------
# deps
COPY backend/package*.json ./
RUN npm install --omit=dev

# source
COPY backend ./

# ------- FRONTEND -------
# deps (TU BEZ --omit=dev, żeby Vite się zainstalował)
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# source
COPY frontend ./frontend/

# build (vite)
RUN cd frontend && npm run build

# przerzucamy build do /public
RUN mkdir -p public
RUN cp -r frontend/dist/* public/

# ------- ENV / PORT -------
ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

EXPOSE 5000

CMD ["node", "server.js"]
