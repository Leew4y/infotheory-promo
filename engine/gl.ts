/**
 * WebGL2 side of the frame pipeline.
 *   glPlate(body, mode, u)       a style's full-frame background shader (e.g. the dawn horizon), drawn onto the 2D canvas
 *   accumulate(k, K)              upload the finished 2D canvas and average K sub-frames (motion blur)
 *   post(T, grade)                film grain, gentle vignette, a little halation on the plates, warm/cool split
 * The 2D canvas is then overwritten with the graded result; overlays (captions) are drawn on top, sharp.
 */
import { cv, ctx } from './draw';
import { W, H } from './util';

export const glc = document.createElement('canvas');
glc.width = W;
glc.height = H;
const ctxGl = glc.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false });
if (!ctxGl) throw new Error('WebGL2 is not available: the frame pipeline needs it (check the GPU backend / --use-angle)');
const gl: WebGL2RenderingContext = ctxGl;
// Rendering into the half-float targets (motion-blur accumulation, bloom) needs EXT_color_buffer_float; without it
// the output would be silently wrong, so fail. (Filtering half-float textures is core WebGL2; OES_texture_float_linear
// only concerns 32-bit float textures, which this pipeline does not use.)
if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 extension EXT_color_buffer_float is not available on this GPU backend');

const VS = `#version 300 es
in vec2 p; out vec2 vUv; void main() { vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
/** Shader header shared by the engine passes and style background shaders (hash, value noise, fbm). */
export const HEAD = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes;
#define PI 3.14159265359
float hash(vec2 p){ uvec2 q=uvec2(ivec2(floor(p))+ivec2(4096))*uvec2(1597334673u,3812015801u); uint n=(q.x^q.y)*1597334673u; n^=n>>16; n*=2246822519u; n^=n>>13; return float(n)*(1./4294967295.); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
`;

const FS_ACC = HEAD + `uniform sampler2D uT; uniform float uW; void main(){ o = vec4(texture(uT, vUv).rgb * uW, 1.); }`;
const FS_DOWN = HEAD + `uniform sampler2D uT; uniform vec2 uTexel; uniform float uThresh;
vec3 pre(vec3 c){ if(uThresh<=0.) return c; float l=max(c.r,max(c.g,c.b)); float k=clamp(l-uThresh+.12,0.,.24); k=k*k/.48; return c*max(k,l-uThresh)/max(l,1e-4); }
void main(){ vec2 h=uTexel*.5;
  vec3 s=pre(texture(uT,vUv).rgb)*4.+pre(texture(uT,vUv-h).rgb)+pre(texture(uT,vUv+h).rgb)+pre(texture(uT,vUv+vec2(h.x,-h.y)).rgb)+pre(texture(uT,vUv-vec2(h.x,-h.y)).rgb);
  o=vec4(s/8.,1.); }`;
const FS_UP = HEAD + `uniform sampler2D uT; uniform vec2 uTexel;
void main(){ vec2 h=uTexel*.5; vec3 s=vec3(0.);
  s+=texture(uT,vUv+vec2(-h.x*2.,0.)).rgb; s+=texture(uT,vUv+vec2(-h.x,h.y)).rgb*2.; s+=texture(uT,vUv+vec2(0.,h.y*2.)).rgb; s+=texture(uT,vUv+vec2(h.x,h.y)).rgb*2.;
  s+=texture(uT,vUv+vec2(h.x*2.,0.)).rgb; s+=texture(uT,vUv+vec2(h.x,-h.y)).rgb*2.; s+=texture(uT,vUv+vec2(0.,-h.y*2.)).rgb; s+=texture(uT,vUv+vec2(-h.x,-h.y)).rgb*2.;
  o=vec4(s/12.,1.); }`;
const FS_FINAL = HEAD + `uniform sampler2D uScene; uniform sampler2D uBloom; uniform float uBloomAmt; uniform float uCA; uniform float uVig; uniform float uGrain;
uniform float uSeed; uniform float uSat; uniform float uSplit; uniform vec3 uTintS; uniform vec3 uTintH;
void main(){
  vec2 d=vUv-.5;
  vec3 c=vec3(texture(uScene,vUv-d*uCA).r, texture(uScene,vUv).g, texture(uScene,vUv+d*uCA).b);
  c+=texture(uBloom,vUv).rgb*uBloomAmt;
  float l=dot(c,vec3(.2126,.7152,.0722));
  c=mix(c, c*mix(uTintS,uTintH,smoothstep(.04,.7,l)), uSplit);
  c=mix(vec3(l),c,uSat);
  c*=1.-uVig*smoothstep(.45,1.15,length(d*vec2(1.,.7))*1.5);
  float g=hash(gl_FragCoord.xy+vec2(uSeed*37.,uSeed*17.))-.5;
  c+=g*uGrain*(.6+.4*(1.-l));
  o=vec4(clamp(c,0.,1.),1.);
}`;

