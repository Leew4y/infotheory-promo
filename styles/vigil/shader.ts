// Vigil plate: a rose window seen from inside a dark nave (appended to the engine's shader header: hash, noise, fbm, uRes).
// Sixteen-fold tracery: three rings of small petal-shaped panes and a ring of lancets, thin dark lead between them, and
// glass that is dim and low in saturation (ruby, cobalt, amber), each pane with its own faint mottling. The window is
// centred and set high, so its centre (the flame) burns above the text block and the middle of the frame stays calm.
// uP = progress: the light coming through the glass (0 almost dark, 1 lit but never bright); uQ = highlight: a flame at
// the window's centre, the film's "fire". uTime only makes the light breathe slightly (fixed-seed noise).
export const PLATE_FS = `
uniform float uTime; uniform int uMode; uniform vec3 uTint; uniform float uAmp; uniform float uP; uniform float uQ;
vec3 glass(float k){
  if (k < .4) return vec3(.36, .07, .06);   // ruby
  if (k < .72) return vec3(.07, .11, .30);  // cobalt
  return vec3(.42, .27, .09);               // amber
}
// one ring of petals (ellipses) centred at radius rc in the folded sector: x = pane mask (brighter towards the pane's
// middle), y = distance to the lead
vec2 petals(vec2 q, float rc, float a, float b){
  vec2 d = (q - vec2(rc, 0.)) / vec2(a, b);
  float l = length(d), e = (l - 1.) * min(a, b);
  return vec2(smoothstep(.004, -.003, e) * (1.15 - .45 * l * l), abs(e));
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / (.5 * uRes.y);
  vec2 ctr = vec2(0., .5);
  vec2 p = (uv - ctr) / 1.25;
  float r = length(p), th = atan(p.y, p.x);
  float n = 16., sector = 2. * PI / n;
  float id = mod(floor((th + sector * .5) / sector), n);   // sector index 0..15 (no seam where the angle wraps)
  float a = mod(th + sector * .5, sector) - sector * .5;
  vec2 q = r * vec2(cos(a), sin(a));
  float lit = .05 + .45 * clamp(uP, 0., 1.);
  vec3 c = vec3(.010, .008, .007);
  float lead = 1.;
  for (int i = 0; i < 3; i++) {
    float rc = .2 + .2 * float(i);
    vec2 pt = petals(q, rc, .055 + .018 * float(i), .03 + .016 * float(i));
    float k = hash(vec2(id + 31. * float(i), 7.));
    float mott = .75 + .25 * noise(q * 60. + float(i) * 13.);
    float flick = .92 + .08 * noise(vec2(uTime * .25, id + float(i) * 5.));
    c += glass(fract(k * 1.7 + float(i) * .29)) * pt.x * lit * mott * flick;
    lead = min(lead, smoothstep(0., .006, pt.y));
  }
  // a lead line through the middle of every petal (the glass is in two halves)
  lead = min(lead, mix(1., smoothstep(0., .004, abs(q.y)), step(.12, r) * step(r, .72)));
  // lancets between the outer petals, the rim and the hub
  vec2 lq = vec2(q.x - .76, q.y);
  float lan = max(abs(lq.y) - .022 * smoothstep(.1, -.06, lq.x), abs(lq.x) - .07);
  c += glass(.85) * smoothstep(.003, -.003, lan) * lit * .8;
  lead = min(lead, smoothstep(0., .005, abs(lan)));
  float rim = abs(r - .88); lead = min(lead, smoothstep(0., .008, rim));
  float hub = r - .085; c += glass(.9) * smoothstep(.004, -.004, hub) * lit;
  lead = min(lead, smoothstep(0., .006, abs(hub)));
  c *= mix(.2, 1., lead) * smoothstep(.95, .86, r);
  // the flame at the centre
  float qf = clamp(uQ, 0., 1.);
  c += vec3(1., .66, .32) * (exp(-r * r * 220.) * .9 + exp(-r * 6.) * .12) * qf;
  // a faint haze of the nave around the window, so the frame is not flat black
  c += vec3(.012, .010, .009) * (fbm(uv * 1.5 + vec2(uTime * .005, 0.)) - .3);
  o = vec4(max(c, 0.) * uAmp, 1.);
}`;
