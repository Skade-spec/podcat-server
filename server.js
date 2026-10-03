import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// Healthcheck для мониторинга и Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), rooms: Object.keys(rooms).length });
});

// Раздача клиента (статических файлов, если папка client существует рядом)
const clientIndexPath = path.join(__dirname, '../client/index.html');
const clientStaticDir = path.join(__dirname, '../client');

if (fs.existsSync(clientIndexPath)) {
    app.use(express.static(clientStaticDir));
    app.use((req, res) => {
        res.sendFile(clientIndexPath);
    });
} else {
    app.get('/', (req, res) => {
        res.json({
            name: "Podcat Game Server",
            status: "running",
            websocket: "active",
            health: "/health"
        });
    });
}

// Игровые данные
const rooms = {}; // Хранилище всех активных комнат
const SELECTION_TIME = 35; // 35 секунд на выбор завязки
const ANSWER_TIME = 75;    // 75 секунд на написание подката
const VOTING_TIME = 45;    // 45 секунд на чтение и голосование
const MAX_ROUNDS = 3;

// Модификаторы раунда (забавные челленджи от PodCat)
const ROUND_MODIFIERS = [
    { title: "Обычный флирт", desc: "Разминка! Никаких рамок — включи свой природный Rizz." },
    { title: "🐱 Кринж-турбо", desc: "Обязательно используй кошачьи звуки или уменьшительные суффиксы (лапки, мур, котик)!" },
    { title: "💎 Понты на миллиард", desc: "Подкати как криптомиллиардер или мажор: хвастайся несуществующим богатством и яхтами!" },
    { title: "🥀 Драматичный поэт", desc: "Максимум драмы и тоски: подкати так, будто это последний шанс спасти твою душу!" },
    { title: "👵 Бабушкин пикап", desc: "Подкати с душевной заботой, как строгая бабушка или сосед по гаражу!" }
];

const locations = [
    "в лифте", "на похоронах", "в цирке", "в школе", "в больнице", "в тюрьме", 
    "в маршрутке", "на экзамене", "на свадьбе", "в подвале", "на вписке", "в общаге", 
    "в туалете", "в душе", "на балконе", "в маке в 3 ночи", "в шаурмичной", "в суде",
    "в качалке", "на рейве", "в кальянной", "В Пятерочке", "в автозаке", "в бане",
    "у гадалки", "на собеседовании", "в очереди за айфоном", "на Тиндер-свидании", 
    "на заводе", "в бухгалтерии", "в военкомате", "у стоматолога", "на рыбалке", 
    "на даче", "в стриптиз-клубе", "на свингер пати", "на сво", "в борделе"
];

const professions = [
    "Программист", "Сисадмин", "Хакер", "Фрилансер", "HR", "Дизайнер", "Геймдизайнер", 
    "Стример", "Блогер", "Копирайтер", "Учитель", "Студент", "Инженер", "Юрист", 
    "Полицейский", "Врач", "Психолог", "Курьер", "Таксист", "Строитель", "Безработный",
    "Коуч", "Таролог", "Вебкам-модель", "Криптоинвестор", "Сммщик", "Бариста", "Депутат", 
    "Инфоцыган", "Мастер ноготочков", "Кладмен", "Тиктокер", "Перекуп", "Астролог", 
    "Вейпер", "Риэлтор", "Коллектор", "Скуф", "Алкоголик", "Проститутка", "Дворник", 
    "Фетешист", "Священник"
];

const COLORS = [
    "#FF595E", "#FFCA3A", "#8AC926", "#1982C4", "#6A4C93",
    "#F15BB5", "#00BBF9", "#00F5D4", "#FEE440", "#9B5DE5",
    "#E07A5F", "#3D405B", "#81B29A", "#F2CC8F", "#E5989B"
];

