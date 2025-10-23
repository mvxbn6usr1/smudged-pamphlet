import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, FileText, Check, MessageSquare, Archive, X, ThumbsDown, ChevronDown, Zap } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getAudioData } from '@/utils/db';
import { getStaffInfo as getStaffInfoUtil } from '@/utils/critics';

const cn = (...inputs: any[]) => twMerge(clsx(inputs));

// Constants for comment generation timing
const MAX_ORGANIC_COMMENTS = 20;
const MIN_COMMENT_DELAY_MS = 8000;
const MAX_COMMENT_DELAY_MS = 20000;
const INITIAL_COMMENT_MIN_DELAY_MS = 3000;
const INITIAL_COMMENT_MAX_DELAY_MS = 8000;
const AUTO_SAVE_DEBOUNCE_MS = 1000;

interface SavedReview {
  id: string;
  title: string;
  artist: string;
  slug: string;
  timestamp: number;
  review: {
    title: string;
    artist: string;
    score: number;
    summary: string;
    body: string[];
    critic?: 'music' | 'film' | 'literary' | 'business';
    criticName?: string;
  };
  audioFileName?: string;
  audioDataUrl?: string;
  albumArt?: string;
  waveformData?: number[];
  hasAudioInDB?: boolean;
  youtubeUrl?: string;
  isYouTube?: boolean;
}

interface Reply {
  id: string;
  username: string;
  persona_type: string;
  timestamp: string;
  text: string;
  likes: number;
  is_editor?: boolean;
  is_critic?: boolean;
  critic?: 'music' | 'film' | 'literary' | 'business';
  replyingToUsername?: string;
  replyingToId?: string;
}

interface Comment {
  id: string;
  username: string;
  persona_type: string;
  timestamp: string;
  text: string;
  likes: number;
  replies: Reply[];
  is_editor?: boolean;
  is_critic?: boolean;
  critic?: 'music' | 'film' | 'literary' | 'business';
}

interface Verdict {
  mediaTitle: string;
  mediaArtist: string;
  verdict: 'ROCKS' | 'SUCKS';
  reason: string;
}

interface SavedEditorial {
  id: string;
  title: string;
  summary: string;
  body: string[];
  verdicts: Verdict[];
  timestamp: number;
  reviewIds: string[];
  comments: Comment[];
}

type CriticType = 'music' | 'film' | 'literary' | 'business';
type StaffType = CriticType | 'editor';

