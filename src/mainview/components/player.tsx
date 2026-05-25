import { useState } from 'react';
import ReactPlayer from 'react-player';
import { electroview } from '../rpc';

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
    <section className='mx-auto w-full max-w-5xl rounded-2xl border border-white/20 bg-black/30 p-4 shadow-2xl backdrop-blur'>
      <header className='mb-3 flex items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold text-white'>Live Player</h2>
        <span className='rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100'>{statusText}</span>
      </header>

      <div className='relative aspect-video min-h-[320px] w-full overflow-hidden rounded-xl bg-black'>
        {!hlsUrl ? (
          <div className='absolute inset-0 flex items-center justify-center'>
            <button
              type='button'
              onClick={() => {
                void handleWatchLive();
              }}
              disabled={starting}
              className='rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60'
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
        <p className='mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-200' role='alert'>
          {errorText}
        </p>
      )}
    </section>
  );
};

export default StreamingViewer;