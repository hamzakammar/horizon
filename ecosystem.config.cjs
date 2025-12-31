// PM2 ecosystem config for managing multiple MCP servers
module.exports = {
  apps: [
    {
      name: 'mcp-d2l',
      cwd: './d2l-mcp',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/d2l-error.log',
      out_file: './logs/d2l-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
    // Add more MCP servers here
    // {
    //   name: 'mcp-another',
    //   cwd: './another-mcp',
    //   script: 'npm',
    //   args: 'start',
    //   env: {
    //     NODE_ENV: 'production',
    //   },
    //   error_file: './logs/another-error.log',
    //   out_file: './logs/another-out.log',
    //   autorestart: true,
    // },
  ],
};
