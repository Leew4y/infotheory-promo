// The full-frame plate shader body of a new style (appended to the engine's shader header: hash, noise, fbm, uRes).
// Uniforms: uTime (seconds, slow drift), uP = progress (0 opening, 1 close), uQ = highlight (0 none, 1 strong),
// uTint (a colour the style passes), uMode (which branch, if the style has several). Replace the body with the look.
export const PLATE_FS = `
uniform float uTime; uniform int uMode; uniform vec3 uTint; uniform float uAmp; uniform float uP; uniform float uQ;
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / (.5 * uRes.y);
  // a vertical gradient that brightens with progress, a little drifting noise, a soft light for the highlight
  vec3 low = vec3(.04, .05, .07), high = mix(vec3(.10, .12, .16), uTint, .5);
  vec3 c = mix(low, high, smoothstep(-1., 1., uv.y) * (.4 + .6 * clamp(uP, 0., 1.)));
  c += (fbm(uv * 2. + vec2(uTime * .01, 0.)) - .5) * .04;
  float d = length(uv - vec2(.5, .3));
  c += uTint * exp(-d * d * 8.) * .5 * uQ;
  o = vec4(c * uAmp, 1.);
}`;
