// Direction C plate: two interfering systems of concentric rings on black (appended to the engine's shader header).
// The rings are thin and white; where the two systems cross they form moiré bands. uP = progress: the rings tighten
// and sharpen (0 sparse and faint, 1 dense and crisp); uQ = highlight: a solid red disc. uTime slides the second
// centre slowly along a fixed path, so the moiré shifts; no noise.
export const PLATE_FS = `
uniform float uTime; uniform int uMode; uniform vec3 uTint; uniform float uAmp; uniform float uP; uniform float uQ;
float rings(vec2 uv, vec2 c, float f){
  float d = length(uv - c) * f;
  float w = fwidth(d);
  return smoothstep(.5 - w, .5 + w, abs(fract(d) - .5) * 2. - .0) ;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / (.5 * uRes.y);
  float k = clamp(uP, 0., 1.);
  float f = mix(9., 26., k);
  vec2 c1 = vec2(-.35, .0), c2 = vec2(.35 + .08 * sin(uTime * .05), .05 * cos(uTime * .04));
  float a = 1. - rings(uv, c1, f), b = 1. - rings(uv, c2, f);
  float m = a * b + (1. - a) * (1. - b);
  vec3 c = vec3(1.) * mix(.05, .55, k) * (1. - m) * smoothstep(1.9, 1.1, length(uv));
  float disc = smoothstep(.17, .165, length(uv - vec2(.0, .0)));
  c = mix(c, vec3(.82, .1, .07), disc * clamp(uQ, 0., 1.));
  o = vec4(c * uAmp, 1.);
}`;
