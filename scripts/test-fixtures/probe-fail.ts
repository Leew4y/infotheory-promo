// Test stand-in for ffprobe: the stream query prints parseable, plausible JSON but exits 7.
if (Bun.argv.includes('format=duration')) console.log('202.0');
else {
  console.log(JSON.stringify({ streams: [{ codec_type: 'video', nb_read_packets: '30', duration: '1.0', color_space: 'bt709', color_primaries: 'bt709', color_transfer: 'bt709', color_range: 'tv' }, { codec_type: 'audio', duration: '1.0' }] }));
  process.exit(7);
}
export {};
