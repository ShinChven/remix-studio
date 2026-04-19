import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
async function run() {
  const res = await ai.models.generateContent({
    model: 'gemini-2.0-flash-thinking-exp',
    contents: 'What is 2+2? Think step by step.',
  });
  console.log(JSON.stringify(res.candidates?.[0]?.content?.parts, null, 2));
}
run().catch(console.error);
