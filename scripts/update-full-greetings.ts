import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');
const files = ['fr.json', 'ja.json', 'ko.json', 'zh-CN.json', 'zh-TW.json'];

const fullGreetings: Record<string, any> = {
  fr: {
    "0": "Qu'avez-vous en tête ?",
    "1": "Que voulez-vous créer aujourd'hui ?",
    "2": "Construisons quelque chose d'incroyable ensemble.",
    "3": "Comment puis-je assister votre flux de travail ?",
    "4": "Prêt à faire de la magie ?",
    "5": "Suis le lapin blanc.",
    "6": "Pilule rouge ou pilule bleue ?",
    "7": "La cuillère n'existe pas.",
    "8": "Réveille-toi, Néo...",
    "9": "Bienvenue dans le désert du réel."
  },
  ja: {
    "0": "何か考えていることはありますか？",
    "1": "今日は何を作りますか？",
    "2": "素晴らしいものを一緒に作りましょう。",
    "3": "ワークフローをどのようにアシストしましょうか？",
    "4": "魔法を起こす準備はできましたか？",
    "5": "白ウサギを追え。",
    "6": "赤の薬か、青の薬か？",
    "7": "スプーンなど存在しない。",
    "8": "目覚めよ、ネオ…",
    "9": "現実の砂漠へようこそ。"
  },
  ko: {
    "0": "어떤 생각을 가지고 계신가요?",
    "1": "오늘은 무엇을 만들고 싶으신가요?",
    "2": "멋진 것을 함께 만들어 봅시다.",
    "3": "당신의 작업 흐름을 어떻게 도와드릴까요?",
    "4": "마법을 일으킬 준비가 되셨나요?",
    "5": "흰 토끼를 따라가라.",
    "6": "빨간 약인가, 파란 약인가?",
    "7": "숟가락은 없다.",
    "8": "일어나라, 네오...",
    "9": "진실의 사막에 오신 것을 환영합니다."
  },
  "zh-CN": {
    "0": "您有什么想法？",
    "1": "今天您想创造什么？",
    "2": "让我们一起创造一些惊人的东西吧。",
    "3": "我该如何协助您的工作流？",
    "4": "准备好见证奇迹了吗？",
    "5": "跟随白兔。",
    "6": "红色药丸还是蓝色药丸？",
    "7": "勺子并不存在。",
    "8": "醒醒，尼奥...",
    "9": "欢迎来到真实世界的荒漠。"
  },
  "zh-TW": {
    "0": "您有什麼想法？",
    "1": "今天您想創造什麼？",
    "2": "讓我們一起創造一些驚人的東西吧。",
    "3": "我該如何協助您的工作流程？",
    "4": "準備好見證奇蹟了嗎？",
    "5": "跟隨白兔。",
    "6": "紅色藥丸還是藍色藥丸？",
    "7": "勺子並不存在。",
    "8": "醒醒，尼奧...",
    "9": "歡迎來到真實世界的荒漠。"
  }
};

for (const file of files) {
  const lang = path.basename(file, '.json');
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  if (data.assistant) {
    data.assistant.greetings = fullGreetings[lang];
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}
console.log('Restored original greetings and appended Matrix quotes in all locale files.');
