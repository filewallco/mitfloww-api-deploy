module.exports = {
  apps: [
    {
      name: "mitfloww-api",
      script: "dist/index.js",
      instances: process.env.WEB_CONCURRENCY || "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 4001,
      },
    },
  ],
};
