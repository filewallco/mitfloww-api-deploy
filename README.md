# MitFloww Backend API
 
High-performance, modular backend API for MitFloww built with **Node.js**, **Express 5**, **TypeScript**, **PostgreSQL**, and **Drizzle ORM**.

---

## 🚀 Quick Start (Development)

### 1. Install Dependencies
```bash
npm install
# or
pnpm install
```

### 2. Run in Development Mode
Starts the API with hot reloading on single-process mode (`http://localhost:4001`):
```bash
npm run dev
```

### 3. Build & Test
```bash
npm run build       # Bundles to dist/index.js via tsup in ~90ms
npm test            # Runs the full test suite (33 passing tests)
npm run typecheck   # Typecheck without emitting JS
```

---

## ⚡ High-Throughput & Scaling

### Multi-Core Cluster Mode (`node:cluster`)
Node.js runs on a single core by default. MitFloww includes native multi-core cluster orchestration:
- Detects total CPU cores via `os.availableParallelism()`.
- The **Primary process** forks worker processes across cores and load-balances incoming HTTP requests.
- **Self-Healing:** If a worker crashes, the Primary automatically revives a replacement worker in milliseconds.
- **Dedicated Background Scheduling:** Periodic reconciliation jobs run strictly once on the Primary process, avoiding duplicate database writes.

To run locally in cluster mode:
```bash
npm run start:cluster
```

---

## 🛡️ Production Deployment with PM2 (`ecosystem.config.cjs`)

### What is `ecosystem.config.cjs`?
Think of `ecosystem.config.cjs` like **IIS Application Pool** or **systemd / Windows Service Manager** for Node.js.

In production (e.g. AWS EC2, DigitalOcean, Linux VPS), you do not run `npm start` in an open terminal. Instead, you run **PM2** (Process Manager 2), which:
- Runs your API continuously in the background (daemon mode).
- Automatically restarts the API if it crashes.
- Restarts automatically if the server reboots (`pm2 startup`).
- Scales across all CPU cores and recycles memory if RAM exceeds limits.

### Configuration Reference:
```javascript
module.exports = {
  apps: [
    {
      name: "mitfloww-api",
      script: "dist/index.js",
      instances: process.env.WEB_CONCURRENCY || "max", // Uses all CPU cores
      exec_mode: "cluster",                             // Multi-core cluster mode
      autorestart: true,                               // Instant zero-downtime recovery
      watch: false,
      max_memory_restart: "1G",                         // Memory leak guard
      env: {
        NODE_ENV: "production",
        PORT: 4001,
      },
    },
  ],
};
```

### Starting in Production:
```bash
# 1. Build the production bundle
npm run build

# 2. Launch with PM2 using the ecosystem file
pm2 start ecosystem.config.cjs

# Useful PM2 commands:
pm2 status          # Check worker status, memory & CPU usage
pm2 logs            # View live real-time application logs
pm2 restart all     # Zero-downtime rolling restart
pm2 stop all        # Stop the API processes
pm2 startup         # Configure API to auto-start on server system boot
```

---

## 📄 In-Process Puppeteer PDF Engine

Invoices and project service contracts are converted from HTML to pixel-perfect PDFs using Chromium without requiring Redis or background message queues:

- **Unified Browser Singleton:** Both invoices and contracts share a single Chromium manager (`PuppeteerManager`), cutting RAM usage in half.
- **In-Memory Concurrency Semaphore:** Requests are capped at **2 concurrent renders** (`PDF_CONCURRENCY_LIMIT`). Additional requests wait in a light FIFO queue, preventing 100% CPU spikes and memory exhaustion.
- **Auto-Idle Memory Release:** If no PDFs are generated for 60 seconds (`PDF_IDLE_TIMEOUT_MS`), Chromium automatically closes and releases **~150–250MB of RAM** back to the OS.
- **Fallback Resilience:** If Chromium fails to launch (e.g. serverless environments without GUI libraries), generation cleanly falls back to native `pdf-lib`.

### Tuning Parameters (Optional in `.env`):
```env
PDF_CONCURRENCY_LIMIT=2      # Max concurrent PDF renders (default: 2)
PDF_IDLE_TIMEOUT_MS=60000    # Idle time before closing Chromium (default: 60000ms)
PDF_QUEUE_TIMEOUT_MS=30000   # Max queue wait time before falling back (default: 30000ms)
```

---

## 🧪 Stress & Load Testing

To simulate high traffic and verify throughput, use `autocannon`:
```bash
# Simulates 50 concurrent users firing requests for 20 seconds
npx -y autocannon -c 50 -d 20 http://localhost:4001/api/i18n/config
```
