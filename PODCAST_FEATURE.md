# Podcast Feature Documentation

This document describes the new podcast generation feature for The Smudged Pamphlet.

## Overview

The podcast feature allows you to generate AI-powered audio conversations about reviews and editorials:

- **Single Review Podcasts**: Chuck Morrison (Editor-in-Chief) sits down with the review author for a one-on-one discussion
- **Editorial Roundtable Podcasts**: Chuck hosts a roundtable discussion with multiple critics who participated in the editorial comments

## Architecture

### Components

1. **Podcast Script Generator** (`utils/podcastScriptGenerator.ts`)
   - Uses Gemini AI to generate natural conversation scripts
   - Creates character-appropriate dialogue based on critic personas
   - Formats scripts for TTS consumption

2. **Gemini TTS API Integration** (`pages/api/podcast/generate-audio.ts`)
   - Converts scripts to multi-speaker audio using Gemini's TTS API
   - Maps each critic to an appropriate voice (30 available voices)
   - Returns WAV audio as base64 data

3. **Podcast Orchestrator** (`utils/podcastOrchestrator.ts`)
   - Coordinates the full pipeline: script generation → TTS → storage
   - Provides progress callbacks for UI updates
   - Caches generated podcasts in IndexedDB

4. **UI Components**
   - Review page ([slug].tsx): One-on-one podcast button and player
   - Editorial page (editorial.tsx): Roundtable podcast button and player
   - Reuses existing AudioPlayer component for playback

### Data Flow

```
User clicks "Generate Podcast"
    ↓
Orchestrator checks for existing podcast
    ↓
Generate conversation script using Gemini AI
    ↓
Map speakers to voice profiles
    ↓
Call Gemini TTS API with multi-speaker config
    ↓
Receive WAV audio (base64)
    ↓
Convert to data URL and save to IndexedDB
    ↓
Display audio player with podcast
```

## Voice Mapping

Each critic persona is mapped to a specific Gemini voice:

- **Chuck Morrison** (Editor): Kore (Firm)
- **Julian Pinter** (Music Critic): Puck (Upbeat/Sarcastic)
- **Rex Beaumont** (Film Critic): Algenib (Gravelly)
- **Margot Ashford** (Literary Critic): Sadaltager (Knowledgeable)
- **Patricia Chen** (Business Editor): Alnilam (Firm/Professional)

## Setup Requirements

### Environment Variables

Add to your `.env.local` file:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

### API Access

**Important**: The Gemini multi-speaker TTS feature uses the preview model `gemini-2.5-flash-preview-tts` which may require:
- Waitlist access
- Google AI Studio Early Access Program enrollment
- Check availability at: https://ai.google.dev/

If you don't have access to the TTS preview, you can:
1. Wait for general availability
2. Request early access from Google
3. Implement a fallback using alternative TTS services (ElevenLabs, OpenAI TTS, etc.)

### Storage

Podcasts are stored in IndexedDB with the key pattern `podcast-{reviewId}`:
- Uses existing `SmudgedPamphletDB` database
- Stores as data URLs (same format as uploaded audio)
- No additional configuration needed

## Usage

### For Single Reviews

1. Navigate to any review page
2. Scroll to the "Podcast Discussion" section (between article and comments)
3. Click "Generate Podcast" button
4. Wait for generation (typically 30-60 seconds)
5. Play the generated podcast using the audio player

### For Editorial Roundtables

1. Navigate to an editorial page with comments
2. Scroll to the "Editorial Roundtable Podcast" section
3. Click "Generate Roundtable Podcast" button
4. Wait for generation (typically 45-90 seconds due to longer script)
5. Play the generated podcast

### Progress Indicators

The UI shows real-time progress:
- **Generating Script** (0-40%): AI is writing the conversation
- **Generating Audio** (40-100%): TTS is synthesizing the audio
- **Complete**: Podcast ready to play

## Technical Details

### Script Generation Prompt

The script generator creates natural dialogue by:
- Including critic personalities and bios
- Using the review content and score
- Adding natural speech patterns (interruptions, filler words)
- Ensuring back-and-forth exchanges (15-40 exchanges depending on type)
- Making Chuck challenge pretentious takes (true to his character)

### TTS Generation

Multi-speaker TTS uses this format:

```javascript
{
  contents: [{ parts: [{ text: "Speaker1: Line\nSpeaker2: Line" }] }],
  generationConfig: {
    responseModalities: ['AUDIO'],
    speechConfig: {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          { speaker: 'Speaker1', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' }}},
          { speaker: 'Speaker2', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' }}}
        ]
      }
    }
  }
}
```

### Caching

- Podcasts are cached in IndexedDB after generation
- Subsequent page loads check for existing podcasts
- Delete podcast by clearing IndexedDB or regenerating

## Extending the Feature

### Adding New Voices

Edit `utils/podcastScriptGenerator.ts` → `getVoiceForSpeaker()`:

```typescript
export function getVoiceForSpeaker(speakerName: string): string {
  const voiceMap: Record<string, string> = {
    'Your Critic': 'Zephyr', // Choose from 30 available voices
    // ... existing mappings
  };
  return voiceMap[speakerName] || 'Kore';
}
```

### Alternative TTS Providers

To use a different TTS service:

1. Create a new API route (e.g., `pages/api/podcast/generate-audio-elevenlabs.ts`)
2. Update `utils/podcastOrchestrator.ts` to call your new endpoint
3. Handle voice mapping and audio format conversion as needed

### Customizing Conversation Length

Edit the prompts in `utils/podcastScriptGenerator.ts`:

```typescript
// Change from "15-25 exchanges" to your desired length
11. Keep the total conversation to 30-50 exchanges (longer format)
```

## Troubleshooting

### Error: "Failed to generate audio from Gemini"

**Causes**:
- Invalid API key
- No access to TTS preview model
- Rate limiting

**Solutions**:
- Verify `GEMINI_API_KEY` in `.env.local`
- Check API quota at Google AI Studio
- Request TTS preview access

### Error: "Failed to generate podcast script"

**Causes**:
- Gemini API down
- Review data missing required fields

**Solutions**:
- Check `/api/gemini/generate` endpoint is working
- Verify review has `critic`, `criticName`, and `body` fields

### Podcast not loading after generation

**Causes**:
- IndexedDB storage full or disabled
- Browser privacy mode blocking storage

**Solutions**:
- Clear browser storage and try again
- Disable private/incognito mode
- Check browser console for IndexedDB errors

## Future Enhancements

Potential improvements:
- [ ] Download podcast as MP3/WAV file
- [ ] Add chapter markers for different discussion topics
- [ ] Variable playback speed controls
- [ ] Transcript display alongside audio
- [ ] Batch generate podcasts for all reviews
- [ ] Custom voice selection by user
- [ ] Podcast RSS feed generation
- [ ] Share podcast via URL

## API Cost Considerations

**Gemini API Costs** (as of 2025):
- Text generation: ~$0.10 per 1M input characters
- TTS generation: Pricing TBD (preview model)

**Typical Costs per Podcast**:
- Script generation: ~$0.01-0.02 (5-10K characters)
- TTS generation: To be determined

**Optimization Tips**:
- Cache generated podcasts (already implemented)
- Limit podcast length to reduce TTS costs
- Consider batch generation during off-peak hours
