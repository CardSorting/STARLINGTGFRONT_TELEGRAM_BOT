const http = require('http');
const PORT = 3000;
const TelegramBot = require('node-telegram-bot-api');
const workerQueueHandler = require('./lavinMQWorkerQueueHandler');
const CreditManager = require('./CreditManager');
const pinoLogger = require('./logger');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(telegramToken, { polling: true });
const creditManager = new CreditManager();
const rateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
});

const userStatus = new Map();
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello World\n');
});

async function initializeBot() {
  try {
    await workerQueueHandler.initialize();
    setupQueueConsumers();
    setupMessageListener();
    pinoLogger.info('Telegram bot initialized successfully.');
  } catch (error) {
    pinoLogger.error('Failed to initialize the bot:', error);
  }
}

function setupMessageListener() {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (userStatus.get(chatId) === 'busy' || userStatus.get(chatId) === 'awaiting_response') {
      await bot.sendMessage(chatId, "I'm still processing your previous request. Please wait.");
      return;
    }

    const userMessage = msg.text;
    try {
      await rateLimiter.consume(chatId);
    } catch (rejRes) {
      await bot.sendMessage(chatId, "Too many requests. Please slow down.");
      return;
    }

    userStatus.set(chatId, 'busy');

    if (userMessage === '/start') {
      await handleStartCommand(chatId);
    } else {
      await processUserMessage(chatId, userMessage);
    }
  });
}

async function handleStartCommand(chatId) {
  try {
    await creditManager.addUserCredits(String(chatId), creditManager.DEFAULT_START_CREDITS);
    await bot.sendMessage(chatId, "Welcome! Your credits have been initialized.");
  } catch (error) {
    pinoLogger.error(`Error in handling /start command for chat ID ${chatId}:`, error);
    await bot.sendMessage(chatId, "Error initializing credits.");
  } finally {
    userStatus.set(chatId, 'free');
  }
}

async function processUserMessage(chatId, userMessage) {
  try {
    const userCredits = await creditManager.fetchUserCredits(String(chatId));
    if (userCredits.credits < creditManager.QUERY_COMMAND_COST) {
      if (userCredits.credits === 0) {
        await bot.sendMessage(chatId, "You've run out of credits. Please join our channel to contact for a refill: https://t.me/aigirlchat");
        return;
      }
      await bot.sendMessage(chatId, "Insufficient credits to process the query.");
      return;
    }

    const hasEnoughCredits = await creditManager.handleQueryCostDeduction(String(chatId));
    if (!hasEnoughCredits) {
      await bot.sendMessage(chatId, "Insufficient credits to process the query.");
      return;
    }

    const task = { chatId, query: userMessage };
    await workerQueueHandler.sendJobResult(task);
    pinoLogger.info(`Query enqueued for chat ID ${chatId}`);
    // Set to awaiting_response after enqueuing the task
    userStatus.set(chatId, 'awaiting_response');
  } catch (error) {
    pinoLogger.error(`Error in processing message for chat ID ${chatId}:`, error);
    await bot.sendMessage(chatId, "Sorry, I encountered an error.");
    userStatus.set(chatId, 'free');
  }
}


function setupQueueConsumers() {
  workerQueueHandler.consumeImageGenerationTasks((msg) => {
    const data = JSON.parse(msg.content.toString());
    const { chatId, response } = data;
    bot.sendMessage(chatId, response).catch(error => {
      pinoLogger.error(`Error in sending response to chat ID ${chatId}:`, error);
    }).finally(() => {
      userStatus.delete(chatId); // Clear the user’s status once we've finished processing
    });
  });
}

initializeBot();

server.listen(PORT, () => {
  console.log(`HTTP Server running on http://localhost:${PORT}/`);
});

process.on('SIGINT', async () => {
  try {
    await workerQueueHandler.close();
    server.close();
    process.exit(0);
  } catch (error) {
    pinoLogger.error('Error during shutdown:', error);
    process.exit(1);
  }
});