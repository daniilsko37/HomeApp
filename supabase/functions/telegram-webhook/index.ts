import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BOT_TOKEN_1 = Deno.env.get('BOT_TOKEN')!;
const BOT_TOKEN_2 = Deno.env.get('BOT_TOKEN_2')!;

async function sendMessage(chatId: number, text: string, botToken: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

function getWelcomeSirBlesk(name: string, gender: string) {
  const isMale = gender !== 'female';
  if (isMale) {
    return `Добро пожаловать, сэр <b>${name}</b>. Я рад, что вы наконец решились.

Позвольте обозначить условия нашего сотрудничества. Я веду учёт всего — задач, сроков, штрафов и побед. Вы — выполняете. Это честное разделение труда.

Каждое выполненное дело приносит баллы. Каждая просрочка их забирает. Система беспристрастна. Я — нет, но стараюсь.

Добро пожаловать в образцовый дом, сэр. Или в то, чем он станет при должном усердии.`;
  } else {
    return `Добро пожаловать, мисс <b>${name}</b>. Я рад, что вы наконец решились.

Позвольте обозначить условия нашего сотрудничества. Я веду учёт всего — задач, сроков, штрафов и побед. Вы — выполняете. Это честное разделение труда.

Каждое выполненное дело приносит баллы. Каждая просрочка их забирает. Система беспристрастна. Я — нет, но стараюсь.

Добро пожаловать в образцовый дом, мисс. Или в то, чем он станет при должном усердии.`;
  }
}

function getWelcomeTyler(name: string, gender: string) {
  const isMale = gender !== 'female';
  const prishel = isMale ? 'пришёл' : 'пришла';
  return `Добро пожаловать, <b>${name}</b>. Слушай внимательно.

Ты ${prishel} сюда потому что хочешь чистый дом. Это хорошо.

Правила простые. Берёшь задачу — делаешь задачу. Не делаешь три дня — платишь штраф. Система не спорит. Система не прощает.

У тебя есть баллы. Баллы — это не деньги. Баллы — это доказательство того, что ты не тряпка.

Добро пожаловать в Проект Чистота, ${name}. Мы рады каждому. Но слабаков не держим.`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  let body: any;
  try { body = await req.json(); } catch { return new Response('ok', { status: 200 }); }

  const message = body?.message;
  if (!message) return new Response('ok', { status: 200 });

  const chatId: number = message.chat.id;
  const text: string = message.text ?? '';
  const firstName: string = message.from?.first_name ?? 'друг';
  const username: string | null = message.from?.username ?? null;

  if (!text.startsWith('/start')) return new Response('ok', { status: 200 });

  const token = text.replace('/start', '').trim();

  const url = new URL(req.url);
  const botParam = url.searchParams.get('bot') ?? 'sir_blesk';
  const botToken = botParam === 'tyler' ? BOT_TOKEN_2 : BOT_TOKEN_1;
  const selectedBot = botParam === 'tyler' ? 'tyler' : 'sir_blesk';

  // Без токена — просто подсказка
  if (!token) {
    const hint = selectedBot === 'tyler'
      ? `Слушай, ${firstName}. Чтобы подключиться — открой приложение и нажми «Подключить бота». Не тяни.`
      : `Приветствую, ${firstName}. Чтобы подключиться — откройте приложение и нажмите «Подключить бота».`;
    await sendMessage(chatId, hint, botToken);
    return new Response('ok', { status: 200 });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, name, gender, connect_token_expires_at, telegram_chat_id')
    .eq('connect_token', token)
    .single();

  if (error || !profile) {
    const msg = selectedBot === 'tyler'
      ? '❌ Ссылка недействительна. Иди в приложение и получи новую.'
      : '❌ Ссылка недействительна. Попробуйте сгенерировать новую в приложении.';
    await sendMessage(chatId, msg, botToken);
    return new Response('ok', { status: 200 });
  }

  if (new Date(profile.connect_token_expires_at) < new Date()) {
    const msg = selectedBot === 'tyler'
      ? '⏰ Ссылка устарела. Слишком долго думал. Иди за новой.'
      : '⏰ Ссылка устарела. Откройте приложение и запросите новую.';
    await sendMessage(chatId, msg, botToken);
    return new Response('ok', { status: 200 });
  }

  if (profile.telegram_chat_id) {
    const msg = selectedBot === 'tyler'
      ? `Ты уже подключён. Зачем пришёл снова, ${firstName}?`
      : `✅ Вы уже подключены к приложению, ${firstName}!`;
    await sendMessage(chatId, msg, botToken);
    return new Response('ok', { status: 200 });
  }

  // Сохраняем подключение
  await supabase
    .from('profiles')
    .update({
      telegram_chat_id: chatId,
      telegram_username: username,
      selected_bot: selectedBot,
      connect_token: null,
      connect_token_expires_at: null,
    })
    .eq('id', profile.id);

  // Отправляем приветствие в стиле персонажа
  const name = profile.name || firstName;
  const gender = profile.gender || 'male';

  const welcomeMsg = selectedBot === 'tyler'
    ? getWelcomeTyler(name, gender)
    : getWelcomeSirBlesk(name, gender);

  await sendMessage(chatId, welcomeMsg, botToken);

  return new Response('ok', { status: 200 });
});
