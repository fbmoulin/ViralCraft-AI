
const axios = require('axios');

async function testServer() {
  const baseUrl = 'http://localhost:5000';
  const tests = [
    { name: 'Health Check', endpoint: '/api/health' },
    { name: 'Static Files', endpoint: '/' }
  ];

  console.log('🧪 Starting server tests...\n');

  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`);
      const response = await axios.get(`${baseUrl}${test.endpoint}`, { timeout: 5000 });
      console.log(`✅ ${test.name}: Status ${response.status}`);
      
      if (test.endpoint === '/api/health') {
        console.log(`   Services: OpenAI ${response.data.services.openai.configured ? '✓' : '✗'}, Anthropic ${response.data.services.anthropic.configured ? '✓' : '✗'}`);
        console.log(`   Database: ${response.data.services.database.connected ? 'Connected' : 'Not connected'} (${response.data.services.database.type})`);
      }
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
    }
    console.log('');le.log('');
  }

  // Test content generation (mock)
  try {
    console.log('Testing: Content Generation (Demo)');
    const response = await axios.post(`${baseUrl}/api/generate`, {
      topic: 'Test Topic',
      contentType: 'social',
      platform: 'instagram',
      tone: 'friendly'
    }, { timeout: 10000 });
    
    if (response.data.success) {
      console.log('✅ Content Generation: Working');
    } else {
      console.log('❌ Content Generation: Failed');
    }
  } catch (error) {
    console.log(`❌ Content Generation: ${error.message}`);
  }

  console.log('\n🏁 Test completed');
}

// Run if called directly
if (require.main === module) {
  testServer().catch(console.error);
}

module.exports = testServer;le.exports = testServer;
