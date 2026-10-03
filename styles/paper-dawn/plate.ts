// The dawn-horizon plate shader body (appended to the engine's shader header), moved verbatim from engine/gl.ts.
// uP = time of day (0 first light, 1 morning), uQ = sun height; uMode 3 selects the dawn branch, the nebula branch is unused.
export const PLATE_FS = `
uniform float uTime; uniform int uMode; uniform vec3 uTint; uniform float uAmp; uniform float uP; uniform float uQ;
// The dawn plate. uP = time of day (0 first light, 1 morning), uQ = sun height above the horizon (0 hidden).
vec3 dawn(vec2 uv){
  float day = clamp(uP, 0., 1.);
  float yh = -0.16 + 0.14 * uv.x * uv.x;              // the earth's curve
  float ab = uv.y - yh;
  vec3 top  = mix(vec3(.07,.12,.22), vec3(.34,.50,.66), day);
  vec3 mid  = mix(vec3(.26,.38,.52), vec3(.66,.76,.85), day);
  vec3 warm = mix(vec3(.86,.48,.18), vec3(.98,.82,.55), day);
  float t = clamp(ab / 1.05, 0., 1.);
  vec3 sky = mix(mid, top, smoothstep(0., 1., t));
  float band = exp(-ab * ab * 22.) * (1. - t * .4);
  sky = mix(sky, warm, clamp(band * 1.15, 0., 1.));
  float haze = fbm(vec2(uv.x * 1.8 + uTime * .006, uv.y * 7. + 3.));
  sky += (haze - .5) * .05;
  float streak = fbm(vec2(uv.x * .9 - uTime * .004, uv.y * 30.));
  sky += (streak - .5) * .03 * exp(-ab * 6.) * step(0., ab);
  // sun
  vec2 sp = vec2(.12, yh + uQ * .18);
  float d = length((uv - sp) * vec2(1., 1.3));
  sky += warm * (exp(-d * d * 60.) * 1.4 + exp(-d * 5.) * .35) * step(.001, uQ) * step(0., ab);
  vec3 earth = vec3(.075,.055,.045) + warm * .10 * exp(-(-ab) * 9.);
  earth += (fbm(vec2(uv.x * 3., uv.y * 3.)) - .5) * .02;
  vec3 c = mix(earth, sky, smoothstep(-0.012, 0.012, ab));
  return c;
}
vec3 nebula(vec2 uv){
  float t=uTime*.02; vec2 p=uv*1.25;
  vec2 q=vec2(fbm(p+t), fbm(p+vec2(5.2,1.3)-t));
  float n=fbm(p+2.2*q+vec2(t*2.,0.));
  vec3 c=vec3(.006,.009,.022);
  c+=uTint*smoothstep(.35,1.05,n)*1.3;
  return c;
}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/(.5*uRes.y);
  vec3 c = uMode==3 ? dawn(uv) : nebula(uv);
  o=vec4(c*uAmp,1.);
}`;