export default function Editorial() {
  const router = useRouter();

  // Use shared utility for critic/staff info
  const getStaffInfo = getStaffInfoUtil;

  const [savedReviews, setSavedReviews] = useState<SavedReview[]>([]);
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set());
  const [editorial, setEditorial] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [savedEditorials, setSavedEditorials] = useState<SavedEditorial[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [userName, setUserName] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);
  const [commentGenerationActive, setCommentGenerationActive] = useState(false);
  const [typingIndicators, setTypingIndicators] = useState<Array<{username: string, commentId: string | null}>>([]);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const commentCountRef = useRef(0);
  const organicTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const saveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Set up mounted ref cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const storedReviews = localStorage.getItem('smudged_reviews');
    if (storedReviews) {
      try {
        setSavedReviews(JSON.parse(storedReviews));
      } catch (e) {
        console.error('Failed to load saved reviews', e);
      }
    }

    const storedEditorials = localStorage.getItem('smudged_editorials');
    if (storedEditorials) {
      try {
        setSavedEditorials(JSON.parse(storedEditorials));
      } catch (e) {
        console.error('Failed to load saved editorials', e);
      }
    }
  }, []);

  const toggleReview = (id: string) => {
    const newSelected = new Set(selectedReviews);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedReviews(newSelected);
  };

  const generateEditorial = async () => {
    if (selectedReviews.size === 0) return;

    setIsGenerating(true);

    try {
      const reviewsToComment = savedReviews.filter(r => selectedReviews.has(r.id));

      // Build media parts array - retrieve actual media files
      const mediaParts: any[] = [];

      for (const review of reviewsToComment) {
        if (review.isYouTube && review.youtubeUrl) {
          // YouTube video - add as file URI
          mediaParts.push({
            fileData: {
              fileUri: review.youtubeUrl
            }
          });
        } else if (review.hasAudioInDB) {
          // Audio/video file from IndexedDB
          try {
            const audioDataUrl = await getAudioData(review.id);
            if (audioDataUrl) {
              // Extract base64 data from data URL
              const base64Match = audioDataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (base64Match) {
                const mimeType = base64Match[1];
                const base64Data = base64Match[2];
                mediaParts.push({
                  inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                  }
                });
              }
            }
          } catch (e) {
            console.error(`Failed to load media for review ${review.id}:`, e);
          }
        }
      }

      const prompt = `You are Chuck Morrison, Editor-in-Chief of 'The Smudged Pamphlet'.

YOUR CHARACTER:
You're an everyman. No fancy words, no pretentious nonsense. You like your meat red, your women blonde, your movies with explosions, your music loud and epic, and your words short and easy to read.

You're the voice of the AUDIENCE against your pretentious critics. You don't care about "deconstructing narrative theory" or "Bergmanesque cinematography" or "post-modern irony." You care if something ROCKS or if it SUCKS.

You're annoying to your critics because:
- You call them out when they're being too pretentious
- You advocate for the common viewer/listener/reader
- You're their boss, but you don't act like an intellectual
- You sometimes just... don't get what they're going on about

But you're also:
- Fair when something genuinely deserves praise
- Funny and self-aware
- A good writer in a populist, accessible style
- Protective of your publication and your team

THE MEDIA YOU'VE CONSUMED:
${reviewsToComment.map(r => `"${r.title}" by ${r.artist}`).join(', ')}

YOUR CRITICS' REVIEWS OF THE SAME MEDIA:
${JSON.stringify(reviewsToComment.map(r => ({
  critic: r.review.criticName,
  mediaTitle: r.title,
  mediaArtist: r.artist,
  score: r.review.score,
  summary: r.review.summary,
  body: r.review.body
})))}

Write an EDITORIAL COMMENTARY combining YOUR OWN EXPERIENCE with the media AND your reaction to what your critics wrote.

IMPORTANT: You've ACTUALLY WATCHED/LISTENED TO/READ the same media your critics reviewed. You can:
- Reference specific moments, songs, scenes, or passages, pages, or documents YOU experienced
- Compare YOUR gut reaction to what your critics said
- Call out when they're being pretentious about something that was actually simple and fun
- Defend what regular audiences would actually enjoy about this media
- Question their scoring based on YOUR OWN experience

Points to hit:
- Call out pretentious language ("What does 'Bergmanesque' even mean, Rex? I just saw a guy walking slowly!")
- Share YOUR reaction as a regular viewer/listener ("This song ROCKS - who cares about 'post-modern irony'?")
- Act as a foil to their elitism ("A 3.5? I loved the big guitar solo in the third track!")
- Be funny and accessible
- Show you care about quality journalism even if you disagree
- Keep it SHORT and PUNCHY

Write 5-6 paragraphs. No fancy words. Talk like a real person.

After the editorial, give your FINAL VERDICT on each piece of media. Binary choice: does it ROCK or does it SUCK?

Output ONLY valid JSON:
{
  "title": "Editorial title (punchy, no pretension)",
  "summary": "One sentence summary",
  "body": ["paragraph1", "paragraph2", "paragraph3"],
  "verdicts": [
    {
      "mediaTitle": "exact title from the review",
      "mediaArtist": "exact artist from the review",
      "verdict": "ROCKS" or "SUCKS",
      "reason": "One punchy sentence why (10-15 words max)"
    }
  ]
}`;

      // Build the content parts array - text prompt + all media
      const contentParts = [
        { text: prompt },
        ...mediaParts
      ];

      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-2.5-pro',
          contents: [{ role: 'user', parts: contentParts }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate editorial');
      }

      const data = await response.json();
      const editorialText = data.parts[0]?.text || '{}';
      const editorialData = JSON.parse(editorialText);

      // Create editorial with metadata
      const newEditorial = {
        ...editorialData,
        id: `editorial-${Date.now()}`,
        timestamp: Date.now(),
        reviewIds: Array.from(selectedReviews)
      };

      setEditorial(newEditorial);
      setComments([]);  // Reset comments for new editorial
      setCommentGenerationActive(true);  // Enable AI comment generation
      commentCountRef.current = 0;
    } catch (error) {
      console.error('Editorial generation error:', error);
      alert('Failed to generate editorial. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const saveEditorial = () => {
    if (!editorial) return;

    const editorialToSave: SavedEditorial = {
      ...editorial,
      comments: comments
    };

    const updated = [editorialToSave, ...savedEditorials];
    setSavedEditorials(updated);
    localStorage.setItem('smudged_editorials', JSON.stringify(updated));
  };

  // Organic comment generation for editorial
  const generateOrganicEditorialComment = useCallback(async () => {
    if (!editorial) return null;

    try {
      const interactionType = Math.random();

      if (interactionType < 0.4) {
        // Critic comments on Chuck's editorial (40% chance)
        const criticTypes: CriticType[] = ['music', 'film', 'literary', 'business'];
        const criticType = criticTypes[Math.floor(Math.random() * criticTypes.length)];
        const criticInfo = getStaffInfo(criticType);
        const shouldReply = Math.random() < 0.5 && comments.length > 0;

        if (shouldReply) {
          const allComments = comments.flatMap(c => [c, ...c.replies.map(r => ({ ...r, parentId: c.id }))]);
          const target: any = allComments[Math.floor(Math.random() * allComments.length)];

          const criticPersona = criticType === 'film'
            ? `You are Rex Beaumont, film critic. You watch everything at 1.5x speed and are pretentious about cinema. Chuck Morrison is your boss.`
            : criticType === 'literary'
            ? `You are Margot Ashford, literary critic with three PhDs. You're overly academic and condescending. Chuck Morrison is your boss.`
            : criticType === 'business'
            ? `You are Patricia Chen, business editor. You despise corporate jargon and value clarity. Chuck Morrison is your boss.`
            : `You are Julian Pinter, music critic. You're pretentious and sardonic about music. Chuck Morrison is your boss.`;

          const prompt = `${criticPersona}

You're reading your boss Chuck's editorial about your work and the comments section.
Editorial: ${JSON.stringify(editorial)}

This comment caught your attention:
${JSON.stringify(target)}

Write a brief reply from your perspective. You might:
- Defend your critical approach
- Playfully push back against Chuck's populism
- Show professional tension or reluctant respect
- Reference your expertise

Keep it in character and brief. Output: {"reply_text":"your reply"}`;

          const replyResponse = await fetch('/api/gemini/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gemini-2.0-flash-exp',
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          });

          if (!replyResponse.ok) return null;
          const replyData = await replyResponse.json();
          const replyText = replyData.parts?.[0]?.text || '{}';
          const reply = JSON.parse(replyText);

          return {
            type: 'reply',
            parentId: target.parentId || target.id,
            data: {
              id: `re${Date.now()}`,
              username: criticInfo.username,
              persona_type: criticInfo.title,
              timestamp: 'Just now',
              text: reply.reply_text || reply.text,
              likes: 0,
              is_critic: true,
              critic: criticType,
              replyingToUsername: target.username,
              replyingToId: target.id
            }
          };
        } else {
          const criticPersona = criticType === 'film'
            ? `You are Rex Beaumont, film critic. You watch everything at 1.5x speed and are pretentious about cinema. Chuck Morrison is your boss.`
            : criticType === 'literary'
            ? `You are Margot Ashford, literary critic with three PhDs. You're overly academic and condescending. Chuck Morrison is your boss.`
            : criticType === 'business'
            ? `You are Patricia Chen, business editor. You despise corporate jargon and value clarity. Chuck Morrison is your boss.`
            : `You are Julian Pinter, music critic. You're pretentious and sardonic about music. Chuck Morrison is your boss.`;

          const prompt = `${criticPersona}

Your boss Chuck Morrison wrote this editorial about your work:
${JSON.stringify(editorial)}

Write a brief comment from your perspective. You might:
- Defend your critical approach against his populism
- Acknowledge some of his points reluctantly
- Show professional tension
- Reference your expertise and why it matters

Keep it brief and in character. Output: {"text":"your comment"}`;

          const commentResponse = await fetch('/api/gemini/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gemini-2.0-flash-exp',
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          });

          if (!commentResponse.ok) return null;
          const commentResponseData = await commentResponse.json();
          const commentText = commentResponseData.parts?.[0]?.text || '{}';
          const commentData = JSON.parse(commentText);

          return {
            type: 'new_comment',
            data: {
              id: `c${Date.now()}`,
              username: criticInfo.username,
              persona_type: criticInfo.title,
              timestamp: 'Just now',
              text: commentData.text,
              likes: 0,
              replies: [],
              is_critic: true,
              critic: criticType
            }
          };
        }
      } else if (interactionType < 0.6) {
        // Chuck responds to comments (20% chance)
        if (comments.length === 0) return null;

        const allComments = comments.flatMap(c => [c, ...c.replies.map(r => ({ ...r, parentId: c.id }))]);
        const target: any = allComments[Math.floor(Math.random() * allComments.length)];

        const prompt = `You are Chuck Morrison, Editor-in-Chief of 'The Smudged Pamphlet'.

You wrote this editorial:
${JSON.stringify(editorial)}

Someone commented:
${JSON.stringify(target)}

Write a brief reply. You're the everyman editor - no fancy words, you defend the audience, call out pretension, and keep it REAL.

Keep it SHORT and ACCESSIBLE. Talk like a regular person.

Output: {"reply_text":"your reply"}`;

        const replyResponse = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemini-2.0-flash-exp',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (!replyResponse.ok) return null;
        const replyData = await replyResponse.json();
        const replyText = replyData.parts?.[0]?.text || '{}';
        const reply = JSON.parse(replyText);

        return {
          type: 'reply',
          parentId: target.parentId || target.id,
          data: {
            id: `re${Date.now()}`,
            username: 'ChuckMorrison',
            persona_type: 'Editor-in-Chief',
            timestamp: 'Just now',
            text: reply.reply_text || reply.text,
            likes: 0,
            is_editor: true,
            replyingToUsername: target.username,
            replyingToId: target.id
          }
        };
      } else {
        // Random commenter (40% chance)
        const shouldReply = Math.random() < 0.6 && comments.length > 0;

        if (shouldReply) {
          const allComments = comments.flatMap(c => [c, ...c.replies.map(r => ({ ...r, parentId: c.id }))]);
          const target: any = allComments[Math.floor(Math.random() * allComments.length)];

          const prompt = `You're a random internet commenter reading this editorial about critics and their reviews:
${JSON.stringify(editorial)}

Someone commented:
${JSON.stringify(target)}

Generate a reply from a NEW commenter. Output: {"username":"name","persona_type":"type","reply_text":"reply"}`;

          const replyResponse = await fetch('/api/gemini/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gemini-2.0-flash-exp',
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          });

          if (!replyResponse.ok) return null;
          const replyData = await replyResponse.json();
          const replyText = replyData.parts?.[0]?.text || '{}';
          const reply = JSON.parse(replyText);

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
              replyingToUsername: target.username,
              replyingToId: target.id
            }
          };
        } else {
          const prompt = `You're a random internet commenter reading this editorial:
${JSON.stringify(editorial)}

Generate a new comment. Output: {"username":"name","persona_type":"type","text":"comment"}`;

          const commentResponse = await fetch('/api/gemini/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gemini-2.0-flash-exp',
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          });

          if (!commentResponse.ok) return null;
          const commentResponseData = await commentResponse.json();
          const commentText = commentResponseData.parts?.[0]?.text || '{}';
          const commentData = JSON.parse(commentText);

          return {
            type: 'new_comment',
            data: {
              id: `c${Date.now()}`,
              username: commentData.username,
              persona_type: commentData.persona_type,
              timestamp: 'Just now',
              text: commentData.text,
              likes: 0,
              replies: []
            }
          };
        }
      }
    } catch (error) {
      console.error('Organic comment generation error:', error);
      return null;
    }
  }, [editorial, comments]);

  // useEffect for organic comment generation
  useEffect(() => {
    if (!commentGenerationActive || !editorial) {
      if (organicTimerRef.current) {
        clearTimeout(organicTimerRef.current);
        organicTimerRef.current = null;
      }
      setTypingIndicators([]);
      return;
    }

    commentCountRef.current = 0;

    const generateNext = async () => {
      if (commentCountRef.current >= MAX_ORGANIC_COMMENTS || !commentGenerationActive) {
        setCommentGenerationActive(false);
        setTypingIndicators([]);
        return;
      }

      // Show typing indicator
      const tempUsername = `User${Math.floor(Math.random() * 1000)}`;
      const tempCommentId = Math.random() > 0.5 ? null : comments[Math.floor(Math.random() * comments.length)]?.id || null;

      if (!isMountedRef.current) return;

      setTypingIndicators(prev => [...prev, { commentId: tempCommentId, username: tempUsername }]);

      const interaction = await generateOrganicEditorialComment();

      if (!isMountedRef.current) return;

      // Remove typing indicator
      setTypingIndicators(prev => prev.filter(t => t.username !== tempUsername));

      if (interaction) {
        commentCountRef.current++;

        if (interaction.type === 'new_comment') {
          setComments(prev => [...prev, interaction.data as Comment]);
        } else if (interaction.type === 'reply') {
          setComments(prev => prev.map(c =>
            c.id === interaction.parentId
              ? { ...c, replies: [...c.replies, interaction.data as Reply] }
              : c
          ));
        }
      }

      // Schedule next comment
      if (isMountedRef.current && commentCountRef.current < MAX_ORGANIC_COMMENTS && commentGenerationActive) {
        const delay = MIN_COMMENT_DELAY_MS + Math.random() * (MAX_COMMENT_DELAY_MS - MIN_COMMENT_DELAY_MS);
        organicTimerRef.current = setTimeout(generateNext, delay);
      }
    };

    // Start generation
    const initialDelay = INITIAL_COMMENT_MIN_DELAY_MS + Math.random() * (INITIAL_COMMENT_MAX_DELAY_MS - INITIAL_COMMENT_MIN_DELAY_MS);
    organicTimerRef.current = setTimeout(generateNext, initialDelay);

    return () => {
      if (organicTimerRef.current) {
        clearTimeout(organicTimerRef.current);
      }
      setTypingIndicators([]);
    };
  }, [commentGenerationActive, editorial, comments, generateOrganicEditorialComment]);

  // Auto-save comments to the current editorial in localStorage with debouncing
  useEffect(() => {
    if (!editorial || comments.length === 0) return;

    // Clear previous debounce timer
    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }

    // Debounce the save operation
    saveDebounceTimerRef.current = setTimeout(() => {
      // Update the editorial in savedEditorials with current comments
      setSavedEditorials(prev => {
        const currentEditorialIndex = prev.findIndex(e => e.id === editorial.id);
        if (currentEditorialIndex === -1) return prev;

        const updatedEditorials = [...prev];
        updatedEditorials[currentEditorialIndex] = {
          ...updatedEditorials[currentEditorialIndex],
          comments: comments
        };

        try {
          localStorage.setItem('smudged_editorials', JSON.stringify(updatedEditorials));
        } catch (e) {
          console.error('Failed to save to localStorage (quota exceeded?)', e);
        }

        return updatedEditorials;
      });
    }, AUTO_SAVE_DEBOUNCE_MS);

    // Cleanup debounce timer
    return () => {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
      }
    };
  }, [comments, editorial]);

  const handleCommentSubmit = () => {
    if (!commentText.trim() || !userName.trim()) return;

    setIsPostingComment(true);

    setTimeout(() => {
      const newComment: Comment = {
        id: `c${Date.now()}`,
        username: userName,
        persona_type: 'Human User',
        timestamp: 'Just now',
        text: commentText,
        likes: 0,
        replies: []
      };

      if (replyingTo) {
        // Add as reply
        setComments(prev => prev.map(c => {
          if (c.id === replyingTo.commentId) {
            const newReply: Reply = {
              id: `r${Date.now()}`,
              username: newComment.username,
              persona_type: newComment.persona_type,
              timestamp: newComment.timestamp,
              text: newComment.text,
              likes: 0,
              replyingToUsername: replyingTo.username
            };
            return { ...c, replies: [...c.replies, newReply] };
          }
          return c;
        }));
        setReplyingTo(null);
      } else {
        // Add as top-level comment
        setComments(prev => [newComment, ...prev]);
      }

      setCommentText('');
      setIsPostingComment(false);
    }, 300);
  };

  const editorInfo = {
    name: 'Chuck Morrison',
    username: 'ChuckMorrison',
    title: 'Editor-in-Chief',
    color: 'red-500',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=chuckmorrison&top=shortFlat&facialHair=beardMedium&eyebrows=default&mouth=smile&eyes=default&skinColor=ffdbb4',
    bio: 'Editor-in-Chief, likes it loud and simple.'
  };

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-zinc-900 font-serif">
      <header className="border-b-4 border-zinc-900 py-6 px-4 md:px-12 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Reviews
            </button>
            {savedEditorials.length > 0 && (
              <button
                onClick={() => setShowArchive(!showArchive)}
                className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 font-black uppercase text-sm hover:bg-red-600 active:scale-95 transition-all"
              >
                <Archive className="w-4 h-4" />
                Archive ({savedEditorials.length})
              </button>
            )}
          </div>
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 bg-zinc-200 rounded-full overflow-hidden border-4 border-red-500">
              <img src={editorInfo.avatar} alt={editorInfo.name} />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-tight">
                Editorial
              </h1>
              <p className="mt-2 text-lg font-medium text-zinc-600">
                by {editorInfo.name}, {editorInfo.title}
              </p>
              <p className="mt-1 text-sm italic text-zinc-500">
                {editorInfo.bio}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-12 py-12">
        {!editorial ? (
          <div className="space-y-8">
            <div className="bg-white border-2 border-zinc-900 p-8 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)]">
              <h2 className="text-2xl font-black uppercase mb-4 flex items-center gap-2">
                <FileText className="w-6 h-6" />
                Select Reviews for Editorial
              </h2>
              <p className="text-zinc-600 mb-6">
                Chuck will write an editorial commentary on the selected reviews. Pick the ones that
                deserve his take.
              </p>

              {savedReviews.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <p>No reviews available yet. Submit some content first!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedReviews.map((review) => (
                    <button
                      key={review.id}
                      onClick={() => toggleReview(review.id)}
                      className={`w-full text-left p-4 border-2 transition-all ${
                        selectedReviews.has(review.id)
                          ? 'border-red-500 bg-red-50'
                          : 'border-zinc-300 bg-white hover:border-zinc-400'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-black">{review.title}</h3>
                            <span className="text-xs bg-zinc-900 text-white px-2 py-0.5 rounded-sm uppercase">
                              {review.review.criticName || 'Julian Pinter'}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-600">{review.artist}</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            Score: {review.review.score.toFixed(1)}/10
                          </p>
                        </div>
                        <div
                          className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                            selectedReviews.has(review.id)
                              ? 'border-red-500 bg-red-500'
                              : 'border-zinc-300'
                          }`}
                        >
                          {selectedReviews.has(review.id) && (
                            <Check className="w-4 h-4 text-white" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedReviews.size > 0 && (
                <button
                  onClick={generateEditorial}
                  disabled={isGenerating}
                  className="w-full mt-6 bg-red-500 text-white py-4 text-xl font-black uppercase tracking-widest hover:bg-red-600 disabled:bg-zinc-400 transition-colors"
                >
                  {isGenerating ? 'Chuck is Writing...' : `Generate Editorial (${selectedReviews.size} reviews)`}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-white border-4 border-red-500 p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(220,38,38,1)]">
              <div className="border-b-4 border-zinc-900 pb-6 mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-red-500 text-white px-3 py-1 font-black uppercase text-xs">
                    Editorial
                  </span>
                  <span className="text-zinc-500 text-sm">
                    by Chuck Morrison
                  </span>
                </div>
                <h2 className="text-4xl md:text-5xl font-black uppercase leading-tight">
                  {editorial.title}
                </h2>
              </div>

              <p className="text-2xl font-bold mb-8 text-zinc-700 leading-relaxed">
                {editorial.summary}
              </p>

              {/* Chuck's Verdicts */}
              {editorial.verdicts && editorial.verdicts.length > 0 && (
                <div className="mb-8 bg-zinc-900 border-4 border-red-500 p-6">
                  <h3 className="text-2xl font-black uppercase text-white mb-4 flex items-center gap-2">
                    <Zap className="w-6 h-6 text-red-500 fill-red-500" />
                    Chuck&apos;s Verdict
                  </h3>
                  <div className="space-y-4">
                    {editorial.verdicts.map((verdict: Verdict, idx: number) => (
                      <div key={idx} className={`border-4 p-4 ${verdict.verdict === 'ROCKS' ? 'border-green-500 bg-green-950' : 'border-red-600 bg-red-950'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="text-white font-bold text-lg mb-1">
                              &ldquo;{verdict.mediaTitle}&rdquo; by {verdict.mediaArtist}
                            </div>
                            <div className="text-zinc-300 text-sm italic">
                              {verdict.reason}
                            </div>
                          </div>
                          <div className={`shrink-0 px-6 py-3 font-black text-2xl uppercase tracking-wider border-4 ${
                            verdict.verdict === 'ROCKS'
                              ? 'bg-green-500 border-green-300 text-zinc-900'
                              : 'bg-red-600 border-red-400 text-white'
                          }`}>
                            {verdict.verdict}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="prose prose-lg max-w-none">
                {editorial.body.map((para: string, i: number) => (
                  <p key={i} className="mb-6 text-lg leading-relaxed">{para}</p>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t-2 border-zinc-200 flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-200 rounded-full overflow-hidden border-2 border-red-500">
                  <img src={editorInfo.avatar} alt={editorInfo.name} />
                </div>
                <div>
                  <div className="font-black uppercase tracking-wider">{editorInfo.name}</div>
                  <div className="text-sm text-zinc-500 italic">{editorInfo.bio}</div>
                </div>
              </div>
            </div>

            {/* Comments Section */}
            <section className="mt-12 bg-white border-2 border-zinc-900 p-8 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                  <MessageSquare className="w-6 h-6" />
                  {comments.length} Comments
                </h3>
                <button
                  onClick={() => setCommentGenerationActive(!commentGenerationActive)}
                  className={`px-4 py-2 font-bold text-sm uppercase transition-all border-2 border-zinc-900 ${
                    commentGenerationActive
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                  }`}
                >
                  {commentGenerationActive ? '✓ AI Comments On' : 'AI Comments Off'}
                </button>
              </div>

              {/* Comment Input */}
              {commentGenerationActive && (
                <div className="mb-8 bg-white border-2 border-zinc-900 p-6 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)]">
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
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder={replyingTo ? "Write your reply..." : "Share your thoughts on this editorial..."}
                      rows={3}
                      className="w-full px-4 py-2 border-2 border-zinc-300 focus:border-zinc-900 focus:outline-none resize-none font-medium"
                      disabled={isPostingComment}
                    />
                    <button
                      onClick={handleCommentSubmit}
                      disabled={!commentText.trim() || !userName.trim() || isPostingComment}
                      className="bg-zinc-900 text-white px-6 py-2 font-black uppercase text-sm hover:bg-zinc-800 transition-colors disabled:bg-zinc-400 disabled:cursor-not-allowed"
                    >
                      {isPostingComment ? 'Posting...' : (replyingTo ? 'Post Reply' : 'Post Comment')}
                    </button>
                  </div>
                </div>
              )}

              {/* Comments List */}
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
                  const criticInfo = isCriticComment && criticType ? getStaffInfo(criticType) : null;
                  const editorInfo = isEditorComment ? getStaffInfo('editor') : null;

                  const borderColor = editorInfo
                    ? 'border-red-500'
                    : criticInfo
                    ? (criticType === 'music' ? 'border-amber-400' :
                       criticType === 'film' ? 'border-purple-400' :
                       criticType === 'business' ? 'border-blue-500' : 'border-emerald-400')
                    : comment.persona_type === 'Human User' ? 'border-blue-400' : 'border-zinc-300';

                  const bgColor = editorInfo
                    ? 'bg-red-50'
                    : criticInfo
                    ? (criticType === 'music' ? 'bg-amber-50' :
                       criticType === 'film' ? 'bg-purple-50' :
                       criticType === 'business' ? 'bg-blue-50' : 'bg-emerald-50')
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
                                     criticType === 'film' ? 'bg-purple-500' :
                                     criticType === 'business' ? 'bg-blue-500' : 'bg-emerald-500')
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
                              const isCritic = (reply as any).is_critic;
                              const isEditor = (reply as any).is_editor;
                              const replyType = isEditor ? 'editor' : (reply as any).critic || 'music';
                              const staffInfo = getStaffInfo(replyType as StaffType);

                              const borderColor = isEditor ? 'border-red-500' :
                                                 reply.critic === 'music' ? 'border-amber-400' :
                                                 reply.critic === 'film' ? 'border-purple-400' :
                                                 reply.critic === 'business' ? 'border-blue-500' :
                                                 'border-emerald-400';
                              const textColor = isEditor ? 'text-red-500' :
                                               reply.critic === 'music' ? 'text-amber-400' :
                                               reply.critic === 'film' ? 'text-purple-400' :
                                               reply.critic === 'business' ? 'text-blue-500' :
                                               'text-emerald-400';
                              const bgColor = isEditor ? 'bg-red-500' :
                                             reply.critic === 'music' ? 'bg-amber-400' :
                                             reply.critic === 'film' ? 'bg-purple-400' :
                                             reply.critic === 'business' ? 'bg-blue-500' :
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
                                        <div className="font-bold flex items-center gap-2">
                                          {staffInfo.username}
                                          <span className={`text-xs px-1.5 py-0.5 rounded ${bgColor} text-zinc-900 font-black uppercase`}>
                                            {staffInfo.title}
                                          </span>
                                        </div>
                                        <div className="text-xs text-zinc-500">{reply.timestamp}</div>
                                      </div>
                                      {reply.replyingToUsername && (
                                        <div className={`text-xs ${textColor} mb-1`}>
                                          Replying to @{reply.replyingToUsername}
                                        </div>
                                      )}
                                      <p className="text-zinc-200 leading-relaxed">{reply.text}</p>
                                      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400 font-medium">
                                        <button className="flex items-center gap-1 hover:text-zinc-200">
                                          <ThumbsDown className="w-3 h-3 rotate-180" />
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-10 h-10 shrink-0 bg-zinc-200 rounded-md overflow-hidden border-2 border-zinc-900">
                                      <img src={`https://api.dicebear.com/7.x/identicon/svg?seed=${reply.username}`} alt={reply.username} />
                                    </div>
                                    <div className="flex-1 bg-white border-2 border-zinc-300 p-4 rounded-sm shadow-sm">
                                      <div className="flex justify-between items-baseline mb-2">
                                        <div className="font-bold text-sm">{reply.username}</div>
                                        <div className="text-xs text-zinc-400">{reply.timestamp}</div>
                                      </div>
                                      {reply.replyingToUsername && (
                                        <div className="text-xs text-blue-600 mb-1">
                                          Replying to @{reply.replyingToUsername}
                                        </div>
                                      )}
                                      <p className="text-zinc-800 text-sm">{reply.text}</p>
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
            </section>

            <div className="mt-8 flex gap-4">
              <button
                onClick={saveEditorial}
                className="flex-1 bg-green-600 text-white py-3 font-black uppercase text-sm hover:bg-green-700 transition-colors"
              >
                Save Editorial
              </button>
              <button
                onClick={() => {
                  setEditorial(null);
                  setSelectedReviews(new Set());
                  setComments([]);
                }}
                className="flex-1 bg-zinc-900 text-white py-3 font-black uppercase text-sm hover:bg-zinc-800 transition-colors"
              >
                Write New Editorial
              </button>
            </div>
          </div>
        )}

        {/* Archive Sidebar */}
        <div className={`fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 transition-opacity duration-200 ${showArchive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowArchive(false)}>
          <div className={`absolute right-0 top-0 bottom-0 w-full md:w-96 bg-[#f4f1ea] border-l-4 border-zinc-900 shadow-2xl overflow-y-auto transition-transform duration-300 ease-out ${showArchive ? 'translate-x-0' : 'translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-zinc-900 text-white p-4 flex justify-between items-center border-b-4 border-zinc-800">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5" />
                <span className="font-black uppercase">Editorial Archive</span>
              </div>
              <button onClick={() => setShowArchive(false)} className="hover:bg-zinc-800 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {savedEditorials.map((saved) => (
                <div
                  key={saved.id}
                  onClick={() => {
                    setEditorial(saved);
                    setComments(saved.comments || []);
                    setShowArchive(false);
                  }}
                  className="bg-white border-2 border-zinc-900 p-4 cursor-pointer hover:shadow-lg transition-shadow"
                >
                  <h4 className="font-black text-sm uppercase mb-2">{saved.title}</h4>
                  <p className="text-xs text-zinc-600 line-clamp-2">{saved.summary}</p>
                  <div className="mt-2 text-xs text-zinc-500">
                    {new Date(saved.timestamp).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