// Угарные рандомные сплетни и треш-новости раунда
const TRASH_RUMORS = [
    (p1, p2) => `🚩 Красный флаг: @${p1} до сих пор слушает голосовые мамы перед тем, как ответить на подкат!`,
    (p1, p2) => `🚔 Шок! На @${p1} написали заявление за чрезмерный кринж на первом свидании.`,
    (p1, p2) => `🍷 Инсайд: @${p1} заказал(а) в ресторане лобстера, а счёт предложил(а) оплатить @${p2}!`,
    (p1, p2) => `🔮 Таролог предупредил: совместимость @${p1} и @${p2} по натальной карте — минус 200%.`,
    (p1, p2) => `🕵️ Сливы: @${p1} тренировал(а) подкат перед зеркалом 3 часа и всё равно сморозил(а) дичь.`,
    (p1, p2) => `📱 @${p1} случайно отправил(а) свой подкат в семейный чат с бабушкой вместо краша!`,
    (p1, p2) => `🤡 Эксперты оценили Rizz @${p1}: уровень угрозы для общества признан критическим.`,
    (p1, p2) => `🦝 @${p1} оправдывается, что проголосовал(а) не туда, потому что экран залип от жирной шаурмы.`,
    (p1, p2) => `💸 @${p1} пытался(ась) купить взаимность @${p2} промокодом на скидку в чебуречную.`,
    (p1, p2) => `👀 Очевидцы: @${p1} лайкнул(а) все фото @${p2} десятилетней давности ровно в 3:45 ночи.`,
    (p1, p2) => `🧃 Экстренные вести: @${p1} перепутал(а) Тиндер с HeadHunter и пришёл(ла) на свидание с резюме!`,
    (p1, p2) => `🍿 @${p1} признался(ась), что генерирует подкаты через нейросеть, но даже ИИ словил испанский стыд.`,
    (p1, p2) => `🪦 @${p1} официально получил(а) пожизненный абонемент во френдзону с бесплатным чаем.`,
    (p1, p2) => `🛁 Инсайдеры: @${p1} слушает грустный рэп и представляет свадьбу с @${p2} после одного лайка.`,
    (p1, p2) => `🍌 Секретный опрос: 9 из 10 крашей предпочли бы съесть кактус, чем пойти на второе свидание с @${p1}.`,
    (p1, p2) => `🍕 @${p1} пообещал(а) подарить @${p2} звезду с неба, но принёс только половину холодной пиццы.`,
    (p1, p2) => `💅 @${p1} считает себя роковым соблазнителем, но краш всё ещё думает, что это был пранк.`,
    (p1, p2) => `🚨 Внимание: @${p1} был(а) пойман(а) за гуглением «как очаровать краша без регистрации и смс».`
];

