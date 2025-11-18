FROM node:20-alpine

WORKDIR /app

# ------- BACKEND -------
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend ./

# ------- FRONTEND -------
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend ./frontend/
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
