# The Smudged Pamphlet

Music criticism for people who hate music criticism.

## About

An AI-powered music review application featuring Julian Pinter, a pretentious music critic who reviews your audio files with scathing commentary, followed by an autonomous comment section that argues back.

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A [Gemini API Key](https://aistudio.google.com/app/apikey) from Google AI Studio

### Installation

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Usage

1. Enter your Gemini API key in the authentication field
2. Upload an audio file (MP3/WAV, under 20MB)
3. Click "Submit to Julian Pinter"
4. Watch as the autonomous agents generate a review and comment section

## Technology Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Google Gemini AI** - Multi-agent AI system
- **Lucide React** - Icons

## Features

- 🎵 Audio file upload and playback
- 🤖 Multi-agent AI system with distinct personas
- 💬 Autonomous comment generation with replies
- 🎨 Brutalist design aesthetic
- 📝 Real-time agent workflow logging

## Project Structure

```
smudged-pamphlet/
├── pages/
│   ├── _app.tsx          # Next.js app wrapper
│   ├── _document.tsx     # HTML document structure
│   └── index.tsx         # Main application page
├── styles/
│   └── globals.css       # Global styles with Tailwind
├── public/               # Static assets
└── package.json          # Dependencies
```

## Build for Production

```bash
npm run build
npm start
```

## License

MIT
