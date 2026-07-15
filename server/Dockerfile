FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json ./
RUN npm install

# Copy server source
COPY server/src ./src
COPY server/tsconfig.json ./

# Build server
RUN npx tsc -b

# Install frontend dependencies and build
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm install

COPY frontend/ ./frontend/
RUN cd frontend && npx vite build

# Copy frontend dist to server public
RUN rm -rf ./public && cp -r frontend/dist ./public

ENV OUTPUT_DIR=/tmp/output

EXPOSE 3000

CMD ["node", "dist/index.js"]
