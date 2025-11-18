FROM node:18-alpine

WORKDIR /app

# Install backend deps
COPY backend/package*.json ./
RUN npm install

# Copy backend source
COPY backend ./

# Install frontend deps
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# Copy frontend source
COPY frontend ./frontend/

# Build frontend (Vite)
RUN cd frontend && npm run build

# Create public folder for serving static files
RUN mkdir -p public
RUN cp -r frontend/dist/* public/

ENV PORT=5000
ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "server.js"]
