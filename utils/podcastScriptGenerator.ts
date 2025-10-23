import { getCriticPersona, getCriticInfo, getStaffInfo, type CriticType } from './critics';

interface PodcastScript {
  speaker: string;
  line: string;
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
}

/**
 * Generates a podcast script using AI orchestration
 * For single reviews: Chuck Morrison (host) + Review Author
 * For editorials: Chuck Morrison (host) + Multiple Critics (roundtable)
 */
export async function generatePodcastScript(
  options: PodcastGenerationOptions
): Promise<PodcastScript[]> {
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
): Promise<PodcastScript[]> {
  const reviewBodyText = body.join('\n\n');

  // Build media context
  let mediaContext = '';
  if (options?.isYouTube && options?.youtubeUrl) {
    mediaContext = `\nMEDIA TYPE: YouTube video (${options.youtubeUrl})
NOTE: This is a VIDEO review. Reference visual elements, cinematography, performances, or video content as appropriate.`;
  } else if (options?.audioFileName) {
    mediaContext = `\nMEDIA TYPE: Audio file (${options.audioFileName})
NOTE: This is an AUDIO/MUSIC review. Reference songs, production, vocals, instrumentation as appropriate.`;
  } else if (options?.documentFileName) {
    mediaContext = `\nMEDIA TYPE: Written document (${options.documentFileName})
NOTE: This is a DOCUMENT review. Reference writing style, arguments, structure, content as appropriate.`;
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
5. The critic should defend their perspective using examples from the review
6. Include 2-3 back-and-forth exchanges that dig deeper into specific points
7. Reference the reader comments when relevant - "Some readers said..." or "One commenter argued..."
8. Chuck wraps up with a brief closing statement
9. Keep the total conversation to 15-25 exchanges (not too long)
10. Use casual language, contractions, filler words ("you know", "I mean", "like", "uh", "um")
11. Include vocalizations and reactions in asterisks: *sighs*, *laughs*, *scoffs*, *groans*, *chuckles*, *pauses*
12. Use phatic expressions: "Right?", "You see?", "Come on", "Seriously?", "Yeah, yeah", "Hold on", "Wait, wait"
13. Make it sound like two people actually talking, not reading a script - be messy, overlap, interrupt

FORMAT:
Return ONLY the script in this exact format (no additional commentary):

Chuck: [opening line with vocalizations like *chuckles* or *sighs* embedded naturally]
${criticInfo.name}: [response with reactions like *scoffs* or *laughs*]
Chuck: [next line]
${criticInfo.name}: [response]
...and so on

IMPORTANT: Include vocalizations WITHIN the dialogue text, like: "Well *chuckles* I don't know about that" or "*sighs* Look, here's the thing..."

DO NOT include stage directions outside the dialogue. Keep it in "SpeakerName: Line" format with vocalizations embedded.`;

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

    return parseScriptToStructured(scriptText);
  } catch (error) {
    console.error('Error generating podcast script:', error);
    throw error;
  }
}

/**
 * Generate an editorial roundtable podcast with multiple critics and Chuck as host
 */
async function generateEditorialRoundtable(
  options: PodcastGenerationOptions,
  comments: any[]
): Promise<PodcastScript[]> {
  const { reviewTitle, artist, score, summary, body } = options;

  // Extract unique critics from comments
  const participatingCritics = new Set<string>();
  comments.forEach(comment => {
    if (comment.persona_type !== 'user' && comment.persona_type !== 'bot') {
      participatingCritics.add(comment.persona_type);
    }
    comment.replies?.forEach((reply: any) => {
      if (reply.critic && reply.persona_type !== 'user') {
        participatingCritics.add(reply.critic);
      }
    });
  });

  const criticInfos = Array.from(participatingCritics).map(type =>
    getCriticInfo(type as any)
  );

  const chuckPersona = getCriticPersona('editor', { context: 'colleague_interaction' });

  // Get full personas for each critic
  const criticDescriptions = Array.from(participatingCritics).map(type => {
    const info = getCriticInfo(type as any);
    const persona = getCriticPersona(type as any, { context: 'colleague_interaction' });
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

DISCUSSION TOPIC:
- Work: "${artist}" - "${reviewTitle}"
- Lead Review Score: ${score}/10
- Lead Review Summary: "${summary}"

REVIEW CONTENT:
${reviewBodyText}

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
14. Include vocalizations and reactions in asterisks: *sighs*, *laughs*, *scoffs*, *groans*, *chuckles*, *pauses*
15. Use phatic expressions: "Right?", "You see?", "Come on", "Seriously?", "Yeah, yeah", "Hold on", "Wait, wait"
16. Sound natural - be messy, overlap, interrupt, talk over each other

FORMAT:
Return ONLY the script in this exact format (no additional commentary):

Chuck: [opening line with vocalizations like *chuckles* or *sighs* embedded naturally]
${criticInfos[0]?.name || 'Critic'}: [response with reactions]
Chuck: [moderating comment]
${criticInfos[1]?.name || 'Critic'}: [response with reactions like *scoffs* or *laughs*]
...and so on

Use exact names: "Chuck", "${criticInfos.map(c => c.name).join('", "')}"

IMPORTANT: Include vocalizations WITHIN the dialogue text, like: "Well *chuckles* I don't know about that" or "*sighs* Look, here's the thing..."

DO NOT include stage directions outside the dialogue. Keep it in "SpeakerName: Line" format with vocalizations embedded.`;

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

    return parseScriptToStructured(scriptText);
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
