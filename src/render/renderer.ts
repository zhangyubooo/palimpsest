import type { SimConfig, World } from '../sim';
import { GROUND_FRAG, GROUND_VERT, LIFE_FRAG, LIFE_VERT, REMAINS_FRAG, REMAINS_VERT } from './shaders';

/** How strongly trail values are compressed into 0..1 for display. */
const TRAIL_GAIN = 4;
/** Ticks during which a newborn is drawn in the Vitality colour. */
const YOUTH_TICKS = 120;

export interface ViewOptions {
  /** Memory view hides the living and shows only the ground. */
  showLife: boolean;
}

/**
 * Draws a world with WebGL2. It only reads the world; it never changes it.
 * Three draw calls per frame: the ground quad, the remains, then the living.
 */
export class WorldRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly groundProgram: WebGLProgram;
  private readonly lifeProgram: WebGLProgram;
  private readonly remainsProgram: WebGLProgram;
  private readonly remainsVao: WebGLVertexArrayObject;
  private readonly remainsBuffer: WebGLBuffer;
  /** How many remains are already on the GPU, and for which world. */
  private remainsUploaded = 0;
  private remainsWorld: World | null = null;
  private readonly groundVao: WebGLVertexArrayObject;
  private readonly lifeVao: WebGLVertexArrayObject;
  private readonly lifeBuffer: WebGLBuffer;
  private readonly fieldTexture: WebGLTexture;
  private readonly fieldPixels: Uint8Array;
  /** x, y, size, energy, youth per organism. */
  private readonly lifeData: Float32Array;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly config: SimConfig,
  ) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    this.groundProgram = link(gl, GROUND_VERT, GROUND_FRAG);
    this.lifeProgram = link(gl, LIFE_VERT, LIFE_FRAG);
    this.remainsProgram = link(gl, REMAINS_VERT, REMAINS_FRAG);

    // Remains: x, y, deathTick. Re-uploaded only when someone dies.
    this.remainsVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.remainsVao);
    this.remainsBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.remainsBuffer);
    const remainsPos = gl.getAttribLocation(this.remainsProgram, 'aPosition');
    gl.enableVertexAttribArray(remainsPos);
    gl.vertexAttribPointer(remainsPos, 2, gl.FLOAT, false, 12, 0);
    const remainsTick = gl.getAttribLocation(this.remainsProgram, 'aDeathTick');
    gl.enableVertexAttribArray(remainsTick);
    gl.vertexAttribPointer(remainsTick, 1, gl.FLOAT, false, 12, 8);

    // Ground: two triangles covering the screen.
    this.groundVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const groundPos = gl.getAttribLocation(this.groundProgram, 'aPosition');
    gl.enableVertexAttribArray(groundPos);
    gl.vertexAttribPointer(groundPos, 2, gl.FLOAT, false, 0, 0);

    // Fields: one texel per grid cell, smoothed by the GPU, wrapping at the edges.
    const size = config.size;
    this.fieldPixels = new Uint8Array(size * size * 4);
    this.fieldTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.fieldPixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    // Life: one interleaved, per-frame-updated buffer.
    const STRIDE = 5 * 4;
    this.lifeData = new Float32Array(config.hardCap * 5);
    this.lifeVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lifeVao);
    this.lifeBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lifeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.lifeData.byteLength, gl.DYNAMIC_DRAW);
    const attribute = (name: string, count: number, offset: number) => {
      const location = gl.getAttribLocation(this.lifeProgram, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, count, gl.FLOAT, false, STRIDE, offset * 4);
    };
    attribute('aPosition', 2, 0);
    attribute('aSize', 1, 2);
    attribute('aEnergy', 1, 3);
    attribute('aYouth', 1, 4);
    gl.bindVertexArray(null);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Matches the drawing buffer to the canvas's size on screen. Call before draw. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const side = Math.round(this.canvas.clientWidth * dpr);
    if (side > 0 && this.canvas.width !== side) {
      this.canvas.width = side;
      this.canvas.height = side;
    }
  }

  draw(world: World, options: ViewOptions): void {
    const { gl, config } = this;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Pack the fields into bytes. Trail has no upper limit, so it is
    // compressed with 1 - exp(-x): faint paths stay visible, busy ones saturate.
    const px = this.fieldPixels;
    const { food, trail, fertility } = world;
    for (let i = 0, p = 0; i < food.length; i++, p += 4) {
      px[p] = Math.min(255, (food[i] / config.foodCapacity) * 127);
      px[p + 1] = (1 - Math.exp(-trail[i] * TRAIL_GAIN)) * 255;
      px[p + 2] = (fertility[i] / config.fertilityMax) * 255;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, config.size, config.size, gl.RGBA, gl.UNSIGNED_BYTE, px);

    gl.disable(gl.BLEND);
    gl.useProgram(this.groundProgram);
    gl.uniform1i(gl.getUniformLocation(this.groundProgram, 'uFields'), 0);
    gl.uniform2f(gl.getUniformLocation(this.groundProgram, 'uResolution'), this.canvas.width, this.canvas.height);
    gl.bindVertexArray(this.groundVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Remains: every death, drawn into the ground.
    if (world !== this.remainsWorld || world.remains.length !== this.remainsUploaded) {
      const packed = new Float32Array(world.remains.length * 3);
      world.remains.forEach((r, i) => {
        packed[i * 3] = r.x;
        packed[i * 3 + 1] = r.y;
        packed[i * 3 + 2] = r.deathTick;
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, this.remainsBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, packed, gl.DYNAMIC_DRAW);
      this.remainsUploaded = world.remains.length;
      this.remainsWorld = world;
    }
    if (this.remainsUploaded > 0) {
      gl.enable(gl.BLEND);
      gl.useProgram(this.remainsProgram);
      gl.uniform1f(gl.getUniformLocation(this.remainsProgram, 'uWorldSize'), config.size);
      gl.uniform1f(gl.getUniformLocation(this.remainsProgram, 'uPixelsPerUnit'), this.canvas.width / config.size);
      gl.uniform1f(gl.getUniformLocation(this.remainsProgram, 'uTick'), world.tick);
      gl.uniform1f(gl.getUniformLocation(this.remainsProgram, 'uDecay'), config.remainsDecay);
      gl.bindVertexArray(this.remainsVao);
      gl.drawArrays(gl.POINTS, 0, this.remainsUploaded);
      gl.bindVertexArray(null);
    }

    if (!options.showLife) return;

    const data = this.lifeData;
    const count = Math.min(world.organisms.length, config.hardCap);
    for (let i = 0; i < count; i++) {
      const o = world.organisms[i];
      const k = i * 5;
      data[k] = o.x;
      data[k + 1] = o.y;
      data[k + 2] = 2.2 + 2.6 * o.genome.extension;
      data[k + 3] = o.energy / config.maxEnergy;
      data[k + 4] = Math.max(0, 1 - o.age / YOUTH_TICKS);
    }
    gl.enable(gl.BLEND);
    gl.useProgram(this.lifeProgram);
    gl.uniform1f(gl.getUniformLocation(this.lifeProgram, 'uWorldSize'), config.size);
    gl.uniform1f(gl.getUniformLocation(this.lifeProgram, 'uPixelsPerUnit'), this.canvas.width / config.size);
    gl.bindVertexArray(this.lifeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lifeBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 5);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);
  }
}

function link(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader failed to compile:\n${gl.getShaderInfoLog(shader)}`);
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program failed to link:\n${gl.getProgramInfoLog(program)}`);
  }
  return program;
}
