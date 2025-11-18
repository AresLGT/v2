const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// --- ⚙️ НАЛАШТУВАННЯ (ПЕРЕВІРТЕ СВОЇ ДАНІ) ---
const TOKEN = 'ВАШ_ТОКЕН_ВІД_BOTFATHER'; 
const ADMIN_ID = 7677921905; // Ваш ID
const WEB_APP_URL = 'https://ВАШ_ДОМЕН_АБО_IP.nip.io'; 
const DB_PATH = './db.json';
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- 💾 БАЗА ДАНИХ ---
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ users: {} }));

function getUser(userId, username = '') {
    const db = JSON.parse(fs.readFileSync(DB_PATH));
    if (!db.users[userId]) {
        // Якщо це ваш ID - зразу даємо адмінку
        const role = (String(userId) === String(ADMIN_ID)) ? 'admin' : 'client';
        db.users[userId] = { role: role, username, customName: null };
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }
    // Перестраховка: якщо ви в базі, але роль не адмін, хоча ID співпадає
    if (String(userId) === String(ADMIN_ID) && db.users[userId].role !== 'admin') {
         db.users[userId].role = 'admin';
         fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }
    return db.users[userId];
}

function updateUserRole(userId, role) {
    const db = JSON.parse(fs.readFileSync(DB_PATH));
    if (db.users[userId]) {
        db.users[userId].role = role;
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }
}

function setDriverName(userId, newName) {
    const db = JSON.parse(fs.readFileSync(DB_PATH));
    if (db.users[userId]) {
        db.users[userId].customName = newName;
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        return true;
    }
    return false;
}

// ВИПРАВЛЕНО: Тепер показує і Адмінів у списку
function getAllDrivers() {
    const db = JSON.parse(fs.readFileSync(DB_PATH));
    let list = [];
    for (let id in db.users) {
        // Додаємо у список, якщо роль 'driver_approved' АБО 'admin'
        if (db.users[id].role === 'driver_approved' || db.users[id].role === 'admin') {
            let name = db.users[id].customName || db.users[id].username || "Без імені";
            let roleLabel = (db.users[id].role === 'admin') ? '👑' : '🚖';
            list.push(`${roleLabel} 🆔 <code>${id}</code> — ${name}`);
        }
    }
    return list.join('\n');
}

// --- 🚖 ПАМ'ЯТЬ ЗАМОВЛЕНЬ ---
let orderCounter = 1;
let activeOrders = []; 

// ==========================
// 🤖 ЛОГІКА БОТА
// ==========================

bot.onText(/\/start/, (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId, msg.from.first_name);
    let text = `Привіт, ${user.customName || user.username}!`;
    
    // Кнопки одразу при старті
    let keyboard = [[{ text: '📱 Замовити послугу', web_app: { url: WEB_APP_URL + '/client.html' } }]];

    if (user.role === 'admin') {
        text += '\n👑 Ви Адміністратор і Водій.\n\n<b>Команди:</b>\n/drivers - Список всіх водіїв\n/setname ID ІМ\'Я - Змінити ім\'я';
        keyboard = [
            [{ text: '💼 Я виконавець', web_app: { url: WEB_APP_URL + '/driver.html' } }],
            [{ text: '🙋‍♂️ Я клієнт', web_app: { url: WEB_APP_URL + '/client.html' } }]
        ];
    }
    else if (user.role === 'client') text += '\nХочете стати водієм? Тисніть /register_driver';
    
    bot.sendMessage(userId, text, { 
        parse_mode: 'HTML',
        reply_markup: { keyboard, resize_keyboard: true }
    });
});

// Адмінські команди
bot.onText(/\/drivers/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    const list = getAllDrivers();
    bot.sendMessage(msg.chat.id, list ? `📋 <b>Список водіїв:</b>\n\n${list}` : "Водіїв немає", { parse_mode: 'HTML' });
});

bot.onText(/\/setname (\d+) (.+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    const targetId = match[1];
    const newName = match[2];
    if (setDriverName(targetId, newName)) {
        bot.sendMessage(msg.chat.id, `✅ Ім'я змінено на: <b>${newName}</b>`, { parse_mode: 'HTML' });
    } else {
        bot.sendMessage(msg.chat.id, "❌ Юзера не знайдено (він має хоч раз запустити бота).");
    }
});

