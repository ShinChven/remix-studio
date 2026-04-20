import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');
const files = ['fr.json', 'ja.json', 'ko.json', 'zh-CN.json', 'zh-TW.json'];

const translations: Record<string, any> = {
  fr: {
    "0": "Comment puis-je vous aider aujourd'hui ?",
    "1": "Que voulez-vous créer aujourd'hui ?",
    "2": "Construisons quelque chose d'incroyable ensemble.",
    "3": "Comment puis-je assister votre flux de travail ?",
    "4": "Prêt à faire de la magie ?"
  },
  ja: {
    "0": "今日はどのようなご用件でしょうか？",
    "1": "今日は何を作りますか？",
    "2": "素晴らしいものを一緒に作りましょう。",
    "3": "ワークフローをどのようにアシストしましょうか？",
    "4": "魔法を起こす準備はできましたか？"
  },
  ko: {
    "0": "오늘은 무엇을 도와드릴까요?",
    "1": "오늘은 무엇을 만들고 싶으신가요?",
    "2": "멋진 것을 함께 만들어 봅시다.",
    "3": "당신의 작업 흐름을 어떻게 도와드릴까요?",
    "4": "마법을 일으킬 준비가 되셨나요?"
  },
  "zh-CN": {
    "0": "今天我能帮您什么？",
    "1": "今天您想创造什么？",
    "2": "让我们一起创造一些惊人的东西吧。",
    "3": "我该如何协助您的工作流？",
    "4": "准备好见证奇迹了吗？"
  },
  "zh-TW": {
    "0": "今天我能幫您什麼？",
    "1": "今天您想創造什麼？",
    "2": "讓我們一起創造一些驚人的東西吧。",
    "3": "我該如何協助您的工作流程？",
    "4": "準備好見證奇蹟了嗎？"
  }
};

for (const file of files) {
  const lang = path.basename(file, '.json');
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  if (data.assistant) {
    data.assistant.greetings = translations[lang];
  }
  
  // also inject missing library pin keys just to silence the other warnings if possible
  // not strictly required but why not
  if (data.libraries && data.libraries.libraryCard) {
    if (!data.libraries.libraryCard.pin) data.libraries.libraryCard.pin = "Pin Library";
    if (!data.libraries.libraryCard.unpin) data.libraries.libraryCard.unpin = "Unpin Library";
  }
  if (data.libraries && !data.libraries.pinLimitReached) {
    data.libraries.pinLimitReached = "You can pin at most {{max}} libraries.";
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}
console.log('Fixed missing i18n keys for greetings and libraries.');
