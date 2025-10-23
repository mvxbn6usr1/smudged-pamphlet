import type { NextApiRequest, NextApiResponse } from 'next';
import { addWavHeader } from '@/utils/wavConverter';

interface SpeakerConfig {
  speaker: string;
  voice: string;
}

interface GenerateAudioRequest {
  script: string; // Formatted script with "Speaker: Line" format
  speakers: SpeakerConfig[]; // Array of speaker names and their voice configs
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { script, speakers } = req.body as GenerateAudioRequest;

    if (!script || !speakers || speakers.length === 0) {
      return res.status(400).json({ error: 'Missing script or speakers' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    // Build the multi-speaker voice config
    const speakerVoiceConfigs = speakers.map(s => ({
      speaker: s.speaker,
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: s.voice }
      }
    }));

    // Prepare the TTS prompt with speaker style instructions
    const speakerStyles = speakers.map(s =>
      `${s.speaker} uses voice "${s.voice}"`
    ).join(', ');

    const ttsPrompt = `TTS the following conversation with natural emotion and appropriate pacing. ${speakerStyles}:

${script}`;

    // Call Gemini TTS API
    // Note: Using the preview TTS model - may require waitlist access
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: ttsPrompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs
              }
            }
          }
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      return res.status(geminiResponse.status).json({
        error: 'Failed to generate audio from Gemini',
        details: errorText
      });
    }

    const data = await geminiResponse.json();

    // Extract the audio data
    const audioBase64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioBase64) {
      console.error('No audio data in response:', JSON.stringify(data));
      return res.status(500).json({ error: 'No audio data returned from Gemini' });
    }

    // Convert base64 to buffer
    const pcmBuffer = Buffer.from(audioBase64, 'base64');

    // Add WAV headers to the PCM data
    // Gemini TTS outputs 24kHz, mono, 16-bit PCM
    const wavBuffer = addWavHeader(pcmBuffer, 24000, 1, 16);

    // Convert back to base64
    const wavBase64 = wavBuffer.toString('base64');

    // Return the properly formatted WAV audio
    res.status(200).json({
      audioData: wavBase64,
      mimeType: 'audio/wav',
    });

  } catch (error) {
    console.error('Error generating podcast audio:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
