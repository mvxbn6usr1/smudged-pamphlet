import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, FileText, Check, MessageSquare, Archive, X, ThumbsDown } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: any[]) => twMerge(clsx(inputs));

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
    critic?: 'music' | 'film' | 'literary';
    criticName?: string;
  };
}

interface Reply {
  id: string;
  username: string;
  persona_type: string;
  timestamp: string;
  text: string;
  likes: number;
  is_editor?: boolean;
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
}

interface SavedEditorial {
  id: string;
  title: string;
  summary: string;
  body: string[];
  timestamp: number;
  reviewIds: string[];
  comments: Comment[];
}

export default function Editorial() {
  const router = useRouter();
  const [savedReviews, setSavedReviews] = useState<SavedReview[]>([]);
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set());
  const [editorial, setEditorial] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [savedEditorials, setSavedEditorials] = useState<SavedEditorial[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);

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

YOUR REVIEWS TO COMMENT ON:
${JSON.stringify(reviewsToComment.map(r => ({
  critic: r.review.criticName,
  title: r.title,
  artist: r.artist,
  score: r.review.score,
  summary: r.review.summary,
  body: r.review.body
})))}

Write an EDITORIAL COMMENTARY on these reviews. Not a review of the content itself - a commentary on what your critics said.

Points to hit:
- Call out pretentious language ("What does 'Bergmanesque' even mean, Rex?")
- Defend the audience perspective ("People just want to have FUN")
- Act as a foil to their elitism ("A 3.5? People loved this!")
- Be funny and accessible
- Show you care about quality journalism even if you disagree
- Keep it SHORT and PUNCHY

Write 3-4 paragraphs. No fancy words. Talk like a real person.

Output ONLY valid JSON:
{
  "title": "Editorial title (punchy, no pretension)",
  "summary": "One sentence summary",
  "body": ["paragraph1", "paragraph2", "paragraph3"]
}`;

      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-2.5-pro',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
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

  const handleCommentSubmit = () => {
    if (!commentText.trim()) return;

    const newComment: Comment = {
      id: `c${Date.now()}`,
      username: 'You',
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
  };

  const editorInfo = {
    name: 'Chuck Morrison',
    username: 'ChuckMorrison',
    title: 'Editor-in-Chief',
    color: 'red-500',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=chuckmorrison&top=shortHairShortWaved&facialHair=beardMajestic&eyebrows=default&mouth=smile',
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
                deserve his everyman take.
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
              <h3 className="text-2xl font-black uppercase tracking-tight mb-6 flex items-center gap-3">
                <MessageSquare className="w-6 h-6" />
                {comments.length} Comments
              </h3>

              {/* Comment Input */}
              <div className="mb-8 bg-blue-50 border-2 border-blue-400 p-4">
                {replyingTo && (
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-blue-600">Replying to <strong>@{replyingTo.username}</strong></span>
                    <button onClick={() => setReplyingTo(null)} className="text-blue-600 hover:text-blue-800">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={replyingTo ? "Write your reply..." : "Join the discussion..."}
                  className="w-full p-3 border-2 border-blue-300 focus:border-blue-500 outline-none resize-none"
                  rows={3}
                />
                <button
                  onClick={handleCommentSubmit}
                  disabled={!commentText.trim()}
                  className="mt-2 bg-blue-600 text-white px-6 py-2 font-black uppercase text-sm hover:bg-blue-700 disabled:bg-zinc-400 transition-colors"
                >
                  {replyingTo ? 'Post Reply' : 'Post Comment'}
                </button>
              </div>

              {/* Comments List */}
              <div className="space-y-6">
                {comments.map((comment) => (
                  <div key={comment.id} className="group">
                    <div className="flex gap-4">
                      <div className="w-10 h-10 shrink-0 bg-zinc-200 rounded-md overflow-hidden border-2 border-zinc-900">
                        <img src={`https://api.dicebear.com/7.x/identicon/svg?seed=${comment.username}`} alt={comment.username} />
                      </div>
                      <div className="flex-1">
                        <div className={cn(
                          "p-4 rounded-sm shadow-sm border-2",
                          comment.persona_type === 'Human User' ? "bg-blue-50 border-blue-400" : "bg-white border-zinc-300"
                        )}>
                          <div className="flex justify-between items-baseline mb-2">
                            <div className="font-bold">
                              {comment.username}
                              <span className={cn(
                                "ml-2 text-xs text-white px-1 rounded-sm font-normal uppercase",
                                comment.persona_type === 'Human User' ? "bg-blue-600" : "bg-zinc-400"
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
                            <button
                              onClick={() => setReplyingTo({ commentId: comment.id, username: comment.username })}
                              className="hover:text-zinc-900 font-bold"
                            >
                              Reply
                            </button>
                          </div>
                        </div>

                        {/* Replies */}
                        {comment.replies.length > 0 && (
                          <div className="ml-8 mt-4 space-y-3">
                            {comment.replies.map((reply) => (
                              <div key={reply.id} className="flex gap-3">
                                <div className="w-8 h-8 shrink-0 bg-zinc-200 rounded-md overflow-hidden border border-zinc-900">
                                  <img src={`https://api.dicebear.com/7.x/identicon/svg?seed=${reply.username}`} alt={reply.username} />
                                </div>
                                <div className="flex-1 bg-white border border-zinc-300 p-3 rounded-sm shadow-sm text-sm">
                                  <div className="flex justify-between items-baseline mb-1">
                                    <div className="font-bold text-xs">{reply.username}</div>
                                    <div className="text-xs text-zinc-400">{reply.timestamp}</div>
                                  </div>
                                  <p className="text-zinc-800">
                                    {reply.replyingToUsername && (
                                      <span className="text-blue-600 font-bold">@{reply.replyingToUsername} </span>
                                    )}
                                    {reply.text}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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
