#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');

console.log('🧪 Running Full ViralCraft-AI Application Test\n');

// Test configurations
const testConfig = {
  serverUrl: 'http://localhost:5000',
  timeout: 10000,
  retryAttempts: 3
};

// Test results storage
const testResults = {
  syntax: [],
  dependencies: [],
  server: [],
  endpoints: [],
  files: [],
  overall: 'PENDING'
};

// Helper function to run shell commands
function runCommand(command, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Test 1: Syntax Validation
async function testSyntax() {
  console.log('1️⃣ Testing JavaScript Syntax...');

  const jsFiles = [
    'server.js',
    'utils/logger.js',
    'routes/youtube-routes.js',
    'routes/logs-routes.js',
    'services/database.js',
    'middleware/monitoring.js'
  ];

  for (const file of jsFiles) {
    const filePath = path.join(__dirname, file);
    try {
      if (fs.existsSync(filePath)) {
        await runCommand(`node --check ${filePath}`);
        testResults.syntax.push({ file, status: 'PASS', message: 'Syntax OK' });
        console.log(`  ✅ ${file}: Syntax OK`);
      } else {
        testResults.syntax.push({ file, status: 'SKIP', message: 'File not found' });
        console.log(`  ⚠️ ${file}: File not found`);
      }
    } catch (error) {
      testResults.syntax.push({
        file,
        status: 'FAIL',
        message: error.stderr || error.error.message
      });
      console.log(`  ❌ ${file}: ${error.stderr || error.error.message}`);
    }
  }
}

// Test 2: Dependencies Check
async function testDependencies() {
  console.log('\n2️⃣ Testing Dependencies...');

  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    console.log(`  📦 Checking ${Object.keys(dependencies).length} dependencies...`);

    const result = await runCommand('npm ls --depth=0');
    testResults.dependencies.push({
      test: 'npm_ls',
      status: 'PASS',
      message: 'All dependencies installed'
    });
    console.log('  ✅ All dependencies are properly installed');

    // Check for vulnerabilities
    try {
      await runCommand('npm audit --audit-level moderate');
      testResults.dependencies.push({
        test: 'security',
        status: 'PASS',
        message: 'No critical vulnerabilities'
      });
      console.log('  ✅ No critical security vulnerabilities');
    } catch (auditError) {
      testResults.dependencies.push({
        test: 'security',
        status: 'WARN',
        message: 'Some vulnerabilities found'
      });
      console.log('  ⚠️ Some vulnerabilities found - run npm audit for details');
    }
  } catch (error) {
    testResults.dependencies.push({
      test: 'npm_ls',
      status: 'FAIL',
      message: error.stderr || error.error.message
    });
    console.log(`  ❌ Dependency check failed: ${error.stderr || error.error.message}`);
  }
}

// Test 3: File Structure
async function testFileStructure() {
  console.log('\n3️⃣ Testing File Structure...');

  const requiredFiles = [
    'package.json',
    'server.js',
    '.env.example',
    'public/index.html',
    'static/css/modernized-style.css',
    'static/js/modernized-app.js',
    'utils/logger.js',
    'services/database.js'
  ];

  const requiredDirs = ['public', 'static', 'utils', 'services', 'routes', 'middleware'];

  // Check files
  for (const file of requiredFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      testResults.files.push({ item: file, type: 'file', status: 'PASS' });
      console.log(`  ✅ ${file}: Found`);
    } else {
      testResults.files.push({ item: file, type: 'file', status: 'FAIL' });
      console.log(`  ❌ ${file}: Missing`);
    }
  }

  // Check directories
  for (const dir of requiredDirs) {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      testResults.files.push({ item: dir, type: 'directory', status: 'PASS' });
      console.log(`  ✅ ${dir}/: Found`);
    } else {
      testResults.files.push({ item: dir, type: 'directory', status: 'FAIL' });
      console.log(`  ❌ ${dir}/: Missing`);
    }
  }
}

