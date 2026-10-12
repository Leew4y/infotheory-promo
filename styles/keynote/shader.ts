// Keynote plate: a light stage, the same grey as the pages (#F5F5F7), lit from above by a soft cyan and blue glow drawn
// from the product logo's gradient, fading to near white at the floor. uP (progress) widens the glow a little; uQ
// (highlight) adds a faint horizon line. Deterministic in uTime; dithered so the pale gradient does not band.
export const PLATE_FS = `
uniform float uTime; uniform int uMode; uniform vec3 uTint; uniform float uAmp; uniform float uP; uniform float uQ;
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / (.5 * uRes.y);
  float p = clamp(uP, 0., 1.);
  vec3 base = vec3(.961, .961, .969);
  vec2 c1 = vec2(-.60 + .06 * sin(uTime * .05), 1.30), c2 = vec2(.65 + .06 * cos(uTime * .04), 1.20);
  float r = 1.0 + .25 * p;
  float g1 = exp(-dot(uv - c1, uv - c1) / (r * r)), g2 = exp(-dot(uv - c2, uv - c2) / (r * r * .8));
  // the logo's cyan and blue, both pale: they tint the grey, never darken it much
  vec3 lav = vec3(.84, .96, .95), blu = vec3(.84, .89, 1.0);
  vec3 c = mix(base, lav, g1 * .55);
  c = mix(c, blu, g2 * .45);
  c = mix(c, vec3(.985), smoothstep(-.2, -1., uv.y) * .6);
  c -= vec3(.10, .10, .04) * exp(-pow((uv.y + .32) * 70., 2.)) * .35 * uQ * exp(-uv.x * uv.x * 1.5);
  c += (hash(gl_FragCoord.xy) - .5) / 255.;
  o = vec4(c * uAmp, 1.);
}`;
