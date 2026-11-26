/**
 * GLSL for the two draw calls of the world view.
 *
 * Ground: one full-screen quad. The simulation's fields arrive packed in a
 * single RGBA texture (R = food, G = trail, B = fertility), one texel per cell.
 * Remains: one point sprite per death, drawn into the ground.
 * Life: one point sprite per organism.
 */

export const GROUND_VERT = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  // Flip v so that the simulation's y = 0 is the top of the screen.
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

export const GROUND_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uFields;
uniform vec2 uResolution;
in vec2 vUv;
out vec4 outColor;

const vec3 VOID     = vec3(0.031, 0.039, 0.035); // #080A09
const vec3 GRAPHITE = vec3(0.133, 0.157, 0.141); // #222824
const vec3 MINERAL  = vec3(0.412, 0.467, 0.431); // #69776E
const vec3 MEMBRANE = vec3(0.722, 0.776, 0.737); // #B8C6BC
const vec3 MEMORY   = vec3(0.780, 0.675, 0.467); // #C7AC77

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 fields = texture(uFields, vUv);
  float food = fields.r * 2.0; // packed at half range: fertile ground exceeds 1
  float trail = fields.g;
  float fertility = fields.b;

  // Ground: food barely lifts the void, so depleted land reads as darker.
  vec3 color = mix(VOID, GRAPHITE, food * 0.2);

  // Fertile ground, where many have died, carries a faint warmth.
  color += MEMORY * fertility * 0.10;

  // Trail: a mineral haze that brightens to membrane where paths overlap.
  color += MINERAL * trail * 0.6;
  color += MEMBRANE * pow(trail, 3.0) * 0.4;

  // A little film grain keeps the dark areas from banding.
  color += (hash(gl_FragCoord.xy) - 0.5) * 0.012;

  // Soft vignette, like the edge of a microscope slide.
  vec2 centred = vUv - 0.5;
  color *= 1.0 - 0.35 * dot(centred, centred) * 2.0;

  outColor = vec4(color, 1.0);
}`;

export const LIFE_VERT = /* glsl */ `#version 300 es
in vec2 aPosition; // world units
in float aSize;    // world units
in float aEnergy;  // 0..1
in float aYouth;   // 1 at birth, 0 once grown

uniform float uWorldSize;
uniform float uPixelsPerUnit;

out float vEnergy;
out float vYouth;

void main() {
  vec2 clip = aPosition / uWorldSize * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = aSize * uPixelsPerUnit;
  vEnergy = aEnergy;
  vYouth = aYouth;
}`;

export const LIFE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in float vEnergy;
in float vYouth;
out vec4 outColor;

const vec3 BONE     = vec3(0.890, 0.886, 0.847); // #E3E2D8
const vec3 VITALITY = vec3(0.714, 0.796, 0.580); // #B6CB94

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;

  // A bright core inside a faint membrane.
  float core = smoothstep(0.55, 0.25, d);
  float membrane = smoothstep(1.0, 0.8, d) * 0.28;
  float alpha = (core + membrane) * (0.3 + 0.7 * vEnergy);

  outColor = vec4(mix(BONE, VITALITY, vYouth), alpha);
}`;

export const REMAINS_VERT = /* glsl */ `#version 300 es
in vec2 aPosition;   // world units
in float aDeathTick;

uniform float uWorldSize;
uniform float uPixelsPerUnit;
uniform float uTick;
uniform float uDecay;

out float vStrength;
out float vFresh;

void main() {
  vec2 clip = aPosition / uWorldSize * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = 3.2 * uPixelsPerUnit;
  float age = uTick - aDeathTick;
  vStrength = exp(-uDecay * age);
  // A death glows for a moment before it settles into the ground.
  vFresh = exp(-age / 400.0);
}`;

export const REMAINS_FRAG = /* glsl */ `#version 300 es
precision highp float;

in float vStrength;
in float vFresh;
out vec4 outColor;

const vec3 MEMORY = vec3(0.780, 0.675, 0.467); // #C7AC77
const vec3 DECAY  = vec3(0.706, 0.365, 0.259); // #B45D42

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  // A ring with a dim centre: a mark left in the ground, not a light.
  float ring = smoothstep(1.0, 0.8, d) * smoothstep(0.35, 0.65, d);
  float centre = smoothstep(0.5, 0.0, d) * 0.35;
  float alpha = (ring + centre) * (0.28 + 0.6 * vFresh) * vStrength;
  outColor = vec4(mix(MEMORY, DECAY, vFresh), alpha);
}`;
