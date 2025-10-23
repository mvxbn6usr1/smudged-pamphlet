import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
  audioUrl?: string;
  audioFileName?: string;
  albumArt?: string;
  waveformData?: number[];
}

export default function AudioPlayer({ audioUrl, audioFileName, albumArt, waveformData }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    audioRef.current.currentTime = percentage * duration;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-zinc-100 border-2 border-zinc-900 p-6 rounded-sm mb-8 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)]">
      {audioUrl && <audio ref={audioRef} src={audioUrl} />}

      <div className="flex gap-6">
        {/* Album Art */}
        {albumArt ? (
          <div className="w-32 h-32 shrink-0 bg-zinc-900 rounded-sm overflow-hidden border-2 border-zinc-900 shadow-lg">
            <img src={albumArt} alt="Album art" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-32 h-32 shrink-0 bg-zinc-900 rounded-sm flex items-center justify-center border-2 border-zinc-900 shadow-lg">
            <div className="text-white/20 text-5xl">♪</div>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between">
          {/* Track Info */}
          <div className="font-mono text-sm text-zinc-600 mb-2">
            {audioFileName ? `[AUDIO: ${audioFileName}]` : '[NO AUDIO AVAILABLE]'}
          </div>

          {/* Waveform Visualization - Symmetrical */}
          {waveformData && waveformData.length > 0 && (
            <div
              className="h-20 flex items-center gap-0.5 cursor-pointer relative overflow-hidden rounded-sm bg-zinc-200/50"
              onClick={handleSeek}
            >
              {/* Progress overlay */}
              <div
                className="absolute inset-0 bg-amber-400/30 pointer-events-none transition-all"
                style={{ width: `${progress}%` }}
              />

              {/* Waveform bars - symmetrical around center */}
              {waveformData.map((value, i) => {
                const height = Math.max(value * 100, 4);
                const isPast = (i / waveformData.length) * 100 <= progress;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center justify-center gap-0.5"
                  >
                    {/* Top half */}
                    <div
                      className={`w-full rounded-sm transition-colors ${
                        isPast ? 'bg-zinc-900' : 'bg-zinc-400'
                      }`}
                      style={{ height: `${height / 2}%` }}
                    />
                    {/* Bottom half (mirror) */}
                    <div
                      className={`w-full rounded-sm transition-colors ${
                        isPast ? 'bg-zinc-900' : 'bg-zinc-400'
                      }`}
                      style={{ height: `${height / 2}%` }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Playback Controls */}
          {audioUrl && (
            <div className="flex items-center gap-4 mt-2">
              <button
                onClick={togglePlay}
                className="w-10 h-10 bg-zinc-900 text-white flex items-center justify-center rounded-full hover:scale-105 transition-transform shadow-md"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              <div className="flex-1 text-xs font-mono text-zinc-500">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
