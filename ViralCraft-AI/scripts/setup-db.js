
require('sequelize');
const { setupDatabase } = require('./setupDatabase');
require('dotenv').config();

// Run if called directly
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;
