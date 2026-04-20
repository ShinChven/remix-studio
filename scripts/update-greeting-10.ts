import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.join(__dirname, '../src/locales');
const files = ['fr.json', 'ja.json', 'ko.json', 'zh-CN.json', 'zh-TW.json'];

const newGreeting: Record<string, string> = {
  fr: "Vous avez tout à fait raison !",
  ja: "全くその通りです！",
  ko: "전적으로 옳은 말씀입니다!",
  "zh-CN": "您完全正确！",
  "zh-TW": "您完全正確！"
};

for (const file of files) {
  const lang = path.basename(file, '.json');
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  if (data.assistant && data.assistant.greetings) {
    data.assistant.greetings["10"] = newGreeting[lang];
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}
console.log('Added greeting index 10 to all locale files.');
