import { getCriticPersona, getCriticInfo, getStaffInfo, type CriticType } from './critics';

interface PodcastScript {
  speaker: string;
  line: string;
}

export interface PodcastSegment {
  speakers: string[]; // Exactly 2 speakers for this segment
  script: PodcastScript[];
}

interface PodcastGenerationOptions {
  reviewTitle: string;
  artist: string;
  score: number;
  summary: string;
  body: string[];
  notableLyrics?: string;
  criticType: 'music' | 'film' | 'literary' | 'business';
  criticName: string;
  isEditorial?: boolean;
  comments?: any[];
  youtubeUrl?: string;
  audioFileName?: string;
  isYouTube?: boolean;
  documentFileName?: string;
  reviewCritics?: ('music' | 'film' | 'literary' | 'business')[]; // For editorial roundtables
  // For editorials: information about the original reviews being discussed
  originalReviews?: Array<{
    title: string;
    artist: string;
    score: number;
    summary: string;
    critic?: 'music' | 'film' | 'literary' | 'business';
    criticName?: string;
    body: string[];
    // Media information
    youtubeUrl?: string;
    isYouTube?: boolean;
    audioFileName?: string;
    hasAudioFile?: boolean;
    documentFileName?: string;
    // Actual media content for Gemini
    mediaContent?: {
      inlineData?: {
        data: string;
        mimeType: string;
      };
      fileData?: {
        fileUri: string;
        mimeType: string;
      };
    };
  }>;
  verdicts?: Array<{
    mediaTitle: string;
    mediaArtist: string;
    verdict: 'ROCKS' | 'SUCKS';
  }>;
}

export interface PodcastGenerationResult {
  script: PodcastScript[] | PodcastSegment[];
  albumArtPrompt: string;
  editorialTitle?: string; // Generated title for editorial podcasts
}

/**
 * Generates a podcast script using AI orchestration
 * For single reviews: Chuck Morrison (host) + Review Author
 * For editorials: Chuck Morrison (host) + Multiple Critics (roundtable)
 *
 * Returns segments for multi-speaker scenarios (3+ speakers need to be split)
 * Also generates an album art prompt for Gemini image generation
 */
export async function generatePodcastScript(
  options: PodcastGenerationOptions
): Promise<PodcastGenerationResult> {
  const {
    reviewTitle,
    artist,
    score,
    summary,
    body,
    notableLyrics,
    criticType,
    criticName,
    isEditorial = false,
    comments = [],
  } = options;

  const criticInfo = getCriticInfo(criticType);
  const chuckInfo = getStaffInfo('editor');

  if (isEditorial) {
    return await generateEditorialRoundtable(options, comments);
  } else {
    return await generateOneOnOnePodcast(
      criticInfo,
      chuckInfo,
      reviewTitle,
      artist,
      score,
      summary,
      body,
      notableLyrics,
      {
        youtubeUrl: options.youtubeUrl,
        audioFileName: options.audioFileName,
        isYouTube: options.isYouTube,
        documentFileName: options.documentFileName,
        criticType: options.criticType,
        comments: options.comments
      }
    );
  }
}

/**
 * Generate a one-on-one podcast between Chuck and the review author
 */
