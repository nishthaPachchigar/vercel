# Vercel Clone

A full-stack Vercel clone that allows users to deploy GitHub repositories by entering a repo URL. The system clones the repo, builds it, and serves it — just like Vercel!

## Live Links

| Service | URL |
|---------|-----|
| Frontend | _[Deploy on Vercel]_ |
| Upload Service | _[Deploy on Render]_ |
| Request Handler | _[Deploy on Render]_ |

## Architecture

```
User → Frontend (React)
         ↓ POST /deploy
       Upload Service (Express + Redis)
         ↓ Clone repo → Upload to S3 → Push to Redis queue
       Deploy Service (Redis Worker)
         ↓ Download from S3 → npm install → npm run build → Upload dist to S3
       Request Handler (Express)
         ↓ Fetch from S3 → Serve HTML/CSS/JS
       User sees deployed website
```

## Features

- **GitHub Integration** — Enter any public GitHub repo URL to deploy
- **Automatic Build** — Detects React/HTML projects and runs `npm run build`
- **S3 Storage** — Source code stored in `output/{id}/`, built files in `dist/{id}/`
- **Redis Queue** — Asynchronous build pipeline using Redis queues
- **Status Polling** — Real-time deployment status (uploaded → deployed)
- **Static Site Serving** — Serves deployed sites with correct MIME types
- **Docker Support** — Containerized deployment with Docker Compose

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Backend:** Express.js, TypeScript, Node.js
- **Queue:** Redis (ioredis)
- **Storage:** AWS S3
- **Build:** Docker (optional)

## Project Structure

```
vercel-clone/
├── frontend/                    # React frontend (Vite + Tailwind)
│   ├── src/components/
│   │   ├── landing.tsx          # Main deploy UI
│   │   └── ui/                  # shadcn-style components
│   └── ...
├── vercel-upload-service/       # API server (port 3000)
│   ├── src/
│   │   ├── index.ts             # POST /deploy, GET /status
│   │   ├── s3.ts                # S3 upload
│   │   ├── file.ts              # Recursive file listing
│   │   └── utils.ts             # ID generator
│   └── ...
├── vercel-deploy-service/       # Build worker (Redis consumer)
│   ├── src/
│   │   ├── index.ts             # Pop from queue → build → upload
│   │   ├── aws.ts               # S3 download/upload
│   │   └── utils.ts             # npm install && npm run build
│   └── ...
├── vercel-request-handler/      # Serves deployed sites (port 3001)
│   ├── src/
│   │   └── index.ts             # Extract ID → fetch from S3 → serve
│   └── ...
└── docker-compose.yml           # Run all services locally
```

## How It Works

1. **Deploy:** User enters GitHub repo URL in frontend
2. **Clone:** Upload service clones the repo locally
3. **Upload:** All source files uploaded to S3 under `output/{id}/`
4. **Queue:** Deploy ID pushed to Redis `build-queue`
5. **Build:** Deploy service pops from queue, downloads from S3, runs `npm install && npm run build`
6. **Store:** Built files (HTML/CSS/JS) uploaded to S3 under `dist/{id}/`
7. **Serve:** Request handler fetches files from S3 and serves them
8. **Access:** Site live at `http://{id}.yourdomain.com/index.html`

## Local Development

### Prerequisites
- Node.js 18+
- Redis (running locally or via Docker)
- AWS S3 bucket

### Setup

```bash
# Clone the repo
git clone https://github.com/nishthaPachchigar/vercel-clone.git
cd vercel-clone

# Create .env file in each service folder
# AWS_ACCESS_KEY_ID=your_key
# AWS_SECRET_ACCESS_KEY=your_secret
# AWS_REGION=your_region
# BUCKET_NAME=your_bucket

# Terminal 1 - Upload Service
cd vercel-upload-service
npm install
npx tsc -b
node dist/index.js

# Terminal 2 - Deploy Service
cd vercel-deploy-service
npm install
npx tsc -b
node dist/index.js

# Terminal 3 - Request Handler
cd vercel-request-handler
npm install
npx tsc -b
node dist/index.js

# Terminal 4 - Frontend
cd frontend
npm install
npm run dev
```

### Docker (Alternative)

```bash
docker-compose up --build
```

## API Endpoints

### Upload Service (port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/deploy` | Deploy a GitHub repo (body: `{ repoUrl }`) |
| GET | `/status?id=xxx` | Get deployment status |

### Request Handler (port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/{id}/index.html` | Access deployed site |
| GET | `/{id}/style.css` | Access deployed CSS |
| GET | `/{id}/photo.jpg` | Access deployed images |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_REGION` | AWS region (e.g. ap-south-1) |
| `BUCKET_NAME` | S3 bucket name |
| `REDIS_HOST` | Redis host (default: 127.0.0.1) |
