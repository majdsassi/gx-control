import { useState } from 'react';
import ReactPlayer from 'react-player';
import { electroview } from '../rpc';
import { Link } from 'react-router-dom';

const StreamingViewer = () => {
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('Connecting to stream...');
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const handleWatchLive = async () => {
    if (!electroview.rpc) {
      setErrorText('RPC bridge is not ready.');
      return;
    }

    setStarting(true);
    setErrorText(null);
    setStatusText('Starting HLS transcode...');

    try {
      const source = await electroview.rpc.request.getPlaybackSource({});
      setHlsUrl(source.url);
      setStatusText(source.message ?? 'Playing live HLS stream.');
    } catch (error) {
      console.error('Playback source resolution error:', error);
      setErrorText('Could not start live stream. Check Bun logs for ffmpeg output.');
      setStatusText('Playback setup failed.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className='app-shell text-[var(--app-text)]'>
      <div className='mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-10'>
        <header className='mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <p className='text-xs uppercase tracking-[0.36em] text-sky-200/70'>Live playback</p>
            <h2 className='mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl'>Watch the live stream</h2>
            <p className='mt-2 max-w-2xl text-sm text-[var(--app-text-soft)] sm:text-base'>Start transcoding, then play the HLS stream in a clean embedded viewer.</p>
          </div>
          <span className='rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-100 backdrop-blur'>{statusText}</span>
        </header>

        <div className='glass-panel-strong relative overflow-hidden rounded-[2rem] p-4 shadow-2xl sm:p-5 lg:p-6'>
          <div className='absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent' />

          <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
          <Link
            to='/app'
            className='soft-button inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10'
          >
            Back to Home
          </Link>
              <h2 className='text-lg font-semibold text-white'>Live Player</h2>
            </div>
          </div>

      <div className='relative aspect-video min-h-[320px] w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-black shadow-[0_20px_70px_rgba(0,0,0,0.45)]'>
        {!hlsUrl ? (
          <div className='absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.18),transparent_58%)]'>
            <button
              type='button'
              onClick={() => {
                void handleWatchLive();
              }}
              disabled={starting}
              className='soft-button rounded-2xl bg-sky-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60'
            >
              {starting ? 'Starting...' : 'Watch Live'}
            </button>
          </div>
        ) : (
          <ReactPlayer
            key={hlsUrl}
            src={hlsUrl}
            controls
            width='100%'
            height='100%'
            style={{ position: 'absolute', inset: 0 }}
            playing
            muted
            playsInline
            config={{
              hls: {
                liveSyncDurationCount: 1,
                lowLatencyMode: false,
                maxBufferLength: 4,
                maxLiveSyncPlaybackRate: 1.5,
                backBufferLength: 0,
                enableWorker: true,
              },
            }}
            onReady={() => setStatusText('Playing live HLS stream.')}
            onError={(error) => {
              console.error('Stream Error:', error);
              setErrorText('Unable to play HLS stream. Check ffmpeg output and HLS file generation.');
              setStatusText('Playback failed.');
            }}
          />
        )}
      </div>

      {errorText && (
        <p className='mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100' role='alert'>
          {errorText}
        </p>
      )}
        </div>
      </div>
    </section>
  );
};

export default StreamingViewer;