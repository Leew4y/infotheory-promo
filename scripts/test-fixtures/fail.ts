// Test stand-in for ffmpeg: takes the first frames, then exits 1 (an encoder that fails while encoding).
for await (const _ of Bun.stdin.stream()) break;
process.exit(1);
export {};
