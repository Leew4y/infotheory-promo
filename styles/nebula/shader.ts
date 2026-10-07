// The nebula style's background shader body (appended to the engine's shader header).
// uMode 1: the page ground (near-black blue, a faint dust haze, a fixed dot grid, sparse stars).
// uMode 2: the full-frame plate (a domain-warped nebula). uP = brightness and density (0 dim, 1 full),
// uQ = a bright star core (0 none). uTint = the gas colour. uTime drifts the gas; the dot grid never moves.
export const NEBULA_FS = `
uniform float uTime; uniform int uMode; uniform vec3 uTint; uniform float uAmp; uniform float uP; uniform float uQ;
float stars(vec2 px, float scale, float thresh){
  vec2 c = floor(px / scale);
  float h = hash(c);
  if (h < thresh) return 0.;
  vec2 at = (c + vec2(hash(c + 17.), hash(c + 41.))) * scale;
  float d = length(px - at);
  return exp(-d * d * .45) * (h - thresh) / (1. - thresh);
}
vec3 page(vec2 uv, vec2 px){
  vec3 c = mix(vec3(.030,.040,.070), vec3(.050,.066,.110), 1. - smoothstep(-.4, 1.2, length(uv - vec2(-.35, .25))));
  float n = fbm(uv * 1.4 + vec2(uTime * .004, 0.));
  c += uTint * smoothstep(.45, 1., n) * .06;
  vec2 g = mod(px + 20., 40.) - 20.;
  c += vec3(.10,.13,.19) * exp(-dot(g, g) * .9) * .55;
  c += vec3(.75,.82,.95) * stars(px, 90., .93) * .35;
  return c;
}
vec3 plate(vec2 uv, vec2 px){
  float k = clamp(uP, 0., 1.);
  float t = uTime * .02; vec2 p = uv * 1.25;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float n = fbm(p + 2.2 * q + vec2(t * 2., 0.));
  vec3 c = vec3(.006,.009,.022);
  vec3 gas = mix(uTint, vec3(.95,.62,.32), smoothstep(.55, 1., q.x) * .55);
  c += gas * smoothstep(mix(.62, .35, k), 1.05, n) * mix(.55, 1.4, k);
  c += vec3(.8,.86,1.) * (stars(px, 70., .9) * .9 + stars(px, 23., .985) * .5);
  vec2 sp = vec2(1.25, .55);
  float d = length(uv - sp);
  c += vec3(1.,.93,.82) * (exp(-d * d * 900.) * 1.6 + exp(-d * 9.) * .35) * uQ;
  return c;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / (.5 * uRes.y);
  vec2 px = gl_FragCoord.xy;
  vec3 c = uMode == 1 ? page(uv, px) : plate(uv, px);
  o = vec4(c * uAmp, 1.);
}`;
