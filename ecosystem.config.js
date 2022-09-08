module.exports = {
  apps: [
    {
      name: 'firmachain-event-udc-server',
      script: 'ts-node -r ./src/server.ts',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
