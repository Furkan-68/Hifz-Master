
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getHifzTips = async (surahName: string, ayahNumber: number, ayahText: string) => {
  const prompt = `
    I am memorizing the Quran. 
    Surah: ${surahName}
    Ayah Number: ${ayahNumber}
    Arabic Text: ${ayahText}

    Please provide:
    1. A brief simple explanation (Tafsir) of this verse.
    2. A memorization tip specific to this verse (e.g., mnemonic, linguistic pattern, or repeating structure).
    3. The spiritual significance of this verse.

    Keep it concise and encouraging.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "I'm having trouble connecting to my knowledge base right now. Please keep practicing!";
  }
};
