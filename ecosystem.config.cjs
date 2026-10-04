/**
 * pm2 process file for the WealthMesh monorepo.
 *   npm run dev   two processes: backend (gradle bootRun) + frontend (vite dev server, proxies /api)
 *   npm start     one process: the fat jar, which serves the UI and the API on the backend port
 * WM_MODE=prod selects the fat-jar mode. The database runs in Docker: npm run db:up.
 */
const path = require('node:path')
const { existsSync } = require('node:fs')

const envFile = path.join(__dirname, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const prod = process.env.WM_MODE === 'prod'
const dbPort = process.env.WM_DB_PORT ?? '5434'
const backendPort = process.env.WM_BACKEND_PORT ?? '8081'
const frontendPort = process.env.WM_FRONTEND_PORT ?? '5180'

if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD is not set. Copy .env.example to .env and set it.')
}

const common = {
  autorestart: true,
  max_restarts: 5,
  min_uptime: '20s',
  time: true,
  merge_logs: true,
  interpreter: 'none', // run the command directly instead of through node
}

const backend = {
  ...common,
  name: 'wm-backend',
  cwd: __dirname,
  script: prod ? './scripts/run-backend-jar.sh' : './scripts/gradle.sh',
  args: prod ? [] : ['bootRun'],
  kill_timeout: 20000, // let Spring shut down gracefully
  out_file: './logs/backend.out.log',
  error_file: './logs/backend.err.log',
  env: {
    // In fat-jar mode, refuse to start a jar that was built without the UI.
    ...(prod ? { WM_REQUIRE_UI: '1' } : {}),
    DB_PASSWORD: process.env.DB_PASSWORD,
    SERVER_PORT: backendPort,
    SPRING_R2DBC_URL: `r2dbc:postgresql://localhost:${dbPort}/wealthmesh_v3`,
    SPRING_FLYWAY_URL: `jdbc:postgresql://localhost:${dbPort}/wealthmesh_v3`,
  },
}

// The dev server only exists in dev mode; the fat jar already contains the built UI.
const frontend = {
  ...common,
  name: 'wm-frontend',
  cwd: path.join(__dirname, 'frontend'),
  script: 'npm',
  args: ['run', 'dev', '--', '--port', frontendPort, '--strictPort'],
  out_file: '../logs/frontend.out.log',
  error_file: '../logs/frontend.err.log',
  env: {
    WM_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
  },
}

module.exports = { apps: prod ? [backend] : [backend, frontend] }