function shuffleArray(arr) {
    const array = [...arr];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateTwoOptions() {
    const opt1 = `${getRandomItem(professions)} ${getRandomItem(locations)}`;
    let opt2 = `${getRandomItem(professions)} ${getRandomItem(locations)}`;
    while (opt1 === opt2) {
        opt2 = `${getRandomItem(professions)} ${getRandomItem(locations)}`;
    }
    return [opt1, opt2];
}

// Запуск таймера для комнаты
function startStageTimer(code, duration, onTimeout) {
    const room = rooms[code];
    if (!room) return;

    if (room.timer) clearInterval(room.timer);

    room.timeLeft = duration;
    io.to(code).emit('timer:tick', room.timeLeft);

    room.timer = setInterval(() => {
        room.timeLeft--;
        io.to(code).emit('timer:tick', room.timeLeft);

        if (room.timeLeft <= 0) {
            clearInterval(room.timer);
            onTimeout();
        }
    }, 1000);
}

// Переход к этапу ответов (раздача вопросов другим игрокам)
function startAnswerStage(code) {
    const room = rooms[code];
    if (!room) return;

    room.stage = 'answering';
    const users = Object.keys(room.users);
    const n = users.length;
    
    // БАГФИКС: Гарантированный циклический сдвиг перемешанных игроков.
    // Ни один игрок НИКОГДА не получит свою собственную завязку, так как (i + 1) % n != i при n >= 2!
    const shuffledUsers = shuffleArray(users);
    room.assignments = {};

    for (let i = 0; i < n; i++) {
        const receiver = shuffledUsers[i];
        const provider = shuffledUsers[(i + 1) % n];
        const prompt = room.selections[provider] || "Программист В лифте";

        // Назначаем краша (не себя) с ротацией по раундам
        const candidates = users.filter(u => u !== receiver);
        const lastCrush = room.previousCrushes?.[receiver];
        let availableCandidates = candidates.filter(u => u !== lastCrush);
        if (availableCandidates.length === 0) availableCandidates = candidates;
        
        const crush = getRandomItem(availableCandidates) || candidates[0] || "Красивой незнакомке";
        
        if (!room.previousCrushes) room.previousCrushes = {};
        room.previousCrushes[receiver] = crush;

        room.assignments[receiver] = {
            prompt: prompt,
            fromUser: provider,
            crush: crush,
            isMutual: false
        };
    }

    // Проверяем, есть ли взаимные краши (A -> B и B -> A)
    for (let i = 0; i < n; i++) {
        const u1 = users[i];
        const c1 = room.assignments[u1].crush;
        if (room.assignments[c1] && room.assignments[c1].crush === u1) {
            room.assignments[u1].isMutual = true;
            room.assignments[c1].isMutual = true;
        }
    }

    // Клиентам отправляем данные БЕЗ поля isMutual, чтобы игроки не могли заранее сговориться
    const clientAssignments = {};
    for (const [u, data] of Object.entries(room.assignments)) {
        clientAssignments[u] = {
            prompt: data.prompt,
            fromUser: data.fromUser,
            crush: data.crush
        };
    }

    io.to(code).emit('stage:answering', { 
        assignments: clientAssignments, 
        round: room.round,
        roundModifier: room.roundModifier
    });

    const totalUsers = Object.keys(room.users).length;
    io.to(code).emit('answer:progress', { doneCount: 0, totalCount: totalUsers });

    startStageTimer(code, ANSWER_TIME, () => {
        // Если кто-то не успел ответить, подставляем забавный ответ по умолчанию
        Object.keys(room.users).forEach(username => {
            if (!room.answers[username]) {
                const assignment = room.assignments[username] || {};
                room.answers[username] = {
                    prompt: assignment.prompt || "Программист В лифте",
                    answer: "Я так засмотрелся(лась) на тебя, что забыл(а) все слова... 😳",
                    crush: assignment.crush || "Крашу"
                };
            }
        });
        startVotingStage(code);
    });
}

// Переход к этапу голосования
function startVotingStage(code) {
    const room = rooms[code];
    if (!room) return;

    room.stage = 'voting';
    room.superlikesThisRound = {};
    
    const rawCards = Object.entries(room.answers).map(([author, data]) => ({
        author,
        prompt: data.prompt,
        answer: data.answer,
        crush: data.crush || "Крашу"
    }));

    // Перемешиваем карточки случайным образом, чтобы нельзя было угадать автора по порядку подключения/ответа
    room.cards = shuffleArray(rawCards);

    io.to(code).emit('stage:voting', { cards: room.cards });

    const totalUsers = Object.keys(room.users).length;
    io.to(code).emit('vote:progress', { votedCount: 0, totalCount: totalUsers });

    startStageTimer(code, VOTING_TIME, () => {
        finishRound(code);
    });
}

// Подсчет очков и переход к след. раунду или финалу с драмой и бонусами
function finishRound(code) {
    const room = rooms[code];
    if (!room) return;

    if (room.timer) clearInterval(room.timer);

    const dramaEvents = [];
    const users = Object.keys(room.users);

    // 1. Базовый подсчет, проверка суперлайков и бонусов краша
    users.forEach(author => {
        const assignment = room.assignments[author] || {};
        const crush = assignment.crush;

        // Кто проголосовал за автора
        const voters = Object.entries(room.votes)
            .filter(([voter, votedAuthor]) => votedAuthor === author)
            .map(([voter]) => voter);

        voters.forEach(voter => {
            const isSuper = room.superlikesThisRound && room.superlikesThisRound[voter] === author;
            const points = isSuper ? 250 : 100;

            if (isSuper) {
                dramaEvents.push({
                    type: 'super',
                    text: `⭐ СУПЕРЛАЙК! @${voter} подарил(а) золотой суперлайк подкату @${author}! (+250 симпатий)`
                });
            }

            if (voter === crush) {
                // Краш проголосовал за автора!
                const crushPoints = isSuper ? 350 : 250;
                room.scores[author] = (room.scores[author] || 0) + crushPoints;
                dramaEvents.push({
                    type: 'crush_match',
                    text: `💖 МЭТЧ! @${crush} выбрал(а) подкат @${author}! (+${crushPoints} симпатий)`
                });
            } else {
                room.scores[author] = (room.scores[author] || 0) + points;
            }
        });

        // Если краш проголосовал за кого-то другого — френдзона!
        const crushVote = room.votes[crush];
        if (crush && crushVote && crushVote !== author && crushVote !== crush) {
            dramaEvents.push({
                type: 'friendzone',
                text: `💔 Френдзона: @${crush} проигнорировал(а) подкат @${author} и выбрал(а) @${crushVote}`
            });
        }
    });

    // 2. Проверка Супер-Мэтча (Взаимный краш + взаимные голоса)
    const processedPairs = new Set();
    users.forEach(u1 => {
        const u2 = room.assignments[u1]?.crush;
        if (u2 && room.assignments[u2]?.crush === u1 && !processedPairs.has(`${u2}_${u1}`)) {
            processedPairs.add(`${u1}_${u2}`);
            if (room.votes[u1] === u2 && room.votes[u2] === u1) {
                // Супер-мэтч!
                room.scores[u1] = (room.scores[u1] || 0) + 150;
                room.scores[u2] = (room.scores[u2] || 0) + 150;
                dramaEvents.push({
                    type: 'super_match',
                    text: `🔥 СУПЕР-МЭТЧ! @${u1} и @${u2} тайно крашили друг друга и выбрали взаимно! (+150 бонус каждому)`
                });
            }
        }
    });

    if (room.round < MAX_ROUNDS) {
        // Переход к следующему раунду
        room.round++;
        room.selections = {};
        room.answers = {};
        room.votes = {};
        room.superlikesThisRound = {};
        
        io.to(code).emit('round:ended', { 
            scores: room.scores, 
            nextRound: room.round,
            dramaEvents: dramaEvents 
        });
        
        setTimeout(() => {
            startSelectionStage(code);
        }, 5000); // 5 секунд показа очков между раундами
    } else {
        // Финал игры
        room.stage = 'finished';
        io.to(code).emit('game:over', { 
            finalScores: room.scores,
            dramaEvents: dramaEvents
        });
    }
}

// Старт этапа выбора (начало раунда)
function startSelectionStage(code) {
    const room = rooms[code];
    if (!room) return;

    room.stage = 'selection';
    room.selections = {};
    room.answers = {};
    room.votes = {};
    room.superlikesThisRound = {};

    // Выбираем модификатор для раунда
    if (room.round === 1) {
        room.roundModifier = ROUND_MODIFIERS[0];
    } else {
        const pool = ROUND_MODIFIERS.slice(1);
        room.roundModifier = getRandomItem(pool);
    }

    // Каждому игроку генерируем по 2 варианта
    const userOptions = {};
    Object.keys(room.users).forEach(username => {
        userOptions[username] = generateTwoOptions();
    });

    io.to(code).emit('stage:selection', { 
        userOptions, 
        round: room.round,
        roundModifier: room.roundModifier
    });

    const totalUsers = Object.keys(room.users).length;
    io.to(code).emit('selection:progress', { doneCount: 0, totalCount: totalUsers });

    startStageTimer(code, SELECTION_TIME, () => {
        // Заполняем дефолтными значениями, если кто-то не успел
        Object.keys(room.users).forEach(username => {
            if (!room.selections[username]) {
                room.selections[username] = userOptions[username][0];
            }
        });
        startAnswerStage(code);
    });
}

function getFormattedUsers(room) {
    return Object.keys(room.users).map(username => ({
        username,
        color: room.users[username].color,
        isHost: username === room.host
    }));
}

function handleUserLeave(socket) {
    const { code, username } = socket.data || {};
    if (code && rooms[code] && username) {
        const room = rooms[code];
        
        delete room.users[username];
        delete room.selections[username];
        delete room.answers[username];
        delete room.votes[username];
        delete room.scores[username];

        socket.leave(code);
        socket.emit('game:left');

        const remainingUsers = Object.keys(room.users);
        if (remainingUsers.length === 0) {
            if (room.timer) clearInterval(room.timer);
            delete rooms[code];
        } else {
            if (room.host === username) {
                room.host = remainingUsers[0];
            }
            io.to(code).emit('lobby:updated', { 
                users: getFormattedUsers(room),
                host: room.host
            });
        }
        socket.data = {};
    }
}

function joinRoom(socket, code, username) {
    socket.join(code);
    socket.data = { code, username };

    if (!rooms[code]) {
        rooms[code] = {
            code,
            host: username,
            users: {},
            scores: {},
            round: 1,
            stage: 'lobby',
            selections: {},
            answers: {},
            votes: {},
            superlikesUsed: {},
            superlikesThisRound: {},
            previousCrushes: {},
            timer: null
        };
    }

    const room = rooms[code];
    room.users[username] = {
        socketId: socket.id,
        color: getRandomItem(COLORS)
    };
    if (room.scores[username] === undefined) room.scores[username] = 0;

    io.to(code).emit('lobby:updated', { 
        code: room.code,
        users: getFormattedUsers(room),
        host: room.host
    });
}

// SOCKET.IO ЛОГИКА
io.on('connection', (socket) => {
    
    // Создание лобби
    socket.on('lobby:create', ({ username }) => {
        const code = crypto.randomBytes(2).toString('hex').toUpperCase();
        socket.emit('lobby:created', { code });
        joinRoom(socket, code, username);
    });

    // Вход в лобби
    socket.on('lobby:join', ({ code, username }) => {
        joinRoom(socket, code, username);
    });

    // Запуск игры
    socket.on('lobby:start', ({ code }) => {
        const room = rooms[code];
        if (room && room.host === socket.data.username && Object.keys(room.users).length >= 2) {
            startSelectionStage(code);
        }
    });

    // 1. Игрок выбрал 1 из 2 вариантов
    socket.on('selection:submit', ({ option }) => {
        const { code, username } = socket.data;
        const room = rooms[code];
        if (!room || room.stage !== 'selection') return;
        
        // Защита от дубликатов
        if (room.selections[username]) return;

        room.selections[username] = option;

        const doneCount = Object.keys(room.selections).length;
        const totalCount = Object.keys(room.users).length;

        io.to(code).emit('selection:progress', { doneCount, totalCount });

        // Если ВСЕ выбрали — досрочно переходим к следующему этапу
        if (doneCount === totalCount) {
            if (room.timer) clearInterval(room.timer);
            startAnswerStage(code);
        }
    });

    // 2. Игрок написал продолжение (панчлайн)
    socket.on('answer:submit', ({ answer }) => {
        const { code, username } = socket.data;
        const room = rooms[code];
        if (!room || room.stage !== 'answering') return;
        
        // Защита от дубликатов
        if (room.answers[username]) return;

        const assignment = room.assignments[username];
        room.answers[username] = {
            prompt: assignment.prompt,
            answer: answer || "...",
            crush: assignment.crush
        };

        const doneCount = Object.keys(room.answers).length;
        const totalCount = Object.keys(room.users).length;

        io.to(code).emit('answer:progress', { doneCount, totalCount });

        // Если ВСЕ ответили — досрочно переходим к голосованию
        if (doneCount === totalCount) {
            if (room.timer) clearInterval(room.timer);
            startVotingStage(code);
        }
    });

    // 3. Игрок проголосовал (с поддержкой Суперлайка)
    socket.on('vote:submit', ({ votedAuthor, isSuperlike }) => {
        const { code, username } = socket.data;
        const room = rooms[code];
        if (!room || room.stage !== 'voting') return;
        
        // Защита от дубликатов, голосования за себя и некорректных авторов
        if (room.votes[username]) return;
        if (votedAuthor === username) return;
        if (!room.users[votedAuthor]) return;

        room.votes[username] = votedAuthor;

        if (isSuperlike && !room.superlikesUsed[username]) {
            room.superlikesUsed[username] = true;
            if (!room.superlikesThisRound) room.superlikesThisRound = {};
            room.superlikesThisRound[username] = votedAuthor;
        }

        const votedCount = Object.keys(room.votes).length;
        const totalCount = Object.keys(room.users).length;

        io.to(code).emit('vote:progress', { votedCount, totalCount });

        // Если ВСЕ проголосовали — закончить раунд
        if (votedCount === totalCount) {
            finishRound(code);
        }
    });

    // 4. Живые эмодзи-реакции на карточки
    socket.on('vote:react', ({ author, emoji }) => {
        const { code, username } = socket.data;
        if (code && rooms[code] && rooms[code].stage === 'voting' && author && emoji) {
            io.to(code).emit('vote:reaction', { author, emoji, fromUser: username });
        }
    });

    // Перезапуск игры
    socket.on('game:restart', ({ code }) => {
        const room = rooms[code];
        if (!room) return;

        room.round = 1;
        room.stage = 'lobby';
        room.selections = {};
        room.answers = {};
        room.votes = {};
        room.superlikesUsed = {};
        room.superlikesThisRound = {};
        room.previousCrushes = {};
        if (room.timer) {
            clearInterval(room.timer);
            room.timer = null;
        }

        // Сброс очков
        Object.keys(room.scores).forEach(u => room.scores[u] = 0);

        io.to(code).emit('lobby:updated', { 
            users: getFormattedUsers(room),
            host: room.host
        });
        io.to(code).emit('game:restarted');
    });

    // Выход из игры
    socket.on('game:leave', () => {
        handleUserLeave(socket);
    });

    // Отключение
    socket.on('disconnect', () => {
        handleUserLeave(socket);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});