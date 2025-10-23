import {
  generatePodcastScript,
  formatScriptForTTS,
  getVoiceForSpeaker,
} from './podcastScriptGenerator';
import { savePodcastAudio, getPodcastAudio } from './db';

export interface PodcastGenerationProgress {
  status: 'generating_script' | 'generating_audio' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}

export interface Review {
  id: string;
  title: string;
  artist: string;
  review: {
    score: number;
    summary: string;
    body: string[];
    notable_lyrics_quoted?: string;
    critic?: 'music' | 'film' | 'literary' | 'business';
    criticName?: string;
  };
  comments?: any[];
  youtubeUrl?: string;
}

/**
 * Main orchestration function for generating a podcast
 * Handles the full pipeline: script generation -> TTS -> storage
 */
export async function generatePodcast(
  review: Review,
  isEditorial: boolean = false,
  onProgress?: (progress: PodcastGenerationProgress) => void
): Promise<string> {
  try {
    // Step 1: Check if podcast already exists
    const existingPodcast = await getPodcastAudio(review.id);
    if (existingPodcast) {
      onProgress?.({
        status: 'complete',
        progress: 100,
        message: 'Podcast already exists',
      });
      return existingPodcast;
    }

    // Step 2: Generate script
    onProgress?.({
      status: 'generating_script',
      progress: 10,
      message: 'Generating conversation script...',
    });

    const script = await generatePodcastScript({
      reviewTitle: review.title,
      artist: review.artist,
      score: review.review.score,
      summary: review.review.summary,
      body: review.review.body,
      notableLyrics: review.review.notable_lyrics_quoted,
      criticType: review.review.critic || 'music',
      criticName: review.review.criticName || 'Unknown Critic',
      isEditorial,
      comments: review.comments || [],
      youtubeUrl: review.youtubeUrl,
    });

    onProgress?.({
      status: 'generating_script',
      progress: 40,
      message: 'Script generated, preparing audio...',
    });

    // Step 3: Format script for TTS
    const formattedScript = formatScriptForTTS(script);

    // Step 4: Build speaker configs
    const uniqueSpeakers = Array.from(
      new Set(script.map(s => s.speaker))
    );

    const speakers = uniqueSpeakers.map(name => ({
      speaker: name,
      voice: getVoiceForSpeaker(name),
    }));

    // Step 5: Generate audio via API
    onProgress?.({
      status: 'generating_audio',
      progress: 50,
      message: 'Generating audio with Gemini TTS...',
    });

    const audioResponse = await fetch('/api/podcast/generate-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: formattedScript,
        speakers,
      }),
    });

    if (!audioResponse.ok) {
      const errorData = await audioResponse.json();
      throw new Error(errorData.error || 'Failed to generate audio');
    }

    const { audioData, mimeType } = await audioResponse.json();

    onProgress?.({
      status: 'generating_audio',
      progress: 80,
      message: 'Audio generated, saving...',
    });

    // Step 6: Convert to data URL and save
    const audioDataUrl = `data:${mimeType};base64,${audioData}`;
    await savePodcastAudio(review.id, audioDataUrl);

    onProgress?.({
      status: 'complete',
      progress: 100,
      message: 'Podcast generated successfully!',
    });

    return audioDataUrl;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onProgress?.({
      status: 'error',
      progress: 0,
      message: 'Failed to generate podcast',
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Get existing podcast audio for a review
 */
export async function getExistingPodcast(reviewId: string): Promise<string | null> {
  try {
    const audio = await getPodcastAudio(reviewId);
    return audio || null;
  } catch (error) {
    console.error('Error retrieving podcast:', error);
    return null;
  }
}

/**
 * Check if a podcast exists for a review
 */
export async function hasPodcast(reviewId: string): Promise<boolean> {
  try {
    const audio = await getPodcastAudio(reviewId);
    return !!audio;
  } catch (error) {
    console.error('Error checking podcast:', error);
    return false;
  }
}
