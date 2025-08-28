import { v4 as uuidv4 } from "uuid";
import { NextRequest, NextResponse } from "next/server";
import type { AgentCard, Message, JSONRPCErrorResponse, JSONRPCResponse, JSONRPCSuccessResponse } from "@a2a-js/sdk";
import {
    AgentExecutor,
    RequestContext,
    ExecutionEventBus,
    DefaultRequestHandler,
    InMemoryTaskStore,
    JsonRpcTransportHandler,
    A2AError,
} from "@a2a-js/sdk/server";
const AGENT_CARD_PATH = ".well-known/agent-card.json";
import { GoogleGenerativeAI } from "@google/generative-ai"; // 👈 Import Gemini SDK

// 1. Define your agent's identity card. (이전과 동일)
const helloAgentCard: AgentCard = {
  name: "Socrates Web3 AI Tutor",
  description: "Web3, AI, 블록체인 등 다양한 주제에 대해 소크라테스식 문답법으로 대화하며, Gemini 모델을 활용해 심층적이고 친절하게 설명해주는 AI 에이전트입니다. 대화의 맥락을 기억하며, 사용자의 질문에 맞춰 단계별로 사고를 유도하고, 개념을 쉽게 풀어서 안내합니다. (초기 안내 메시지는 public/prompt.txt에서 불러옵니다)",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000") + "/api/a2a",
  capabilities: {},
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  skills: [
    {
      id: "chat",
      name: "Socratic Dialogue",
      description: "질문을 통해 사고를 유도하고, Web3/AI/블록체인 등 다양한 주제를 쉽게 설명합니다.",
      tags: ["chat", "socratic", "web3", "ai", "blockchain"]
    }
  ],
};


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // 👈 Gemini 모델 설정

// 2. Implement the agent's logic. (이전과 동일)
class HelloExecutor implements AgentExecutor {
    // 히스토리 저장용 (메모리 예시, 실제 서비스는 DB 등 사용 권장)
    private static historyStore: Record<string, Message[]> = {};

