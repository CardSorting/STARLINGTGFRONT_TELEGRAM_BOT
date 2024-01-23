const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const logger = require('./credit');

class DatabaseHandler {
  constructor() {
    const dbDir = path.join(__dirname, './sqlite');
    if (!fs.existsSync(dbDir)) {
      logger.info(`Creating database directory at ${dbDir}`);
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'credits.db');
    logger.info(`Initializing SQLite database at ${dbPath}`);
    this.db = new Database(dbPath);

    this.createUserCreditsTable();
  }

  createUserCreditsTable() {
    logger.info(`Ensuring UserCredits table exists`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS UserCredits (
        userID TEXT PRIMARY KEY,
        credits INTEGER NOT NULL CHECK (credits >= 0),
        lastUpdated TEXT
      )
    `);
  }
}

class CreditStore extends DatabaseHandler {
  constructor() {
    super();
  }

  static validateInputs(userID, userCredits) {
    if (!userID) {
      logger.error(`Invalid userID: ${userID}`);
      throw new Error('Invalid userID: ' + userID);
    }

    if (userCredits && (typeof userCredits.credits !== 'number' || isNaN(userCredits.credits))) {
      logger.error(`Invalid credits: ${userCredits.credits}`);
      throw new Error('Invalid credits value: ' + userCredits.credits);
    }
  }

  retrieveUserCredits(userID) {
    logger.info(`Fetching credits for user ${userID}`);
    try {
      this.constructor.validateInputs(userID);
      const stmt = this.db.prepare('SELECT credits, lastUpdated FROM UserCredits WHERE userID = ?');
      let user = stmt.get(userID);

      if (user && user.lastUpdated) {
        user.lastUpdated = new Date(user.lastUpdated);
      }

      logger.info(`Retrieved credits for user ${userID}:`, user);

      return user || { credits: 0, lastUpdated: null };
    } catch (error) {
      logger.error(`Error retrieving credits for user ${userID}:`, error);
      throw error;
    }
  }

  updateUserCredits(userID, userCredits) {
    logger.info(`Updating credits for user ${userID} with data:`, userCredits);
    try {
      this.constructor.validateInputs(userID, userCredits);

      const stmt = this.db.prepare('INSERT OR REPLACE INTO UserCredits (userID, credits, lastUpdated) VALUES (?, ?, ?)');

      const lastUpdatedISOString = userCredits.lastUpdated ? userCredits.lastUpdated.toISOString() : null;

      const info = stmt.run(userID, userCredits.credits, lastUpdatedISOString);
      logger.info(`Credits updated for user ${userID}:`, info);

      return info;
    } catch (error) {
      logger.error(`Error updating credits for user ${userID}:`, error);
      throw error;
    }
  }

  deleteUserCredits(userID) {
    logger.info(`Deleting credits for user ${userID}`);
    try {
      this.constructor.validateInputs(userID);
      const stmt = this.db.prepare('DELETE FROM UserCredits WHERE userID = ?');
      stmt.run(userID);
      logger.info(`Deleted credits for user ${userID}`);
    } catch (error) {
      logger.error(`Error deleting credits for user ${userID}:`, error);
      throw error;
    }
  }
}

module.exports = CreditStore;