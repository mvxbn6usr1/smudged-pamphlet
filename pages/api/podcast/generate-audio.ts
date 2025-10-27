import type { NextApiRequest, NextApiResponse } from 'next';
import { addWavHeader } from '@/utils/wavConverter';

interface SpeakerConfig {
  speaker: string;
  voice: string;
}

interface GenerateAudioRequest {
  script: string; // Formatted script with "Speaker: Line" format
  speakers: SpeakerConfig[]; // Array of speaker names and their voice configs
  quality?: 'high' | 'fast'; // Audio quality selection (defaults to 'high')
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { script, speakers, quality = 'high' } = req.body as GenerateAudioRequest;

    if (!script || !speakers || speakers.length === 0) {
      return res.status(400).json({ error: 'Missing script or speakers' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    // Select TTS model based on quality setting
    const ttsModel = quality === 'fast'
      ? 'gemini-2.5-flash-preview-tts'
      : 'gemini-2.5-pro-preview-tts';

    console.log(`TTS Quality: ${quality} (using ${ttsModel})`);

    // Build the multi-speaker voice config
    const speakerVoiceConfigs = speakers.map(s => ({
      speaker: s.speaker,
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: s.voice }
      }
    }));

    // Prepare the TTS prompt with emotional tone direction for each speaker
    const getSpeakerTone = (speakerName: string): string => {
      // Chuck Morrison - the host
      if (speakerName.toLowerCase().includes('chuck') || speakerName.toLowerCase().includes('morrison')) {
        return `${speakerName} should sound conversational, friendly, curious, and occasionally amused - like an everyman host engaging with an intellectual guest`;
      }

      // Julian Pinter - music critic
      if (speakerName.toLowerCase().includes('julian') || speakerName.toLowerCase().includes('pinter')) {
        return `${speakerName} should sound intellectual, sardonic, articulate, and world-weary - a pretentious critic who occasionally shows genuine passion`;
      }

      // Rex Beaumont - film critic
      if (speakerName.toLowerCase().includes('rex') || speakerName.toLowerCase().includes('beaumont')) {
        return `${speakerName} should sound theatrical, dramatic, and intellectual - a film critic with cinematic gravitas`;
      }

      // Clementine Hayes - literature critic
      if (speakerName.toLowerCase().includes('clementine') || speakerName.toLowerCase().includes('hayes')) {
        return `${speakerName} should sound precise, academic, and measured - a literature professor with quiet authority`;
      }

      // Patricia Chen - business editor
      if (speakerName.toLowerCase().includes('patricia') || speakerName.toLowerCase().includes('chen')) {
        return `${speakerName} should sound professional, confident, and analytical - a business editor with sharp insights`;
      }

      // Default for unknown speakers
      return `${speakerName} should speak naturally with appropriate emotion`;
    };

    const toneDirections = speakers.map(s => getSpeakerTone(s.speaker)).join('. ');

    const ttsPrompt = `Generate natural, emotionally expressive speech for this podcast conversation. ${toneDirections}:

${script}`;

    console.log('TTS Request - Speakers:', speakers.map(s => `${s.speaker}(${s.voice})`).join(', '));
    console.log('TTS Request - Script length:', script.length, 'characters');
    console.log('TTS Request - Prompt length:', ttsPrompt.length, 'characters');

    // Call Gemini TTS API
    // Note: Using the preview TTS model - may require waitlist access
    const requestBody = {
      contents: [{ parts: [{ text: ttsPrompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs
          }
        }
      }
    };

    console.log('TTS Request body:', JSON.stringify(requestBody, null, 2));

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini TTS API error status:', geminiResponse.status);
      console.error('Gemini TTS API error response:', errorText);
      return res.status(geminiResponse.status).json({
        error: 'Failed to generate audio from Gemini',
        details: errorText,
        status: geminiResponse.status
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