async function generateOneOnOnePodcast(
  criticInfo: any,
  chuckInfo: any,
  reviewTitle: string,
  artist: string,
  score: number,
  summary: string,
  body: string[],
  notableLyrics?: string,
  options?: Pick<PodcastGenerationOptions, 'youtubeUrl' | 'audioFileName' | 'isYouTube' | 'documentFileName' | 'criticType' | 'comments'>
): Promise<PodcastGenerationResult> {
  const reviewBodyText = body.join('\n\n');

  // Build media context - make it very prominent
  let mediaContext = '';
  let mediaTypeDescription = '';

  if (options?.documentFileName) {
    mediaContext = `\n\n⚠️ CRITICAL - MEDIA TYPE: WRITTEN DOCUMENT ⚠️
Document: ${options.documentFileName}
This is NOT music, NOT audio, NOT a song, NOT an album.
This is a WRITTEN DOCUMENT (PDF, text file, business doc, or literary work).`;
    mediaTypeDescription = 'a written document';
  } else if (options?.isYouTube && options?.youtubeUrl) {
    mediaContext = `\n\n⚠️ CRITICAL - MEDIA TYPE: VIDEO ⚠️
Video URL: ${options.youtubeUrl}
This is a VIDEO review (YouTube, film, visual content).`;
    mediaTypeDescription = 'a video/film';
  } else if (options?.audioFileName) {
    mediaContext = `\n\n⚠️ CRITICAL - MEDIA TYPE: AUDIO/MUSIC ⚠️
Audio file: ${options.audioFileName}
This is MUSIC or AUDIO content (song, album, track, audio recording).`;
    mediaTypeDescription = 'music/audio';
  }

  // Get full persona prompts for rich character details
  const criticPersona = options?.criticType
    ? getCriticPersona(options.criticType, { context: 'colleague_interaction' })
    : `${criticInfo.bio}`;

  const chuckPersona = getCriticPersona('editor', { context: 'colleague_interaction' });

  const prompt = `You are a podcast script generator for "The Smudged Pamphlet" podcast.

Generate a natural, engaging 3-5 minute conversation between:

**Chuck Morrison (Host)**:
${chuckPersona}
VOCAL STYLE: Make Chuck sound warm, straightforward, and conversational. He should speak with confidence and a "regular guy" tone - not pretentious. Use a friendly, direct style. He likes his music loud, his movies with explosions, and his words short. He's the voice of the audience.

**${criticInfo.name} (Guest)**:
${criticPersona}
VOCAL STYLE: ${getVocalStyleForCritic(criticInfo.name)}

CONTEXT:
- Review Title: "${reviewTitle}"
- Artist/Subject: ${artist}
- Score: ${score}/10
- Summary: "${summary}"
${notableLyrics ? `- Notable Quote: "${notableLyrics}"` : ''}${mediaContext}

IMPORTANT: This review is about ${mediaTypeDescription}. Make sure the conversation reflects this throughout.

REVIEW CONTENT:
${reviewBodyText}

IMPORTANT - READER COMMENTS CONTEXT:
The review generated discussion. Here are some of the comments/reactions:
${options?.comments && options.comments.length > 0
  ? options.comments.slice(0, 5).map((c: any) =>
      `- ${c.username}: "${c.text}"`
    ).join('\n')
  : '(No comments yet)'}

Use these comments to inform the discussion - Chuck might bring up interesting points readers made, or the critic might address criticisms.

PODCAST GUIDELINES:
1. Chuck opens the show warmly, introduces the guest and the work being discussed
2. Chuck asks the critic to explain their review and score
3. The conversation should feel natural - include interruptions, agreements, disagreements
4. Chuck should challenge overly pretentious takes (he's the everyman defender)
5. The critic should defend their perspective using SPECIFIC examples from the content - timestamps, moments, exact quotes
6. Include 2-3 back-and-forth exchanges that dig deeper into specific points
7. Reference the reader comments when relevant - "Some readers said..." or "One commenter argued..."
8. Chuck wraps up with a brief closing statement
9. Keep the total conversation to 15-25 exchanges (not too long)
10. Use casual language, contractions, filler words ("you know", "I mean", "like", "uh", "um")
11. Include short one word vocalizations (not pauses or ommissions) and reactions in asterisks: *sighs*, *laughs*, *scoffs*, *groans*, *chuckles*,
12. Use phatic expressions: "Right?", "You see?", "Come on", "Seriously?", "Yeah, yeah", "Hold on", "Wait, wait"
13. Make it sound like two people actually talking, not reading a script - be messy, overlap, interrupt

CRITICAL - ENGAGE WITH SPECIFICS:
- When the critic discusses what they liked/disliked, they should reference SPECIFIC moments, sounds, shots, sentences
- Not "the production was sterile" - instead "that lifeless reverb on the snare at 1:32"
- Not "the cinematography was bad" - instead "that awkward Dutch angle at 0:47"
- Not "the writing was pedestrian" - instead quote a specific clunky sentence
- Chuck should push back with concrete questions: "What exactly bothered you about that part?"
- The conversation should reveal they ACTUALLY engaged with the content, not just have opinions about it

FORMAT:
Return ONLY the script in this exact format (no additional commentary):

Chuck: [opening line with vocalizations embedded naturally]
${criticInfo.name}: [response with reactions like *scoffs* or *laughs*]
Chuck: [next line]
${criticInfo.name}: [response]
...and so on

IMPORTANT: Include vocalizations WITHIN the dialogue text, like: "Well *chuckles* I don't know about that" or "*sighs* Look, here's the thing..."

DO NOT include stage directions beyond vocalizations. Keep it in "SpeakerName: Line" format with vocalizations embedded.`;

  try {
    const response = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-pro',
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.9, // Higher temperature for more creative dialogue
          maxOutputTokens: 65535,
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate podcast script');
    }

    const data = await response.json();
    const scriptText = data.candidates?.[0]?.content?.parts?.[0]?.text ||
                       data.parts?.[0]?.text || '';

    if (!scriptText) {
      throw new Error('No script text returned from API');
    }

    const albumArtPrompt = generateAlbumArtPrompt(reviewTitle, artist, summary);
    return { script: parseScriptToStructured(scriptText), albumArtPrompt };
  } catch (error) {
    console.error('Error generating podcast script:', error);
    throw error;
  }
}

