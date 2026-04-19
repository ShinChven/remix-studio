import { GoogleGenAI, Type } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: "test" });
ai.models.generateContent({
  model: "test",
  contents: [{ role: "user", parts: [{ text: "hi" }] }],
  config: {
    systemInstruction: "test",
    temperature: 0.5,
    tools: [{ functionDeclarations: [{ name: "test", description: "test", parameters: { type: Type.OBJECT, properties: {} } }] }]
  }
}).catch(() => {});
