
const { OpenAI } = require('openai');
require('dotenv').config();

async function testOpenAI() {
  console.log('🧪 Testing OpenAI API Configuration...\n');
  
  // Check environment variables
  console.log('📋 Environment Check:');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  console.log('- OpenAI Key Present:', !!process.env.OPENAI_API_KEY);
  console.log('- OpenAI Key Length:', process.env.OPENAI_API_KEY?.length || 0);
  console.log('- OpenAI Key Preview:', process.env.OPENAI_API_KEY ? 
    `${process.env.OPENAI_API_KEY.substring(0, 7)}...${process.env.OPENAI_API_KEY.substring(-4)}` : 
    'Not set');
  
  if (!process.env.OPENAI_API_KEY) {
    console.log('\n❌ OpenAI API Key not found in environment variables');
    console.log('💡 Please add OPENAI_API_KEY to your .env file');
    console.log('💡 Get your API key from: https://platform.openai.com/api-keys');
    return;
  }

  if (process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.log('\n❌ OpenAI API Key is still set to placeholder value');
    console.log('💡 Replace "your_openai_api_key_here" with your actual API key');
    return;
  }

  // Test API connection
  console.log('\n🔗 Testing API Connection...');
  
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 10000
    });

    // Test with a simple completion
    console.log('📞 Making test API call...');
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say 'Hello, OpenAI API is working!' in exactly those words." }
      ],
      max_tokens: 20,
      temperature: 0
    });

    console.log('✅ OpenAI API Test Successful!');
    console.log('📝 Response:', response.choices[0].message.content);
    console.log('🎯 Model Used:', response.model);
    console.log('📊 Tokens Used:', response.usage.total_tokens);
    
    // Test available models
    console.log('\n📋 Testing Model Access...');
    try {
      const models = await openai.models.list();
      const availableModels = models.data
        .filter(model => model.id.includes('gpt'))
        .map(model => model.id)
        .slice(0, 5);
      
      console.log('✅ Available GPT Models:', availableModels.join(', '));
    } catch (modelError) {
      console.log('⚠️ Could not fetch models:', modelError.message);
    }
    
  } catch (error) {
    console.log('❌ OpenAI API Test Failed!');
    console.log('📋 Error Details:');
    console.log('- Status:', error.status || 'Unknown');
    console.log('- Code:', error.code || 'Unknown');
    console.log('- Message:', error.message);
    
    if (error.status === 401) {
      console.log('\n💡 Troubleshooting 401 Unauthorized:');
      console.log('- Check if your API key is correct');
      console.log('- Ensure your OpenAI account has sufficient credits');
      console.log('- Verify the API key has the right permissions');
    } else if (error.status === 429) {
      console.log('\n💡 Troubleshooting 429 Rate Limit:');
      console.log('- You are being rate limited');
      console.log('- Wait a moment and try again');
      console.log('- Consider upgrading your OpenAI plan');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('\n💡 Troubleshooting Network Error:');
      console.log('- Check your internet connection');
      console.log('- Verify firewall settings');
      console.log('- Try again in a few moments');
    }
  }
}

// Run the test
testOpenAI().catch(console.error);