/**
 * Generate a simple album art prompt based on review details
 */
function generateAlbumArtPrompt(title: string, artist: string, summary: string): string {
  return `Create album art for a podcast episode about "${title}" by ${artist}. ${summary}`;
}

/**
 * Generate an editorial roundtable podcast with multiple critics and Chuck as host
 */
async function generateEditorialRoundtable(
  options: PodcastGenerationOptions,
  comments: any[]
): Promise<PodcastGenerationResult> {
  const { reviewTitle, artist, score, summary, body } = options;

  // Extract unique critics - prioritize reviewCritics if provided
  const validCriticTypes: CriticType[] = ['music', 'film', 'literary', 'business'];
  const participatingCritics = new Set<CriticType>();

  // First, add critics from reviewCritics if available (for editorials with multiple reviews)
  if (options.reviewCritics && options.reviewCritics.length > 0) {
    options.reviewCritics.forEach(critic => {
      if (validCriticTypes.includes(critic)) {
        participatingCritics.add(critic);
      }
    });
  }

  // Also check comments for additional critics
  comments.forEach(comment => {
    // Check if comment has a critic type
    if (comment.critic && validCriticTypes.includes(comment.critic)) {
      participatingCritics.add(comment.critic);
    }
    comment.replies?.forEach((reply: any) => {
      if (reply.critic && validCriticTypes.includes(reply.critic)) {
        participatingCritics.add(reply.critic);
      }
    });
  });

  // Fallback: if no critics found, use the review's critic type
  if (participatingCritics.size === 0 && options.criticType) {
    participatingCritics.add(options.criticType);
  }

  const criticInfos = Array.from(participatingCritics).map(type =>
    getCriticInfo(type)
  );

  const chuckPersona = getCriticPersona('editor', { context: 'colleague_interaction' });

  // Get full personas for each critic
  const criticDescriptions = Array.from(participatingCritics).map(type => {
    const info = getCriticInfo(type);
    const persona = getCriticPersona(type, { context: 'colleague_interaction' });
    return `**${info.name}**:\n${persona}\nVOCAL STYLE: ${getVocalStyleForCritic(info.name)}`;
  }).join('\n\n');

  const reviewBodyText = body.join('\n\n');

  const prompt = `You are a podcast script generator for "The Smudged Pamphlet" editorial roundtable podcast.

Generate a natural, engaging 5-8 minute roundtable discussion between:

**Chuck Morrison (Host/Moderator)**:
${chuckPersona}
VOCAL STYLE: Make Chuck sound warm but authoritative as a moderator. He should guide the conversation, interrupt when needed, and keep things moving. Friendly but in charge. He's the everyman who calls out pretension and defends the audience.

PANELISTS:
${criticDescriptions}

========== ORIGINAL REVIEWS BEING DISCUSSED ==========
${options.originalReviews?.map((rev, idx) => {
  const criticInfo = getCriticInfo(rev.critic || 'music');
  const mediaType = rev.isYouTube ? 'YouTube video' : rev.hasAudioFile ? 'audio file' : rev.documentFileName ? 'document' : 'media';
  return `
━━━ Review #${idx + 1} ━━━
Work: "${rev.title}" by ${rev.artist}
Media: [${mediaType}] (actual media file included in this request for your analysis)
AUTHOR: ${rev.criticName || criticInfo.name} wrote this review
Score Given: ${rev.score}/10
Summary: ${rev.summary}

Full Review Body:
${rev.body.join('\n\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}).join('\n') || `- Work: "${artist}" - "${reviewTitle}"\n- Lead Review Score: ${score}/10\n- Lead Review Summary: "${summary}"\n\nREVIEW CONTENT:\n${reviewBodyText}`}

CRITICAL: Each critic knows which review THEY wrote. Defend YOUR review and YOUR score. Critique the OTHER critics' reviews and scores. Do not confuse whose work is whose.

EDITORIAL COMMENTS TO REFERENCE:
${comments.slice(0, 10).map(c => {
  const replies = c.replies?.slice(0, 2).map((r: any) => `  └─ ${r.username}: ${r.text}`).join('\n') || '';
  return `${c.username}: ${c.text}${replies ? '\n' + replies : ''}`;
}).join('\n')}

These comments represent the discussion this editorial sparked. Reference them naturally - critics might defend their positions, Chuck might bring up reader points.

ROUNDTABLE GUIDELINES:
1. Chuck opens the show, introduces the work and all panelists
2. Chuck asks the lead reviewer (original critic) to present their take first
3. Other critics chime in with agreements, disagreements, or different perspectives
4. Chuck moderates - asks follow-up questions, manages speaking time, keeps it moving
5. Critics should reference each other's points ("I agree with [Name] that...", "But [Name], you're missing...")
6. Reference the reader comments when relevant - "One reader pointed out..." or "People in the comments are saying..."
7. Include some tension/debate but keep it professional and witty
8. Each critic should speak at least 3-4 times
9. Chuck should speak frequently to guide the conversation
10. End with Chuck asking each critic for a final thought (one sentence each)
11. Chuck gives a brief closing
12. Total: 25-40 exchanges for a longer editorial discussion
13. Use casual language, contractions, filler words ("you know", "I mean", "like", "uh", "um")
14. Include short one word vocalizations (not pauses or ommissions) and reactions in asterisks: *sighs*, *laughs*, *scoffs*, *groans*, *chuckles*,
15. Use phatic expressions: "Right?", "You see?", "Come on", "Seriously?", "Yeah, yeah", "Hold on", "Wait, wait"
16. Sound natural - be messy, overlap, interrupt, talk over each other

CRITICAL - ENGAGE WITH SPECIFICS:
- Critics defending THEIR reviews should cite SPECIFIC moments from the content they reviewed
- Critics critiquing OTHERS' reviews should reference specific claims or observations from those reviews
- Not "I stand by my assessment" - instead "that compression issue at 1:47 was exactly what I meant"
- Not "I disagree with your score" - instead "you gave it a 6.2 but ignored that awful transition at the bridge"
- Chuck should push for specifics: "What exactly are you talking about?" "Where in the song?"
- The conversation should prove everyone actually consumed the media being discussed
${participatingCritics.size > 2 ? `
17. SEGMENT STRUCTURE: Since there are ${participatingCritics.size} panelists, create natural conversation segments where Chuck focuses on ONE critic at a time:
    - Start each segment with Chuck turning to the specific critic: "Let's hear from [Name]..." or "What do you think, [Name]?"
    - Have 5-8 exchanges between Chuck and that critic
    - End the segment with Chuck transitioning: "Thanks [Name]. Now let me turn to [NextName]..." or "Interesting. [NextName], your thoughts?"
    - These transitions should feel natural, like a host managing speaking time
    - insert "---SEGMENT BREAK---" between segments.
    - Each critic gets their own segment with Chuck
` : ''}

FORMAT:
Return ONLY the script in this exact format (no additional commentary):

Chuck: [opening line with vocalizations embedded naturally]
${criticInfos[0]?.name || 'Critic'}: [response with reactions]
Chuck: [moderating comment]
${criticInfos[1]?.name || 'Critic'}: [response with reactions like *scoffs* or *laughs*]
---SEGMENT BREAK---
Chuck: [moderating comment]
${criticInfos[1]?.name || 'Critic'}: [response with reactions like *scoffs* or *laughs*]
Use exact names: "Chuck", "${criticInfos.map(c => c.name).join('", "')}"
...and so on

IMPORTANT: Include one word vocalizations WITHIN the dialogue text, like: "Well *chuckles* I don't know about that" or "*sighs* Look, here's the thing..."

DO NOT include stage or music directions beyond vocalizations your script only powers the dialogue itself. Keep it in "SpeakerName: Line" format with vocalizations embedded.`;

  try {
    // Build parts array with prompt text and media files
    const parts: any[] = [{ text: prompt }];

    // Add media content from original reviews
    if (options.originalReviews) {
      options.originalReviews.forEach((rev, idx) => {
        if (rev.mediaContent) {
          parts.push(rev.mediaContent);
          console.log(`Added media for review #${idx + 1}: ${rev.title}`);
        }
      });
    }

    const response = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-pro',
        contents: [
          {
            role: 'user',
            parts
          }
        ],
        generationConfig: {
          temperature: 0.9, // Higher temperature for more creative dialogue
          maxOutputTokens: 65535, // More tokens for longer roundtable discussions
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate editorial podcast script');
    }

    const data = await response.json();
    const scriptText = data.candidates?.[0]?.content?.parts?.[0]?.text ||
                       data.parts?.[0]?.text || '';

    if (!scriptText) {
      throw new Error('No script text returned from API');
    }

    console.log('Number of participating critics:', participatingCritics.size);
    console.log('Critics:', Array.from(participatingCritics));

    // Generate album art prompt
    const albumArtPrompt = generateAlbumArtPrompt(reviewTitle, artist, summary);

    // Generate editorial title directly (not via API call since we're already server-side)
    let editorialTitle: string | undefined;
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const titlePrompt = `Generate a short, catchy title for this editorial podcast discussion. The title should be 4-6 words that capture the main theme or debate.

Editorial summary: ${summary}

Podcast script excerpt:
${scriptText.substring(0, 2000)}

Requirements:
- 4-6 words only
- Catchy and engaging
- Reflects the main discussion topic
- NO quotation marks
- NO generic phrases like "Editorial Discussion" or "Roundtable"
- Focus on the actual topic being debated

Return ONLY the title, nothing else.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: titlePrompt }] }],
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 50,
              }
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const generatedTitle = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (generatedTitle) {
            editorialTitle = generatedTitle
              .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
              .replace(/\s+/g, ' ') // Normalize whitespace
              .trim();
            console.log('Generated editorial title:', editorialTitle);
          }
        }
      }
    } catch (error) {
      console.warn('Error generating editorial title:', error);
    }

    // Check if we need to segment (3+ total speakers = 2+ critics + Chuck)
    // TTS API only supports exactly 2 speakers, so we need segments when we have 2+ critics
    if (participatingCritics.size >= 2) {
      console.log('Detected 3+ total speakers (Chuck + critics), checking for segment breaks in script...');
      const criticNames = Array.from(participatingCritics).map(type => getCriticInfo(type).name);
      console.log('Segment break markers found:', (scriptText.match(/---SEGMENT BREAK---|--- SEGMENT BREAK ---|SEGMENT BREAK/gi) || []).length);
      const segments = parseScriptToSegments(scriptText, criticNames);
      console.log('Parsed into', segments.length, 'segments');
      return { script: segments, albumArtPrompt, editorialTitle };
    }

    console.log('Only 2 total speakers (Chuck + 1 critic), returning flat script');
    return { script: parseScriptToStructured(scriptText), albumArtPrompt, editorialTitle };
  } catch (error) {
    console.error('Error generating editorial podcast script:', error);
    throw error;
  }
}

/**
 * Parse the text script into structured format
 */
function parseScriptToStructured(scriptText: string): PodcastScript[] {
  const lines = scriptText.split('\n').filter(line => line.trim());
  const script: PodcastScript[] = [];

  for (const line of lines) {
    // Match pattern: "SpeakerName: dialogue text"
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      const speaker = match[1].trim();
      const dialogue = match[2].trim();

      script.push({
        speaker,
        line: dialogue,
      });
    }
  }

  return script;
}

/**
 * Parse segmented script (for 3+ speakers) into segments with 2 speakers each
 * Splits on "---SEGMENT BREAK---" markers
 */
function parseScriptToSegments(scriptText: string, criticNames: string[]): PodcastSegment[] {
  const segments: PodcastSegment[] = [];

  // Split by segment break marker
  const segmentTexts = scriptText.split(/---SEGMENT BREAK---|--- SEGMENT BREAK ---|SEGMENT BREAK/i);

  for (const segmentText of segmentTexts) {
    if (!segmentText.trim()) continue;

    const script = parseScriptToStructured(segmentText);
    if (script.length === 0) continue;

    // Identify unique speakers in this segment
    const uniqueSpeakers = Array.from(new Set(script.map(s => s.speaker)));

    // If this segment has 3+ speakers, we need to split it further
    // This happens when the AI doesn't properly segment the script
    if (uniqueSpeakers.length > 2) {
      console.warn(`Segment has ${uniqueSpeakers.length} speakers (${uniqueSpeakers.join(', ')}), force-splitting by critic...`);

      // Chuck should be in every segment
      const chuckName = 'Chuck';
      const critics = uniqueSpeakers.filter(s => s !== chuckName);

      // Group consecutive exchanges by critic to avoid duplicates
      // We'll go through the script linearly and create segments based on speaker transitions
      let currentCritic: string | null = null;
      let currentSegmentScript: typeof script = [];

      for (let i = 0; i < script.length; i++) {
        const line = script[i];

        // If this is a critic line, check if we need to start a new segment
        if (critics.includes(line.speaker)) {
          if (currentCritic && currentCritic !== line.speaker) {
            // Speaker changed - save current segment and start new one
            if (currentSegmentScript.length > 0) {
              console.log(`Created sub-segment: ${chuckName} + ${currentCritic} (${currentSegmentScript.length} lines)`);
              segments.push({
                speakers: [chuckName, currentCritic],
                script: currentSegmentScript
              });
            }
            currentSegmentScript = [];
          }
          currentCritic = line.speaker;
        }

        // Add line to current segment
        currentSegmentScript.push(line);
      }

      // Don't forget the last segment
      if (currentSegmentScript.length > 0 && currentCritic) {
        console.log(`Created sub-segment: ${chuckName} + ${currentCritic} (${currentSegmentScript.length} lines)`);
        segments.push({
          speakers: [chuckName, currentCritic],
          script: currentSegmentScript
        });
      }
    } else {
      // Proper 2-speaker segment
      segments.push({
        speakers: uniqueSpeakers.slice(0, 2), // Ensure exactly 2
        script
      });
    }
  }

  return segments;
}

/**
 * Format script for Gemini TTS multi-speaker input
 * Returns a formatted string in the exact format Gemini expects
 */
export function formatScriptForTTS(script: PodcastScript[]): string {
  return script.map(({ speaker, line }) => `${speaker}: ${line}`).join('\n');
}

/**
 * Get vocal style instructions for a critic to guide TTS performance
 */
function getVocalStyleForCritic(criticName: string): string {
  const styleMap: Record<string, string> = {
    'Julian Pinter': 'Make Julian sound pretentious, sardonic, and slightly dismissive. He should speak with a condescending tone, using dramatic pauses and sarcastic emphasis. Think bored intellectual who\'s seen it all.',
    'Rex Beaumont': 'Make Rex sound serious and dismissive, with a gravelly, authoritative tone. He should speak slowly and deliberately, as if everything is beneath him except auteur cinema. Use a jaded, film-snob delivery.',
    'Margot Ashford': 'Make Margot sound overly academic and theoretical. She should speak in a measured, professorial tone with occasional excitement when discussing literary theory. Think pretentious grad student who loves to name-drop.',
    'Patricia Chen': 'Make Patricia sound no-nonsense, direct, and professional. She should speak clearly and firmly, with impatience for corporate jargon. Think sharp business journalist who doesn\'t suffer fools.',
  };

  return styleMap[criticName] || 'Speak naturally with appropriate emotion and emphasis.';
}

/**
 * Get voice configuration for a critic/staff member
 * Maps personas to Gemini voice options based on personality
 */
export function getVoiceForSpeaker(speakerName: string): string {
  const voiceMap: Record<string, string> = {
    // Chuck Morrison - everyman, straightforward, warm
    'Chuck': 'Algieba', // Firm voice
    'Chuck Morrison': 'Algieba',

    // Julian Pinter - pretentious, sardonic music critic
    'Julian': 'Puck', // Upbeat but can sound sarcastic
    'Julian Pinter': 'Puck',

    // Rex Beaumont - dismissive film critic
    'Rex': 'Algenib', // Gravelly, serious
    'Rex Beaumont': 'Algenib',

    // Margot Ashford - academic literary critic
    'Margot': 'Gacrux', // Knowledgeable, measured
    'Margot Ashford': 'Gacrux',

    // Patricia Chen - no-nonsense business editor
    'Patricia': 'Sulafat', // Firm, professional
    'Patricia Chen': 'Sulafat',
  };

  return voiceMap[speakerName] || 'Kore'; // Default to Kore if not found
}
