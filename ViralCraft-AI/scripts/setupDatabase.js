
async function setupDatabase() {
    console.log('🗄️ Setting up database...');

    try {
        // Initialize database service
        const databaseService = require('../services/database');

        // Initialize connection and create tables
        const connected = await databaseService.initialize();

        if (connected) {
            console.log('✅ Database setup completed successfully');

            // Create some sample data if tables are empty
            const contentCount = await databaseService.models.Content.count();
            if (contentCount === 0) {
                console.log('📝 Creating sample content...');

                await databaseService.createContent({
                    title: 'Welcome to ViralCraft-AI',
                    type: 'social',
                    platform: 'instagram',
                    content: {
                        text: 'Transform your content creation with AI! 🚀 #ViralCraft #AI #ContentCreation',
                        hashtags: ['#ViralCraft', '#AI', '#ContentCreation'],
                        tone: 'friendly'
                    },
                    keywords: ['AI', 'content', 'viral', 'social media'],
                    viralScore: 75,
                    status: 'published'
                });

                console.log('✅ Sample content created');
            }

            // Display database info
            const healthCheck = await databaseService.healthCheck();
            console.log('📊 Database status:', healthCheck);

        } else {
            console.error('❌ Failed to setup database');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Database setup error:', error.message);
        process.exit(1);
    }

    process.exit(0);
}
exports.setupDatabase = setupDatabase;
