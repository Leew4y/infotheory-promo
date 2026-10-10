// Direction B plate: stacked soft colour fields (appended to the engine's shader header: hash, noise, fbm, uRes).
// Two horizontal fields with breathing, noise-softened edges on a plum-black ground. uP = progress: the fields
// brighten and warm from near-black plum to deep red; uQ = highlight: a luminous seam between the fields.
// uTime makes the edges breathe very slowly (fixed-seed noise); nothing else moves.
export const PLATE_FS = `
uniform float uTime; uniform int uMode; uniform vec3 uTint; uniform float uAmp; uniform float uP; uniform float uQ;
float field(vec2 uv, vec2 c, vec2 h, float soft){
  vec2 d = abs(uv - c) - h;
  float e = length(max(d, 0.)) + min(max(d.x, d.y), 0.);
  e += (fbm(uv * 2.5 + vec2(uTime * .015, c.y * 3.)) - .5) * .06;
  return smoothstep(soft, -soft, e);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / (.5 * uRes.y);
  float k = clamp(uP, 0., 1.);
  vec3 base = vec3(.045, .022, .035);
  vec3 top = mix(vec3(.07, .03, .05), vec3(.42, .08, .07), k);
  vec3 bot = mix(vec3(.05, .025, .04), vec3(.26, .05, .09), k);
  vec3 c = base;
  c = mix(c, top, field(uv, vec2(0., .38), vec2(1.45, .34), .09));
  c = mix(c, bot, field(uv, vec2(0., -.46), vec2(1.45, .28), .09));
  float seam = exp(-pow((uv.y + .08) / .035, 2.)) * smoothstep(1.6, .9, abs(uv.x));
  c += vec3(1., .55, .35) * seam * .5 * clamp(uQ, 0., 1.);
  c += (hash(gl_FragCoord.xy) - .5) * .01;
  o = vec4(max(c, 0.) * uAmp, 1.);
}`;
