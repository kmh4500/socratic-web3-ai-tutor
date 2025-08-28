'use client';

import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { A2AClient } from "@a2a-js/sdk/client";
import { SendMessageSuccessResponse } from "@a2a-js/sdk";
import { Message, MessageSendParams, TextPart } from "@a2a-js/sdk";
export const A2A_API_PREFIX = "/api/a2a";

// 에이전트 카드 검색(Discovery) URL 정의
const AGENT_CARD_PATH = `${A2A_API_PREFIX}/.well-known/agent-card.json`;

export default function Home() {
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<A2AClient | null>(null);
  // 대화 세션 동안 유지되는 contextId 생성
  const [contextId] = useState<string>(uuidv4());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // A2A 클라이언트 초기화
  useEffect(() => {
    const initializeClient = async () => {
      try {
        const cardUrl = `${window.location.origin}${AGENT_CARD_PATH}`;
        // URL로부터 에이전트 카드 정보를 읽어와 클라이언트 생성
        const a2aClient = await A2AClient.fromCardUrl(cardUrl);
        setClient(a2aClient);
      } catch (err) {
        console.error("Failed to initialize A2A client:", err);
        setError("에이전트 연결 실패. (A2A Discovery 실패)");
      }
    };
    initializeClient();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !client) return;

    const userMessage: Message = {
        kind: "message",
        messageId: uuidv4(),
        role: "user",
        parts: [{ kind: "text", text: input }],
        contextId: contextId, // 중요: 유지된 contextId 사용
    };

    // UI 업데이트
    setHistory(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const sendParams: MessageSendParams = {
        message: userMessage,
      };

      // A2A 클라이언트로 메시지 전송 (SDK가 폴링 및 응답 처리 자동화)
      const response = await client.sendMessage(sendParams);

      if ("error" in response) {
        throw new Error(response.error.message);
      }

      const resultEvent = (response as SendMessageSuccessResponse).result;

      if (isMessage(resultEvent)) {
          // 에이전트 응답으로 UI 업데이트
          setHistory(prev => [...prev, resultEvent]);
      }

      // Message 타입 판별 함수 (로컬 구현)
      function isMessage(obj: any): obj is Message {
        return obj && typeof obj === "object" && obj.kind === "message" && typeof obj.messageId === "string";
      }

    } catch (error: any) {
      console.error('A2A communication error:', error);
      setError(`통신 오류: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessageContent = (message: Message) => {
    return message.parts
      .filter((part): part is TextPart => part.kind === 'text')
      .map((part, index) => <span key={index}>{part.text}</span>);
  };

  // --- 렌더링 ---
  if (error && !client) {
    return <div className="p-10 text-center text-red-500">초기화 오류: {error}</div>;
  }

  if (!client) {
    return <div className="p-10 text-center text-gray-500">A2A 에이전트 연결 중...</div>;
  }

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-xl">
      <header className="p-5 bg-purple-800 text-white shadow-md sticky top-0">
        <h1 className="text-2xl font-semibold">소크라테스 Web3 AI 튜터 (@a2a-js/sdk)</h1>
        <a href={AGENT_CARD_PATH} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300 hover:text-blue-200">View Agent Card (JSON)</a>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
        {history.length === 0 ? (
            <div className="text-center text-gray-600 mt-10 p-6 border rounded-lg bg-white shadow-sm">
                <h2 className="text-lg font-medium mb-3">Web3와 AI의 융합에 대한 탐구를 시작해 봅시다.</h2>
                <p>A2A 프로토콜로 통신 중입니다. Session Context ID: <span className="text-xs font-mono">{contextId.substring(0, 8)}...</span></p>
            </div>
        ) : (
          history.map((msg) => (
            <div key={msg.messageId} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               <div className={`p-4 rounded-xl shadow-md max-w-3xl leading-relaxed ${
                    msg.role === 'user' ? 'bg-purple-500 text-white rounded-br-none' : 'bg-white text-gray-800 border rounded-bl-none'
                  }`}>
                  {renderMessageContent(msg)}
                </div>
            </div>
          ))
        )}
        {isLoading && <div className="text-center italic p-3 text-gray-500">A2A 프로토콜을 통해 응답 대기 중...</div>}
        {error && <div className="text-center text-red-500 p-3 bg-red-50 border border-red-300 rounded-lg mx-4">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-6 border-t bg-white sticky bottom-0">
        <div className="flex">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 p-4 text-lg border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition duration-150"
            placeholder="당신의 생각을 입력하세요..."
            disabled={isLoading}
          />
          <button
            type="submit"
            className="px-6 py-4 bg-purple-600 text-white font-bold rounded-r-lg hover:bg-purple-700 transition duration-200 disabled:bg-gray-400"
            disabled={isLoading}
          >
            전송
          </button>
        </div>
      </form>
    </div>
  );
}