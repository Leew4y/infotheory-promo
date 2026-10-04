// Test stand-in for ffprobe: answers the audio duration query, then hangs on the final stream probe.
if (Bun.argv.includes('format=duration')) console.log('202.0');
else await Bun.sleep(3_600_000);
export {};
