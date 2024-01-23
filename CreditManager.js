creditslog = require('./credit');
const CreditStore = require('./creditStore');

class CreditManager {
  constructor(config = {}) {
    this.DEFAULT_START_CREDITS = config.DEFAULT_START_CREDITS || 500;
    this.QUERY_COMMAND_COST = config.QUERY_COMMAND_COST || 3;
    this.creditStore = new CreditStore();
    creditslog.info('CreditManager instance created.');

    this.cleanup = this.cleanup.bind(this);
    process.on('exit', this.cleanup);
  }

  // Validate user ID
  validateUserID(userID) {
    if (!userID || typeof userID !== 'string') {
      throw new Error('Invalid user ID');
    }
  }

  // Fetch user credits
  async fetchUserCredits(userID) {
    this.validateUserID(userID);
    try {
      creditslog.info(`Fetching credits for user: ${userID}`);
      let userCredits = await this.creditStore.retrieveUserCredits(userID);

      // Check if there's no existing entry for the user
      if (userCredits === null || userCredits === undefined) {
        userCredits = { credits: this.DEFAULT_START_CREDITS, lastUpdated: new Date() };
        await this.updateUserCredits(userID, userCredits);
      }

      return userCredits;
    } catch (error) {
      creditslog.error(`Error fetching credits for user ${userID}: ${error}`);
      throw new Error(`Error fetching credits for user ${userID}`);
    }
  }


  // Update user credits
  async updateUserCredits(userID, userCredits) {
    this.validateUserID(userID);
    try {
      await this.creditStore.updateUserCredits(userID, userCredits);
      creditslog.info(`Updated user ${userID} credits to ${userCredits.credits}`);
    } catch (error) {
      creditslog.error(`Error updating credits for user ${userID}: ${error}`);
      throw new Error(`Error updating credits for user ${userID}`);
    }
  }

  // Deduct user credits
  async deductUserCredits(userID, creditAmount = 1) {
    this.validateUserID(userID);
    if (creditAmount < 0) {
      throw new Error('Credit amount to deduct must be non-negative');
    }

    try {
      const userCredits = await this.fetchUserCredits(userID);

      if (userCredits.credits >= creditAmount) {
        userCredits.credits -= creditAmount;
        await this.updateUserCredits(userID, userCredits);
        return true;
      } else {
        creditslog.warn(`Insufficient credits for user ${userID}`);
        return false;
      }
    } catch (error) {
      creditslog.error(`Error deducting credits for user ${userID}: ${error}`);
      throw new Error(`Error deducting credits for user ${userID}`);
    }
  }

  // Handle specific command cost deductions
  async handleQueryCostDeduction(userID) {
    return this.deductUserCredits(userID, this.QUERY_COMMAND_COST);
  }

  async handleRenderCostDeduction(userID) {
    return this.deductUserCredits(userID, this.RENDER_COST);
  }

  async handleAskCostDeduction(userID) {
    return this.deductUserCredits(userID, this.ASK_COMMAND_COST);
  }

  async handleSelfieCommandCostDeduction(userID) {
    return this.deductUserCredits(userID, this.SELFIE_COMMAND_COST);
  }

  // Add user credits
  async addUserCredits(userID, creditAmount) {
    this.validateUserID(userID);
    if (isNaN(creditAmount) || creditAmount <= 0) {
      creditslog.error(`Invalid credit amount: ${creditAmount} for user ${userID}`);
      throw new Error('Invalid credit amount');
    }

    try {
      const userCredits = await this.fetchUserCredits(userID);
      userCredits.credits += creditAmount;
      await this.updateUserCredits(userID, userCredits);
    } catch (error) {
      creditslog.error(`Error adding credits for user ${userID}: ${error}`);
      throw new Error(`Error adding credits for user ${userID}`);
    }
  }

  // Cleanup resources
  cleanup() {
    try {
      this.creditStore.close();
      creditslog.info('CreditManager instance cleaned up.');
    } catch (error) {
      creditslog.error(`Error during cleanup: ${error}`);
    }
  }
}

module.exports = CreditManager;