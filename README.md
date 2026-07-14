# DeployHub

One-click deployment platform. Enter a GitHub repo URL, get a live website instantly.

## Live Link

**https://vercel-936k.onrender.com**

## Architecture

```
User → Frontend (React, served by Express)
         ↓ POST /deploy
       Server (Express + S3 Worker)
         ↓ Pull repo from GitHub → Upload to S3
         ↓ Background worker polls S3 → npm install → npm run build → Upload dist to S3
         ↓ Fetch from S3 → Serve HTML/CSS/JS
       User sees deployed website
```

## Features

- **GitHub Integration** — Enter any public GitHub repo URL to deploy
- **Automatic Build** — Detects React/HTML projects and runs `npm install && npm run build`
- **S3 Storage** — Source code stored in `output/{id}/`, built files in `dist/{id}/`
- **Status Polling** — Real-time deployment status (uploaded → deployed)
- **Static Site Serving** — Serves deployed sites with correct MIME types
- **All-in-One** — Frontend + Backend + Worker in a single service

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Backend:** Express.js, TypeScript, Node.js
- **Storage:** AWS S3
- **Deploy:** Docker on Render (free tier)

## Project Structure

```
deployhub/
├── frontend/                    # React frontend (Vite + Tailwind)
│   ├── src/components/
│   │   ├── landing.tsx          # Main deploy UI
│   │   └── ui/                  # shadcn-style components
│   └── ...
├── server/                      # Unified backend server
│   ├── src/
│   │   ├── index.ts             # Express API + S3 worker + static file serving
│   │   ├── file.ts              # Recursive file listing
│   │   └── utils.ts             # ID generator
│   ├── Dockerfile               # Docker build for Render
│   └── ...
├── render.yaml                  # Render Blueprint
└── README.md
```

## How It Works

1. **Deploy:** User enters GitHub repo URL in frontend
2. **Pull:** Server pulls the repo from GitHub locally
3. **Upload:** All source files uploaded to S3 under `output/{id}/`
4. **Status:** Deployment status written to S3 (`status/{id}`)
5. **Build:** Background worker polls S3, downloads source, runs `npm install && npm run build`
6. **Store:** Built files (HTML/CSS/JS) uploaded to S3 under `dist/{id}/`
7. **Serve:** Server fetches files from S3 and serves them at `/{id}/index.html`
8. **Access:** Site live at `https://vercel-936k.onrender.com/{id}/index.html`

## Local Development

### Prerequisites
- Node.js 18+
- AWS S3 bucket

### Setup

```bash
# Pull the repo
git clone https://github.com/nishthaPachchigar/vercel.git
cd vercel

# Create .env file in server/ folder
# AWS_ACCESS_KEY_ID=your_key
# AWS_SECRET_ACCESS_KEY=your_secret
# AWS_REGION=your_region
# BUCKET_NAME=your_bucket

# Build frontend
cd frontend
npm install
npx vite build
cp -r dist ../server/public

# Run server
cd ../server
npm install
npx tsc -b
node dist/index.js
```

### Docker

```bash
docker build -t deployhub -f server/Dockerfile .
docker run -p 3000:3000 --env-file server/.env deployhub
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Frontend UI |
| POST | `/deploy` | Deploy a GitHub repo (body: `{ repoUrl }`) |
| GET | `/status?id=xxx` | Get deployment status |
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
