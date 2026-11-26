import * as PIXI from 'pixi.js';

/**
 * Toggleable Minecraft-style enchantment glint overlay for Difficult (crimson) and No Mercy (purple).
 * Keeps the underlying sprite colors intact and layers an animated diagonal shimmer on top of opaque pixels.
 */
export const ENABLE_DIFFICULTY_GLINT = true;

const GLINT_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uIntensity;

void main(void) {
  vec4 base = texture2D(uSampler, vTextureCoord);
  if (base.a <= 0.02) {
    gl_FragColor = base;
    return;
  }

  // Dual crossing diagonal shimmer waves inspired by Minecraft enchantment glint
  float w1 = sin((vTextureCoord.x * 5.0 + vTextureCoord.y * 5.0 - uTime * 2.15) * 3.14159);
  float w2 = sin((vTextureCoord.x * 3.4 - vTextureCoord.y * 4.4 + uTime * 1.4) * 3.14159);
  float band1 = pow(clamp(w1 * 0.5 + 0.5, 0.0, 1.0), 3.0);
  float band2 = pow(clamp(w2 * 0.5 + 0.5, 0.0, 1.0), 3.4);

  float shimmer = clamp(band1 * 0.68 + band2 * 0.45 + 0.12, 0.0, 1.0);
  vec3 glintCol = mix(uColorA, uColorB, clamp(band1 * 0.75 + band2 * 0.45, 0.0, 1.0));

  // Screen-like luminous glaze over the sprite while preserving original sprite details & alpha
  vec3 overlay = glintCol * shimmer * uIntensity * base.a;
  vec3 finalRgb = clamp(base.rgb + overlay * (1.0 - base.rgb * 0.32), 0.0, base.a);
  gl_FragColor = vec4(finalRgb, base.a);
}
`;

export class DifficultyGlintFilter extends PIXI.Filter {
  constructor(mode: 'difficult' | 'no_mercy') {
    const isNoMercy = mode === 'no_mercy';
    super(undefined, GLINT_FRAGMENT_SHADER, {
      uTime: 0,
      uColorA: isNoMercy ? [0.58, 0.14, 0.96] : [0.92, 0.12, 0.22],
      uColorB: isNoMercy ? [0.95, 0.54, 1.0] : [1.0, 0.46, 0.46],
      uIntensity: isNoMercy ? 0.62 : 0.56,
    });
  }

  public setMode(mode: 'difficult' | 'no_mercy'): void {
    const isNoMercy = mode === 'no_mercy';
    this.uniforms.uColorA = isNoMercy ? [0.58, 0.14, 0.96] : [0.92, 0.12, 0.22];
    this.uniforms.uColorB = isNoMercy ? [0.95, 0.54, 1.0] : [1.0, 0.46, 0.46];
    this.uniforms.uIntensity = isNoMercy ? 0.62 : 0.56;
  }

  public advance(dt: number): void {
    this.uniforms.uTime += dt;
  }
}