// Test 4: Server Startup
async function testServerStartup() {
  console.log('\n4️⃣ Testing Server Startup...');

  try {
    console.log('  🚀 Starting server...');

    // Start server in background
    const serverProcess = exec('node server.js', { cwd: __dirname });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Test if server responds
    try {
      const response = await axios.get(`${testConfig.serverUrl}/api/health`, {
        timeout: testConfig.timeout
      });

      testResults.server.push({
        test: 'startup',
        status: 'PASS',
        message: 'Server started successfully'
      });
      console.log('  ✅ Server started successfully');

      // Test health endpoint
      if (response.data && response.data.status === 'ok') {
        testResults.server.push({ test: 'health', status: 'PASS', message: 'Health check passed' });
        console.log('  ✅ Health check passed');
      } else {
        testResults.server.push({ test: 'health', status: 'FAIL', message: 'Health check failed' });
        console.log('  ❌ Health check failed');
      }
    } catch (httpError) {
      testResults.server.push({ test: 'startup', status: 'FAIL', message: httpError.message });
      console.log(`  ❌ Server not responding: ${httpError.message}`);
    }

    // Cleanup
    serverProcess.kill();
  } catch (error) {
    testResults.server.push({ test: 'startup', status: 'FAIL', message: error.message });
    console.log(`  ❌ Server startup failed: ${error.message}`);
  }
}

// Test 5: API Endpoints
async function testAPIEndpoints() {
  console.log('\n5️⃣ Testing API Endpoints...');

  const endpoints = [
    { path: '/api/health', method: 'GET', expected: 200 },
    { path: '/api/test-integration', method: 'GET', expected: 200 },
    { path: '/', method: 'GET', expected: 200 }
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios({
        method: endpoint.method,
        url: `${testConfig.serverUrl}${endpoint.path}`,
        timeout: testConfig.timeout
      });

      if (response.status === endpoint.expected) {
        testResults.endpoints.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          status: 'PASS',
          code: response.status
        });
        console.log(`  ✅ ${endpoint.method} ${endpoint.path}: ${response.status}`);
      } else {
        testResults.endpoints.push({
          endpoint: `${endpoint.method} ${endpoint.path}`,
          status: 'FAIL',
          code: response.status
        });
        console.log(
          `  ❌ ${endpoint.method} ${endpoint.path}: Expected ${endpoint.expected}, got ${response.status}`
        );
      }
    } catch (error) {
      testResults.endpoints.push({
        endpoint: `${endpoint.method} ${endpoint.path}`,
        status: 'FAIL',
        error: error.message
      });
      console.log(`  ❌ ${endpoint.method} ${endpoint.path}: ${error.message}`);
    }
  }
}

// Generate test report
function generateReport() {
  console.log('\n📊 Test Results Summary\n');

  const totalTests = [
    ...testResults.syntax,
    ...testResults.dependencies,
    ...testResults.files,
    ...testResults.server,
    ...testResults.endpoints
  ];

  const passed = totalTests.filter((t) => t.status === 'PASS').length;
  const failed = totalTests.filter((t) => t.status === 'FAIL').length;
  const warnings = totalTests.filter((t) => t.status === 'WARN').length;
  const skipped = totalTests.filter((t) => t.status === 'SKIP').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️ Warnings: ${warnings}`);
  console.log(`⏭️ Skipped: ${skipped}`);

  if (failed === 0) {
    testResults.overall = 'PASS';
    console.log('\n🎉 All tests passed! The application is ready to run.');
  } else if (failed <= 2) {
    testResults.overall = 'WARN';
    console.log('\n⚠️ Some tests failed, but the application may still work with limitations.');
  } else {
    testResults.overall = 'FAIL';
    console.log(
      '\n❌ Multiple test failures detected. The application needs fixes before running.'
    );
  }

  // Save detailed report
  const reportPath = path.join(__dirname, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

// Main test runner
async function runFullTest() {
  try {
    await testSyntax();
    await testDependencies();
    await testFileStructure();
    await testServerStartup();
    // Note: Server endpoints test requires server to be running
    // await testAPIEndpoints();

    generateReport();
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runFullTest();
}

module.exports = runFullTest;
