
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BASE_URL = 'http://localhost:5000';

async function testAllIntegrations() {
  console.log('🔍 Running Comprehensive Integration Tests...\n');

  const results = {
    server: { status: 'unknown', details: {} },
    database: { status: 'unknown', details: {} },
    ai: { status: 'unknown', details: {} },
    cache: { status: 'unknown', details: {} },
    staticFiles: { status: 'unknown', details: {} },
    apis: { status: 'unknown', details: {} }
  };

  // Test 1: Server Health
  console.log('1️⃣ Testing Server Health...');
  try {
    const response = await axios.get(`${BASE_URL}/api/health`);
    results.server.status = response.status === 200 ? 'healthy' : 'unhealthy';
    results.server.details = response.data;
    console.log('✅ Server is running and responsive');
  } catch (error) {
    results.server.status = 'error';
    results.server.details = { error: error.message };
    console.log('❌ Server health check failed:', error.message);
  }

  // Test 2: Database Connection
  console.log('\n2️⃣ Testing Database...');
  try {
    const response = await axios.get(`${BASE_URL}/api/test/integration`);
    const dbStatus = response.data.database;
    if (dbStatus && dbStatus.includes('Connected')) {
      results.database.status = 'healthy';
      results.database.details = { message: dbStatus };
      console.log('✅ Database connection verified');
    } else {
      results.database.status = 'unhealthy';
      results.database.details = { message: dbStatus || 'Unknown status' };
      console.log('⚠️ Database status unclear:', dbStatus);
    }
  } catch (error) {
    results.database.status = 'error';
    results.database.details = { error: error.message };
    console.log('❌ Database test failed:', error.message);
  }

  // Test 3: AI Services
  console.log('\n3️⃣ Testing AI Services...');
  try {
    const response = await axios.get(`${BASE_URL}/api/test/integration`);
    const data = response.data;
    
    results.ai.details = {
      openai: data.openai || 'Not configured',
      anthropic: data.anthropic || 'Not configured',
      aiService: data.aiService || 'Unknown status'
    };
    
    if (data.openai && data.openai !== '') {
      results.ai.status = 'configured';
      console.log('✅ OpenAI configured and accessible');
    } else if (data.aiService && data.aiService.includes('Fallback')) {
      results.ai.status = 'fallback';
      console.log('⚠️ AI services running in fallback mode');
    } else {
      results.ai.status = 'error';
      console.log('❌ AI services not properly configured');
    }
  } catch (error) {
    results.ai.status = 'error';
    results.ai.details = { error: error.message };
    console.log('❌ AI services test failed:', error.message);
  }

  // Test 4: Content Generation
  console.log('\n4️⃣ Testing Content Generation...');
  try {
    const response = await axios.post(`${BASE_URL}/api/generate`, {
      topic: 'test content',
      platform: 'instagram',
      type: 'post'
    });
    
    if (response.status === 200 && response.data.content) {
      results.apis.status = 'working';
      results.apis.details = { 
        contentGenerated: true,
        provider: response.data.provider || 'fallback'
      };
      console.log('✅ Content generation working');
    } else {
      results.apis.status = 'partial';
      console.log('⚠️ Content generation returned unexpected response');
    }
  } catch (error) {
    results.apis.status = 'error';
    results.apis.details = { 
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    };
    console.log('❌ Content generation failed:', error.message);
  }

  // Test 5: Static Files
  console.log('\n5️⃣ Testing Static Files...');
  try {
    const response = await axios.get(`${BASE_URL}/`);
    if (response.status === 200 && response.data.includes('<!DOCTYPE html>')) {
      results.staticFiles.status = 'healthy';
      results.staticFiles.details = { message: 'Frontend accessible' };
      console.log('✅ Static files served correctly');
    } else {
      results.staticFiles.status = 'partial';
      console.log('⚠️ Static files partially accessible');
    }
  } catch (error) {
    results.staticFiles.status = 'error';
    results.staticFiles.details = { error: error.message };
    console.log('❌ Static files test failed:', error.message);
  }

  // Test 6: Cache Service
  console.log('\n6️⃣ Testing Cache Service...');
  try {
    // Make the same request twice to test caching
    const start1 = Date.now();
    await axios.post(`${BASE_URL}/api/generate`, {
      topic: 'cache test',
      platform: 'twitter',
      type: 'post'
    });
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    await axios.post(`${BASE_URL}/api/generate`, {
      topic: 'cache test',
      platform: 'twitter',
      type: 'post'
    });
    const time2 = Date.now() - start2;

    if (time2 < time1 * 0.8) {
      results.cache.status = 'working';
      results.cache.details = { 
        firstRequest: `${time1}ms`,
        secondRequest: `${time2}ms`,
        improvement: `${Math.round((1 - time2/time1) * 100)}%`
      };
      console.log('✅ Cache service working - response time improved');
    } else {
      results.cache.status = 'unknown';
      results.cache.details = { 
        message: 'Cache effectiveness unclear',
        firstRequest: `${time1}ms`,
        secondRequest: `${time2}ms`
      };
      console.log('⚠️ Cache effectiveness unclear');
    }
  } catch (error) {
    results.cache.status = 'error';
    results.cache.details = { error: error.message };
    console.log('❌ Cache test failed:', error.message);
  }

  // Summary Report
  console.log('\n📊 INTEGRATION TEST SUMMARY');
  console.log('================================');
  
  Object.entries(results).forEach(([service, result]) => {
    const icon = result.status === 'healthy' || result.status === 'working' ? '✅' : 
                 result.status === 'configured' || result.status === 'partial' || result.status === 'fallback' ? '⚠️' : '❌';
    console.log(`${icon} ${service.toUpperCase()}: ${result.status}`);
    
    if (result.details && Object.keys(result.details).length > 0) {
      Object.entries(result.details).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    }
  });

  // Overall Status
  const healthyServices = Object.values(results).filter(r => 
    r.status === 'healthy' || r.status === 'working' || r.status === 'configured'
  ).length;
  
  const totalServices = Object.keys(results).length;
  const healthPercentage = Math.round((healthyServices / totalServices) * 100);
  
  console.log('\n🎯 OVERALL SYSTEM HEALTH');
  console.log(`Healthy Services: ${healthyServices}/${totalServices} (${healthPercentage}%)`);
  
  if (healthPercentage >= 80) {
    console.log('🟢 System Status: EXCELLENT - All critical services operational');
  } else if (healthPercentage >= 60) {
    console.log('🟡 System Status: GOOD - Most services operational, minor issues');
  } else {
    console.log('🔴 System Status: NEEDS ATTENTION - Multiple service issues detected');
  }

  return results;
}

// Run the comprehensive test
testAllIntegrations().catch(console.error);
