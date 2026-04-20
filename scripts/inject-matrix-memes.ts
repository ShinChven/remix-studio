import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');
const files = ['fr.json', 'ja.json', 'ko.json', 'zh-CN.json', 'zh-TW.json'];

const matrixGreetings: Record<string, any> = {
  fr: {
    "1": "Suis le lapin blanc.",
    "2": "Pilule rouge ou pilule bleue ?",
    "3": "La cuillère n'existe pas.",
    "4": "Réveille-toi, Néo..."
  },
  ja: {
    "1": "白ウサギを追え。",
    "2": "赤の薬か、青の薬か？",
    "3": "スプーンなど存在しない。",
    "4": "目覚めよ、ネオ…"
  },
  ko: {
    "1": "흰 토끼를 따라가라.",
    "2": "빨간 약인가, 파란 약인가?",
    "3": "숟가락은 없다.",
    "4": "일어나라, 네오..."
  },
  "zh-CN": {
    "1": "跟随白兔。",
    "2": "红色药丸还是蓝色药丸？",
    "3": "勺子并不存在。",
    "4": "醒醒，尼奥..."
  },
  "zh-TW": {
    "1": "跟隨白兔。",
    "2": "紅色藥丸還是藍色藥丸？",
    "3": "勺子並不存在。",
    "4": "醒醒，尼奧..."
  }
};

for (const file of files) {
  const lang = path.basename(file, '.json');
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  if (data.assistant && data.assistant.greetings) {
    Object.assign(data.assistant.greetings, matrixGreetings[lang]);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}
console.log('Injected Matrix memes into all locale files.');