function compile(type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader compile failed: ${gl.getShaderInfoLog(s)}`);
  return s;
}
interface Prog { pr: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }
function program(fs: string, names: string[]): Prog {
  const pr = gl.createProgram()!;
  gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(pr, 0, 'p');
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(`shader link failed: ${gl.getProgramInfoLog(pr)}`);
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of ['uRes', ...names]) u[n] = gl.getUniformLocation(pr, n);
  return { pr, u };
}
const P_ACC = program(FS_ACC, ['uT', 'uW']);
const P_DOWN = program(FS_DOWN, ['uT', 'uTexel', 'uThresh']);
const P_UP = program(FS_UP, ['uT', 'uTexel']);
const P_FIN = program(FS_FINAL, ['uScene', 'uBloom', 'uBloomAmt', 'uCA', 'uVig', 'uGrain', 'uSeed', 'uSat', 'uSplit', 'uTintS', 'uTintH']);
const VAO = gl.createVertexArray();
gl.bindVertexArray(VAO);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

function makeTex(w: number, h: number, float: boolean): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return t;
}
interface Fbo { t: WebGLTexture; f: WebGLFramebuffer; w: number; h: number }
function makeFbo(w: number, h: number): Fbo {
  const t = makeTex(w, h, true);
  const f = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`half-float framebuffer ${w}x${h} is incomplete on this GPU backend`);
  return { t, f, w, h };
}
const SCENE_TEX = makeTex(W, H, false);
const ACC = makeFbo(W, H);
const MIPS = [1, 2, 3, 4, 5].map((k) => makeFbo(Math.ceil(W / 2 ** k), Math.ceil(H / 2 ** k)));
function tri(target: WebGLFramebuffer | null, w: number, h: number): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target);
  gl.viewport(0, 0, w, h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function bindTex(unit: number, t: WebGLTexture | null): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
}

export interface BgUniforms { time?: number; tint?: [number, number, number]; amp?: number; p?: number; q?: number }
const BG_UNIFORMS = ['uTime', 'uMode', 'uTint', 'uAmp', 'uP', 'uQ'];
const bgPrograms = new Map<string, Prog>();
/** Draw a style's background shader (HEAD + body) onto the 2D canvas. `mode` is passed as uMode. */
export function glPlate(body: string, mode: number, u: BgUniforms = {}, alpha = 1): void {
  let P = bgPrograms.get(body);
  if (!P) bgPrograms.set(body, (P = program(HEAD + body, BG_UNIFORMS)));
  gl.useProgram(P.pr);
  gl.disable(gl.BLEND);
  gl.uniform2f(P.u.uRes, W, H);
  gl.uniform1f(P.u.uTime, u.time ?? 0);
  gl.uniform1i(P.u.uMode, mode);
  const t = u.tint ?? [0.2, 0.3, 0.7];
  gl.uniform3f(P.u.uTint, t[0], t[1], t[2]);
  gl.uniform1f(P.u.uAmp, u.amp ?? 1);
  gl.uniform1f(P.u.uP, u.p ?? 0);
  gl.uniform1f(P.u.uQ, u.q ?? 0);
  tri(null, W, H);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(glc, 0, 0);
  ctx.restore();
}

export function accumulate(k: number, K: number): void {
  bindTex(0, SCENE_TEX);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.useProgram(P_ACC.pr);
  gl.uniform1i(P_ACC.u.uT, 0);
  gl.uniform1f(P_ACC.u.uW, 1 / K);
  if (k === 0) gl.disable(gl.BLEND);
  else {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
  }
  tri(ACC.f, W, H);
  gl.disable(gl.BLEND);
}

export interface Grade { bloom: number; ca: number; vig: number; grain: number; sat: number; split: number; tintS: [number, number, number]; tintH: [number, number, number] }

export function post(T: number, g: Grade, fps = 30): void {
  let src: Fbo = ACC;
  gl.useProgram(P_DOWN.pr);
  gl.uniform1i(P_DOWN.u.uT, 0);
  MIPS.forEach((dst, i) => {
    bindTex(0, src.t);
    gl.uniform2f(P_DOWN.u.uTexel, 1 / src.w, 1 / src.h);
    gl.uniform1f(P_DOWN.u.uThresh, i ? 0 : 0.72);
    tri(dst.f, dst.w, dst.h);
    src = dst;
  });
  gl.useProgram(P_UP.pr);
  gl.uniform1i(P_UP.u.uT, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = MIPS.length - 1; i > 0; i--) {
    const s = MIPS[i];
    const d = MIPS[i - 1];
    bindTex(0, s.t);
    gl.uniform2f(P_UP.u.uTexel, 1 / s.w, 1 / s.h);
    tri(d.f, d.w, d.h);
  }
  gl.disable(gl.BLEND);
  const P = P_FIN;
  gl.useProgram(P.pr);
  bindTex(0, ACC.t);
  bindTex(1, MIPS[0].t);
  gl.uniform1i(P.u.uScene, 0);
  gl.uniform1i(P.u.uBloom, 1);
  gl.uniform2f(P.u.uRes, W, H);
  gl.uniform1f(P.u.uBloomAmt, g.bloom);
  gl.uniform1f(P.u.uCA, g.ca);
  gl.uniform1f(P.u.uVig, g.vig);
  gl.uniform1f(P.u.uGrain, g.grain);
  gl.uniform1f(P.u.uSeed, Math.floor(T * fps) % 97);
  gl.uniform1f(P.u.uSat, g.sat);
  gl.uniform1f(P.u.uSplit, g.split);
  gl.uniform3fv(P.u.uTintS, g.tintS);
  gl.uniform3fv(P.u.uTintH, g.tintH);
  tri(null, W, H);
  bindTex(1, null);
  bindTex(0, null);
}

export function gpuName(): string {
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return String(d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}
