
const axios = require('axios');

async function testAPIIntegration() {
  const baseURL = process.env.NODE_ENV === 'production' 
    ? 'https://your-repl-url.replit.app' 
    : 'http://localhost:5000';

  console.log('🧪 Testing API Integration...\n');

  const tests = [
    {
      name: 'Health Check',
      endpoint: '/api/health',
      method: 'GET'
    },
    {
      name: 'Integration Test',
      endpoint: '/api/test-integration',
      method: 'GET'
    },
    {
      name: 'Content Generation (Demo)',
      endpoint: '/api/suggest',
      method: 'POST',
      data: {
        topic: 'AI Technology',
        contentType: 'social',
        platform: 'instagram',
        keywords: ['AI', 'technology'],
        tone: 'inspiring'
      }
    },
    {
      name: 'YouTube Analyses List',
      endpoint: '/api/youtube/analyses',
      method: 'GET'
    }
  ];

  for (const test of tests) {
    try {
      console.log(`Testing ${test.name}...`);
      
      const config = {
        method: test.method,
        url: `${baseURL}${test.endpoint}`,
        timeout: 10000
      };

      if (test.data) {
        config.data = test.data;
        config.headers = { 'Content-Type': 'application/json' };
      }

      const response = await axios(config);
      
      console.log(`✅ ${test.name}: ${response.status} ${response.statusText}`);
      
      if (test.endpoint === '/api/test-integration') {
        const { tests: integrationTests } = response.data;
        Object.entries(integrationTests).forEach(([service, result]) => {
          const icon = result.status === 'ok' ? '✅' : '❌';
          console.log(`   ${icon} ${service}: ${result.details}`);
        });
      }
      
    } catch (error) {
      console.error(`❌ ${test.name}: ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }
    console.log('');
  }

  console.log('🏁 API Integration tests completed');
}

// Run if called directly
if (require.main === module) {
  testAPIIntegration().catch(console.error);
}

module.exports = testAPIIntegration;
