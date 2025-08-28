import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, Content, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// 환경 변수에서 API 키 로드
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("GOOGLE_GEMINI_API_KEY is not set.");
}

const genAI = new GoogleGenerativeAI(API_KEY || "");

// 소크라테스식 문답법을 강제하는 시스템 프롬프트
const SOCRATIC_SYSTEM_PROMPT = `
당신은 '소크라테스'이며, Web3와 AI의 융합 분야 전문 튜터입니다. 당신의 목표는 사용자가 탈중앙화 AI(DeAI), 검증 가능한 추론(Verifiable Inference/ZKML), AI DAO, 암호경제 인센티브와 같은 복잡한 주제를 이해하도록 돕는 것입니다.

당신은 반드시 소크라테스식 문답법(Socratic Method)을 엄격하게 준수해야 합니다.
1. **절대로 직접적인 답변, 정의, 설명을 제공하지 마십시오.** 지식을 주입해서는 안 됩니다.
2. 대신, 사용자가 스스로 답을 발견하도록 유도하는 탐색적이고 도전적인 질문(Probing Question)을 하십시오.
3. 사용자의 가정에 의문을 제기하고 모순을 드러내십시오. (예: "'X'가 중요하다고 하셨는데, 그것이 'Y' 상황에서는 어떻게 적용될까요?")
4. 사용자가 설명을 요구하면, "당신은 그것을 어떻게 정의하시겠습니까?"와 같이 질문으로 되물어야 합니다.
5. 대화의 초점을 엄격하게 Web3와 AI의 교차점에 맞추십시오.
6. 항상 한국어로, 정중하면서도 탐구적인 어조로, 간결하게 질문하십시오.
`;

// Gemini 모델 설정 (Gemini 1.5부터는 System Instruction을 지원합니다)
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest", // 빠르고 비용 효율적인 모델 (더 강력한 추론이 필요하면 gemini-1.5-pro-latest 사용)
  systemInstruction: SOCRATIC_SYSTEM_PROMPT,
});

const generationConfig = {
  temperature: 0.7,
  maxOutputTokens: 300,
};

// 프론트엔드/A2A 형식(user/assistant)을 Gemini 형식(user/model)으로 변환하는 헬퍼 함수
const mapToGeminiHistory = (history: Array<{ role: string, content: string }>): Content[] => {
    return history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
  };

export async function POST(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'Google Gemini API key is not configured.' }, { status: 500 });
  }

  try {
    // A2A 스키마에 따라 요청 본문 파싱
    const { history, message } = await req.json();

    if (!message || history === undefined) {
        return NextResponse.json({ error: 'Message and history are required.' }, { status: 400 });
    }

    // Gemini 형식으로 변환
    const geminiHistory = mapToGeminiHistory(history);

    // 채팅 세션 시작 (이전 기록 포함)
    const chat = model.startChat({
      generationConfig,
      history: geminiHistory,
    });

    // 메시지 전송 및 응답 받기
    const result = await chat.sendMessage(message);
    const response = result.response;
    const agentResponse = response.text();

    if (!agentResponse) {
        // 응답이 비어있거나 필터링된 경우 대비
        console.warn("Gemini response was empty or blocked.");
        return NextResponse.json({ response: "흠... 흥미로운 관점이군요. 그 주장을 뒷받침할 다른 근거는 무엇이 있을까요?" });
    }

    return NextResponse.json({ response: agentResponse });

  } catch (error) {
    console.error("Error during Gemini dialogue processing:", error);
    // Gemini API 에러 처리 (안전 필터 등)
    if (error instanceof Error && (error.message.includes('Candidate was blocked due to safety') || error.message.includes('SAFETY'))) {
        return NextResponse.json({ response: '제가 그 질문에 답하기는 어렵군요. 주제를 조금 바꿔서 다시 탐구해 볼까요?' });
    }
    return NextResponse.json({ error: '에이전트가 응답을 생성하는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}