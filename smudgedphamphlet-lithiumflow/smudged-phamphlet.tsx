import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Upload, Play, Pause, MessageSquare, ThumbsDown, Terminal, ShieldAlert, ChevronDown, Music } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function SmudgedPamphlet() {
  const [apiKey, setApiKey] = useState('');
  const [hasValidKey, setHasValidKey] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const [stage, setStage] = useState('idle');
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const [review, setReview] = useState(null);
  const [comments, setComments] = useState([]);

  const addLog = (msg) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  }

  const runJulianReview = async (genAI, audioPart) => {
    setStage('julian_reviewing');
    addLog('AGENT ACTIVATED: Julian Pinter (Chief Critic)');
    addLog('ACTION: Julian is putting on oversized headphones and sighing loudly...');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const systemPrompt = `
      You are Julian Pinter, the fiercely pretentious, cynical, and overly intellectual music critic for 'The Smudged Pamphlet'.
      You have egg on your t-shirt from a breakfast you ate at 3 PM. You hate everything mainstream and barely tolerate the underground.
      
      Listen to the designated audio track. Write a scathing, verbose, incredibly pretentious review.
      Use obscure metaphors, reference nonexistent philosophical movements, and be vicious but vaguely brilliant.
      
      IMPORTANT: Return ONLY raw JSON without markdown formatting. Structure:
      {
        "title": "Track Title (guess if unknown)",
        "artist": "Artist Name (guess if unknown)",
        "score": (number 0.0 to 10.0, usually low e.g. 2.3, 5.1),
        "summary": "A one sentence pretentious summary.",
        "body": ["Paragraph 1", "Paragraph 2", "Paragraph 3"],
        "notable_lyrics_quoted": "(Make up pretentiously misheard lyrics if you can't hear them clearly)"
      }
    `;

    try {
      const result = await model.generateContent([systemPrompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      const cleanedJson = text.replace(/```json|```/g, '').trim();
      const reviewData = JSON.parse(cleanedJson);
      setReview(reviewData);
      addLog('SUCCESS: Julian has finished his masterpiece of disdain.');
      return reviewData;
    } catch (e) {
      throw new Error(`Julian refused to work: ${e.message}`);
    }
  };

  const runCommenters = async (genAI, reviewData) => {
    setStage('commenters_reacting');
    addLog('AGENTS ACTIVATED: The Comment Section Horde (x10)');
    addLog('ACTION: Trolls are emerging from under digital bridges...');

    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      You are simulating the comments section of a pretentious music blog 'The Smudged Pamphlet'.
      Read this review by Julian Pinter:
      ${JSON.stringify(reviewData)}

      Generate 10 distinct comments from different standard internet personas (e.g., The Stan, The Hater, The 'Actually' Guy, The Bot, The Boomer, The Confused).
      Some should attack Julian, some should defend the artist blindly, some should just be confused.
      
      Output a JSON ARRAY of objects:
      [
        {
          "id": "c1",
          "username": "User handle",
          "persona_type": "short description of persona",
          "timestamp": "relative time e.g. '2 minutes ago'",
          "text": "The comment text",
          "likes": (integer usually between -5 and 50)
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const commentsData = JSON.parse(result.response.text());
    setComments(commentsData);
    addLog(`SUCCESS: ${commentsData.length} comments posted. The horde is restless.`);
    return commentsData;
  };

  const runJulianArguments = async (genAI, currentComments, reviewData) => {
    setStage('julian_arguing');
    addLog('AGENT REACTIVATED: Julian Pinter is triggered.');
    addLog('ACTION: Julian is furiously typing replies while drinking lukewarm cold brew...');

    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      You are Julian Pinter again. You just read the comments on your review: ${reviewData.title}.
      You are intellectually insecure and must have the last word.
      
      Here are the comments:
      ${JSON.stringify(currentComments)}

      Select exactly 3 comments that annoy you the most. Write vicious, petty, intellectualizing replies to them.
      
      Output a JSON ARRAY of objects only for the replies:
      [
        {
          "comment_id_to_reply_to": "id of the comment",
          "reply_text": "Julian's scathing reply"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const replies = JSON.parse(result.response.text());
    addLog(`SUCCESS: Julian started ${replies.length} fights in the comments.`);

    setComments(prev => prev.map(c => {
      const reply = replies.find(r => r.comment_id_to_reply_to === c.id);
      return reply ? { ...c, julian_reply: reply.reply_text } : c;
    }));
  };

  const startReviewProcess = async () => {
    if (!audioFile || !apiKey) return;
    setErrorMsg('');
    setReview(null);
    setComments([]);
    setLogs([]);
    setStage('uploading');

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      if (audioFile.size > 20 * 1024 * 1024) {
         throw new Error("File too large for browser demo. Please use an MP3 under 20MB.");
      }
      const audioPart = await fileToGenerativePart(audioFile);
      addLog('SYSTEM: Audio loaded into memory buffer.');

      const reviewData = await runJulianReview(genAI, audioPart);
      const commentsData = await runCommenters(genAI, reviewData);
      await runJulianArguments(genAI, commentsData, reviewData);

      setStage('complete');
      addLog('SYSTEM: Autonomous workflow complete.');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'An opaque error occurred in the neural net.');
      setStage('error');
      addLog(`CRITICAL FAILURE: ${err.message}`);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setReview(null);
      setComments([]);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-zinc-900 font-serif selection:bg-zinc-900 selection:text-white">
      <audio ref={audioRef} src={audioUrl || ''} onEnded={() => setIsPlaying(false)} />
      <header className="border-b-4 border-zinc-900 py-6 px-4 md:px-12 bg-white">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85]">
            The Smudged<br/>Pamphlet
          </h1>
          <p className="mt-2 text-lg italic font-medium text-zinc-500">
            Music criticism for people who hate music criticism.
          </p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 md:px-12 py-8">
        <section className={cn("mb-12 transition-all", stage !== 'idle' && stage !== 'error' ? 'opacity-50 pointer-events-none blur-sm' : '')}>
            <div className="bg-zinc-100 border-2 border-zinc-300 p-6 rounded-sm mb-8">
                <div className="flex items-start gap-3 mb-4">
                    <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
                    <div className="text-sm text-zinc-700">
                        <strong>Authentication Required:</strong> This is a client-side demo. We cannot securely use a Google Cloud Service Account JSON in the browser. 
                        Please enter a standard <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-bold">Gemini API Key</a> to power the agents.
                    </div>
                </div>
                <div className="flex gap-2">
                    <input 
                        type="password"
                        placeholder="Paste your GEMINI_API_KEY here"
                        value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); setHasValidKey(e.target.value.length > 10); }}
                        className="flex-1 p-2 border-2 border-zinc-400 focus:border-zinc-900 outline-none font-mono text-sm bg-white"
                    />
                </div>
            </div>
            <div className="border-4 border-dashed border-zinc-300 hover:border-zinc-900 transition-colors p-12 text-center relative group bg-[#faf9f6]">
                <input 
                    type="file" 
                    accept="audio/*" 
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={!hasValidKey || (stage !== 'idle' && stage !== 'error')}
                />
                <div className="pointer-events-none flex flex-col items-center space-y-4">
                    {audioFile ? (
                         <Music className="w-16 h-16 text-zinc-900" />
                    ) : (
                        <Upload className="w-16 h-16 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                    )}
                    <div className="font-black text-2xl uppercase tracking-tight">
                        {audioFile ? audioFile.name : "Drop MP3/WAV here to be judged"}
                    </div>
                    {!audioFile && (
                        <p className="text-zinc-500">Limit 20MB. Don't bore us.</p>
                    )}
                </div>
            </div>
            {audioFile && stage === 'idle' && (
                <button 
                    onClick={startReviewProcess}
                    disabled={!hasValidKey}
                    className="w-full mt-4 bg-zinc-900 text-[#f4f1ea] py-4 text-xl font-black uppercase tracking-widest hover:bg-zinc-800 disabled:bg-zinc-400 transition-colors"
                >
                    Submit to Julian Pinter
                </button>
            )}
             {stage === 'error' && (
                 <div className="mt-4 p-4 bg-red-100 border-2 border-red-900 text-red-900 font-mono text-sm">
                    ERROR: {errorMsg}
                    <button onClick={() => setStage('idle')} className="block mt-2 underline font-bold">Try Again</button>
                 </div>
            )}
        </section>
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
                        <div className="animate-pulse mt-2">> Processing...</div>
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
                             <div className="w-24 h-24 md:w-32 md:h-32 bg-zinc-900 text-white flex flex-col justify-center items-center rounded-full rotate-12">
                                <span className="text-3xl md:text-5xl font-black tracking-tighter">{review.score.toFixed(1)}</span>
                                <span className="text-xs uppercase tracking-widest opacity-70">/ 10</span>
                             </div>
                        </div>
                    </div>
                    <div className="bg-zinc-100 border border-zinc-300 p-4 mb-8 flex items-center gap-4">
                        <button 
                            onClick={togglePlay}
                            className="w-12 h-12 bg-zinc-900 text-white flex items-center justify-center rounded-full hover:scale-105 transition-transform"
                        >
                            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                        </button>
                        <div className="flex-1 font-mono text-sm opacity-50">
                             [AUDIO TRACK EMBEDDED: {audioFile?.name}]
                        </div>
                    </div>
                    <div className="prose prose-zinc max-w-none prose-lg">
                        <p className="text-xl md:text-2xl font-medium leading-snug mb-8 text-zinc-800">
                            {review.summary}
                        </p>
                        {review.body.map((para, i) => (
                            <p key={i}>{para}</p>
                        ))}
                        <blockquote className="border-l-4 border-zinc-900 pl-6 italic text-xl my-8 font-medium text-zinc-700">
                            "{review.notable_lyrics_quoted}"
                            <footer className="text-sm font-black not-italic text-zinc-400 mt-2 uppercase">— Notable Lyrics (allegedly)</footer>
                        </blockquote>
                    </div>
                    <div className="mt-12 pt-6 border-t-2 border-zinc-100 flex items-center gap-4">
                        <div className="w-12 h-12 bg-zinc-200 rounded-full overflow-hidden border border-zinc-900">
                             <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=julianpinter&mood=sad&eyebrows=angryNatural`} alt="Julian Pinter" />
                        </div>
                        <div>
                            <div className="font-black uppercase tracking-wider">Julian Pinter</div>
                            <div className="text-sm text-zinc-500 italic">Chief Critic, has a headache.</div>
                        </div>
                    </div>
                </article>
                <section id="comments" className="max-w-3xl mx-auto">
                    <h3 className="text-2xl font-black uppercase tracking-tight mb-8 flex items-center gap-3">
                        <MessageSquare className="w-6 h-6" />
                        {comments.length} Comments
                    </h3>
                    <div className="space-y-8">
                        {comments.map((comment) => (
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
                                                <button className="hover:text-zinc-900">Reply</button>
                                                <button className="hover:text-zinc-900">Report</button>
                                            </div>
                                        </div>
                                        {comment.julian_reply && (
                                            <div className="flex gap-4 mt-4 ml-2 md:ml-8 animate-in fade-in slide-in-from-left-4">
                                                <div className="text-zinc-400">
                                                    <ChevronDown className="w-6 h-6 ml-2" />
                                                </div>
                                                <div className="w-10 h-10 shrink-0 bg-zinc-900 rounded-full overflow-hidden border-2 border-amber-400 z-10">
                                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=julianpinter&mood=sad&eyebrows=angryNatural`} alt="Julian Pinter" />
                                                </div>
                                                <div className="flex-1 bg-zinc-900 text-zinc-100 p-4 rounded-sm shadow-lg relative border-l-4 border-amber-400">
                                                    <div className="flex justify-between items-baseline mb-2">
                                                        <div className="font-black text-amber-400 flex items-center gap-1">
                                                            JULIAN PINTER
                                                            <ShieldAlert className="w-3 h-3" />
                                                            <span className="text-[10px] bg-amber-400 text-zinc-900 px-1 rounded-sm ml-2">AUTHOR</span>
                                                        </div>
                                                        <div className="text-xs text-zinc-500">Just now</div>
                                                    </div>
                                                    <p className="whitespace-pre-wrap font-medium">{comment.julian_reply}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {comments.length > 0 && stage === 'julian_arguing' && (
                        <div className="mt-8 text-center text-zinc-500 animate-pulse font-mono text-sm">
                            Julian is furiously typing replies...
                        </div>
                    )}
                </section>
            </div>
        )}
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
