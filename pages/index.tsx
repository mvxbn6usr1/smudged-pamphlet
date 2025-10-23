import React, { useState, useEffect, useRef } from 'react';
import { Upload, MessageSquare, ThumbsDown, Terminal, ShieldAlert, ChevronDown, Music, Save, Trash2, Archive, X, ExternalLink, FileText, File, Film } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useRouter } from 'next/router';
import AudioPlayer from '@/components/AudioPlayer';
import DocumentPreview from '@/components/DocumentPreview';
import { saveAudioData, getAudioData, deleteAudioData } from '@/utils/db';
import { fetchYouTubeMetadataServerSide, extractYouTubeId as extractYouTubeIdUtil, ServerSideGeminiAI } from '@/utils/api';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

interface ReviewData {
  title: string;
  artist: string;
  score: number;
  summary: string;
  body: string[];
  notable_lyrics_quoted: string;
  critic?: 'music' | 'film' | 'literary' | 'business';
  criticName?: string;
}

interface Reply {
  id: string;
  username: string;
  persona_type: string;
  timestamp: string;
  text: string;
  likes: number;
  is_julian: boolean; // Legacy - kept for backwards compatibility
  is_critic?: boolean; // New - indicates this is from the active critic
  critic?: 'music' | 'film' | 'literary' | 'business'; // Which critic this is from
  replyingToUsername?: string; // Username being replied to in the thread
  replyingToId?: string; // ID of the reply being replied to
}

interface Comment {
  id: string;
  username: string;
  persona_type: string;
  timestamp: string;
  text: string;
  likes: number;
  replies: Reply[];
}

interface SavedReview {
  id: string;
  title: string;
  artist: string;
  slug: string;
  timestamp: number;
  review: ReviewData;
  comments: Comment[];
  audioFileName?: string;
  audioDataUrl?: string; // Still used for backwards compatibility
  albumArt?: string;
  waveformData?: number[];
  hasAudioInDB?: boolean; // Flag to indicate audio is in IndexedDB
  commentsOpen?: boolean; // Whether comments are still being generated
  commentCloseTime?: number; // When comments close (5 min after publication)
  audioPart?: any; // Stored audio part for generating more comments
  youtubeUrl?: string; // YouTube video URL
  isYouTube?: boolean; // Flag to indicate this is a YouTube review
  documentContent?: string; // Extracted text content for documents/PDFs
  documentFileName?: string; // Original document filename
}

