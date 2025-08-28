'use client';

import { useState, useEffect, useRef } from 'react';

// 프론트엔드에서 사용하는 메시지 타입 정의 (role: user/assistant)
type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function Home() {
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [history]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    // 현재까지의 대화 기록 (새 메시지 포함 전) - API 호출용
    const previousHistory = [...history];
     // UI 즉시 업데이트 (사용자 메시지 추가)
    setHistory([...previousHistory, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // A2A 정의된 엔드포인트(/api/dialogue) 호출
      const response = await fetch('/api/dialogue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // A2A 정의된 스키마 준수: history와 message 전송
        body: JSON.stringify({ history: previousHistory, message: input }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Network response was not ok');
      }

      const data = await response.json();
      const agentMessage: Message = { role: 'assistant', content: data.response };
      // UI 업데이트 (에이전트 응답 추가)
      setHistory(prev => [...prev, agentMessage]);

    } catch (error: any) {
      console.error('Failed to communicate with agent:', error);
      const errorMessage: Message = { role: 'assistant', content: `오류가 발생했습니다: ${error.message}` };
      setHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-xl">
      <header className="p-5 bg-indigo-800 text-white shadow-md sticky top-0">
        <h1 className="text-2xl font-semibold">소크라테스 Web3 AI 튜터 (Gemini)</h1>
        <p className="text-sm text-indigo-400">A2A Protocol Compliant Agent</p>
        <a href="/.well-known/ai-agent.json" target="_blank" className="text-xs text-blue-300 hover:text-blue-200">View A2A Manifest</a>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
        {history.length === 0 ? (
            <div className="text-center text-gray-600 mt-10 p-6 border rounded-lg bg-white shadow-sm">
                <h2 className="text-lg font-medium mb-3">Web3와 AI의 융합에 대한 탐구를 시작해 봅시다.</h2>
                <p>저는 답 대신 여러분이 스스로 생각할 수 있는 질문을 던집니다. (Powered by Gemini)</p>
                <p className="mt-3 text-sm italic">(예: "탈중앙화된 AI(DeAI)가 왜 필요한가요?")</p>
            </div>
        ) : (
          history.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-start gap-4 max-w-3xl`}>
                {msg.role === 'assistant' && <div className="text-2xl pt-2">👨‍🏫</div>}
                <div
                  className={`p-4 rounded-xl shadow-md leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-500 text-white rounded-br-none'
                      : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && <div className="text-2xl pt-2">🧑‍🎓</div>}
              </div>
            </div>
          ))
        )}
        {isLoading && <div className="text-center text-gray-500 italic p-3">소크라테스가 질문을 숙고하고 있습니다...</div>}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-6 border-t border-gray-200 bg-white sticky bottom-0">
        <div className="flex">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 p-4 text-lg border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition duration-150"
            placeholder="당신의 생각을 입력하세요..."
            disabled={isLoading}
          />
          <button
            type="submit"
            className="px-6 py-4 bg-indigo-600 text-white font-bold rounded-r-lg hover:bg-indigo-700 transition duration-200 disabled:bg-gray-400"
            disabled={isLoading}
          >
            전송
          </button>
        </div>
      </form>
    </div>
  );
}