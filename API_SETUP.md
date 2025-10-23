# API Setup Guide

This application uses server-side API routes to protect API keys and implement rate limiting.

## Environment Variables

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Add your API keys to `.env.local`:

### Gemini API Key
Get your key from: https://aistudio.google.com/app/apikey

```
GEMINI_API_KEY=your_gemini_api_key_here
```

### YouTube Data API v3 Key
1. Go to: https://console.cloud.google.com/
2. Create a new project (or select existing)
3. Enable "YouTube Data API v3"
4. Go to Credentials → Create Credentials → API Key
5. Restrict the key to "YouTube Data API v3" only

```
YOUTUBE_API_KEY=your_youtube_data_api_key_here
```

## API Routes

### `/api/youtube/metadata`
- **Method**: POST
- **Body**: `{ "videoId": "string" }`
- **Returns**: Video metadata including title, channel, and music detection
- **Rate Limit**: 100 requests/hour per IP

### `/api/gemini/generate`
- **Method**: POST
- **Body**: `{ "model": "string", "contents": [], "generationConfig": {} }`
- **Returns**: AI-generated content from Gemini
- **Rate Limit**: 50 requests/hour per IP
- **Max Payload**: 20MB

## Rate Limiting

Simple in-memory rate limiting is implemented per IP address:
- **YouTube API**: 100 requests/hour
- **Gemini API**: 50 requests/hour

For production, replace with Redis-based rate limiting.

## Security Notes

- API keys are stored server-side only
- Never commit `.env.local` to git (already in `.gitignore`)
- Rate limiting prevents abuse
- For production deployment, consider:
  - Redis-based rate limiting
  - User authentication
  - API key rotation
  - Request logging and monitoring
  - CORS restrictions
