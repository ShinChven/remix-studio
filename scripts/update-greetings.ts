import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');
const files = ['fr.json', 'ja.json', 'ko.json', 'zh-CN.json', 'zh-TW.json'];

const translations0: Record<string, string> = {
  fr: "Qu'avez-vous en tête ?",
  ja: "何か考えていることはありますか？",
  ko: "어떤 생각을 가지고 계신가요?",
  "zh-CN": "您有什么想法？",
  "zh-TW": "您有什麼想法？"
};

for (const file of files) {
  const lang = path.basename(file, '.json');
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  if (data.assistant && data.assistant.greetings) {
    data.assistant.greetings["0"] = translations0[lang];
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}
console.log('Updated translation 0 across locales.');
