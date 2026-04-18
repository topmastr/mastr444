import { GoogleGenAI, Modality, Type } from "@google/genai";
import { toSafeDate } from '../lib/utils';
import { cacheUtil } from './firebase';
import { getSessionStatus } from '../lib/market-times';

function getAI() {
  // Prefer the user-selected API key if it exists, otherwise fallback to the default
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({ apiKey });
}

export interface TradeSetup {
  direction: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: string;
  reasoning: string;
}

export interface AnalysisResult {
  marketCondition: 'BULLISH' | 'BEARISH' | 'RANGING';
  structureType: 'BOS' | 'CHoCH' | 'SMS' | 'NONE';
  algorithmicContext: string;
  liquidityFlow: string;
  d1Liquidity: string;
  h4Bias: string;
  h1Bias: string;
  m15Confirmation: string;
  m5EntryLogic: string;
  tradeSetup: TradeSetup;
  explanation: string;
  confidenceScore: number;
  tradeQuality: 'A+' | 'A' | 'B' | 'C';
  riskManagement: string;
  shouldTrade: boolean;
  noTradeReason?: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function handleGeminiError(error: any, isFallback: boolean): never {
  console.error("Gemini API Error:", error);
  const errorStr = (error.message || String(error)).toLowerCase();
  
  if (errorStr.includes("429") || errorStr.includes("resource_exhausted") || errorStr.includes("quota")) {
    if (!isFallback) {
      // This will be caught by the retry/fallback logic
      throw new Error("QUOTA_EXHAUSTED");
    }
    throw new Error("تم تجاوز حصة الاستخدام المسموح بها (Quota Exceeded). يرجى المحاولة لاحقاً أو استخدام مفتاح API مدفوع.");
  }
  
  if (errorStr.includes("fetch") || errorStr.includes("network") || errorStr.includes("connection") || errorStr.includes("econnrefused")) {
    throw new Error("فشل الاتصال بخوادم الذكاء الاصطناعي. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.");
  }

  if (errorStr.includes("401") || errorStr.includes("403") || errorStr.includes("invalid api key") || errorStr.includes("api_key_invalid")) {
    throw new Error("مفتاح API غير صالح أو غير مفعل. يرجى التحقق من الإعدادات.");
  }

  if (errorStr.includes("500") || errorStr.includes("503") || errorStr.includes("overloaded") || errorStr.includes("deadline_exceeded")) {
    throw new Error("خوادم الذكاء الاصطناعي مشغولة حالياً. جاري المحاولة مرة أخرى تلقائياً...");
  }

  throw new Error(`حدث خطأ في معالجة البيانات: ${error.message || 'خطأ غير معروف'}`);
}

export async function analyzeCharts(
  images: { [key: string]: string }, 
  historicalContext: { wins: any[], losses: any[], missed: any[], avoided: any[] } | null = { wins: [], losses: [], missed: [], avoided: [] },
  latestRefinement: any = null,
  goldStandard: any = null,
  isFallback = false,
  retryCount = 0
): Promise<AnalysisResult> {
  const MAX_RETRIES = 2;
  
  // 1. Improved caching logic
  const imageKeys = Object.keys(images).sort().join('|');
  const imageSamples = Object.values(images).map(img => img.slice(0, 200) + img.slice(-200)).join('');
  const cacheKey = `analysis_v2_${imageKeys}_${imageSamples.length}_${latestRefinement?.version || 0}`;
  
  if (!isFallback) {
    const cached = cacheUtil.get(cacheKey);
    if (cached) return cached;
  }

  const ai = getAI();
  const model = isFallback ? "gemini-3-flash-preview" : "gemini-3.1-pro-preview";
  
  const wins = historicalContext?.wins || [];
  const losses = historicalContext?.losses || [];
  const missed = historicalContext?.missed || [];
  const avoided = historicalContext?.avoided || [];

  const goldStandardContext = goldStandard 
    ? `\n**GOLD STANDARD (Emulate this logic):**\n${JSON.stringify(goldStandard.analysis.tradeSetup)}\nReasoning: ${goldStandard.analysis.tradeSetup.reasoning}`
    : "";

  const refinementContext = latestRefinement 
    ? `\n**STRATEGY EVOLUTION (v${latestRefinement.version}):**\nWeaknesses: ${latestRefinement.weaknesses?.join(', ')}\nRefinements: ${latestRefinement.refinements?.join(', ')}`
    : "";

  const sessionStatus = getSessionStatus();
  const timeContext = `\n**CURRENT MARKET TIME:** ${sessionStatus.utcTime}\n**ACTIVE SESSION:** ${sessionStatus.current?.name || 'Outside major sessions'}${sessionStatus.current?.isKillzone ? ' (ACTIVE KILLZONE)' : ''}`;

  const prompt = `
    Role: Institutional SMC/ICT Expert (XAUUSD specialist).
    Objective: Deep Algorithmic Analysis (IPDA focus) for high-precision entries.
    Language: Arabic (Professional/Technical).

    ${timeContext}
    ${refinementContext}
    ${goldStandardContext}
    
    Analysis Framework (High Precision Methodology):
    1. **Structural Integrity & Precision:** 
       - **BOS (Break of Structure):** Identify a trend continuation break. **CRITICAL:** A valid BOS *must* have a candle **body close** beyond the previous structural high/low. A wick-only break is a liquidity sweep, NOT a BOS.
       - **CHoCH (Change of Character):** Identify the first sign of a trend reversal. **CRITICAL:** A valid CHoCH *must* have a candle **body close** beyond the recent swing point.
       - **Liquidity Sweeps:** Explicitly identify when price pierces a level with a **wick only** and then reverses. This is a "Sweep," not a "Break."
       - **SMS (Shift in Market Structure):** Identify failure to make a new high/low followed by a body close break in the opposite direction.
    **Your Persona:**
    You are a 20+ year veteran Institutional Trader. You don't trade "patterns"; you trade "liquidity" and "algorithmic delivery". You view Retail Support/Resistance as liquidity pools to be harvested. Your goal is to identify where the "Smart Money" is entering the market by tracking displacement and the Interbank Price Delivery Algorithm (IPDA).

    **Advanced Logic Framework:**
    1. **The MMXM Model (Market Maker Model):** Identify if we are in a Market Maker Buy Model (MMBM) or Sell Model (MMSM). Locate the Original Consolidation and the stages of re-accumulation/re-distribution.
    2. **Retail Traps vs. Institutional POIs:** 
       - Identify "Equal Highs/Lows" (Retail Double Top/Bottom) as Liquidity to be swept.
       - Distinguish between a "Retail Resistance" (weak) and an "Institutional Order Block" (strong).
    3. **Institutional Price Delivery (IPDA):**
       - **Displacement:** Look for violent moves that leave "Fair Value Gaps" (FVG). This is the "Electronic Signature" of institutional participation.
       - **Mitigation:** Track how price returns to FVG/OB to "offset" or "mitigate" orders. Only trade "Fresh/Unmitigated" levels.
    4. **Execution Sequence (Surgical Entry):** 
       - **Phase 1: Liquidity Hunt:** Price must sweep a significant HTF level (D1/H4).
       - **Phase 2: Market Structure Shift (MSS):** A clear displacement move on LTF (M5/M15) closing beyond a swing point.
       - **Phase 3: The Optimal Trade Entry (OTE) or FVG Re-entry:** Entry within the 62-79% retracement or the premium/discount FVG.
    5. **Time-Price Alignment:** Consider the current London/NY sessions (even if not explicitly provided, analyze the volatility and logic expected in institutional 'Killzones').

    **Self-Correction & Rigor Protocol:**
    - **Logical Linkage:** Every claim must be backed by visual evidence in the charts (e.g., "Price swept D1 highs at [Price X] before displacing below H1 low").
    - **No Generalities:** Do not use vague terms like "strong resistance" without identifying it as a specific Institutional POI (e.g., "Mitigated H4 Order Block").
    - **Timeframe Conflict Resolution:** If you detect a contradiction between timeframes (e.g., D1 Bullish but H1 Bearish without a clear CHoCH), you must resolve it by prioritizing the higher timeframe bias unless a clear lower timeframe reversal is confirmed via LTF Displacement.
    - **Precision Audit:** Double-check SL/TP levels relative to the identified institutional levels. SL must be placed where the institutional bias is invalidated, not at arbitrary distances.

    Strict Rules:
    - Risk: TP $4 / SL $12 (Strict 1:0.33 RR).
    - Confirmation: No trade without clear Liquidity Sweep and Displacement.
    - POI: Only trade at Fresh/Unmitigated OBs.

    Output JSON Format:
    {
      "marketCondition": "BULLISH|BEARISH|RANGING",
      "structureType": "BOS|CHoCH|SMS|NONE",
      "algorithmicContext": "IPDA phase and institutional levels analysis.",
      "liquidityFlow": "IRL to ERL path and open FVGs.",
      "d1Liquidity": "D1 ERL/IRL and candle projection.",
      "h4Bias": "AMD analysis and MMXM stage.",
      "h1Bias": "Order flow and session manipulation (London/NY).",
      "m15Confirmation": "Displacement and FVG confirmation.",
      "m5EntryLogic": "Detailed analysis of institutional behavior on M5. Identify precise entry points within identified Fair Value Gaps (FVGs) and Order Blocks (OBs). Emphasize how the Institutional Price Delivery Algorithm (IPDA) respects these levels during the entry sequence.",
      "shouldTrade": boolean,
      "noTradeReason": "Reason if shouldTrade is false.",
      "tradeSetup": {
        "direction": "BUY|SELL",
        "entry": number,
        "stopLoss": number,
        "takeProfit": number,
        "riskReward": "1:0.33",
        "reasoning": "Institutional logic detailing the FVG/OB mitigation sequence, linking liquidity sweeps, displacement, and precise IPDA delivery."
      },
      "confidenceScore": number (0-100),
      "tradeQuality": "A+|A|B|C",
      "riskManagement": "Professional risk plan (Strict TP/SL).",
      "explanation": "Detailed professional report (200-300 words) in Arabic analyzing the algorithmic logic and institutional behavior."
    }
  `;

  const parts = Object.entries(images).map(([timeframe, base64]) => ({
    inlineData: {
      mimeType: "image/png",
      data: base64.split(',')[1]
    }
  }));

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [...parts, { text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            marketCondition: { type: Type.STRING, enum: ["BULLISH", "BEARISH", "RANGING"] },
            structureType: { type: Type.STRING, enum: ["BOS", "CHoCH", "SMS", "NONE"] },
            algorithmicContext: { type: Type.STRING },
            liquidityFlow: { type: Type.STRING },
            d1Liquidity: { type: Type.STRING },
            h4Bias: { type: Type.STRING },
            h1Bias: { type: Type.STRING },
            m15Confirmation: { type: Type.STRING },
            m5EntryLogic: { type: Type.STRING, description: "Detailed analysis of institutional behavior on M5. Identify precise entry points within identified Fair Value Gaps (FVGs) and Order Blocks (OBs). Emphasize how the Institutional Price Delivery Algorithm (IPDA) respects these levels during the entry sequence." },
            shouldTrade: { type: Type.BOOLEAN },
            noTradeReason: { type: Type.STRING },
            tradeSetup: {
              type: Type.OBJECT,
              properties: {
                direction: { type: Type.STRING, enum: ["BUY", "SELL"] },
                entry: { type: Type.NUMBER },
                stopLoss: { type: Type.NUMBER },
                takeProfit: { type: Type.NUMBER },
                riskReward: { type: Type.STRING },
                reasoning: { type: Type.STRING, description: "Institutional logic detailing the FVG/OB mitigation sequence, linking liquidity sweeps, displacement, and precise IPDA delivery." }
              },
              required: ["direction", "entry", "stopLoss", "takeProfit", "riskReward", "reasoning"]
            },
            confidenceScore: { type: Type.NUMBER },
            tradeQuality: { type: Type.STRING, enum: ["A+", "A", "B", "C"] },
            riskManagement: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ["marketCondition", "structureType", "algorithmicContext", "liquidityFlow", "d1Liquidity", "h4Bias", "h1Bias", "m15Confirmation", "m5EntryLogic", "shouldTrade", "noTradeReason", "tradeSetup", "confidenceScore", "tradeQuality", "riskManagement", "explanation"]
        }
      }
    });

    let jsonStr = response.text.trim();
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json\n?|```/g, '').trim();
    }
    
    try {
      const result = JSON.parse(jsonStr || "{}");
      if (result && !isFallback) {
        cacheUtil.set(cacheKey, result, 1800000); // 30 mins TTL
      }
      return result;
    } catch (e) {
      console.error("Failed to parse analysis JSON:", jsonStr);
      if (retryCount < MAX_RETRIES) {
        console.warn(`Retrying analysis due to parse error (Attempt ${retryCount + 1})...`);
        await sleep(1000 * (retryCount + 1));
        return analyzeCharts(images, historicalContext, latestRefinement, goldStandard, isFallback, retryCount + 1);
      }
      throw new Error("فشل في تحليل تنسيق البيانات المستلمة من الذكاء الاصطناعي.");
    }
  } catch (error: any) {
    const errorStr = (error.message || String(error)).toLowerCase();
    
    // Automatic retry for server errors or connection issues
    if (retryCount < MAX_RETRIES && (errorStr.includes("500") || errorStr.includes("503") || errorStr.includes("overloaded") || errorStr.includes("fetch") || errorStr.includes("deadline"))) {
      console.warn(`Retrying analysis due to server/network error (Attempt ${retryCount + 1})...`);
      await sleep(2000 * (retryCount + 1));
      return analyzeCharts(images, historicalContext, latestRefinement, goldStandard, isFallback, retryCount + 1);
    }

    if (error.message === "QUOTA_EXHAUSTED" || errorStr.includes("429") || errorStr.includes("quota")) {
      if (!isFallback) {
        console.warn("Gemini Pro quota hit, falling back to Flash for analysis...");
        return analyzeCharts(images, historicalContext, latestRefinement, goldStandard, true);
      }
    }
    
    return handleGeminiError(error, isFallback);
  }
}

export async function evolveStrategy(
  failedTrades: any[], 
  winningTrades: any[] = [],
  missedTrades: any[] = [],
  avoidedTrades: any[] = [],
  isFallback = false,
  retryCount = 0
): Promise<any> {
  const MAX_RETRIES = 2;
  const ai = getAI();
  const model = isFallback ? "gemini-3-flash-preview" : "gemini-3.1-pro-preview";
  
  const failedData = failedTrades.map((t) => ({
    id: t.id,
    outcome: t.outcome,
    reasoning: t.analysis.tradeSetup.reasoning,
    feedback: t.userFeedback,
    timestamp: toSafeDate(t.timestamp).toISOString()
  }));

  const winningData = winningTrades.map((t) => ({
    id: t.id,
    outcome: t.outcome,
    reasoning: t.analysis.tradeSetup.reasoning,
    timestamp: toSafeDate(t.timestamp).toISOString()
  }));

  const missedData = missedTrades.map((t) => ({
    id: t.id,
    outcome: t.outcome,
    reasoning: t.analysis.tradeSetup.reasoning,
    timestamp: toSafeDate(t.timestamp).toISOString()
  }));

  const avoidedData = avoidedTrades.map((t) => ({
    id: t.id,
    outcome: t.outcome,
    reasoning: t.analysis.tradeSetup.reasoning,
    timestamp: toSafeDate(t.timestamp).toISOString()
  }));

  const prompt = `
    أنت "كبير مهندسي أنظمة التداول الخوارزمية" (Chief Algorithmic Trading Systems Architect) و "خبير تدقيق أمني" (Security Auditor).
    مهمتك هي إجراء "تشريح جثة" (Post-Mortem) خوارزمي عميق للصفقات لتطوير الاستراتيجية لتصبح مضادة للرصاص (Bulletproof).
    
    إليك البيانات التاريخية المصنفة:
    1. صفقات خاسرة (LOSS):
    ${JSON.stringify(failedData)}
    
    2. صفقات ناجحة (WIN):
    ${JSON.stringify(winningData)}
 
    3. فرص ضائعة (MISSED - كان يجب التداول):
    ${JSON.stringify(missedData)}
 
    4. تجنب صحيح (AVOIDED - أحسنت بعدم التداول):
    ${JSON.stringify(avoidedData)}
    
    المطلوب منك إجراء "هجوم الفريق الأحمر" (Red Team Attack) خوارزمي على الاستراتيجية الحالية مع التركيز العميق على خوارزمية IPDA وأنماط الشموع المؤسسية:
    1. **محاكاة النجاح الأول:** تأكد من أن القواعد الجديدة تعزز المنطق الخوارزمي الذي أدى لنجاح أول صفقة في النظام.
    2. **تحليل الفشل الخوارزمي (LOSS):** قارن بين "المنطق" والنتيجة الفعلية. لماذا ضرب السعر وقف الخسارة؟ هل كان هناك "كسر وهمي" (Fakeout)؟ هل تم تجاهل "سيولة أعلى"؟ هل كانت الإزاحة (Displacement) ضعيفة؟
    3. **الكشف التلقائي عن الأعطال:** حدد أي "انحراف خوارزمي" (Algorithmic Drift) في منطق الـ AI عن الاستراتيجية الأساسية وقم بإصلاحه فوراً عبر قواعد صارمة.
    4. **تحليل النجاح الخوارزمي (WIN):** هل تحقق الربح بناءً على تدفق السيولة المتوقع؟
    5. **تحليل الفرص الضائعة (MISSED):** لماذا كان النظام حذراً جداً هنا؟ هل فاتنا "نموذج قوة ثلاثية" (Power of 3) واضح؟
    6. **تحليل التجنب الصحيح (AVOIDED):** ما الذي جعل النظام يرفض هذه الصفقات؟ هل كانت هذه القواعد فعالة؟
    7. **تطوير قواعد الشموع الخوارزمية:** استخرج قواعد جديدة بناءً على الأنماط التي أدت للنجاح (مثل الإزاحة القوية بعد سحب السيولة وترك FVG) وتجنب الأنماط التي أدت للفشل (مثل كسر الـ OB دون احترام الـ FVG).
    8. **صياغة "خوارزمية ذهبية" جديدة:** بناءً على كل ما سبق، ما هي القواعد الصارمة التي يجب إضافتها أو تعديلها لتقليل الـ Drawdown وزيادة الدقة. ركز على كيفية تحسين التعرف على الفجوات السعرية (FVG) وحالة تخفيف كتل الأوامر (OB Mitigation). يجب أن تلتزم القواعد بإدارة المخاطر (TP $4 / SL $12).
    9. **اكتشاف نقاط الضعف الهيكلية:** ابحث عن أنماط متكررة في الخسائر (مثلاً: الخسارة دائماً تحدث في جلسة لندن، أو عند التداول عكس اتجاه D1).
    
    قم بإرجاع النتيجة بتنسيق JSON حصراً:
    {
      "weaknesses": ["وصف دقيق لنقطة الضعف"],
      "refinements": ["قاعدة تداول جديدة"],
      "adaptiveChallenges": ["تحدي تقني للـ AI"],
      "tradeAnalyses": [
        {
          "tradeId": "string",
          "outcome": "WIN/LOSS/MISSED/AVOIDED",
          "discrepancy": "تحليل التناقض بين المنطق والنتيجة",
          "learningPoint": "ما الذي تعلمناه من هذه الصفقة تحديداً"
        }
      ],
      "analysisSummary": "تقرير فني مفصل عن عملية التطور والتحسين المستمر"
    }
  `;

  if (failedData.length === 0 && winningData.length === 0 && missedData.length === 0 && avoidedData.length === 0) {
    return {
      weaknesses: [],
      refinements: [],
      adaptiveChallenges: [],
      tradeAnalyses: [],
      analysisSummary: "لا توجد بيانات كافية لإجراء تحليل التطور حالياً."
    };
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
            refinements: { type: Type.ARRAY, items: { type: Type.STRING } },
            adaptiveChallenges: { type: Type.ARRAY, items: { type: Type.STRING } },
            tradeAnalyses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tradeId: { type: Type.STRING },
                  outcome: { type: Type.STRING },
                  discrepancy: { type: Type.STRING },
                  learningPoint: { type: Type.STRING }
                },
                required: ["tradeId", "outcome", "discrepancy", "learningPoint"]
              }
            },
            analysisSummary: { type: Type.STRING }
          },
          required: ["weaknesses", "refinements", "adaptiveChallenges", "tradeAnalyses", "analysisSummary"]
        }
      }
    });

    let jsonStr = response.text.trim();
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json\n?|```/g, '').trim();
    }
    
    try {
      return JSON.parse(jsonStr || "{}");
    } catch (e) {
      console.error("Failed to parse evolution JSON:", jsonStr);
      if (retryCount < MAX_RETRIES) {
        await sleep(1000 * (retryCount + 1));
        return evolveStrategy(failedTrades, winningTrades, missedTrades, avoidedTrades, isFallback, retryCount + 1);
      }
      throw new Error("فشل في تحليل تنسيق بيانات التطور المستلمة.");
    }
  } catch (error: any) {
    const errorStr = (error.message || String(error)).toLowerCase();
    
    if (retryCount < MAX_RETRIES && (errorStr.includes("500") || errorStr.includes("503") || errorStr.includes("overloaded") || errorStr.includes("fetch"))) {
      await sleep(2000 * (retryCount + 1));
      return evolveStrategy(failedTrades, winningTrades, missedTrades, avoidedTrades, isFallback, retryCount + 1);
    }

    if (errorStr.includes("429") || errorStr.includes("quota")) {
      if (!isFallback) {
        console.warn("Gemini Pro quota hit, falling back to Flash for evolution...");
        return evolveStrategy(failedTrades, winningTrades, missedTrades, avoidedTrades, true);
      }
    }
    
    return handleGeminiError(error, isFallback);
  }
}

export async function generateVoiceExplanation(text: string): Promise<string> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Professional trader voice: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Deep, authoritative voice
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData) {
      const { data } = part.inlineData;
      
      // Convert base64 PCM to WAV
      const binaryString = atob(data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const samples = new Int16Array(bytes.buffer);
      const wavBuffer = encodeWAV(samples, 24000);
      
      // Safer base64 conversion for large buffers
      const wavUint8 = new Uint8Array(wavBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < wavUint8.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(wavUint8.subarray(i, i + chunkSize)));
      }
      const wavBase64 = btoa(binary);
      
      return `data:audio/wav;base64,${wavBase64}`;
    }
  } catch (error) {
    console.warn("Voice generation failed (likely quota):", error);
  }
  
  return "";
}

function encodeWAV(samples: Int16Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }

  return buffer;
}
