# Socratic Web3 Tutor

A Web3 educational chatbot built with Next.js and Gemini AI that uses the Socratic method to teach blockchain and cryptocurrency concepts.

## Features

- Interactive Web3 education using Socratic questioning
- Powered by Google's Gemini AI
- Agent-to-Agent (A2A) protocol support
- Real-time streaming responses

## Getting Started

### Prerequisites

- Node.js 18+
- Gemini API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd socratic-web3-tutor-gemini
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Add your Gemini API key to `.env.local`:
```
GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Endpoints

- `GET /api/a2a` - Returns agent card information
- `POST /api/a2a` - Handles agent-to-agent communication and chat requests

## Architecture

This project uses:
- **Next.js 15** - React framework with App Router
- **Google Gemini AI** - For natural language processing
- **Agent-to-Agent (A2A) Protocol** - For inter-agent communication
- **TypeScript** - For type safety

## Deployment

This project is configured for deployment on Vercel. Set the following environment variables in your deployment:

- `GEMINI_API_KEY`
- `NEXT_PUBLIC_SITE_URL`

## License

MIT
