// PM2 process config — karyaOS backend (Express + SQLite).
//
// On the server, from the repo root:
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup     (auto-start on reboot)
//
// The backend reads server/.env (Midtrans keys, ports, etc.) — `node_args`
// loads dotenv and `cwd` points at server/ so it finds the right .env.
const path = require("path");

module.exports = {
  apps: [
    {
      name:               "karyaos-backend",
      script:             "index.js",
      cwd:                path.join(__dirname, "server"),
      node_args:          "-r dotenv/config",
      instances:          1,
      exec_mode:          "fork",
      autorestart:        true,
      watch:              false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT:     3011,
      },
    },
  ],
};
