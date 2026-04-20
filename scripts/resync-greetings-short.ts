import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf-8'));
const files = ['fr.json', 'ja.json', 'ko.json', 'zh-CN.json', 'zh-TW.json'];

for (const file of files) {
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  if (data.assistant && data.assistant.greetings) {
    // Re-sync greetings based on en.json keys
    const newGreetings: Record<string, string> = {};
    for (const key in en.assistant.greetings) {
       // Deep check for the original content to find the translation
       // Since the list shifted, we need to find them or provide new ones.
       // Actually, I'll just regenerate them for safety.
       // (Simplified approach: Use the previously calculated ones and shift them)
    }
    // Better: I'll just manually define the new 10 strings for each lang in this script
  }
}

const fullGreetingsShifted: Record<string, any> = {
  fr: {
    "0": "Qu'avez-vous en tête ?",
    "1": "Que voulez-vous créer aujourd'hui ?",
    "2": "Comment puis-je assister votre flux de travail ?",
    "3": "Prêt à faire de la magie ?",
    "4": "Suis le lapin blanc.",
    "5": "Pilule rouge ou pilule bleue ?",
    "6": "La cuillère n'existe pas.",
    "7": "Réveille-toi, Néo...",
    "8": "Bienvenue dans le désert du réel.",
    "9": "Vous avez tout à fait raison !"
  },
  ja: {
    "0": "何か考えていることはありますか？",
    "1": "今日は何を作りますか？",
    "2": "ワークフローをどのようにアシストしましょうか？",
    "3": "魔法を起こす準備はできましたか？",
    "4": "白ウサギを追え。",
    "5": "赤の薬か、青の薬か？",
    "6": "スプーンなど存在しない。",
    "7": "目覚めよ、ネオ…",
    "8": "現実の砂漠へようこそ。",
    "9": "全くその通りです！"
  },
  ko: {
    "0": "어떤 생각을 가지고 계신가요?",
    "1": "오늘은 무엇을 만들고 싶으신가요?",
    "2": "당신의 작업 흐름을 어떻게 도와드릴까요?",
    "3": "마법을 일으킬 준비가 되셨나요?",
    "4": "흰 토끼를 따라가라.",
    "5": "빨간 약인가, 파란 약인가?",
    "6": "숟가락은 없다.",
    "7": "일어나라, 네오...",
    "8": "진실의 사막에 오신 것을 환영합니다.",
    "9": "전적으로 옳은 말씀입니다!"
  },
  "zh-CN": {
    "0": "您有什么想法？",
    "1": "今天您想创造什么？",
    "2": "我该如何协助您的工作流？",
    "3": "准备好见证奇迹了吗？",
    "4": "跟随白兔。",
    "5": "红色药丸还是蓝色药丸？",
    "6": "勺子并不存在。",
    "7": "醒醒，尼奥...",
    "8": "欢迎来到真实世界的荒漠。",
    "9": "您完全正确！"
  },
  "zh-TW": {
    "0": "您有什麼想法？",
    "1": "今天您想創造什麼？",
    "2": "我該如何協助您的工作流程？",
    "3": "準備好見證奇蹟了嗎？",
    "4": "跟隨白兔。",
    "5": "紅色藥丸還是藍色藥丸？",
    "6": "勺子並不存在。",
    "7": "醒醒，尼奧...",
    "8": "歡迎來到真實世界的荒漠。",
    "9": "您完全正確！"
  }
};

for (const file of files) {
  const lang = path.basename(file, '.json');
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  if (data.assistant) {
    data.assistant.greetings = fullGreetingsShifted[lang];
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}
console.log('Removed long greeting and re-indexed all locale files.');
