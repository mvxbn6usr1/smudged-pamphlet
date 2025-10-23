import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { MessageSquare, ThumbsDown, ShieldAlert, ChevronDown, ArrowLeft, Podcast } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import AudioPlayer from '@/components/AudioPlayer';
import DocumentPreview from '@/components/DocumentPreview';
import { getAudioData } from '@/utils/db';
import { getCriticInfo as getCriticInfoUtil } from '@/utils/critics';
import { generatePodcast, getExistingPodcast, type PodcastGenerationProgress } from '@/utils/podcastOrchestrator';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

function extractYouTubeId(url: string): string | null {
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
}

// Use shared utility for critic info
const getCriticInfo = getCriticInfoUtil;

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
  is_julian?: boolean;
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
  audioDataUrl?: string;
  albumArt?: string;
  waveformData?: number[];
  hasAudioInDB?: boolean;
  youtubeUrl?: string;
  isYouTube?: boolean;
}

export default function ReviewPage() {
  const router = useRouter();
  const { slug } = router.query;
  const [review, setReview] = useState<SavedReview | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  // Podcast state
  const [podcastUrl, setPodcastUrl] = useState<string | undefined>();
  const [isPodcastGenerating, setIsPodcastGenerating] = useState(false);
  const [podcastProgress, setPodcastProgress] = useState<PodcastGenerationProgress | null>(null);

  useEffect(() => {
    if (!slug) return;

    const loadReviewData = async () => {
      const storedReviews = localStorage.getItem('smudged_reviews');
      if (storedReviews) {
        try {
          const reviews: SavedReview[] = JSON.parse(storedReviews);
          const foundReview = reviews.find(r => r.slug === slug);
          if (foundReview) {
            setReview(foundReview);

            // Load audio/document from IndexedDB if available
            if (foundReview.hasAudioInDB) {
              try {
                const audioData = await getAudioData(foundReview.id);
                if (audioData) {
                  // For documents (literary/business reviews), recreate File object for download
                  if ((foundReview.review.critic === 'literary' || foundReview.review.critic === 'business') && foundReview.audioFileName) {
                    const response = await fetch(audioData);
                    const blob = await response.blob();
                    const file = new File([blob], foundReview.audioFileName, { type: blob.type });
                    setDocumentFile(file);
                    setAudioUrl(undefined);
                  } else {
                    // For audio/video, just set the URL
                    setAudioUrl(audioData);
                    setDocumentFile(null);
                  }
                }
              } catch (e) {
                console.error('Failed to load from IndexedDB', e);
                setAudioUrl(foundReview.audioDataUrl);
                setDocumentFile(null);
              }
            } else {
              setAudioUrl(foundReview.audioDataUrl);
              setDocumentFile(null);
            }

            // Check for existing podcast
            try {
              const existingPodcast = await getExistingPodcast(foundReview.id);
              if (existingPodcast) {
                setPodcastUrl(existingPodcast);
              }
            } catch (e) {
              console.error('Failed to check for podcast', e);
            }
          } else {
            router.push('/');
          }
        } catch (e) {
          console.error('Failed to load review', e);
          router.push('/');
        }
      } else {
        router.push('/');
      }
    };

    loadReviewData();
  }, [slug, router]);

  const handleGeneratePodcast = async () => {
    if (!review) return;

    setIsPodcastGenerating(true);
    setPodcastProgress({
      status: 'generating_script',
      progress: 0,
      message: 'Starting podcast generation...',
    });

    try {
      const audioDataUrl = await generatePodcast(review, false, (progress) => {
        setPodcastProgress(progress);
      });

      setPodcastUrl(audioDataUrl);
      setIsPodcastGenerating(false);
      setPodcastProgress(null);
    } catch (error) {
      console.error('Failed to generate podcast:', error);
      setIsPodcastGenerating(false);
      setPodcastProgress({
        status: 'error',
        progress: 0,
        message: 'Failed to generate podcast',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  if (!review) {
    return (
      <div className="min-h-screen bg-[#f4f1ea] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-zinc-900 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="font-black uppercase text-zinc-900">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-zinc-900 font-serif selection:bg-zinc-900 selection:text-white">
      <header className="border-b-4 border-zinc-900 py-6 px-4 md:px-12 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85] cursor-pointer hover:opacity-80 transition-opacity" onClick={() => router.push('/')}>
                The Smudged<br/>Pamphlet
              </h1>
              <p className="mt-2 text-lg italic font-medium text-zinc-500">
                Criticism for people who hate criticism from real people.
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 font-black uppercase text-sm hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-12 py-8">
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <article className="bg-white border-2 border-zinc-900 p-8 md:p-12 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] mb-16">
            <div className="flex justify-between items-start border-b-2 border-zinc-200 pb-8 mb-8">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">Review</div>
                <h2 className="text-4xl md:text-6xl font-black leading-none mb-2">{review.review.title}</h2>
                <h3 className="text-2xl text-zinc-600 font-medium">{review.review.artist}</h3>
                <div className="mt-4 text-sm text-zinc-400">
                  Published {new Date(review.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 md:w-32 md:h-32 bg-zinc-900 text-white flex flex-col justify-center items-center rounded-full rotate-12">
                  <span className="text-3xl md:text-5xl font-black tracking-tighter">{review.review.score.toFixed(1)}</span>
                  <span className="text-xs uppercase tracking-widest opacity-70">/ 10</span>
                </div>
              </div>
            </div>

            {review.isYouTube && review.youtubeUrl ? (
              <div className="my-8">
                <div className="aspect-video w-full bg-black">
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${extractYouTubeId(review.youtubeUrl)}`}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full border-0"
                  ></iframe>
                </div>
              </div>
            ) : review.review.critic === 'literary' || review.review.critic === 'business' ? (
              <DocumentPreview
                fileName={review.audioFileName}
                fileType={documentFile?.type}
                onDownload={() => {
                  if (documentFile) {
                    const url = URL.createObjectURL(documentFile);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = documentFile.name;
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                }}
              />
            ) : (
              <AudioPlayer
                audioUrl={audioUrl}
                audioFileName={review.audioFileName}
                albumArt={review.albumArt}
                waveformData={review.waveformData}
              />
            )}

            <div className="prose prose-zinc max-w-none prose-lg">
              <p className="text-xl md:text-2xl font-medium leading-snug mb-8 text-zinc-800">
                {review.review.summary}
              </p>
              {review.review.body.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              <blockquote className="border-l-4 border-zinc-900 pl-6 italic text-xl my-8 font-medium text-zinc-700">
                &quot;{review.review.notable_lyrics_quoted}&quot;
                <footer className="text-sm font-black not-italic text-zinc-400 mt-2 uppercase">— Notable Lyrics (allegedly)</footer>
              </blockquote>
            </div>
            <div className="mt-12 pt-6 border-t-2 border-zinc-100 flex items-center gap-4">
              {(() => {
                const criticInfo = getCriticInfo(review.review.critic || 'music');
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

          {/* Podcast Section */}
          <section className="bg-white border-2 border-zinc-900 p-8 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Podcast className="w-6 h-6" />
              <h3 className="text-2xl font-black uppercase tracking-tight">
                Podcast Discussion
              </h3>
            </div>

            {podcastUrl ? (
              <div className="space-y-4">
                <p className="text-zinc-600 italic">
                  Listen to Chuck Morrison discuss this review with {review.review.criticName || 'the critic'}.
                </p>
                <AudioPlayer
                  audioUrl={podcastUrl}
                  audioFileName={`${review.slug}-podcast.wav`}
                />
              </div>
            ) : isPodcastGenerating ? (
              <div className="space-y-4">
                <div className="bg-zinc-100 border-2 border-zinc-900 p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="animate-spin w-8 h-8 border-4 border-zinc-900 border-t-transparent rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-black uppercase text-sm mb-1">
                        {podcastProgress?.status === 'generating_script' && 'Preparing Discussion'}
                        {podcastProgress?.status === 'generating_audio' && 'Recording Podcast'}
                        {podcastProgress?.status === 'complete' && 'Complete'}
                        {podcastProgress?.status === 'error' && 'Error'}
                      </div>
                      <div className="text-sm text-zinc-600">
                        {podcastProgress?.status === 'generating_script' && 'Setting up the conversation...'}
                        {podcastProgress?.status === 'generating_audio' && 'This may take a minute...'}
                        {podcastProgress?.status === 'complete' && 'Ready to play!'}
                        {podcastProgress?.status === 'error' && (podcastProgress?.error || 'Something went wrong')}
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-300 h-2 border border-zinc-900">
                    <div
                      className="bg-zinc-900 h-full transition-all duration-300"
                      style={{ width: `${podcastProgress?.progress || 0}%` }}
                    />
                  </div>
                  {podcastProgress?.error && (
                    <div className="mt-4 p-4 bg-red-100 border border-red-600 text-red-800 text-sm">
                      {podcastProgress.error}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-zinc-600">
                  Want to hear a conversation about this review? Generate a podcast where Chuck Morrison
                  sits down with {review.review.criticName || 'the critic'} to discuss
                  &quot;{review.review.title}&quot; by {review.review.artist}.
                </p>
                <button
                  onClick={handleGeneratePodcast}
                  className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 font-black uppercase text-sm hover:bg-zinc-800 transition-colors"
                >
                  <Podcast className="w-5 h-5" />
                  Generate Podcast
                </button>
              </div>
            )}
          </section>

          <section id="comments" className="max-w-3xl mx-auto">
            <h3 className="text-2xl font-black uppercase tracking-tight mb-8 flex items-center gap-3">
              <MessageSquare className="w-6 h-6" />
              {review.comments.length} Comments
            </h3>
            <div className="space-y-8">
              {review.comments.map((comment) => (
                <div key={comment.id} className="group">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 shrink-0 bg-zinc-200 rounded-md overflow-hidden border border-zinc-900">
                      <img src={`https://api.dicebear.com/7.x/identicon/svg?seed=${comment.username}`} alt={comment.username} />
                    </div>
                    <div className="flex-1">
                      <div className="bg-white border border-zinc-300 p-4 rounded-sm shadow-sm">
                        <div className="flex justify-between items-baseline mb-2">
                          <div className="font-bold">
                            {comment.username}
                            <span className="ml-2 text-xs text-white bg-zinc-400 px-1 rounded-sm font-normal uppercase">
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
                        </div>
                      </div>

                      {/* Render all replies */}
                      {comment.replies.length > 0 && (
                        <div className="mt-4 space-y-4">
                          {comment.replies.map((reply) => {
                            const isCritic = reply.is_julian || reply.is_critic;
                            const criticType = reply.critic || review.review.critic || 'music';
                            const criticInfo = isCritic ? getCriticInfo(criticType) : null;
                            const borderColor = criticType === 'music' ? 'border-amber-400'
                              : criticType === 'film' ? 'border-purple-400'
                              : criticType === 'business' ? 'border-blue-500'
                              : 'border-emerald-400';
                            const textColor = criticType === 'music' ? 'text-amber-400'
                              : criticType === 'film' ? 'text-purple-400'
                              : criticType === 'business' ? 'text-blue-500'
                              : 'text-emerald-400';
                            const bgColor = criticType === 'music' ? 'bg-amber-400'
                              : criticType === 'film' ? 'bg-purple-400'
                              : criticType === 'business' ? 'bg-blue-500'
                              : 'bg-emerald-400';

                            return (
                            <div key={reply.id} className="flex gap-4 ml-2 md:ml-8 animate-in fade-in slide-in-from-left-4">
                              <div className="text-zinc-400">
                                <ChevronDown className="w-6 h-6 ml-2" />
                              </div>
                              {isCritic && criticInfo ? (
                                <>
                                  <div className={`w-10 h-10 shrink-0 bg-zinc-900 rounded-full overflow-hidden border-2 ${borderColor} z-10`}>
                                    <img src={criticInfo.avatar} alt={criticInfo.name} />
                                  </div>
                                  <div className={`flex-1 bg-zinc-900 text-zinc-100 p-4 rounded-sm shadow-lg relative border-l-4 ${borderColor}`}>
                                    <div className="flex justify-between items-baseline mb-2">
                                      <div className={`font-black ${textColor} flex items-center gap-1`}>
                                        {criticInfo.name.toUpperCase()}
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
              ))}
            </div>
          </section>
        </div>
      </main>
      <footer className="bg-zinc-900 text-zinc-500 py-12 text-center mt-24">
        <p className="font-black uppercase tracking-widest mb-4 text-zinc-300">The Smudged Pamphlet</p>
        <p className="text-sm max-w-md mx-auto opacity-60">
          Est. 2009. We are better than you, and we know it.
          Powered by autonomous AI agents that hate their jobs.
        </p>
      </footer>
    </div>
  );
}
