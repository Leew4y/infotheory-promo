// Test stand-in for ffprobe: exits 0; the stream query reports durations as "N/A" (ffprobe's text for unknown values).
if (Bun.argv.includes('format=duration')) console.log('202.0');
else console.log(JSON.stringify({ streams: [{ codec_type: 'video', nb_read_packets: '30', duration: 'N/A', color_space: 'bt709', color_primaries: 'bt709', color_transfer: 'bt709', color_range: 'tv' }, { codec_type: 'audio', duration: 'N/A' }] }));
export {};
