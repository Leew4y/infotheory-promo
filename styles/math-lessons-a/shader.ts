// Direction A plate: a rose window (appended to the engine's shader header: hash, noise, fbm, uRes).
// Twelve-fold symmetry: rings of circular panes in polar coordinates, dark lead lines between them, crimson / cobalt /
// gold glass. uP = progress: the light coming through the panes (0 almost dark, 1 full); uQ = highlight: a flame at
// the centre. uTime only makes the light breathe a little (fixed-seed noise), the geometry never moves.
export const PLATE_FS = `
uniform float uTime; uniform int uMode; uniform vec3 uTint; uniform float uAmp; uniform float uP; uniform float uQ;
vec3 glass(float k){
  vec3 a = vec3(.62,.13,.11), b = vec3(.13,.24,.58), c = vec3(.86,.63,.25);
  return k < .45 ? a : (k < .8 ? b : c);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / (.5 * uRes.y);
  vec2 p = uv - vec2(0., .02);
  float r = length(p), th = atan(p.y, p.x);
  float n = 12., sector = 2. * PI / n;
  float a = mod(th + sector * .5, sector) - sector * .5;           // angle inside one sector
  vec2 q = r * vec2(cos(a), sin(a));                                // folded point
  float lit = .08 + .92 * clamp(uP, 0., 1.);
  vec3 c = vec3(.012, .009, .008);
  float lead = 1.;
  // three rings of panes: centres at radii .22, .46, .70, pane radius proportional
  for (int i = 0; i < 3; i++) {
    float rc = .22 + .24 * float(i), pr = .085 + .03 * float(i);
    float d = length(q - vec2(rc, 0.)) - pr;
    float k = hash(vec2(float(i), 3.));
    float pane = smoothstep(.006, -.004, d);
    lead = min(lead, smoothstep(.0, .012, abs(d)));
    float flick = .9 + .1 * noise(vec2(uTime * .3 + float(i) * 7., k * 9.));
    c += glass(fract(k + float(i) * .37)) * pane * lit * flick * (1.1 - .25 * float(i));
  }
  // outer rim and the circle around the centre
  float rim = abs(r - .86); lead = min(lead, smoothstep(.0, .012, rim));
  c += vec3(.25,.18,.10) * smoothstep(.02, .0, rim) * lit;
  float hub = r - .1; c += glass(.9) * smoothstep(.006, -.004, hub) * lit * .9;
  lead = min(lead, smoothstep(.0, .01, abs(hub)));
  c *= mix(.25, 1., lead) * smoothstep(1.05, .8, r);
  c += vec3(1., .72, .38) * (exp(-r * r * 60.) * 1.2 + exp(-r * 5.) * .18) * clamp(uQ, 0., 1.);
  c += (fbm(uv * 3.) - .5) * .02;
  o = vec4(max(c, 0.) * uAmp, 1.);
}`;
