const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ❗️ НАЛАШТУВАННЯ
const TOKEN = '8580831379:AAHY1i-mNZ3XN49SZ7VeiwoqGrv-y3HUysk';
const WEB_APP_URL = 'https://mytaxi-app.onrender.com'; // Ваш HTTPS від ngrok
const ADMIN_ID = 7677921905; // ❗️ ВАШ ID (числом)
const DB_PATH = './db.json';

const bot = new TelegramBot(TOKEN, { polling: true });

// --- Робота з БД ---
function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH));
        }
    } catch (e) { console.error(e); }
    return { users: {} };
}

function saveDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getUser(userId, username = '') {
    const db = loadDB();
    if (!db.users[userId]) {
        db.users[userId] = { role: 'client', username };
        saveDB(db);
    }
    return db.users[userId];
}

// --- Команди ---
bot.onText(/\/start/, (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId, msg.from.first_name);
    
    let text = `Привіт, ${user.username}! Натисніть /app для замовлення.`;
    if (user.role === 'admin') text += '\n\n⭐️ Ви Адміністратор.';
    else text += '\nВодії можуть подати заявку через /register_driver';

    bot.sendMessage(msg.chat.id, text);
});

bot.onText(/\/app/, (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId);
    let url = WEB_APP_URL + '/client.html';
    let text = 'Замовити таксі:';

    if (user.role === 'driver_approved' || user.role === 'admin') {
        url = WEB_APP_URL + '/driver.html';
        text = 'Панель водія:';
    } else if (user.role === 'driver_pending') {
        return bot.sendMessage(msg.chat.id, "Ваша заявка на перевірці.");
    }

    bot.sendMessage(msg.chat.id, text, {
        reply_markup: { inline_keyboard: [[{ text: 'Відкрити додаток', web_app: { url } }]] }
    });
});

bot.onText(/\/register_driver/, (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId, msg.from.first_name);
    const db = loadDB();

    if (user.role === 'admin') return bot.sendMessage(userId, 'Ви Адмін, вам не треба реєстрація.');
    if (user.role === 'driver_approved') return bot.sendMessage(userId, 'Ви вже водій.');
    if (user.role === 'driver_pending') return bot.sendMessage(userId, 'Чекайте підтвердження.');

    db.users[userId].role = 'driver_pending';
    saveDB(db);

    bot.sendMessage(userId, 'Заявка прийнята! Чекайте.');

    // Сповіщення Адміну
    bot.sendMessage(ADMIN_ID, `🔔 Нова заявка!\nUser: ${user.username} (ID: ${userId})`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Схвалити', callback_data: `approve_${userId}` }],
                [{ text: '❌ Відхилити', callback_data: `reject_${userId}` }]
            ]
        }
    }).catch(e => console.error('Помилка відправки адміну:', e.message));
});

bot.on('callback_query', (q) => {
    if (q.from.id !== ADMIN_ID) return;
    const db = loadDB();
    const targetId = q.data.split('_')[1];
    const action = q.data.split('_')[0];

    if (!db.users[targetId]) return bot.answerCallbackQuery(q.id, { text: 'Юзера не знайдено' });

    if (action === 'approve') {
        db.users[targetId].role = 'driver_approved';
        saveDB(db);
        bot.sendMessage(targetId, '✅ Ваша заявка схвалена! Тисніть /app');
        bot.editMessageText(`✅ Водія ${db.users[targetId].username} схвалено.`, { chat_id: q.message.chat.id, message_id: q.message.message_id });
    } else if (action === 'reject') {
        db.users[targetId].role = 'client';
        saveDB(db);
        bot.sendMessage(targetId, '❌ Заявку відхилено.');
        bot.editMessageText(`❌ Водія ${db.users[targetId].username} відхилено.`, { chat_id: q.message.chat.id, message_id: q.message.message_id });
    }
    bot.answerCallbackQuery(q.id);
});

console.log('Bot started...');