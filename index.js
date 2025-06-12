
#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

// Change to the ViralCraft-AI directory and start the server
const serverPath = path.join(__dirname, 'ViralCraft-AI');
const serverFile = path.join(serverPath, 'server.js');

console.log('🚀 Starting ViralCraft-AI server...');
console.log('📍 Server path:', serverPath);
console.log('📍 Server file:', serverFile);

// Change working directory
process.chdir(serverPath);

// Start the server
const serverProcess = spawn('node', ['server.js'], {
  stdio: 'inherit',
  cwd: serverPath
});

serverProcess.on('error', (error) => {
  console.error('❌ Failed to start server:', error.message);
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  console.log(`🔄 Server process exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Shutting down...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🔄 Shutting down...');
  serverProcess.kill('SIGTERM');
});
