module.exports = {
  apps: [
    {
      name: "learning-kingdom-api",
      script: "api/server.ts",
      interpreter: "tsx",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=256",
        PORT: 3000
      },
      max_memory_restart: "256M"
    }
  ]
};
