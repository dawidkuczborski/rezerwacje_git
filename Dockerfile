FROM node:20-alpine

WORKDIR /app

# Backend deps
COPY backend/package*.json ./
RUN npm install

# Backend source
COPY backend ./

# Frontend deps
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# Frontend source
COPY frontend ./frontend/

# Build frontend (vite)
RUN cd frontend && npm run build

# Move built files
RUN mkdir -p public
RUN cp -r frontend/dist/* public/

ENV PORT=5000
ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "server.js"]
