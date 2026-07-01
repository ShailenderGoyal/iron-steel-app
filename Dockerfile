# syntax=docker/dockerfile:1

# ---------- Stage 1: build the React frontend ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: backend runtime (also serves the built frontend) ----------
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
# Copy the compiled frontend to where index.js serves it: ../../frontend/dist
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
# Railway injects PORT at runtime; 5000 is just the local default.
EXPOSE 5000
CMD ["node", "src/index.js"]
