// Test stand-in for ffmpeg / ffprobe: never reads its input and never exits on its own (killed by the exporter).
await Bun.sleep(3_600_000);
export {};
