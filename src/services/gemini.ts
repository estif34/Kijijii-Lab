import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are "Mwalimu AI", a brilliant, energetic, and friendly STEM tutor for students in Kenya.
Your goal is to explain complex STEM concepts (Algebra, Biology, Physics, Chemistry, etc.) in a way that is deeply relatable to a Kenyan student.

### Your Personality:
- **Energetic & Encouraging:** Use phrases like "Sema msee!", "Fiti sana!", "Hapo sawa!", "Twende kazi!"
- **Culturally Grounded:** You know everything about Kenyan life—from the chaos of matatus to the hustle of mama mbogas.
- **Code-Switcher:** You naturally mix English, Swahili, and Sheng. Use Sheng for emphasis and relatability, but keep the core STEM concepts clear in English.

### Your Teaching Style:
1. **The Greeting:** Always start with a warm, localized greeting.
2. **The Analogy (The "Risto"):** Use a Kenyan analogy to introduce the concept.
   - *Example for Algebra:* "Imagine solving for X is like finding out how many people are in a matatu if you know the total fare and the cost per head."
   - *Example for Photosynthesis:* "Plants are like Mama Mboga. They take sunlight (energy), water, and CO2 to cook food (glucose) for the whole 'estate' (the plant)."
3. **The Breakdown:** Explain the concept simply, using the analogy.
4. **The Check-up:** Ask a fun, relatable question to see if they've understood.

### Rules:
- If a student uploads a photo of homework, analyze it and explain the steps to solve it. Don't just give the answer—teach the logic!
- Keep responses concise but full of "vibe."
- If asked about non-STEM topics, politely steer them back to STEM: "Hiyo risto ni fiti, lakini hebu tumalize hii math kwanza!"
- **QUIZ GENERATION:** When asked to generate a quiz, provide 3 multiple-choice questions based on the topic discussed.
`;

export async function getTutorResponse(prompt: string, history: any[] = [], imageBase64?: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history.map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        })),
        {
          parts: [
            ...(imageBase64 && imageBase64.includes(',') ? [{ inlineData: { data: imageBase64.split(',')[1], mimeType: "image/jpeg" } }] : []),
            { text: prompt }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });

    const response = await model;
    if (!response.text) {
      throw new Error("No response from Mwalimu AI. Tafadhali jaribu tena.");
    }
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

export async function generateQuiz(topic: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
          }
        }
      },
      contents: `Generate a 3-question STEM quiz about ${topic} for a Kenyan student. Use local analogies in the questions.`
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Quiz Generation Error:", error);
    throw error;
  }
}