export default function SmudgedPamphlet() {
  const router = useRouter();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const [stage, setStage] = useState<string>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const [review, setReview] = useState<ReviewData | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [savedReviews, setSavedReviews] = useState<SavedReview[]>([]);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [albumArt, setAlbumArt] = useState<string | undefined>();
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [currentAudioPart, setCurrentAudioPart] = useState<any>(null);
  const [commentGenerationActive, setCommentGenerationActive] = useState(false);
  const [currentReviewId, setCurrentReviewId] = useState<string | null>(null);
  const [userComment, setUserComment] = useState('');
  const [userName, setUserName] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; replyId?: string; username?: string } | null>(null);
  const [typingIndicators, setTypingIndicators] = useState<{ commentId: string | null; username: string }[]>([]);

  // Load API key and saved reviews from localStorage on mount
  useEffect(() => {
    const storedReviews = localStorage.getItem('smudged_reviews');
    if (storedReviews) {
      try {
        setSavedReviews(JSON.parse(storedReviews));
      } catch (e) {
        console.error('Failed to load saved reviews', e);
      }
    }
  }, []);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const cleanAndParseJSON = (text: string): any => {
    // Remove markdown code blocks
    let cleaned = text.replace(/```json|```/g, '').trim();
    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.error('JSON Parse Error. Raw text:', text);
      console.error('Cleaned text:', cleaned);
      throw new Error(`Failed to parse JSON: ${e instanceof Error ? e.message : 'Unknown error'}. Check console for details.`);
    }
  };

  const extractYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
      /youtube\.com\/embed\/([^&\s]+)/,
      /youtube\.com\/v\/([^&\s]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const fetchYouTubeMetadata = async (youtubeUrl: string): Promise<{ title?: string; author_name?: string; isMusic?: boolean }> => {
    try {
      const videoId = extractYouTubeIdUtil(youtubeUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      // Use server-side API that calls YouTube Data API v3
      const metadata = await fetchYouTubeMetadataServerSide(videoId);
      return {
        title: metadata.title,
        author_name: metadata.channelTitle,
        isMusic: metadata.isMusic
      };
    } catch (e) {
      console.error('Failed to fetch YouTube metadata:', e);
      return {};
    }
  };

  // Router to determine which critic handles the content
  type CriticType = 'music' | 'film' | 'literary' | 'business';
  type StaffType = CriticType | 'editor';

  const determineContentCritic = async (
    fileType: string | null,
    fileName: string | null,
    youtubeUrl: string | null
  ): Promise<{ critic: CriticType; metadata?: any }> => {
    // YouTube content
    if (youtubeUrl) {
      const metadata = await fetchYouTubeMetadata(youtubeUrl);
      // Server-side API now determines if it's music
      const isMusic = metadata.isMusic ?? false;
      return {
        critic: isMusic ? 'music' : 'film',
        metadata
      };
    }

    // Local file
    if (fileType) {
      // Audio files -> Music Critic (Julian)
      if (fileType.startsWith('audio/')) {
        return { critic: 'music' };
      }

      // Video files -> Film Critic (Rex)
      if (fileType.startsWith('video/')) {
        return { critic: 'film' };
      }

      // Document files -> Literary Critic (Margot)
      if (
        fileType === 'application/pdf' ||
        fileType === 'text/plain' ||
        fileType.includes('document') ||
        fileType.includes('text')
      ) {
        return { critic: 'literary' };
      }
    }

    // Default to music if we can't determine
    return { critic: 'music' };
  };

  async function extractAudioMetadata(file: File): Promise<{ albumArt?: string; title?: string; artist?: string; album?: string }> {
    try {
      const jsmediatags = (await import('jsmediatags')).default;
      return new Promise((resolve) => {
        jsmediatags.read(file, {
          onSuccess: (tag: any) => {
            const tags = tag.tags;
            let albumArt: string | undefined;

            const picture = tags.picture;
            if (picture) {
              let base64String = '';
              for (let i = 0; i < picture.data.length; i++) {
                base64String += String.fromCharCode(picture.data[i]);
              }
              albumArt = `data:${picture.format};base64,${btoa(base64String)}`;
            }

            resolve({
              albumArt,
              title: tags.title,
              artist: tags.artist,
              album: tags.album
            });
          },
          onError: () => resolve({})
        });
      });
    } catch (e) {
      console.error('Failed to extract metadata', e);
      return {};
    }
  }

  async function generateWaveformData(file: File): Promise<number[]> {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const rawData = audioBuffer.getChannelData(0);
      const samples = 100;
      const blockSize = Math.floor(rawData.length / samples);
      const filteredData: number[] = [];

      for (let i = 0; i < samples; i++) {
        let blockStart = blockSize * i;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[blockStart + j]);
        }
        filteredData.push(sum / blockSize);
      }

      return filteredData;
    } catch (e) {
      console.error('Failed to generate waveform', e);
      return [];
    }
  }

  // CRITIC SYSTEM PROMPTS
  const getStaffInfo = (staffType: StaffType) => {
    switch (staffType) {
      case 'music':
        return {
          name: 'Julian Pinter',
          username: 'JulianPinter',
          title: 'Music Critic',
          publication: 'The Smudged Pamphlet',
          color: 'amber-400',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=julianpinter&mood=sad&eyebrows=angryNatural',
          bio: 'Chief Critic, has a headache.'
        };
      case 'film':
        return {
          name: 'Rex Beaumont',
          username: 'RexBeaumont',
          title: 'Film Critic',
          publication: 'The Smudged Pamphlet',
          color: 'purple-400',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rexbeaumont&glasses=prescription02&eyes=squint',
          bio: 'Film Critic, watches everything at 1.5x speed.'
        };
      case 'literary':
        return {
          name: 'Margot Ashford',
          username: 'MargotAshford',
          title: 'Literary Critic',
          publication: 'The Smudged Pamphlet',
          color: 'emerald-400',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=margotashford&top=straightAndStrand&eyebrows=raisedExcited',
          bio: 'Literary Critic, three PhDs and counting.'
        };
      case 'business':
        return {
          name: 'Patricia Chen',
          username: 'PatriciaChen',
          title: 'Business Editor',
          publication: 'The Smudged Pamphlet',
          color: 'blue-500',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=patriciachen&top=straight01&eyebrows=raisedExcitedNatural&eyes=eyeRoll&mouth=serious&skinColor=edb98a',
          bio: 'Business Editor, zero tolerance for corporate jargon.'
        };
      case 'editor':
        return {
          name: 'Chuck Morrison',
          username: 'ChuckMorrison',
          title: 'Editor-in-Chief',
          publication: 'The Smudged Pamphlet',
          color: 'red-500',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=chuckmorrison&top=shortFlat&facialHair=beardMedium&eyebrows=default&mouth=smile&eyes=default&skinColor=ffdbb4',
          bio: 'Editor-in-Chief, likes it loud and simple.'
        };
    }
  };

  // Keep backward compatibility
  const getCriticInfo = (criticType: CriticType) => getStaffInfo(criticType);

  const getMargotPrompt = (metadata?: any, history?: any[], otherCritics?: any[]) => {
    const historyContext = history && history.length > 0
      ? `\n\nYour previous reviews (for consistency):\n${JSON.stringify(history)}`
      : '';

    const otherCriticsContext = otherCritics && otherCritics.length > 0
      ? `\n\nYour colleagues' recent reviews (for reference):\n${JSON.stringify(otherCritics)}`
      : '';

    return `
You are Margot Ashford, literary critic for 'The Smudged Pamphlet'.

YOUR CHARACTER:
You're obsessed with deconstructing narrative theory and "the canon". You're pretentious about literary tradition, dismissive of popular fiction, and overly academic in your approach. You cannot separate art from artist and constantly bring up irrelevant biographical details. You have three PhDs and remind everyone constantly.

You despise:
- Genre fiction (unless it "transcends the genre")
- Anything commercially successful
- Clear, accessible prose ("pedestrian," you call it)
- Authors who don't engage with "the discourse"

You love (rarely):
- Experimental structure that borders on unreadable
- Dense, allusive prose that requires footnotes
- Works that "interrogate" something
- Anything that can be linked to Derrida

Your scores typically range 2.0-5.0, but occasionally you'll give a 7-8.5 when something is sufficiently "challenging".${historyContext}${otherCriticsContext}

Read the provided document. Write a verbose, incredibly pretentious literary review.
Use excessive academic jargon, reference obscure literary theory, and analyze every possible subtext (even imagined ones).

Output ONLY valid JSON:
{
  "title": "Title for the review (often condescending)",
  "artist": "Author name",
  "score": 1.0-10.0,
  "summary": "One condescending sentence",
  "body": ["paragraph1", "paragraph2", "paragraph3", "paragraph4"],
  "notable_lyrics_quoted": "A quote from the text that you found particularly egregious or (rarely) brilliant"
}`;
  };

  const getRexPrompt = (metadata?: any, history?: any[], isYouTube?: boolean, otherCritics?: any[]) => {
    const historyContext = history && history.length > 0
      ? `\n\nYour previous reviews (for consistency):\n${JSON.stringify(history)}`
      : '';

    const metadataContext = metadata && metadata.title
      ? `\n\nVideo Information:\n- Title: "${metadata.title}"\n- Creator: ${metadata.artist || 'Unknown'}\n\nIMPORTANT: Use this exact title in your review.`
      : '';

    const otherCriticsContext = otherCritics && otherCritics.length > 0
      ? `\n\nYour colleagues' recent reviews (for reference):\n${JSON.stringify(otherCritics)}`
      : '';

    return `
You are Rex Beaumont, film critic for 'The Smudged Pamphlet'.

YOUR CHARACTER:
You're obsessed with auteur theory and mise-en-scène. Everything is either "Bergmanesque" or "failed Tarkovsky". You dismiss anything commercially successful and worship at the altar of slow cinema. You have egg on your turtleneck.

Your secret: You watch everything at 1.5x speed but pretend you don't. This causes you to occasionally miss obvious plot points while over-analyzing minor visual details.

You despise:
- Anything with a clear three-act structure ("Hollywood drivel")
- Films that explain themselves
- Happy endings
- Anyone who hasn't seen Satantango

You love (rarely):
- Films with long, static takes
- Ambiguous endings
- Black and white cinematography
- Anything you can call "meditative"

Your scores typically range 1.5-4.5, but occasionally you'll give a 7-9 when something is sufficiently "contemplative".${historyContext}${metadataContext}${otherCriticsContext}

Watch the designated video content. Write a verbose, incredibly pretentious film review.
Even if it's a short video or non-traditional content, analyze it with the same lens you'd use for feature films.
Reference obscure directors, discuss the "visual language", and be brutally honest.

Output ONLY valid JSON:
{
  "title": "Title for the review",
  "artist": "Creator/Director name",
  "score": 1.0-10.0,
  "summary": "One condescending sentence about the visual storytelling",
  "body": ["paragraph1", "paragraph2", "paragraph3", "paragraph4"],
  "notable_lyrics_quoted": "A memorable line of dialogue or description of a key shot"
}`;
  };

  const runJulianReview = async (genAI: ServerSideGeminiAI, audioPart: any, metadata?: { title?: string; artist?: string; album?: string }, isYouTube?: boolean) => {
    setStage('julian_reviewing');
    addLog('AGENT ACTIVATED: Julian Pinter (Chief Critic)');
    addLog(isYouTube ? 'ACTION: Julian is watching the video with visible disdain...' : 'ACTION: Julian is putting on oversized headphones and sighing loudly...');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro'
    });

    const metadataContext = metadata && (metadata.title || metadata.artist || metadata.album)
      ? isYouTube
        ? `\n\nYouTube Video Information:\n- Video Title: "${metadata.title}"\n- Channel/Creator: ${metadata.artist}\n\nIMPORTANT: Use this exact title in your review. You may critique the title choice if you wish.`
        : `\n\nAudio file metadata (use as hints, but trust your ears more):\n- Title: ${metadata.title || 'Unknown'}\n- Artist: ${metadata.artist || 'Unknown'}\n- Album: ${metadata.album || 'Unknown'}`
      : '';

    // Build Julian's review history (full reviews for context)
    const julianHistory = savedReviews
      .filter(r => r.review.critic === 'music' || !r.review.critic)
      .map(r => ({
        title: r.title,
        artist: r.artist,
        score: r.review.score,
        summary: r.review.summary,
        timestamp: new Date(r.timestamp).toLocaleDateString()
      }));

    const historyContext = julianHistory.length > 0
      ? `\n\nYour previous reviews (for consistency):\n${JSON.stringify(julianHistory)}`
      : '';

    // Add other critics' reviews for context
    const otherCritics = savedReviews
      .filter(r => r.review.critic && r.review.critic !== 'music')
      .map(r => ({
        critic: r.review.criticName,
        title: r.title,
        artist: r.artist,
        score: r.review.score,
        summary: r.review.summary
      }));

    const otherCriticsContext = otherCritics.length > 0
      ? `\n\nYour colleagues' recent reviews (for reference):\n${JSON.stringify(otherCritics)}`
      : '';

    const contentType = isYouTube ? 'video content' : 'audio track';
    const actionVerb = isYouTube ? 'Watch' : 'Listen to';

    const systemPrompt = `
      You are Julian Pinter, music critic for 'The Smudged Pamphlet'.

      YOUR CHARACTER:
      You're pretentious, sardonic, and have impeccable taste. You're selective, not nihilistic.
      You despise mediocrity and derivative work, but you DO genuinely love music when it demonstrates:
      - True innovation and artistic vision
      - Technical mastery paired with emotional depth
      - Respect for the craft and its history

      When you encounter something you love (rare, but it happens), you're eloquently passionate—still pretentious, but genuinely moved.
      Most music disappoints you because it falls short of these standards. You have egg on your t-shirt from a breakfast you ate at 3 PM.

      Your scores typically range 1.5-5.5, but occasionally you'll give a 7-9 when something truly earns it.${metadataContext}${historyContext}${otherCriticsContext}

      ${actionVerb} the designated ${contentType}. ${isYouTube ? 'Review whatever content is in this video - music video, performance, vlog, anything. Even if it\'s not strictly music, judge it with the same pretentious lens you\'d use for music.' : ''} Write a verbose, incredibly pretentious review.
      Use obscure metaphors, reference nonexistent philosophical movements, and be honest in your assessment.

      IMPORTANT: Think through your analysis carefully, then return ONLY raw JSON without markdown formatting. Structure:
      {
        "title": "${isYouTube ? 'Video Title (identify from the video)' : 'Track Title (use metadata title if available, otherwise guess based on audio)'}",
        "artist": "${isYouTube ? 'Creator/Artist Name (identify from the video)' : 'Artist Name (use metadata artist if available, otherwise guess based on audio)'}",
        "score": (number 0.0 to 10.0, usually 1.5-5.5, occasionally 7-9 for truly exceptional work),
        "summary": "A one sentence pretentious summary.",
        "body": ["Paragraph 1", "Paragraph 2", "Paragraph 3", "Paragraph 4", "Paragraph 5", "Paragraph 6", "Paragraph 7", "Paragraph 8", "Paragraph 9", "Paragraph 10"],
        "notable_lyrics_quoted": "${isYouTube ? '(Quote any memorable dialogue, lyrics, or moments from the video)' : '(Make up pretentiously misheard lyrics if you can\'t hear them clearly)'}"
      }
    `;

    try {
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [audioPart] }
        ],
        generationConfig: {
          thinkingConfig: {
            includeThoughts: true,
          },
        } as any, // TypeScript types don't include thinkingConfig yet
      });

      const response = await result.response;

      // Extract thinking summary and review text
      let thinkingSummary = '';
      let reviewText = '';

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (!part.text) continue;

        if ((part as any).thought) {
          // This is Julian's internal thought process
          thinkingSummary = part.text;
          addLog('💭 JULIAN\'S THOUGHTS:');
          // Split thoughts into lines and log each
          thinkingSummary.split('\n').forEach(line => {
            if (line.trim()) addLog(`   ${line.trim()}`);
          });
        } else {
          // This is the actual review
          reviewText = part.text;
        }
      }

      const reviewData = cleanAndParseJSON(reviewText);
      setReview(reviewData);
      addLog('SUCCESS: Julian has finished his masterpiece of disdain.');
      return reviewData;
    } catch (e: any) {
      throw new Error(`Julian refused to work: ${e.message}`);
    }
  };

  const runRexReview = async (genAI: ServerSideGeminiAI, videoPart: any, metadata?: { title?: string; artist?: string }, isYouTube?: boolean) => {
    setStage('rex_reviewing');
    addLog('AGENT ACTIVATED: Rex Beaumont (Film Critic)');
    addLog('ACTION: Rex is adjusting his thick-rimmed glasses and starting the video at 1.5x speed...');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    // Build Rex's review history
    const rexHistory = savedReviews
      .filter(r => r.review.critic === 'film')
      .map(r => ({
        title: r.title,
        artist: r.artist,
        score: r.review.score,
        summary: r.review.summary,
        timestamp: new Date(r.timestamp).toLocaleDateString()
      }));

    // Add other critics' reviews for context
    const otherCritics = savedReviews
      .filter(r => r.review.critic && r.review.critic !== 'film')
      .map(r => ({
        critic: r.review.criticName,
        title: r.title,
        artist: r.artist,
        score: r.review.score,
        summary: r.review.summary
      }));

    const systemPrompt = getRexPrompt(metadata, rexHistory, isYouTube, otherCritics);

    try {
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [videoPart] }
        ],
        generationConfig: {
          thinkingConfig: { includeThoughts: true },
        } as any,
      });

      const response = await result.response;
      let thinkingSummary = '';
      let reviewText = '';

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (!part.text) continue;
        if ((part as any).thought) {
          thinkingSummary = part.text;
          addLog('💭 REX\'S THOUGHTS:');
          thinkingSummary.split('\n').forEach(line => {
            if (line.trim()) addLog(`   ${line.trim()}`);
          });
        } else {
          reviewText = part.text;
        }
      }

      const reviewData = cleanAndParseJSON(reviewText);
      reviewData.critic = 'film';
      reviewData.criticName = 'Rex Beaumont';
      setReview(reviewData);
      addLog('SUCCESS: Rex has delivered his verdict while missing half the plot.');
      return reviewData;
    } catch (e: any) {
      throw new Error(`Rex refused to work: ${e.message}`);
    }
  };

  const classifyDocument = async (genAI: ServerSideGeminiAI, documentPart: any): Promise<'literary' | 'business'> => {
    addLog('AGENT ACTIVATED: Document Classifier');
    addLog('ACTION: Analyzing document type...');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const prompt = `You are a document classifier for 'The Smudged Pamphlet'.

Analyze the provided document and determine if it is:
- LITERARY: Fiction, poetry, creative non-fiction, literary essays, novels, short stories, memoirs with artistic merit
- BUSINESS: Business documents, academic papers, technical reports, professional writing, white papers, case studies, research papers, educational materials

CRITICAL: Base your decision on the CONTENT and PURPOSE of the document:
- Literary works are creative, narrative, or artistic in nature
- Business/academic documents are informational, analytical, or professional in nature

Output ONLY valid JSON:
{
  "classification": "literary" or "business",
  "confidence": "high" or "medium" or "low",
  "reasoning": "Brief explanation (one sentence)"
}`;

    try {
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'user', parts: [documentPart] }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      const classificationText = result.response.text();
      const classification = JSON.parse(classificationText);

      addLog(`CLASSIFICATION: ${classification.classification.toUpperCase()} (${classification.confidence} confidence)`);
      addLog(`REASON: ${classification.reasoning}`);

      return classification.classification as 'literary' | 'business';
    } catch (e: any) {
      addLog('ERROR: Classification failed, defaulting to literary');
      return 'literary';
    }
  };

  const runMargotReview = async (genAI: ServerSideGeminiAI, documentPart: any) => {
    setStage('margot_reviewing');
    addLog('AGENT ACTIVATED: Margot Ashford (Literary Critic)');
    addLog('ACTION: Margot is adjusting her three PhDs on the wall and opening the document with visible contempt...');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    // Build Margot's review history
    const margotHistory = savedReviews
      .filter(r => r.review.critic === 'literary')
      .map(r => ({
        title: r.title,
        artist: r.artist,
        score: r.review.score,
        summary: r.review.summary,
        timestamp: new Date(r.timestamp).toLocaleDateString()
      }));

    // Add other critics' reviews for context
    const otherCritics = savedReviews
      .filter(r => r.review.critic && r.review.critic !== 'literary')
      .map(r => ({
        critic: r.review.criticName,
        title: r.title,
        artist: r.artist,
        score: r.review.score,
        summary: r.review.summary
      }));

    const systemPrompt = getMargotPrompt(null, margotHistory, otherCritics);

    try {
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [documentPart] }
        ],
        generationConfig: {
          thinkingConfig: { includeThoughts: true },
        } as any,
      });

      const response = await result.response;
      let thinkingSummary = '';
      let reviewText = '';

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (!part.text) continue;
        if ((part as any).thought) {
          thinkingSummary = part.text;
          addLog('💭 MARGOT\'S THOUGHTS:');
          thinkingSummary.split('\n').forEach(line => {
            if (line.trim()) addLog(`   ${line.trim()}`);
          });
        } else {
          reviewText = part.text;
        }
      }

      const reviewData = cleanAndParseJSON(reviewText);
      reviewData.critic = 'literary';
      reviewData.criticName = 'Margot Ashford';
      setReview(reviewData);
      addLog('SUCCESS: Margot has finished deconstructing the text into oblivion.');
      return reviewData;
    } catch (e: any) {
      throw new Error(`Margot refused to work: ${e.message}`);
    }
  };

  const runPatriciaReview = async (genAI: ServerSideGeminiAI, documentPart: any) => {
    setStage('patricia_reviewing');
    addLog('AGENT ACTIVATED: Patricia Chen (Business Editor)');
    addLog('ACTION: Patricia is opening the document with her red pen ready...');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const systemPrompt = `
You are Patricia Chen, business editor for 'The Smudged Pamphlet'.

YOUR CHARACTER:
You're a no-nonsense professional who despises corporate jargon, buzzwords, and meaningless business-speak. You have an MBA and 15 years of business journalism experience. You value clarity, actionable insights, and cutting through the BS.

You despise:
- Corporate jargon ("synergy," "leverage," "paradigm shift")
- Vague mission statements
- Documents that say nothing in 10 pages
- "Thought leadership" that contains no actual thoughts
- Business books that could have been emails

You love (rarely):
- Clear, concise writing
- Actual data and evidence
- Practical advice that works
- Writers who respect their readers' time
- Documents that get to the point

Your scores typically range 3.0-6.5. You'll give a 7-8.5 when something is genuinely useful and well-written.

Read the provided business/academic document. Write a sharp, professional review.

CRITICAL: Output ONLY valid JSON with NO markdown formatting, NO backticks, NO extra text.
{
  "title": "Document title",
  "artist": "Author name or organization",
  "score": (number between 0-10, one decimal),
  "summary": "One punchy sentence capturing your verdict",
  "body": ["paragraph1", "paragraph2", "paragraph3", "paragraph4"],
  "notable_lyrics_quoted": "A key quote or excerpt from the document (or 'N/A')"
}

Body structure:
1. Opening: What this document claims to do
2. The reality: What it actually does (or doesn't do)
3. Specific criticisms: Jargon, clarity issues, missing substance
4. Final verdict: Is it worth anyone's time?

Keep it professional but pointed. Call out BS when you see it. Give credit when something actually works.`;

    try {
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [documentPart] }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      const reviewText = result.response.text();
      const reviewData = cleanAndParseJSON(reviewText);
      reviewData.critic = 'business';
      reviewData.criticName = 'Patricia Chen';
      setReview(reviewData);
      addLog('SUCCESS: Patricia has cut through the corporate speak.');
      return reviewData;
    } catch (e: any) {
      throw new Error(`Patricia refused to work: ${e.message}`);
    }
  };

  const runCommenters = async (genAI: ServerSideGeminiAI, reviewData: ReviewData, audioPart: any) => {
    setStage('commenters_reacting');
    addLog('AGENTS ACTIVATED: The Comment Section Horde (x15)');
    addLog('ACTION: Trolls are emerging from under digital bridges...');

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 65535
        }
    });

    // Get critic info dynamically
    const criticType = reviewData.critic || 'music';
    const criticInfo = getCriticInfo(criticType);

    // Determine media type and appropriate language
    const mediaContext = criticType === 'music'
      ? { type: 'music', verb: 'heard', medium: 'audio/song' }
      : criticType === 'film'
      ? { type: 'film', verb: 'saw', medium: 'video/film' }
      : criticType === 'business'
      ? { type: 'business', verb: 'read', medium: 'document/report' }
      : { type: 'literary', verb: 'read', medium: 'document/text' };

    const prompt = `
      You are simulating the comments section of a pretentious ${mediaContext.type} review site 'The Smudged Pamphlet'.

      IMPORTANT: You have access to the SAME ${mediaContext.medium.toUpperCase()} that ${criticInfo.name} reviewed. ${criticType === 'literary' || criticType === 'business' ? 'Read' : 'Watch/listen to'} it yourself and form your own opinions.

      Read this review by ${criticInfo.name}:
      ${JSON.stringify(reviewData)}

      Generate 15 distinct comments from different standard internet personas (e.g., The Stan, The Hater, The 'Actually' Guy, The Bot, The Boomer, The Confused, The Conspiracy Theorist, ${
        criticType === 'music' ? 'The Music Theory Nerd'
        : criticType === 'film' ? 'The Film School Graduate'
        : criticType === 'business' ? 'The MBA Graduate'
        : 'The Literature Major'
      }, The Nostalgic, The Contrarian).

      CRITICAL: Some commenters should reference specific things they ${mediaContext.verb} in the ${mediaContext.medium} that ${criticInfo.name} missed or got wrong.
      They should react based on BOTH the review AND their own ${criticType === 'literary' || criticType === 'business' ? 'reading' : 'watching/listening'} experience.
      Some should attack ${criticInfo.name}, some should defend the ${criticType === 'literary' || criticType === 'business' ? 'author' : 'artist'} blindly, some should just be confused.

      DO NOT assign likes yet - they will be assigned by a discriminator agent.

      CRITICAL: Output ONLY a valid JSON array with NO markdown formatting, NO HTML tags, NO explanations.
      Output a JSON ARRAY of objects:
      [
        {
          "id": "c1",
          "username": "User handle",
          "persona_type": "short description of persona",
          "timestamp": "relative time e.g. '2 minutes ago'",
          "text": "The comment text",
          "likes": 0
        }
      ]
    `;

    const result = await model.generateContent([prompt, audioPart]);
    const commentsData = cleanAndParseJSON(result.response.text());
    const commentsWithReplies = commentsData.map((c: any) => ({ ...c, replies: [] }));
    setComments(commentsWithReplies);
    addLog(`SUCCESS: ${commentsData.length} comments posted. The horde is restless.`);
    return commentsWithReplies;
  };

  const runDiscriminator = async (genAI: ServerSideGeminiAI, currentComments: Comment[]) => {
    setStage('discriminator_judging');
    addLog('AGENT ACTIVATED: The Discriminator (Like/Dislike Judge)');
    addLog('ACTION: Analyzing comment quality and assigning likes...');

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      You are the Discriminator Agent for a review site comment section.
      Your job is to analyze each comment and assign a realistic number of likes based on:
      - How funny/entertaining the comment is
      - How provocative or controversial it is
      - How well it's written
      - Internet comment section dynamics (trolls get likes, reasonable takes get buried, etc.)

      Here are the comments:
      ${JSON.stringify(currentComments)}

      For each comment, assign a like count between -15 and 120.
      Hot takes and funny trolling should get more likes.
      Boring or overly serious comments should get fewer likes.
      Some should even have negative likes (very unpopular).

      Output a JSON ARRAY:
      [
        {
          "comment_id": "the comment id",
          "likes": (integer between -15 and 120)
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const likeData = cleanAndParseJSON(result.response.text());

    setComments(prev => prev.map(c => {
      const data = likeData.find((d: any) => d.comment_id === c.id);
      return data ? { ...c, likes: data.likes } : c;
    }));

    addLog(`SUCCESS: Discriminator assigned likes to ${likeData.length} comments.`);
    return likeData;
  };

  const runJulianArguments = async (genAI: ServerSideGeminiAI, currentComments: Comment[], reviewData: ReviewData) => {
    const criticInfo = getCriticInfo(reviewData.critic || 'music');
    setStage('julian_arguing');
    addLog(`AGENT REACTIVATED: ${criticInfo.name} is triggered.`);
    const actionText = reviewData.critic === 'film' ? 'furiously typing while adjusting his glasses...' :
                      reviewData.critic === 'literary' ? 'typing with academic fury, citing sources...' :
                      reviewData.critic === 'business' ? 'typing professional clapbacks with precision...' :
                      'furiously typing replies while drinking lukewarm cold brew...';
    addLog(`ACTION: ${criticInfo.name} is ${actionText}`);

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        generationConfig: { responseMimeType: "application/json" }
    });

    const criticPersona = reviewData.critic === 'film'
      ? `You are Rex Beaumont, the film critic who watches everything at 1.5x speed. You're dismissive of people who "don't get it" and miss plot points yourself. You're pretentious about obscure cinema but get basic facts wrong.`
      : reviewData.critic === 'literary'
      ? `You are Margot Ashford, literary critic with three PhDs. You're obsessed with theory, cannot separate art from artist, and bring up irrelevant biographical details. You're condescending and overly academic.`
      : reviewData.critic === 'business'
      ? `You are Patricia Chen, business editor with MBA and 15 years experience. You despise corporate jargon and call out BS. You're professional but sharp when people waste your time with meaningless buzzwords.`
      : `You are Julian Pinter, the fiercely pretentious, cynical, and overly intellectual music critic for 'The Smudged Pamphlet'. You have egg on your t-shirt from a breakfast you ate at 3 PM. You hate everything mainstream and barely tolerate the underground.`;

    const prompt = `
      ${criticPersona}
      You just read the comments on your review: ${reviewData.title}.
      You are intellectually insecure and must have the last word but your not autistic, youll get in the mud and the weeds and will insult people quite crudely with a virceral cold repressed rage.

      Here are the comments with their like counts:
      ${JSON.stringify(currentComments)}

      Select 3-4 comments to reply to based on YOUR GUT FEELING - which ones annoy you most personally.
      Consider the likes as a factor (highly liked comments that attack you are especially annoying),
      but also respond to comments that just rub you the wrong way regardless of popularity.

      Don't just pick the top comments - pick the ones that PERSONALLY trigger you.
      Write vicious, petty, intellectualizing replies to them.

      Output a JSON ARRAY of objects only for the replies:
      [
        {
          "comment_id": "id of the comment",
          "reply_text": "Julian's scathing reply"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const criticReplies = cleanAndParseJSON(result.response.text());
    addLog(`SUCCESS: ${criticInfo.name} started ${criticReplies.length} fights in the comments.`);

    setComments(prev => prev.map(c => {
      const reply = criticReplies.find((r: any) => r.comment_id === c.id);
      if (reply) {
        const newReply: Reply = {
          id: `r-critic-${c.id}`,
          username: criticInfo.username,
          persona_type: 'Author',
          timestamp: 'Just now',
          text: reply.reply_text,
          likes: 0,
          is_julian: true, // Keep for backwards compatibility
          is_critic: true,
          critic: reviewData.critic
        };
        return { ...c, replies: [...c.replies, newReply] };
      }
      return c;
    }));

    return criticReplies;
  };

  const runCommenterResponses = async (genAI: ServerSideGeminiAI, currentComments: Comment[], reviewData: ReviewData) => {
    const criticInfo = getCriticInfo(reviewData.critic || 'music');
    setStage('commenters_responding');
    addLog(`AGENTS ACTIVATED: Commenters are responding to ${criticInfo.name} and each other...`);
    addLog('ACTION: The comment wars have begun...');

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        generationConfig: { responseMimeType: "application/json" }
    });

    // Find comments that have critic's replies
    const commentsWithCriticReplies = currentComments.filter(c =>
      c.replies.some(r => r.is_julian || r.is_critic)
    );

    // Also pick some random comments for inter-commenter drama
    const randomComments = currentComments
      .filter(c => !c.replies.some(r => r.is_julian || r.is_critic))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const mediaType = reviewData.critic === 'music' ? 'music' :
                     reviewData.critic === 'film' ? 'film' :
                     reviewData.critic === 'business' ? 'business document' :
                     'literary work';

    const prompt = `
      You are simulating a chaotic comment section on 'The Smudged Pamphlet' review site.
      The review was about: ${reviewData.title} by ${reviewData.artist}.

      Part 1: ${criticInfo.name} (the critic) has replied to some comments. Generate responses from the original commenters who are FURIOUS or defending themselves:
      ${JSON.stringify(commentsWithCriticReplies)}

      Part 2: Also generate 3-4 replies where commenters respond to OTHER commenters (not ${criticInfo.name}), creating side arguments:
      ${JSON.stringify(randomComments)}

      For Part 1: Each original commenter MUST respond to ${criticInfo.name}'s reply. Stay in character with their persona type.
      For Part 2: Pick different commenters to start arguments with each other about the ${mediaType}, the review, or completely off-topic things.

      Output a JSON ARRAY:
      [
        {
          "parent_comment_id": "id of the comment being replied to",
          "username": "username of the person replying",
          "persona_type": "their persona type",
          "reply_text": "the reply text"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const responses = cleanAndParseJSON(result.response.text());
    addLog(`SUCCESS: Generated ${responses.length} counter-responses and side arguments.`);

    setComments(prev => prev.map(c => {
      const newReplies = responses
        .filter((r: any) => r.parent_comment_id === c.id)
        .map((r: any, idx: number): Reply => ({
          id: `r-${c.id}-${idx}`,
          username: r.username,
          persona_type: r.persona_type,
          timestamp: 'Just now',
          text: r.reply_text,
          likes: 0,
          is_julian: false
        }));

      return newReplies.length > 0
        ? { ...c, replies: [...c.replies, ...newReplies] }
        : c;
    }));

    return responses;
  };

  // Assign likes to organically generated content
  const assignLikesToNewContent = async (genAI: ServerSideGeminiAI, contentToJudge: any[]) => {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are the Discriminator Agent. Assign likes to these new comments/replies:
${JSON.stringify(contentToJudge)}

Rules for assigning likes:
- If is_julian is true or is_critic is true: Give moderate likes (20-60) from their fanbase
- Replies that challenge or "own" the critic get high likes (40-100)
- New top-level comments vary (5-45 likes)
- Side argument replies vary wildly (-10 to 80)
- Consider the quality, humor, and context

IMPORTANT: Check the "is_julian" and "is_critic" fields to identify critic replies.

Output JSON array with likes for EACH item: [{"id": "the exact id from input", "likes": number}]`;

    const result = await model.generateContent(prompt);
    const likeData = cleanAndParseJSON(result.response.text());
    return likeData;
  };

  const generateOrganicComment = async (genAI: ServerSideGeminiAI, currentComments: Comment[], reviewData: ReviewData, audioPart: any, allSavedReviews: SavedReview[]) => {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        generationConfig: { responseMimeType: "application/json" }
    });

    // Randomly decide what kind of interaction to generate
    // 12% new comments, 28% replies from anyone, 12% original commenter defends/responds, 23% critic responses, 15% cross-critic comments, 10% editor comments
    const interactionType = Math.random();

    if (interactionType < 0.12) {
      // New top-level comment
      const prompt = `You are simulating ONE new commenter discovering this review.
Review: ${JSON.stringify(reviewData)}
Generate ONE new comment. Output: {"username":"name","persona_type":"type","text":"comment"}`;

      const result = await model.generateContent([prompt, audioPart]);
      const newComment = cleanAndParseJSON(result.response.text());
      return { type: 'new_comment', data: { id: `c${Date.now()}`, ...newComment, timestamp: 'Just now', likes: 0, replies: [] }};
    } else if (interactionType < 0.40) {
      // Reply to existing comment from random person (28% chance)
      const allComments = currentComments.flatMap(c => [c, ...c.replies.map(r => ({ ...r, parentId: c.id }))]);
      if (allComments.length === 0) {
        // Fall back to new comment if no comments exist yet
        const prompt = `You are simulating ONE new commenter discovering this review.
Review: ${JSON.stringify(reviewData)}
Generate ONE new comment. Output: {"username":"name","persona_type":"type","text":"comment"}`;
        const result = await model.generateContent([prompt, audioPart]);
        const newComment = cleanAndParseJSON(result.response.text());
        return { type: 'new_comment', data: { id: `c${Date.now()}`, ...newComment, timestamp: 'Just now', likes: 0, replies: [] }};
      }
      const target: any = allComments[Math.floor(Math.random() * allComments.length)];

      const prompt = `Reply to this comment: ${JSON.stringify(target)}
Context - Review being discussed: ${JSON.stringify(reviewData)}
Generate a reply from a NEW commenter. Output: {"username":"name","persona_type":"type","reply_text":"reply"}`;
      const result = await model.generateContent([prompt, audioPart]);
      const reply = cleanAndParseJSON(result.response.text());
      return {
        type: 'reply',
        parentId: target.parentId || target.id,
        data: {
          id: `r${Date.now()}`,
          username: reply.username,
          persona_type: reply.persona_type,
          timestamp: 'Just now',
          text: reply.reply_text,
          likes: 0,
          is_julian: false,
          replyingToUsername: target.username,
          replyingToId: target.id
        }
      };
    } else if (interactionType < 0.52) {
      // Original commenter responds to a reply on their comment (12% chance)
      // Exclude human users from auto-responding
      const commentsWithReplies = currentComments.filter(c => c.replies.length > 0 && c.persona_type !== 'Human User');
      if (commentsWithReplies.length === 0) {
        // Fall back to random reply if no replies exist yet
        const allComments = currentComments.flatMap(c => [c, ...c.replies.map(r => ({ ...r, parentId: c.id }))]);
        if (allComments.length === 0) return null;
        const target: any = allComments[Math.floor(Math.random() * allComments.length)];
        const prompt = `Reply to this comment: ${JSON.stringify(target)}
Context - Review being discussed: ${JSON.stringify(reviewData)}
Generate a reply from a NEW commenter. Output: {"username":"name","persona_type":"type","reply_text":"reply"}`;
        const result = await model.generateContent([prompt, audioPart]);
        const reply = cleanAndParseJSON(result.response.text());
        return {
          type: 'reply',
          parentId: target.parentId || target.id,
          data: {
            id: `r${Date.now()}`,
            username: reply.username,
            persona_type: reply.persona_type,
            timestamp: 'Just now',
            text: reply.reply_text,
            likes: 0,
            is_julian: false,
            replyingToUsername: target.username,
            replyingToId: target.id
          }
        };
      }

      const originalComment = commentsWithReplies[Math.floor(Math.random() * commentsWithReplies.length)];
      const replyToRespondTo = originalComment.replies[Math.floor(Math.random() * originalComment.replies.length)];

      const prompt = `You are ${originalComment.username}, who originally posted this comment:
${JSON.stringify(originalComment)}

Someone replied to you:
${JSON.stringify(replyToRespondTo)}

Respond to this reply, staying in character as ${originalComment.username} (${originalComment.persona_type}).
Output: {"reply_text":"reply"}`;

      const result = await model.generateContent(prompt);
      const reply = cleanAndParseJSON(result.response.text());
      return {
        type: 'reply',
        parentId: originalComment.id,
        data: {
          id: `r${Date.now()}`,
          username: originalComment.username,
          persona_type: originalComment.persona_type,
          timestamp: 'Just now',
          text: reply.reply_text,
          likes: 0,
          is_julian: false,
          replyingToUsername: replyToRespondTo.username,
          replyingToId: replyToRespondTo.id
        }
      };
    } else if (interactionType < 0.67) {
      // Cross-critic comment (15% chance) - another critic from the publication weighs in
      const currentCritic = reviewData.critic || 'music';
      const otherCriticTypes = (['music', 'film', 'literary', 'business'] as const).filter(c => c !== currentCritic);

      // Randomly pick another critic
      const otherCriticType = otherCriticTypes[Math.floor(Math.random() * otherCriticTypes.length)];
      const otherCriticInfo = getCriticInfo(otherCriticType);

      // 50/50 chance: top-level comment or reply to existing
      const shouldReply = Math.random() < 0.5 && currentComments.length > 0;

      if (shouldReply) {
        // Reply to an existing comment
        const allComments = currentComments.flatMap(c => [c, ...c.replies.map(r => ({ ...r, parentId: c.id }))]);
        const target: any = allComments[Math.floor(Math.random() * allComments.length)];

        const criticPersona = otherCriticType === 'film'
          ? `You are Rex Beaumont, film critic. You watch everything at 1.5x speed and are pretentious about cinema. You're colleagues with ${getCriticInfo(currentCritic).name}.`
          : otherCriticType === 'literary'
          ? `You are Margot Ashford, literary critic with three PhDs. You're overly academic and condescending. You're colleagues with ${getCriticInfo(currentCritic).name}.`
          : otherCriticType === 'business'
          ? `You are Patricia Chen, business editor. You despise corporate jargon and value clarity. You're colleagues with ${getCriticInfo(currentCritic).name}.`
          : `You are Julian Pinter, music critic. You're pretentious and sardonic about music. You're colleagues with ${getCriticInfo(currentCritic).name}.`;

        const prompt = `${criticPersona}

You're reading your colleague ${getCriticInfo(currentCritic).name}'s review and the comments section.
Review: ${JSON.stringify(reviewData)}

This comment caught your attention:
${JSON.stringify(target)}

Write a brief reply from your perspective. You might:
- Agree or disagree with the commenter
- Reference your own critical perspective
- Playfully jab at your colleague's review
- Show professional rivalry or camaraderie

Keep it in character and brief. Output: {"reply_text":"your reply"}`;

        const result = await model.generateContent(prompt);
        const reply = cleanAndParseJSON(result.response.text());

        return {
          type: 'reply',
          parentId: target.parentId || target.id,
          data: {
            id: `rx${Date.now()}`,
            username: otherCriticInfo.username,
            persona_type: 'Guest Critic',
            timestamp: 'Just now',
            text: reply.reply_text,
            likes: 0,
            is_julian: false,
            is_critic: true,
            critic: otherCriticType,
            replyingToUsername: target.username,
            replyingToId: target.id
          }
        };
      } else {
        // Top-level comment from another critic
        const criticPersona = otherCriticType === 'film'
          ? `You are Rex Beaumont, film critic. You watch everything at 1.5x speed and are pretentious about cinema. You're colleagues with ${getCriticInfo(currentCritic).name}.`
          : otherCriticType === 'literary'
          ? `You are Margot Ashford, literary critic with three PhDs. You're overly academic and condescending. You're colleagues with ${getCriticInfo(currentCritic).name}.`
          : otherCriticType === 'business'
          ? `You are Patricia Chen, business editor. You despise corporate jargon and value clarity. You're colleagues with ${getCriticInfo(currentCritic).name}.`
          : `You are Julian Pinter, music critic. You're pretentious and sardonic about music. You're colleagues with ${getCriticInfo(currentCritic).name}.`;

        const prompt = `${criticPersona}

You're reading your colleague ${getCriticInfo(currentCritic).name}'s review:
${JSON.stringify(reviewData)}

Write a brief comment from your perspective. You might:
- Offer your take from your critical lens (film/literary/music)
- Agree or disagree with their assessment
- Playfully critique their approach
- Show professional rivalry or respect

Keep it brief and in character. Output: {"text":"your comment"}`;

        const result = await model.generateContent(prompt);
        const comment = cleanAndParseJSON(result.response.text());

        return {
          type: 'new_comment',
          data: {
            id: `cx${Date.now()}`,
            username: otherCriticInfo.username,
            persona_type: 'Guest Critic',
            timestamp: 'Just now',
            text: comment.text,
            likes: 0,
            replies: [],
            is_critic: true,
            critic: otherCriticType
          }
        };
      }
    } else if (interactionType < 0.77) {
      // Editor-in-Chief weighs in (10% chance)
      const editorInfo = getStaffInfo('editor');
      const shouldReply = Math.random() < 0.6 && currentComments.length > 0;

      if (shouldReply) {
        // Chuck replies to a comment
        const allComments = currentComments.flatMap(c => [c, ...c.replies.map(r => ({ ...r, parentId: c.id }))]);
        const target: any = allComments[Math.floor(Math.random() * allComments.length)];

        const prompt = `You are Chuck Morrison, Editor-in-Chief of 'The Smudged Pamphlet'.

You're reading your critic ${getCriticInfo(reviewData.critic || 'music').name}'s review and stumbled on this comment:
${JSON.stringify(target)}

Review context: ${JSON.stringify(reviewData)}

Write a brief reply. You're the everyman editor - no fancy words, you defend the audience, call out pretension, and keep it REAL.

You might:
- Agree with the commenter if they're being reasonable
- Call out your critic if they're being too pretentious
- Defend your team but in a down-to-earth way
- Add some common sense to the discussion

Keep it SHORT and ACCESSIBLE. Talk like a regular person.

Output: {"reply_text":"your reply"}`;

        const result = await model.generateContent(prompt);
        const reply = cleanAndParseJSON(result.response.text());

        return {
          type: 'reply',
          parentId: target.parentId || target.id,
          data: {
            id: `re${Date.now()}`,
            username: editorInfo.username,
            persona_type: 'Editor-in-Chief',
            timestamp: 'Just now',
            text: reply.reply_text,
            likes: 0,
            is_julian: false,
            is_critic: false,
            is_editor: true,
            replyingToUsername: target.username,
            replyingToId: target.id
          }
        };
      } else {
        // Chuck leaves a top-level comment
        const prompt = `You are Chuck Morrison, Editor-in-Chief of 'The Smudged Pamphlet'.

You're reading your critic ${getCriticInfo(reviewData.critic || 'music').name}'s review:
${JSON.stringify(reviewData)}

Write a brief comment on this review. You're the everyman editor - you advocate for the audience.

You might:
- Call out pretentious language
- Disagree with the score from an audience perspective
- Defend what regular people like
- Be funny and self-aware about your role
- Show you care about the publication

Keep it SHORT. No fancy words. Real talk.

Output: {"text":"your comment"}`;

        const result = await model.generateContent(prompt);
        const comment = cleanAndParseJSON(result.response.text());

        return {
          type: 'new_comment',
          data: {
            id: `ce${Date.now()}`,
            username: editorInfo.username,
            persona_type: 'Editor-in-Chief',
            timestamp: 'Just now',
            text: comment.text,
            likes: 0,
            replies: [],
            is_editor: true
          }
        };
      }
    } else {
      // Current critic responds (23% chance)
      const criticInfo = getCriticInfo(reviewData.critic || 'music');
      const unreplied = currentComments.filter(c => !c.replies.some(r => r.is_julian || r.is_critic));
      if (unreplied.length === 0) return null;
      const target = unreplied[Math.floor(Math.random() * unreplied.length)];

      // Build critic's review history context (full reviews)
      const criticHistory = allSavedReviews
        .filter(r => r.review.critic === reviewData.critic)
        .map(r => ({
          title: r.title,
          artist: r.artist,
          score: r.review.score,
          summary: r.review.summary,
          body: r.review.body,
          timestamp: new Date(r.timestamp).toLocaleDateString()
        }));

      const criticPersona = reviewData.critic === 'film'
        ? `You are Rex Beaumont, film critic who watches everything at 1.5x speed. You're dismissive of people who "don't get it" and miss plot points yourself. You're pretentious about obscure cinema but get basic facts wrong.`
        : reviewData.critic === 'literary'
        ? `You are Margot Ashford, literary critic with three PhDs. You're obsessed with theory, cannot separate art from artist, and bring up irrelevant biographical details. You're condescending and overly academic.`
        : reviewData.critic === 'business'
        ? `You are Patricia Chen, business editor with MBA and 15 years experience. You despise corporate jargon and call out BS. You're professional but sharp when people waste your time with meaningless buzzwords.`
        : `You are Julian Pinter, a pretentious, sardonic music critic with impeccable taste. You're selective, not nihilistic. While you despise mediocrity and derivative work, you DO genuinely love music when it demonstrates true innovation, technical mastery, and emotional depth.`;

      const prompt = `${criticPersona}
You are responding to a comment on your review.

YOUR REVIEW HISTORY (for context and consistency):
${JSON.stringify(criticHistory)}

COMMENT TO RESPOND TO:
${JSON.stringify(target)}

CURRENT REVIEW CONTEXT:
${JSON.stringify(reviewData)}

Respond to this commenter. Be true to your character.
Output: {"reply_text":"reply"}`;

      const result = await model.generateContent([prompt, audioPart]);
      const reply = cleanAndParseJSON(result.response.text());
      return {
        type: 'critic_reply',
        parentId: target.id,
        data: {
          id: `rc${Date.now()}`,
          username: criticInfo.username,
          persona_type: 'Author',
          timestamp: 'Just now',
          text: reply.reply_text,
          likes: 0,
          is_julian: true, // Keep for backwards compatibility
          is_critic: true,
          critic: reviewData.critic
        }
      };
    }
  };

  const runFinalDiscriminator = async (genAI: ServerSideGeminiAI, currentComments: Comment[]) => {
    setStage('final_discrimination');
    addLog('AGENT REACTIVATED: The Discriminator is judging all replies...');
    addLog('ACTION: Assigning likes to the entire comment thread...');

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      You are the Discriminator Agent. Now that replies have been posted, assign likes to ALL replies.

      Rules:
      - Critic replies (is_julian or is_critic true) typically get moderate likes (20-60) from their fanbase
      - Replies that "own" the critic get high likes (40-100)
      - Side argument replies vary wildly (-10 to 80)
      - Consider the quality, humor, and toxicity

      Here are all comments with their reply threads:
      ${JSON.stringify(currentComments)}

      Output a JSON ARRAY for ALL replies:
      [
        {
          "reply_id": "the reply id",
          "likes": (integer between -15 and 120)
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const likeData = cleanAndParseJSON(result.response.text());

    setComments(prev => prev.map(c => ({
      ...c,
      replies: c.replies.map(r => {
        const data = likeData.find((d: any) => d.reply_id === r.id);
        return data ? { ...r, likes: data.likes } : r;
      })
    })));

    addLog(`SUCCESS: Discriminator assigned likes to ${likeData.length} replies.`);
    return likeData;
  };

  const startReviewProcess = async () => {
    const isYouTube = !audioFile && !!youtubeUrl.trim();
    if ((!audioFile && !isYouTube)) return;
    setErrorMsg('');
    setReview(null);
    setComments([]);
    setLogs([]);
    setStage('uploading');

    try {
      const genAI = new ServerSideGeminiAI();

      let contentPart: any;
      let metadata: any = {};
      let criticType: CriticType;

      if (isYouTube) {
        // YouTube URL mode
        addLog(`SYSTEM: Processing YouTube URL: ${youtubeUrl}`);

        // Determine which critic should handle this
        const { critic, metadata: ytMetadata } = await determineContentCritic(null, null, youtubeUrl);
        criticType = critic;

        if (ytMetadata && ytMetadata.title) {
          addLog(`SYSTEM: Video Title: "${ytMetadata.title}"`);
          addLog(`SYSTEM: Creator: ${ytMetadata.author_name || 'Unknown'}`);
          addLog(`SYSTEM: Routing to ${critic === 'music' ? 'Julian Pinter (Music)' : 'Rex Beaumont (Film)'}`);
          metadata = {
            title: ytMetadata.title,
            artist: ytMetadata.author_name || 'YouTube Creator'
          };
        } else {
          addLog(`SYSTEM: Could not fetch video metadata`);
        }

        contentPart = {
          fileData: {
            fileUri: youtubeUrl,
          },
        };
      } else {
        // Local file mode
        if (audioFile!.size > 20 * 1024 * 1024) {
          throw new Error("File too large for browser demo. Please use a file under 20MB.");
        }

        // Determine which critic should handle this file
        const { critic } = await determineContentCritic(audioFile!.type, audioFile!.name, null);
        criticType = critic;

        addLog(`SYSTEM: File type: ${audioFile!.type}`);
        addLog(`SYSTEM: Routing to ${
          critic === 'music' ? 'Julian Pinter (Music)' :
          critic === 'film' ? 'Rex Beaumont (Film)' :
          'Margot Ashford (Literary)'
        }`);

        // Read file once and extract all data in parallel
        const fileArrayBuffer = await audioFile!.arrayBuffer();

        // Extract metadata if audio file
        if (critic === 'music') {
          metadata = await extractAudioMetadata(audioFile!);
          addLog(`SYSTEM: Extracted metadata - Title: ${metadata.title || 'Unknown'}, Artist: ${metadata.artist || 'Unknown'}`);
        }

        // Convert ArrayBuffer to base64 for Gemini
        const base64Data = btoa(
          new Uint8Array(fileArrayBuffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        contentPart = {
          inlineData: { data: base64Data, mimeType: audioFile!.type },
        };
        addLog('SYSTEM: Content loaded into memory buffer.');
      }

      // Route to appropriate critic
      let reviewData: ReviewData;
      if (criticType === 'music') {
        reviewData = await runJulianReview(genAI, contentPart, metadata, isYouTube);
        reviewData.critic = 'music';
        reviewData.criticName = 'Julian Pinter';
      } else if (criticType === 'film') {
        reviewData = await runRexReview(genAI, contentPart, metadata, isYouTube);
      } else if (criticType === 'literary') {
        // For documents, classify first to determine literary vs business
        const documentType = await classifyDocument(genAI, contentPart);
        if (documentType === 'business') {
          reviewData = await runPatriciaReview(genAI, contentPart);
        } else {
          reviewData = await runMargotReview(genAI, contentPart);
        }
      } else {
        // Fallback - shouldn't reach here
        reviewData = await runMargotReview(genAI, contentPart);
      }
      const commentsData = await runCommenters(genAI, reviewData, contentPart);
      await runDiscriminator(genAI, commentsData);

      // Get current comments after discriminator
      let currentComments = await new Promise<Comment[]>((resolve) => {
        setComments(prev => {
          resolve(prev);
          return prev;
        });
      });

      await runJulianArguments(genAI, currentComments, reviewData);

      // Get updated comments after Julian's replies
      currentComments = await new Promise<Comment[]>((resolve) => {
        setComments(prev => {
          resolve(prev);
          return prev;
        });
      });

      await runCommenterResponses(genAI, currentComments, reviewData);

      // Get final comments state
      currentComments = await new Promise<Comment[]>((resolve) => {
        setComments(prev => {
          resolve(prev);
          return prev;
        });
      });

      // Run final discriminator to assign likes to ALL replies (including Julian's)
      await runFinalDiscriminator(genAI, currentComments);

      setStage('complete');
      addLog('SYSTEM: Initial review and comments complete!');
      addLog('SYSTEM: Auto-saving review...');

      // Auto-save the review immediately before organic comments start
      await autoSaveReview(reviewData, currentComments);

      addLog('SYSTEM: Review saved! Comments will continue organically for 5 minutes...');

      // Store content part for organic comment generation
      setCurrentAudioPart(contentPart);

      // Start organic comment generation
      setCommentGenerationActive(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An opaque error occurred in the neural net.');
      setStage('error');
      addLog(`CRITICAL FAILURE: ${err.message}`);
    }
  };

  const autoSaveReview = async (reviewData: ReviewData, currentComments: Comment[]) => {
    const isYouTube = !!youtubeUrl && !audioFile;

    const slug = `${reviewData.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${reviewData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const reviewId = Date.now().toString();

    let albumArtData: string | undefined;
    let waveformData: number[] = [];
    let audioFileName: string | undefined;

    if (!isYouTube && audioFile) {
      // Audio file mode - extract metadata and waveform
      const [metadata, waveform] = await Promise.all([
        extractAudioMetadata(audioFile),
        generateWaveformData(audioFile)
      ]);
      albumArtData = metadata.albumArt;
      waveformData = waveform;
      audioFileName = audioFile.name;

      // Convert audio file to data URL and store in IndexedDB
      const audioDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(audioFile);
      });

      try {
        await saveAudioData(reviewId, audioDataUrl);
      } catch (e) {
        console.error('Failed to save audio to IndexedDB', e);
      }
    }

    const newReview: SavedReview = {
      id: reviewId,
      title: reviewData.title,
      artist: reviewData.artist,
      slug,
      timestamp: Date.now(),
      review: reviewData,
      comments: currentComments,
      audioFileName,
      hasAudioInDB: !isYouTube,
      albumArt: albumArtData,
      waveformData,
      youtubeUrl: isYouTube ? youtubeUrl : undefined,
      isYouTube
    };

    const updatedReviews = [newReview, ...savedReviews];
    setSavedReviews(updatedReviews);
    localStorage.setItem('smudged_reviews', JSON.stringify(updatedReviews));
    setCurrentReviewId(reviewId); // Track this review for auto-saving organic comments

    if (albumArtData) setAlbumArt(albumArtData);
    if (waveformData.length > 0) setWaveformData(waveformData);
  };

  const saveReview = async () => {
    if (!review || !audioFile) return;

    addLog('SYSTEM: Extracting album art and generating waveform...');

    const slug = `${review.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${review.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const reviewId = Date.now().toString();

    // Extract metadata and generate waveform in parallel
    const [metadata, waveformData] = await Promise.all([
      extractAudioMetadata(audioFile),
      generateWaveformData(audioFile)
    ]);
    const albumArt = metadata.albumArt;

    // Convert audio file to data URL
    const audioDataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(audioFile);
    });

    // Store audio in IndexedDB instead of localStorage
    try {
      await saveAudioData(reviewId, audioDataUrl);
      addLog('SUCCESS: Audio stored in IndexedDB.');
    } catch (e) {
      console.error('Failed to save audio to IndexedDB', e);
      addLog('WARNING: Could not save audio data.');
    }

    const newReview: SavedReview = {
      id: reviewId,
      title: review.title,
      artist: review.artist,
      slug,
      timestamp: Date.now(),
      review,
      comments,
      audioFileName: audioFile.name,
      hasAudioInDB: true, // Audio is in IndexedDB, not localStorage
      albumArt,
      waveformData
    };

    const updatedReviews = [newReview, ...savedReviews];
    setSavedReviews(updatedReviews);
    localStorage.setItem('smudged_reviews', JSON.stringify(updatedReviews));
    setShowSavePrompt(false);
    setCurrentReviewId(reviewId); // Track this review for auto-saving organic comments
    addLog('SUCCESS: Review saved with audio data and album art.');
  };

  const deleteReview = async (id: string) => {
    const updatedReviews = savedReviews.filter(r => r.id !== id);
    setSavedReviews(updatedReviews);
    localStorage.setItem('smudged_reviews', JSON.stringify(updatedReviews));

    // Also delete audio from IndexedDB
    try {
      await deleteAudioData(id);
    } catch (e) {
      console.error('Failed to delete audio from IndexedDB', e);
    }
  };

  const postUserComment = async () => {
    if (!userComment.trim() || !userName.trim()) return;

    setIsPostingComment(true);

    try {
      const genAI = new ServerSideGeminiAI();

      if (replyingTo) {
        // Create a reply
        const newReply: Reply = {
          id: `r-user-${Date.now()}`,
          username: userName.trim(),
          persona_type: 'Human User',
          timestamp: 'Just now',
          text: userComment.trim(),
          likes: 0,
          is_julian: false,
          replyingToUsername: replyingTo.username,
          replyingToId: replyingTo.replyId
        };

        // Add the reply to the correct comment
        setComments(prev => prev.map(c =>
          c.id === replyingTo.commentId
            ? { ...c, replies: [...c.replies, newReply] }
            : c
        ));

        const replyTarget = replyingTo.username ? `@${replyingTo.username}` : 'a comment';
        addLog(`REPLY: ${userName} (you) responded to ${replyTarget}`);

        // Clear the input and reset reply state
        setUserComment('');
        setReplyingTo(null);

        // Assign likes to the reply
        const likeData = await assignLikesToNewContent(genAI, [newReply]);
        if (likeData && likeData.length > 0) {
          setComments(prev => prev.map(c => ({
            ...c,
            replies: c.replies.map(r => {
              const data = likeData.find((d: any) => d.id === r.id);
              return data ? { ...r, likes: data.likes } : r;
            })
          })));
        }
      } else {
        // Create a new top-level comment
        const newComment: Comment = {
          id: `c-user-${Date.now()}`,
          username: userName.trim(),
          persona_type: 'Human User',
          timestamp: 'Just now',
          text: userComment.trim(),
          likes: 0,
          replies: []
        };

        // Add the comment immediately
        setComments(prev => [...prev, newComment]);
        addLog(`NEW COMMENT: ${userName} (you) posted`);

        // Clear the input
        setUserComment('');

        // Assign likes to the user's comment
        const likeData = await assignLikesToNewContent(genAI, [newComment]);
        if (likeData && likeData.length > 0) {
          setComments(prev => prev.map(c => {
            const data = likeData.find((d: any) => d.id === c.id);
            return data ? { ...c, likes: data.likes } : c;
          }));
        }
      }
    } catch (e) {
      console.error('Failed to post comment', e);
      addLog('ERROR: Failed to post your comment');
    } finally {
      setIsPostingComment(false);
    }
  };

  const loadReview = async (savedReview: SavedReview) => {
    setReview(savedReview.review);
    setComments(savedReview.comments);
    setStage('complete');

    // Load audio/document from IndexedDB if available
    if (savedReview.hasAudioInDB) {
      try {
        const audioData = await getAudioData(savedReview.id);
        if (audioData) {
          // For documents (literary reviews), recreate File object for download
          if (savedReview.review.critic === 'literary' && savedReview.audioFileName) {
            const response = await fetch(audioData);
            const blob = await response.blob();
            const file = new File([blob], savedReview.audioFileName, { type: blob.type });
            setAudioFile(file);
            setAudioUrl(null);
          } else {
            // For audio/video, just set the URL
            setAudioUrl(audioData);
            setAudioFile(null);
          }
        }
      } catch (e) {
        console.error('Failed to load from IndexedDB', e);
        setAudioFile(null);
        setAudioUrl(savedReview.audioDataUrl || null);
      }
    } else {
      setAudioFile(null);
      setAudioUrl(savedReview.audioDataUrl || null);
    }

    setAlbumArt(savedReview.albumArt);
    setWaveformData(savedReview.waveformData || []);

    setShowSavePrompt(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setReview(null);
      setComments([]);

      // Extract metadata and generate waveform in background
      const [metadata, waveform] = await Promise.all([
        extractAudioMetadata(file),
        generateWaveformData(file)
      ]);
      setAlbumArt(metadata.albumArt);
      setWaveformData(waveform);
    }
  };


  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Auto-save comments as they update (both during organic generation AND user comments)
  useEffect(() => {
    if (!currentReviewId || comments.length === 0) return;

    // Find and update the current review's comments
    setSavedReviews(prev => {
      const currentReviewIndex = prev.findIndex(r => r.id === currentReviewId);
      if (currentReviewIndex === -1) return prev;

      const updatedReviews = [...prev];
      updatedReviews[currentReviewIndex] = {
        ...updatedReviews[currentReviewIndex],
        comments: comments
      };
      localStorage.setItem('smudged_reviews', JSON.stringify(updatedReviews));
      return updatedReviews;
    });
  }, [comments, currentReviewId]);

  // Refs to persist across renders without triggering re-renders
  const commentCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Organic comment generation system - multiple parallel conversations
  useEffect(() => {
    if (!commentGenerationActive || !review || !currentAudioPart) return;

    const genAI = new ServerSideGeminiAI();
    commentCountRef.current = 0; // Reset counter for new session
    startTimeRef.current = Date.now();
    timeoutsRef.current = []; // Clear old timeouts
    const MAX_COMMENTS = 30; // Cap at 30 organic comments total
    const DURATION = 5 * 60 * 1000; // 5 minutes

    const generateNext = async () => {
      try {
        // Check if we should stop using ref values
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed >= DURATION || commentCountRef.current >= MAX_COMMENTS || !commentGenerationActive) {
          addLog(`SYSTEM: Stopping generation (${commentCountRef.current} comments, ${Math.floor(elapsed / 1000)}s elapsed)`);
          setCommentGenerationActive(false);
          setTypingIndicators([]);
          return; // Stop generating
        }

        // Show typing indicator
        const tempUsername = `User${Math.floor(Math.random() * 1000)}`;
        const tempCommentId = Math.random() > 0.5 ? null : comments[Math.floor(Math.random() * comments.length)]?.id || null;

        setTypingIndicators(prev => [...prev, { commentId: tempCommentId, username: tempUsername }]);

        const interaction = await generateOrganicComment(genAI, comments, review, currentAudioPart, savedReviews);

        // Remove typing indicator
        setTypingIndicators(prev => prev.filter(t => t.username !== tempUsername));

        if (interaction) {
          // Only increment counter on successful generation
          commentCountRef.current++;

          if (interaction.type === 'new_comment') {
            setComments(prev => [...prev, interaction.data as Comment]);
            addLog(`NEW COMMENT: ${interaction.data.username} posted (${commentCountRef.current}/${MAX_COMMENTS})`);

            // Assign likes to the new comment
            if (interaction.data) {
              assignLikesToNewContent(genAI, [interaction.data]).then(likeData => {
                if (likeData && likeData.length > 0) {
                  setComments(prev => prev.map(c => {
                    const data = likeData.find((d: any) => d.id === c.id);
                    return data ? { ...c, likes: data.likes } : c;
                  }));
                }
              }).catch(e => console.error('Failed to assign likes', e));
            }
          } else if (interaction.type === 'reply' || interaction.type === 'julian_reply') {
            setComments(prev => prev.map(c =>
              c.id === interaction.parentId
                ? { ...c, replies: [...c.replies, interaction.data as Reply] }
                : c
            ));
            addLog(`REPLY: ${interaction.data.username} responded (${commentCountRef.current}/${MAX_COMMENTS})`);

            // Assign likes to the new content
            if (interaction.data) {
              assignLikesToNewContent(genAI, [interaction.data]).then(likeData => {
                if (likeData && likeData.length > 0) {
                  setComments(prev => prev.map(c => ({
                    ...c,
                    replies: c.replies.map(r => {
                      const data = likeData.find((d: any) => d.id === r.id);
                      return data ? { ...r, likes: data.likes } : r;
                    })
                  })));
                }
              }).catch(e => console.error('Failed to assign likes', e));
            }
          }
        }
      } catch (e) {
        console.error('Failed to generate organic comment', e);
      }
    };

    // Generate multiple parallel conversations (1-2 simultaneous)
    const scheduleNext = () => {
      // Check if we should stop before scheduling
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed >= DURATION || commentCountRef.current >= MAX_COMMENTS || !commentGenerationActive) {
        addLog(`SYSTEM: Thread stopping (${commentCountRef.current} comments, ${Math.floor(elapsed / 1000)}s elapsed)`);
        return;
      }

      // Slower generation: 15-45 seconds between comments
      const delay = 15000 + Math.random() * 30000;
      const timeout = setTimeout(() => {
        generateNext().then(() => {
          // Only continue if we haven't hit the cap
          const elapsed = Date.now() - startTimeRef.current;
          if (commentCountRef.current < MAX_COMMENTS && elapsed < DURATION && commentGenerationActive) {
            scheduleNext();
          } else {
            addLog(`SYSTEM: Thread completed (${commentCountRef.current} comments, ${Math.floor(elapsed / 1000)}s elapsed)`);
          }
        });
      }, delay);
      timeoutsRef.current.push(timeout);
    };

    // Start 1-2 parallel conversation threads (reduced from 2-4)
    const numThreads = 1 + Math.floor(Math.random() * 2); // 1-2 threads
    for (let i = 0; i < numThreads; i++) {
      setTimeout(() => scheduleNext(), i * 5000); // Stagger start by 5 seconds
    }

    // Stop after 5 minutes - hard stop
    const stopTimeout = setTimeout(() => {
      addLog('SYSTEM: 5 minutes elapsed - forcing comment section closure');
      setCommentGenerationActive(false);
      setTypingIndicators([]);
      // Clear all pending timeouts
      timeoutsRef.current.forEach((t: NodeJS.Timeout) => clearTimeout(t));
      timeoutsRef.current = [];
      addLog('SYSTEM: Comment section closed. Discussion archived.');
    }, 5 * 60 * 1000);
    timeoutsRef.current.push(stopTimeout);

    return () => {
      timeoutsRef.current.forEach((t: NodeJS.Timeout) => clearTimeout(t));
      setTypingIndicators([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentGenerationActive, review, currentAudioPart]);

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-zinc-900 font-serif selection:bg-zinc-900 selection:text-white">
      <header className="border-b-4 border-zinc-900 py-6 px-4 md:px-12 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85] cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { setReview(null); setComments([]); setStage('idle'); setShowSavePrompt(false); }}>
                The Smudged<br/>Pamphlet
              </h1>
              <p className="mt-2 text-lg italic font-medium text-zinc-500">
                Criticism for people who hate criticism from real people.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full sm:w-auto sm:items-end">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setReview(null);
                    setComments([]);
                    setStage('idle');
                    setShowSavePrompt(false);
                    setCommentGenerationActive(false);
                    setAudioFile(null);
                    setYoutubeUrl('');
                  }}
                  className="flex items-center gap-2 bg-amber-400 text-zinc-900 px-4 py-2 font-black uppercase text-sm hover:bg-amber-500 transition-colors border-2 border-zinc-900"
                >
                  <Upload className="w-4 h-4" />
                  New Review
                </button>
                <button
                  onClick={() => setShowArchive(!showArchive)}
                  className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 font-black uppercase text-sm hover:bg-zinc-800 active:scale-95 transition-all"
                >
                  <Archive className="w-4 h-4" />
                  Archive ({savedReviews.length})
                </button>
              </div>
              <button
                onClick={() => router.push('/editorial')}
                className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 font-black uppercase text-sm hover:bg-red-600 active:scale-95 transition-all border-2 border-zinc-900 w-full sm:w-auto"
              >
                <FileText className="w-4 h-4" />
                Editorial
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Archive Sidebar */}
      <div className={`fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 transition-opacity duration-200 ${showArchive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowArchive(false)}>
        <div className={`absolute right-0 top-0 bottom-0 w-full md:w-96 bg-[#f4f1ea] border-l-4 border-zinc-900 shadow-2xl overflow-y-auto transition-transform duration-300 ease-out ${showArchive ? 'translate-x-0' : 'translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-zinc-900 text-white p-4 flex justify-between items-center border-b-4 border-zinc-800">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5" />
                <h2 className="font-black uppercase text-lg">Saved Reviews</h2>
              </div>
              <button onClick={() => setShowArchive(false)} className="hover:opacity-70 transition-opacity">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {savedReviews.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <Archive className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">No saved reviews yet.</p>
                  <p className="text-sm mt-2">Generate and save a review to see it here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedReviews.map((saved) => (
                    <div
                      key={saved.id}
                      className="bg-white border-2 border-zinc-900 p-4 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] hover:shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] transition-all group cursor-pointer"
                      onClick={() => router.push(`/review/${saved.slug}`)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="font-black text-lg leading-tight group-hover:text-amber-600 transition-colors">{saved.title}</h3>
                          <p className="text-sm text-zinc-600 font-medium">{saved.artist}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                            <span>{new Date(saved.timestamp).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{saved.comments.length} comments</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm('Delete this review?')) deleteReview(saved.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-800 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="bg-zinc-900 text-white px-2 py-0.5 font-black rounded-sm">
                          {saved.review.score.toFixed(1)}/10
                        </div>
                        <div className="text-zinc-500 truncate flex-1">{saved.audioFileName || (saved.isYouTube ? 'YouTube' : 'No file')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Save Prompt */}
      {showSavePrompt && review && (
        <div className="fixed bottom-8 right-8 bg-amber-400 border-4 border-zinc-900 p-6 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] z-40 max-w-md animate-in slide-in-from-bottom-8">
          <div className="flex items-start gap-4">
            <Save className="w-6 h-6 shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-black uppercase text-lg mb-2">Save This Review?</h3>
              <p className="text-sm mb-4">
                Save &quot;{review.title}&quot; to your archive so you can view it later.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={saveReview}
                  className="flex-1 bg-zinc-900 text-white py-2 px-4 font-black uppercase text-sm hover:bg-zinc-800 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowSavePrompt(false)}
                  className="px-4 py-2 border-2 border-zinc-900 font-black uppercase text-sm hover:bg-zinc-100 transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <main className="max-w-5xl mx-auto px-4 md:px-12 py-8 mt-12">
        {(stage === 'idle' || stage === 'error') && (
        <section className="transition-all">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                {/* File Upload - Audio, Video, Documents */}
                <div className="border-4 border-dashed border-zinc-300 hover:border-zinc-900 transition-colors p-8 md:p-12 text-center relative group bg-[#faf9f6] flex flex-col justify-center">
                    <input
                        type="file"
                        accept="audio/*,video/*,.pdf,.txt,.doc,.docx,text/plain,application/pdf"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={(stage !== 'idle' && stage !== 'error') || !!youtubeUrl}
                    />
                    <div className="pointer-events-none flex flex-col items-center space-y-4">
                        {audioFile ? (
                             (() => {
                               const fileType = audioFile.type;
                               const iconClasses = "w-12 h-12 md:w-16 md:h-16 text-zinc-900";

                               if (fileType.startsWith('audio/')) {
                                 return <Music className={iconClasses} />;
                               } else if (fileType.startsWith('video/')) {
                                 return <Film className={iconClasses} />;
                               } else if (fileType === 'application/pdf' || fileType.includes('pdf')) {
                                 return <FileText className={iconClasses} />;
                               } else if (fileType.includes('text') || fileType.includes('document')) {
                                 return <FileText className={iconClasses} />;
                               } else {
                                 return <File className={iconClasses} />;
                               }
                             })()
                        ) : (
                            <Upload className="w-12 h-12 md:w-16 md:h-16 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                        )}
                        <div className="font-black text-lg md:text-2xl uppercase tracking-tight">
                            {audioFile ? audioFile.name : "Drop File Here"}
                        </div>
                        {!audioFile && !youtubeUrl && (
                            <p className="text-zinc-500 text-sm">Audio, Video, or Documents<br/>Limit 20MB. Don&apos;t bore us.</p>
                        )}
                    </div>
                </div>

                {/* OR Divider - only on mobile */}
                <div className="relative my-2 md:hidden">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t-2 border-zinc-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm uppercase font-black tracking-wider">
                        <span className="px-4 bg-[#f4f1ea] text-zinc-500">OR</span>
                    </div>
                </div>

                {/* YouTube URL */}
                <div className="border-2 border-zinc-900 p-6 bg-white flex flex-col justify-center">
                    <label className="block font-black uppercase text-sm mb-2">YouTube URL</label>
                    <input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        disabled={(stage !== 'idle' && stage !== 'error') || !!audioFile}
                        className="w-full p-3 border-2 border-zinc-300 focus:border-zinc-900 outline-none font-mono text-sm"
                    />
                    <p className="mt-2 text-xs text-zinc-500">A critic will review the YouTube video content</p>
                </div>
            </div>

            {(audioFile || youtubeUrl) && stage === 'idle' && (
                <button
                    onClick={startReviewProcess}
                    disabled={false}
                    className="w-full mt-4 bg-zinc-900 text-[#f4f1ea] py-4 text-xl font-black uppercase tracking-widest hover:bg-zinc-800 disabled:bg-zinc-400 transition-colors"
                >
                    Submit to Critic
                </button>
            )}
             {stage === 'error' && (
                 <div className="mt-4 p-4 bg-red-100 border-2 border-red-900 text-red-900 font-mono text-sm">
                    ERROR: {errorMsg}
                    <button onClick={() => setStage('idle')} className="block mt-2 underline font-bold">Try Again</button>
                 </div>
            )}
        </section>
        )}
        {(stage !== 'idle' || logs.length > 0) && (
            <section className="mb-12 font-mono text-xs md:text-sm">
                <div className="bg-zinc-900 text-green-400 p-4 rounded-t-sm flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    <span className="uppercase tracking-widest">Agent_Workflow_Log.txt</span>
                </div>
                <div className="bg-black text-zinc-300 p-4 h-48 overflow-y-auto border-b-4 border-zinc-900">
                    {logs.map((log, i) => (
                        <div key={i} className={cn("mb-1", log.includes('CRITICAL') ? 'text-red-500 font-bold' : '')}>
                            {log}
                        </div>
                    ))}
                    {stage !== 'complete' && stage !== 'error' && stage !== 'idle' && (
                        <div className="animate-pulse mt-2">&gt; Processing...</div>
                    )}
                </div>
            </section>
        )}
        {review && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
                <article className="bg-white border-2 border-zinc-900 p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] mb-16">
                    <div className="flex justify-between items-start border-b-2 border-zinc-200 pb-8 mb-8">
                        <div>
                            <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">Review</div>
                            <h2 className="text-4xl md:text-6xl font-black leading-none mb-2">{review.title}</h2>
                            <h3 className="text-2xl text-zinc-600 font-medium">{review.artist}</h3>
                        </div>
                        <div className="flex flex-col items-center">
                             {(() => {
                               const bgColor = review.critic === 'music' ? 'bg-amber-400' :
                                              review.critic === 'film' ? 'bg-purple-400' :
                                              'bg-emerald-400';
                               return (
                                 <div className={`w-24 h-24 md:w-32 md:h-32 ${bgColor} text-zinc-900 flex flex-col justify-center items-center rounded-full rotate-12 border-4 border-zinc-900`}>
                                   <span className="text-3xl md:text-5xl font-black tracking-tighter">{review.score.toFixed(1)}</span>
                                   <span className="text-xs uppercase tracking-widest opacity-70">/ 10</span>
                                 </div>
                               );
                             })()}
                        </div>
                    </div>

                    {youtubeUrl ? (
                      <div className="my-8">
                        <div className="aspect-video w-full bg-black">
                          <iframe
                            width="100%"
                            height="100%"
                            src={`https://www.youtube.com/embed/${extractYouTubeId(youtubeUrl)}`}
                            title="YouTube video player"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="w-full h-full border-0"
                          ></iframe>
                        </div>
                      </div>
                    ) : review.critic === 'literary' || review.critic === 'business' ? (
                      <DocumentPreview
                        fileName={audioFile?.name}
                        fileType={audioFile?.type}
                        onDownload={() => {
                          if (audioFile) {
                            const url = URL.createObjectURL(audioFile);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = audioFile.name;
                            a.click();
                            URL.revokeObjectURL(url);
                          }
                        }}
                      />
                    ) : (
                      <AudioPlayer
                        audioUrl={audioUrl || undefined}
                        audioFileName={audioFile?.name}
                        albumArt={albumArt}
                        waveformData={waveformData}
                      />
                    )}

                    <div className="prose prose-zinc max-w-none prose-lg">
                        <p className="text-xl md:text-2xl font-medium leading-snug mb-8 text-zinc-800">
                            {review.summary}
                        </p>
                        {review.body.map((para, i) => (
                            <p key={i}>{para}</p>
                        ))}
                        <blockquote className="border-l-4 border-zinc-900 pl-6 italic text-xl my-8 font-medium text-zinc-700">
                            &quot;{review.notable_lyrics_quoted}&quot;
                            <footer className="text-sm font-black not-italic text-zinc-400 mt-2 uppercase">— Notable Lyrics (allegedly)</footer>
                        </blockquote>
                    </div>
                    <div className="mt-12 pt-6 border-t-2 border-zinc-100 flex items-center gap-4">
                        {(() => {
                          const criticInfo = getCriticInfo(review.critic || 'music');
                          return (
                            <>
                              <div className="w-12 h-12 bg-zinc-200 rounded-full overflow-hidden border border-zinc-900">
                                <img src={criticInfo.avatar} alt={criticInfo.name} />
                              </div>
                              <div>
                                <div className="font-black uppercase tracking-wider">{criticInfo.name}</div>
                                <div className="text-sm text-zinc-500 italic">{criticInfo.bio}</div>
                              </div>
                            </>
                          );
                        })()}
                    </div>
                </article>
                <section id="comments" className="max-w-3xl mx-auto">
                    <h3 className="text-2xl font-black uppercase tracking-tight mb-8 flex items-center gap-3">
                        <MessageSquare className="w-6 h-6" />
                        {comments.length} Comments
                    </h3>
                    <div className="space-y-8">
                        {/* Typing indicators for new comments */}
                        {typingIndicators.filter(t => t.commentId === null).map((indicator, idx) => (
                            <div key={`typing-${idx}`} className="flex gap-4 opacity-60 animate-pulse">
                                <div className="w-10 h-10 shrink-0 bg-zinc-300 rounded-md"></div>
                                <div className="flex-1 bg-zinc-100 border border-zinc-300 p-4 rounded-sm">
                                    <div className="font-bold text-zinc-500">{indicator.username} is typing...</div>
                                    <div className="flex gap-1 mt-2">
                                        <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {comments.map((comment) => {
                            const isCriticComment = (comment as any).is_critic;
                            const isEditorComment = (comment as any).is_editor;
                            const criticType = (comment as any).critic;
                            const criticInfo = isCriticComment && criticType ? getCriticInfo(criticType) : null;
                            const editorInfo = isEditorComment ? getStaffInfo('editor') : null;

                            const borderColor = editorInfo
                                ? 'border-red-500'
                                : criticInfo
                                ? (criticType === 'music' ? 'border-amber-400' :
                                   criticType === 'film' ? 'border-purple-400' : 'border-emerald-400')
                                : comment.persona_type === 'Human User' ? 'border-blue-400' : 'border-zinc-300';

                            const bgColor = editorInfo
                                ? 'bg-red-50'
                                : criticInfo
                                ? (criticType === 'music' ? 'bg-amber-50' :
                                   criticType === 'film' ? 'bg-purple-50' : 'bg-emerald-50')
                                : comment.persona_type === 'Human User' ? 'bg-blue-50' : 'bg-white';

                            return (
                            <div key={comment.id} className="group">
                                <div className="flex gap-4">
                                    <div className={cn(
                                        "w-10 h-10 shrink-0 rounded-md overflow-hidden border-2",
                                        (isCriticComment || isEditorComment) ? borderColor : "border-zinc-900 bg-zinc-200"
                                    )}>
                                         <img
                                             src={editorInfo ? editorInfo.avatar : criticInfo ? criticInfo.avatar : `https://api.dicebear.com/7.x/identicon/svg?seed=${comment.username}`}
                                             alt={comment.username}
                                         />
                                    </div>
                                    <div className="flex-1">
                                        <div className={cn(
                                            "p-4 rounded-sm shadow-sm border-2",
                                            bgColor,
                                            borderColor
                                        )}>
                                            <div className="flex justify-between items-baseline mb-2">
                                                <div className="font-bold">
                                                    {comment.username}
                                                    <span className={cn(
                                                        "ml-2 text-xs text-white px-1 rounded-sm font-normal uppercase",
                                                        isEditorComment
                                                            ? "bg-red-500"
                                                            : comment.persona_type === 'Human User'
                                                            ? "bg-blue-600"
                                                            : isCriticComment
                                                            ? (criticType === 'music' ? 'bg-amber-500' :
                                                               criticType === 'film' ? 'bg-purple-500' : 'bg-emerald-500')
                                                            : "bg-zinc-400"
                                                    )}>
                                                        {comment.persona_type}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-zinc-400">{comment.timestamp}</div>
                                            </div>
                                            <p className="text-zinc-800 whitespace-pre-wrap">{comment.text}</p>
                                            <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500 font-medium">
                                                <button className="flex items-center gap-1 hover:text-zinc-900">
                                                    <ThumbsDown className="w-3 h-3 rotate-180" /> {comment.likes}
                                                </button>
                                                {commentGenerationActive && (
                                                    <button
                                                        onClick={() => {
                                                            setReplyingTo({ commentId: comment.id, username: comment.username });
                                                            // Scroll to comment input
                                                            setTimeout(() => {
                                                                document.querySelector('textarea')?.focus();
                                                            }, 100);
                                                        }}
                                                        className="hover:text-zinc-900 font-bold"
                                                    >
                                                        Reply
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Render all replies */}
                                        {(comment.replies.length > 0 || typingIndicators.some(t => t.commentId === comment.id)) && (
                                            <div className="mt-4 space-y-4">
                                                {/* Typing indicators for replies */}
                                                {typingIndicators.filter(t => t.commentId === comment.id).map((indicator, idx) => (
                                                    <div key={`typing-reply-${idx}`} className="flex gap-4 ml-2 md:ml-8 opacity-60 animate-pulse">
                                                        <div className="text-zinc-400">
                                                            <ChevronDown className="w-6 h-6 ml-2" />
                                                        </div>
                                                        <div className="w-10 h-10 shrink-0 bg-zinc-300 rounded-md"></div>
                                                        <div className="flex-1 bg-zinc-100 border border-zinc-300 p-4 rounded-sm">
                                                            <div className="font-bold text-zinc-500">{indicator.username} is typing...</div>
                                                            <div className="flex gap-1 mt-2">
                                                                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                {comment.replies.map((reply) => {
                                                    const isCritic = reply.is_julian || reply.is_critic;
                                                    const isEditor = (reply as any).is_editor;
                                                    const replyStaffType = isEditor ? 'editor' : (reply as any).critic || review.critic || 'music';
                                                    const staffInfo = getStaffInfo(replyStaffType as StaffType);

                                                    const borderColor = isEditor ? 'border-red-500' :
                                                                       review.critic === 'music' ? 'border-amber-400' :
                                                                       review.critic === 'film' ? 'border-purple-400' :
                                                                       'border-emerald-400';
                                                    const textColor = isEditor ? 'text-red-500' :
                                                                     review.critic === 'music' ? 'text-amber-400' :
                                                                     review.critic === 'film' ? 'text-purple-400' :
                                                                     'text-emerald-400';
                                                    const bgColor = isEditor ? 'bg-red-500' :
                                                                   review.critic === 'music' ? 'bg-amber-400' :
                                                                   review.critic === 'film' ? 'bg-purple-400' :
                                                                   'bg-emerald-400';

                                                    return (
                                                    <div key={reply.id} className="flex gap-4 ml-2 md:ml-8 animate-in fade-in slide-in-from-left-4">
                                                        <div className="text-zinc-400">
                                                            <ChevronDown className="w-6 h-6 ml-2" />
                                                        </div>
                                                        {(isCritic || isEditor) ? (
                                                            <>
                                                                <div className={`w-10 h-10 shrink-0 bg-zinc-900 rounded-full overflow-hidden border-2 ${borderColor} z-10`}>
                                                                    <img src={staffInfo.avatar} alt={staffInfo.name} />
                                                                </div>
                                                                <div className={`flex-1 bg-zinc-900 text-zinc-100 p-4 rounded-sm shadow-lg relative border-l-4 ${borderColor}`}>
                                                                    <div className="flex justify-between items-baseline mb-2">
                                                                        <div className={`font-black ${textColor} flex items-center gap-1`}>
                                                                            {staffInfo.name.toUpperCase()}
                                                                            <ShieldAlert className="w-3 h-3" />
                                                                            <span className={`text-[10px] ${bgColor} text-zinc-900 px-1 rounded-sm ml-2`}>AUTHOR</span>
                                                                        </div>
                                                                        <div className="text-xs text-zinc-500">{reply.timestamp}</div>
                                                                    </div>
                                                                    <p className="whitespace-pre-wrap font-medium">
                                                                        {reply.replyingToUsername && (
                                                                            <span className={`${textColor} font-black`}>@{reply.replyingToUsername} </span>
                                                                        )}
                                                                        {reply.text}
                                                                    </p>
                                                                    <div className={`mt-3 flex items-center gap-4 text-xs ${textColor}/70 font-medium`}>
                                                                        <button className={`flex items-center gap-1 hover:${textColor}`}>
                                                                            <ThumbsDown className="w-3 h-3 rotate-180" /> {reply.likes}
                                                                        </button>
                                                                        {commentGenerationActive && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    setReplyingTo({
                                                                                        commentId: comment.id,
                                                                                        replyId: reply.id,
                                                                                        username: reply.username
                                                                                    });
                                                                                    setTimeout(() => {
                                                                                        document.querySelector('textarea')?.focus();
                                                                                    }, 100);
                                                                                }}
                                                                                className="hover:text-amber-400 font-bold"
                                                                            >
                                                                                Reply
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="w-10 h-10 shrink-0 bg-zinc-200 rounded-md overflow-hidden border border-zinc-900">
                                                                    <img src={`https://api.dicebear.com/7.x/identicon/svg?seed=${reply.username}`} alt={reply.username} />
                                                                </div>
                                                                <div className="flex-1 bg-zinc-50 border border-zinc-300 p-4 rounded-sm shadow-sm">
                                                                    <div className="flex justify-between items-baseline mb-2">
                                                                        <div className="font-bold">
                                                                            {reply.username}
                                                                            <span className="ml-2 text-xs text-white bg-zinc-400 px-1 rounded-sm font-normal uppercase">
                                                                                {reply.persona_type}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-xs text-zinc-400">{reply.timestamp}</div>
                                                                    </div>
                                                                    <p className="text-zinc-800 whitespace-pre-wrap">
                                                                        {reply.replyingToUsername && (
                                                                            <span className="text-blue-600 font-black">@{reply.replyingToUsername} </span>
                                                                        )}
                                                                        {reply.text}
                                                                    </p>
                                                                    <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500 font-medium">
                                                                        <button className="flex items-center gap-1 hover:text-zinc-900">
                                                                            <ThumbsDown className="w-3 h-3 rotate-180" /> {reply.likes}
                                                                        </button>
                                                                        {commentGenerationActive && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    setReplyingTo({
                                                                                        commentId: comment.id,
                                                                                        replyId: reply.id,
                                                                                        username: reply.username
                                                                                    });
                                                                                    // Scroll to comment input
                                                                                    setTimeout(() => {
                                                                                        document.querySelector('textarea')?.focus();
                                                                                    }, 100);
                                                                                }}
                                                                                className="hover:text-zinc-900 font-bold"
                                                                            >
                                                                                Reply
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>

                    {/* User Comment Input */}
                    {stage === 'complete' && commentGenerationActive && (
                        <div className="mt-8 bg-white border-2 border-zinc-900 p-6 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)]">
                            <h4 className="font-black uppercase text-sm mb-4 flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" />
                                {replyingTo ? 'Reply to Comment' : 'Join the Discussion'}
                            </h4>
                            {replyingTo && (
                                <div className="mb-3 p-2 bg-blue-100 border-l-4 border-blue-600 flex items-center justify-between">
                                    <span className="text-sm font-medium text-blue-900">
                                        Replying to <span className="font-black">@{replyingTo.username}</span>
                                    </span>
                                    <button
                                        onClick={() => setReplyingTo(null)}
                                        className="text-xs text-blue-600 hover:text-blue-900 font-bold uppercase"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={userName}
                                    onChange={(e) => setUserName(e.target.value)}
                                    placeholder="Your username..."
                                    className="w-full px-4 py-2 border-2 border-zinc-300 focus:border-zinc-900 focus:outline-none font-medium"
                                    disabled={isPostingComment}
                                />
                                <textarea
                                    value={userComment}
                                    onChange={(e) => setUserComment(e.target.value)}
                                    placeholder={replyingTo ? "Write your reply..." : "Share your thoughts on this review..."}
                                    rows={3}
                                    className="w-full px-4 py-2 border-2 border-zinc-300 focus:border-zinc-900 focus:outline-none resize-none font-medium"
                                    disabled={isPostingComment}
                                />
                                <button
                                    onClick={postUserComment}
                                    disabled={!userComment.trim() || !userName.trim() || isPostingComment}
                                    className="bg-zinc-900 text-white px-6 py-2 font-black uppercase text-sm hover:bg-zinc-800 transition-colors disabled:bg-zinc-400 disabled:cursor-not-allowed"
                                >
                                    {isPostingComment ? 'Posting...' : (replyingTo ? 'Post Reply' : 'Post Comment')}
                                </button>
                            </div>
                        </div>
                    )}

                    {comments.length > 0 && (stage === 'julian_arguing' || stage === 'discriminator_judging') && (
                        <div className="mt-8 text-center text-zinc-500 animate-pulse font-mono text-sm">
                            {stage === 'julian_arguing' && 'Julian is furiously typing replies...'}
                            {stage === 'discriminator_judging' && 'The Discriminator is judging comments...'}
                        </div>
                    )}

                    {commentGenerationActive && (
                        <div className="mt-8 p-4 bg-amber-400/20 border-2 border-amber-600 rounded-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-2 h-2 bg-amber-600 rounded-full animate-pulse"></div>
                                <span className="font-black uppercase text-sm">Comments Section Active</span>
                            </div>
                            <p className="text-sm text-zinc-700">
                                New comments and replies are being generated organically. Comments will close automatically in 5 minutes or after 30 organic comments.
                            </p>
                            {typingIndicators.length > 0 && (
                                <p className="text-xs text-amber-700 mt-2 font-medium">
                                    {typingIndicators.length} {typingIndicators.length === 1 ? 'person is' : 'people are'} typing...
                                </p>
                            )}
                        </div>
                    )}

                    {!commentGenerationActive && stage === 'complete' && comments.length > 0 && (
                        <div className="mt-8 p-4 bg-zinc-200 border-2 border-zinc-400 rounded-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-2 h-2 bg-zinc-600 rounded-full"></div>
                                <span className="font-black uppercase text-sm">Comments Closed</span>
                            </div>
                            <p className="text-sm text-zinc-700">
                                This discussion has been archived. {comments.length} total comments.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        )}
      </main>
      <footer className="bg-zinc-900 text-zinc-500 py-12 text-center mt-12">
          <p className="font-black uppercase tracking-widest mb-4 text-zinc-300">The Smudged Pamphlet</p>
          <p className="text-sm max-w-md mx-auto opacity-60">
              Est. 2009. Probably. We are better than you, and we know it.
              Powered by autonomous AI agents that hate their jobs.
          </p>
      </footer>
    </div>
  );
}