    async execute(
        requestContext: RequestContext,
        eventBus: ExecutionEventBus
    ): Promise<void> {
        // 1. 프롬프트 파일에서 초기화 메시지 불러오기 (public/prompt.txt를 fetch로 읽기)
        let initialPrompt = "안녕하세요! 무엇이 궁금하신가요?";
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/prompt.txt`);
            if (res.ok) {
                initialPrompt = await res.text();
            } else {
                console.warn("프롬프트 파일을 불러올 수 없습니다. 기본값 사용.");
            }
        } catch (e) {
            console.warn("프롬프트 파일을 불러올 수 없습니다. 기본값 사용.");
        }

        // 2. 히스토리 불러오기 및 저장
        const contextId = requestContext.contextId;
        if (!HelloExecutor.historyStore[contextId]) {
            HelloExecutor.historyStore[contextId] = [];
        }
        const history = HelloExecutor.historyStore[contextId];

        // 3. 유저 메시지 추출
        const incomingMessage = requestContext.userMessage;
        if (incomingMessage) {
            history.push(incomingMessage);
        }

        // 4. 첫 메시지라면 초기 프롬프트 반환 (X)
        // 학생의 첫 질문이 들어오면 바로 Gemini API 호출

        // 5. Gemini API 호출
        // system 역할 없이, 첫 user 메시지 앞에 프롬프트를 user 역할로 추가
        const geminiMessages = [
            { role: "user", parts: [{ text: initialPrompt }] },
            ...history
                .filter(msg => msg.role === "user" || msg.role === "agent")
                .map(msg => ({
                    role: msg.role === "user" ? "user" : "model",
                    parts: [{ text: msg.parts[0]?.kind === "text" ? msg.parts[0].text : "" }]
                })),
        ];

        try {
            const result = await model.generateContent({
                contents: geminiMessages
            });
            const geminiResponse = await result.response;
            const geminiText = geminiResponse.text();

            const responseMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: geminiText }],
                contextId,
            };
            history.push(responseMessage);
            eventBus.publish(responseMessage);
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            const errorMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: "Sorry, I encountered an error while contacting the AI model." }],
                contextId,
            };
            history.push(errorMessage);
            eventBus.publish(errorMessage);
        } finally {
            eventBus.finished();
        }
    }

    // 히스토리 조회 메서드 (필요시 활용)
    static getHistory(contextId: string): Message[] {
        return HelloExecutor.historyStore[contextId] || [];
    }

    cancelTask = async (): Promise<void> => {};
}

// 3. Set up the A2A request handler and transport handler.
const agentExecutor = new HelloExecutor();
const requestHandler = new DefaultRequestHandler(
    helloAgentCard,
    new InMemoryTaskStore(),
    agentExecutor
);
// 💡 A2AExpressApp과 마찬가지로, JSON-RPC 요청을 처리할 Transport Handler를 생성합니다.
const jsonRpcTransportHandler = new JsonRpcTransportHandler(requestHandler);


export async function GET(
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> }
) {
    const { params } = context;
    const resolvedParams = await params;
    const currentPath = resolvedParams.path?.join('/') || '';

    // === GET /.well-known/agent-card.json ===
    if (currentPath === AGENT_CARD_PATH) {
        try {
            const agentCard = await requestHandler.getAgentCard();
            return NextResponse.json(agentCard);
        } catch (error: unknown) {
            console.error("Error fetching agent card:", error);
            return NextResponse.json(
                { error: "Failed to retrieve agent card" },
                { status: 500 }
            );
        }
    }

    // 일치하는 라우트가 없을 경우 404 응답
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> }
) {
    const { params } = context;
    const resolvedParams = await params;
    const currentPath = resolvedParams.path?.join('/') || '';

    // === POST / ===
    if (currentPath === '') {
        try {
            const body = await request.json();
            // Transport Handler를 통해 요청 본문을 처리합니다.
            const rpcResponseOrStream = await jsonRpcTransportHandler.handle(body);

            // 결과가 스트림(AsyncGenerator)인지 확인합니다.
            if (typeof (rpcResponseOrStream as unknown as Record<string | symbol, unknown>)?.[Symbol.asyncIterator] === 'function') {
                const stream = rpcResponseOrStream as AsyncGenerator<JSONRPCSuccessResponse, void, undefined>;

                // SSE(Server-Sent Events) 스트림 생성
                const readable = new ReadableStream({
                    async start(controller) {
                        try {
                            for await (const event of stream) {
                                controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
                            }
                        } catch (streamError: unknown) {
                            console.error(`Error during SSE streaming (request ${body?.id}):`, streamError);
                            const a2aError = streamError instanceof A2AError ? streamError : A2AError.internalError((streamError as Error).message || 'Streaming error.');
                            const errorResponse: JSONRPCErrorResponse = {
                                jsonrpc: '2.0',
                                id: body?.id || null,
                                error: a2aError.toJSONRPCError(),
                            };
                            controller.enqueue(`event: error\n`);
                            controller.enqueue(`data: ${JSON.stringify(errorResponse)}\n\n`);
                        } finally {
                            controller.close();
                        }
                    }
                });

                return new Response(readable, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                    }
                });
            } else {
                // 단일 JSON-RPC 응답 처리
                const rpcResponse = rpcResponseOrStream as JSONRPCResponse;
                return NextResponse.json(rpcResponse);
            }
        } catch (error: unknown) {
            console.error("Unhandled error in A2A POST handler:", error);
            const a2aError = error instanceof A2AError ? error : A2AError.internalError('General processing error.');
            const errorResponse: JSONRPCErrorResponse = {
                jsonrpc: '2.0',
                id: null,
                error: a2aError.toJSONRPCError(),
            };
            return NextResponse.json(errorResponse, { status: 500 });
        }
    }

    // 일치하는 라우트가 없을 경우 404 응답
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}
