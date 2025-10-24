import {
  generatePodcastScript,
  formatScriptForTTS,
  getVoiceForSpeaker,
  type PodcastSegment,
} from './podcastScriptGenerator';
import { savePodcastAudio, getPodcastAudio, savePodcastAlbumArt } from './db';
import { stitchWavFiles } from './audioStitcher';

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
  audioFileName?: string;
  isYouTube?: boolean;
  documentFileName?: string;
  reviewCritics?: ('music' | 'film' | 'literary' | 'business')[]; // For editorial roundtables
}

/**
 * Main orchestration function for generating a podcast
 * Handles the full pipeline: script generation -> TTS -> storage
 */
export async function generatePodcast(
  review: Review,
  isEditorial: boolean = false,
  onProgress?: (progress: PodcastGenerationProgress) => void,
  quality: 'high' | 'fast' = 'high'
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
      message: 'Setting up the conversation...',
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
      audioFileName: review.audioFileName,
      isYouTube: review.isYouTube,
      documentFileName: review.documentFileName,
      reviewCritics: review.reviewCritics, // Pass participating critics for editorials
    });

    onProgress?.({
      status: 'generating_script',
      progress: 40,
      message: 'Creating album art...',
    });

    // Step 3: Generate album art (before audio generation, after script)
    let albumArtData: { imageData: string; mimeType: string } | null = null;
    try {
      const criticNames = isEditorial && review.reviewCritics
        ? review.reviewCritics.map(c => {
            const info = require('./critics').getCriticInfo(c);
            return info.name;
          })
        : [];

      const albumArtResponse = await fetch('/api/podcast/generate-album-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewTitle: review.title,
          artist: review.artist,
          isEditorial,
          criticNames,
          podcastScript: script // Pass the generated script
        }),
      });

      if (albumArtResponse.ok) {
        const { imageData, mimeType: imageMimeType } = await albumArtResponse.json();
        albumArtData = { imageData, mimeType: imageMimeType };
        console.log('Album art generated successfully');
      } else {
        console.warn('Failed to generate album art, proceeding without it');
      }
    } catch (albumArtError) {
      console.warn('Album art generation failed, proceeding without it:', albumArtError);
    }

    onProgress?.({
      status: 'generating_audio',
      progress: 45,
      message: 'Preparing to record...',
    });

    // Check if we have segments (3+ speakers) or a flat script
    console.log('Script type check:', {
      isArray: Array.isArray(script),
      length: script.length,
      firstElement: script[0],
      hasSpeakersProperty: script.length > 0 && 'speakers' in script[0]
    });
    const isSegmented = Array.isArray(script) && script.length > 0 && 'speakers' in script[0];
    console.log('Is segmented?', isSegmented);
    let audioDataUrl: string;

    if (isSegmented) {
      // Handle segmented podcast (3+ speakers)
      const segments = script as PodcastSegment[];
      const audioDataUrls: string[] = [];

      console.log(`Generating ${segments.length} segments for multi-speaker podcast`);

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const progressPercent = 50 + (30 * (i / segments.length));

        onProgress?.({
          status: 'generating_audio',
          progress: progressPercent,
          message: `Recording segment ${i + 1} of ${segments.length}...`,
        });

        const formattedScript = formatScriptForTTS(segment.script);
        const speakers = segment.speakers.map(name => ({
          speaker: name,
          voice: getVoiceForSpeaker(name),
        }));

        console.log(`Segment ${i + 1}: ${speakers.map(s => s.speaker).join(', ')}`);

        const audioResponse = await fetch('/api/podcast/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: formattedScript,
            speakers,
            quality,
          }),
        });

        if (!audioResponse.ok) {
          const errorData = await audioResponse.json();
          console.error(`TTS API error for segment ${i + 1}:`, errorData);
          throw new Error(errorData.error || errorData.details || 'Failed to generate audio from Gemini');
        }

        const { audioData, mimeType } = await audioResponse.json();
        const segmentDataUrl = `data:${mimeType};base64,${audioData}`;
        audioDataUrls.push(segmentDataUrl);
      }

      // Stitch segments together
      onProgress?.({
        status: 'generating_audio',
        progress: 85,
        message: 'Stitching segments together...',
      });

      audioDataUrl = stitchWavFiles(audioDataUrls);

    } else {
      // Handle simple 2-speaker podcast
      const flatScript = script as any[];
      const formattedScript = formatScriptForTTS(flatScript);

      const uniqueSpeakers = Array.from(
        new Set(flatScript.map(s => s.speaker))
      );

      const speakers = uniqueSpeakers.map(name => ({
        speaker: name,
        voice: getVoiceForSpeaker(name),
      }));

      // Step 5: Generate audio via API
      onProgress?.({
        status: 'generating_audio',
        progress: 50,
        message: 'Recording podcast...',
      });

      console.log('Generating TTS with speakers:', speakers.map(s => s.speaker).join(', '));
      console.log('Script length:', formattedScript.length, 'characters');

      const audioResponse = await fetch('/api/podcast/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: formattedScript,
          speakers,
          quality,
        }),
      });

      if (!audioResponse.ok) {
        const errorData = await audioResponse.json();
        console.error('TTS API error details:', errorData);
        throw new Error(errorData.error || errorData.details || 'Failed to generate audio from Gemini');
      }

      const { audioData, mimeType } = await audioResponse.json();

      onProgress?.({
        status: 'generating_audio',
        progress: 80,
        message: 'Almost done...',
      });

      // Step 6: Convert to data URL
      audioDataUrl = `data:${mimeType};base64,${audioData}`;
    }

    // Step 7: Save album art separately (not embedded in WAV - that breaks the format)
    onProgress?.({
      status: 'generating_audio',
      progress: 90,
      message: 'Saving album art...',
    });

    if (albumArtData) {
      try {
        await savePodcastAlbumArt(review.id, albumArtData);
        console.log('Album art saved successfully');
      } catch (albumArtError) {
        console.warn('Album art save failed, proceeding without it:', albumArtError);
      }
    } else {
      console.log('No album art to save');
    }

    // Step 8: Save podcast audio (without album art embedded)
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
