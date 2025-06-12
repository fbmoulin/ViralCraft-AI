
const lightDatabase = require('../services/lightDatabase');

async function setupLightDatabase() {
  console.log('💡 Setting up lightweight database...');
  
  try {
    // Initialize the light database
    const connected = await lightDatabase.initialize();
    
    if (connected) {
      console.log('✅ Light database setup completed successfully');
      
      // Create sample data
      const sampleContent = await lightDatabase.create('Content', {
        title: 'Welcome to Light DB',
        type: 'social',
        platform: 'instagram',
        content: {
          text: 'Testing lightweight database! 🚀',
          hashtags: ['#test', '#lightdb']
        },
        tags: ['sample', 'test'],
        score: 80,
        status: 'published'
      });
      
      if (sampleContent) {
        console.log('✅ Sample content created');
        
        // Add analytics for the sample content
        await lightDatabase.create('Analytics', {
          contentId: sampleContent.id,
          views: 100,
          interactions: 25
        });
        
        console.log('✅ Sample analytics created');
      }
      
      // Display database stats
      const stats = await lightDatabase.getStats();
      console.log('📊 Database stats:', stats);
      
    } else {
      console.error('❌ Failed to setup light database');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Light database setup error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  setupLightDatabase();
}

module.exports = setupLightDatabase;