// Запуск додатку /app
bot.onText(/\/app/, (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId);
    
    let messageText = '👋 Куди поїдемо?';
    let keyboard = [[{ text: '📱 Замовити послугу', web_app: { url: WEB_APP_URL + '/client.html' } }]];

    // ВИПРАВЛЕНО: Адмін теж бачить кнопки водія
    if (user.role === 'driver_approved' || user.role === 'admin') {
        messageText = '👋 Оберіть режим:';
        keyboard = [
            [{ text: '💼 Я виконавець', web_app: { url: WEB_APP_URL + '/driver.html' } }],
            [{ text: '🙋‍♂️ Я клієнт', web_app: { url: WEB_APP_URL + '/client.html' } }]
        ];
    } else if (user.role === 'driver_pending') {
        return bot.sendMessage(msg.chat.id, "⏳ Ваша заявка ще на перевірці.");
    }

    bot.sendMessage(msg.chat.id, messageText, {
        reply_markup: { keyboard, resize_keyboard: true }
    });
});

// Реєстрація водія
bot.onText(/\/register_driver/, (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId);
    
    if (user.role === 'admin') return bot.sendMessage(userId, 'Ви Адмін, ви вже маєте доступ водія! Тисніть /app');
    if (user.role === 'driver_approved') return bot.sendMessage(userId, 'Ви вже водій.');
    
    updateUserRole(userId, 'driver_pending');
    bot.sendMessage(userId, 'Заявка прийнята.');
    bot.sendMessage(ADMIN_ID, `🔔 Заявка: ${msg.from.first_name} (ID: <code>${userId}</code>)`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✅', callback_data: `approve_${userId}` }, { text: '❌', callback_data: `reject_${userId}` }]] }
    });
});

bot.on('callback_query', (q) => {
    if (q.from.id !== ADMIN_ID) return;
    const [action, targetId] = q.data.split('_');
    if (action === 'approve') {
        updateUserRole(targetId, 'driver_approved');
        bot.sendMessage(targetId, '✅ Схвалено! Тисніть /app');
        bot.answerCallbackQuery(q.id, { text: 'Ок' });
    } else if (action === 'reject') {
        updateUserRole(targetId, 'client');
        bot.sendMessage(targetId, '❌ Відхилено.');
        bot.answerCallbackQuery(q.id, { text: 'Відміна' });
    }
});

// 💬 Чат-міст
bot.on('message', (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    const senderId = msg.from.id;
    const order = activeOrders.find(o => (o.userId == senderId || o.driverId == senderId) && o.status === 'accepted');

    if (order) {
        const senderUser = getUser(senderId);
        const senderName = senderUser.customName || senderUser.username || "Користувач";
        let targetId = (String(order.userId) === String(senderId)) ? order.driverId : order.userId;
        let page = (String(order.userId) === String(senderId)) ? '/driver.html' : '/client.html';
        let title = (String(order.userId) === String(senderId)) ? `👤 Клієнт` : `🚖 Водій (${senderName})`;

        bot.sendMessage(targetId, `💬 <b>${title}:</b> ${msg.text}`, { 
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🔙 Відкрити додаток", web_app: { url: WEB_APP_URL + page } }]] }
        }).catch(()=>{});
    }
});

// ==========================
// 🌐 API СЕРВЕРА
// ==========================

app.post('/order', (req, res) => {
    const { userId, fromAddress, toAddress, serviceType } = req.body;
    const newOrder = {
        id: orderCounter++,
        userId: String(userId),
        fromAddress,
        toAddress,
        serviceType: serviceType || 'Таксі 🚕',
        status: 'pending', 
        driverId: null
    };
    activeOrders.push(newOrder);
    res.status(201).json({ orderId: newOrder.id });
});

app.get('/get-orders', (req, res) => {
    res.status(200).json(activeOrders.filter(o => o.status === 'pending'));
});

app.get('/check-order/:id', (req, res) => {
    const order = activeOrders.find(o => o.id === parseInt(req.params.id));
    if (!order) return res.status(404).json({ status: 'not_found' });
    res.json({ status: order.status });
});

app.post('/accept-order', (req, res) => {
    const { orderId, driverId } = req.body;
    const order = activeOrders.find(o => o.id === parseInt(orderId));
    if (!order || order.status !== 'pending') return res.status(400).json({ message: 'Зайнято' });

    order.status = 'accepted';
    order.driverId = driverId;

    const driverUser = getUser(driverId);
    const driverName = driverUser.customName || driverUser.username || "Водій";

    bot.sendMessage(order.userId, `✅ <b>Виконавця знайдено!</b>\n\n🚖 <b>${driverName}</b> їде до вас.\nПослуга: ${order.serviceType}\nМаршрут: ${order.fromAddress} -> ${order.toAddress}`, { parse_mode: 'HTML' });
    res.json({ message: 'Success' });
});

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));