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
  name: "Hello Agent (Next.js)",
  description: "A simple agent that says hello, running on Next.js.",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: process.env.NEXT_PUBLIC_SITE_URL + "/api/a2a" || "http://localhost:3000/api/a2a",
  capabilities: {},
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  skills: [{ id: "chat", name: "Chat", description: "Say hello", tags: ["chat"] }],
};


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // 👈 Gemini 모델 설정

// 2. Implement the agent's logic. (이전과 동일)
class HelloExecutor implements AgentExecutor {
    async execute(
        requestContext: RequestContext,
        eventBus: ExecutionEventBus
    ): Promise<void> {
        // 2. Extract the user's message from the request
        const incomingMessage = requestContext.userMessage;
        const firstPart = incomingMessage?.parts[0];
        const userPrompt = (firstPart?.kind === 'text') ? firstPart.text : "Hello";

        try {
            // 3. Call the Gemini API
            const result = await model.generateContent(userPrompt);
            const geminiResponse = await result.response;
            const geminiText = geminiResponse.text();

            // 4. Create the response message with Gemini's output
            const responseMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: geminiText }],
                contextId: requestContext.contextId,
            };

            // 5. Publish the response and finish
            eventBus.publish(responseMessage);

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            // Handle API errors gracefully
            const errorMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: "Sorry, I encountered an error while contacting the AI model." }],
                contextId: requestContext.contextId,
            };
            eventBus.publish(errorMessage);
        } finally {
            eventBus.finished();
        }
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
