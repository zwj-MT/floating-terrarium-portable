import * as THREE from '../vendor/three/three.module.js';

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    float brightness = max(color.r, max(color.g, color.b));
    float soft = clamp(brightness - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 0.00001);
    float contribution = max(soft, brightness - uThreshold) / max(brightness, 0.00001);
    gl_FragColor = vec4(color * contribution, 1.0);
  }
`;

const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  varying vec2 vUv;

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
    color += texture2D(tDiffuse, vUv + uDirection * 1.3846153846).rgb * 0.3162162162;
    color += texture2D(tDiffuse, vUv - uDirection * 1.3846153846).rgb * 0.3162162162;
    color += texture2D(tDiffuse, vUv + uDirection * 3.2307692308).rgb * 0.0702702703;
    color += texture2D(tDiffuse, vUv - uDirection * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const FINAL_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uExposure;
  uniform float uBloomStrength;
  uniform float uNight;
  uniform float uFocus;
  uniform float uAperture;
  uniform float uWarmth;
  uniform float uRaysStrength;
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 sampleSceneChroma(vec2 uv, float strength) {
    vec2 center = uv - 0.5;
    vec2 offset = center * dot(center, center) * strength;
    vec3 color;
    color.r = texture2D(tScene, uv + offset).r;
    color.g = texture2D(tScene, uv).g;
    color.b = texture2D(tScene, uv - offset).b;
    return color;
  }

  vec3 acesFilm(vec3 color) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
  }

  void main() {
    vec2 uv = vUv;
    vec2 centered = uv - 0.5;

    // Tilt-shift: a narrow horizontal focus band runs through the diorama.
    float vertical = abs(uv.y - uFocus);
    float band = smoothstep(0.105, 0.47, vertical);
    float sideSoftness = smoothstep(0.34, 0.84, abs(centered.x));
    float blurPixels = uAperture * (band * band * 1.5 + sideSoftness * 0.24);

    // A small chromatic split at the edges adds the feeling of a real lens.
    float chroma = 0.0025 + 0.008 * uNight;
    vec3 color = sampleSceneChroma(uv, chroma);

    if (blurPixels > 0.12) {
      vec2 radius = vec2(1.0 / uResolution.x, 1.0 / uResolution.y) * blurPixels;
      float angle = hash12(uv * 921.7) * 6.2831853;
      float ca = cos(angle);
      float sa = sin(angle);
      mat2 rotate = mat2(ca, -sa, sa, ca);
      vec3 accum = vec3(0.0);
      float total = 0.0;

      // Rotated Vogel disc: a soft, round macro-lens bokeh.
      for (int i = 0; i < 10; i++) {
        float fi = float(i) + 0.5;
        float r = sqrt(fi / 10.0);
        float theta = fi * 2.39996323;
        vec2 dir = vec2(cos(theta), sin(theta)) * r;
        float weight = 1.0 - r * 0.3;
        vec2 suv = uv + rotate * dir * radius;
        accum += texture2D(tScene, suv).rgb * weight;
        total += weight;
      }
      vec3 soft = accum / total;
      float mixAmount = smoothstep(0.15, 2.2, blurPixels);
      color = mix(color, soft, mixAmount * 0.88);
    }

    vec3 bloom = texture2D(tBloom, uv).rgb;

    // A soft screen-space sun veil: eight bloom samples drift toward an upper
    // light source, giving volume without any hard geometry silhouettes.
    vec2 source = vec2(0.79, 0.83);
    vec3 rays = vec3(0.0);
    float rayWeight = 0.0;
    for (int i = 0; i < 8; i++) {
      float t = float(i) / 7.0;
      vec2 sampleUv = mix(uv, source, t * 0.16);
      float weight = 1.0 - t * 0.55;
      rays += texture2D(tBloom, sampleUv).rgb * weight;
      rayWeight += weight;
    }
    rays /= rayWeight;
    color += rays * uRaysStrength * (0.35 + uWarmth * 0.85) * (1.0 - uNight * 0.7);

    // A distant sun just beyond the glass. The broad halo and faint radial
    // streaks are what make the interior feel bathed in cinematic light.
    vec2 sunUv = source;
    vec2 sunDelta = (uv - sunUv) * vec2(1.0, 1.1);
    float sunDistance = length(sunDelta);
    float sunCore = exp(-sunDistance * sunDistance * 130.0);
    float sunHalo = exp(-sunDistance * sunDistance * 9.0);
    float sunAngle = atan(sunDelta.y, sunDelta.x);
    float streak = pow(max(0.0, cos(sunAngle * 11.0 + 1.2)), 22.0);
    streak *= smoothstep(0.92, 0.12, sunDistance) * smoothstep(0.02, 0.2, sunDistance);
    vec3 sunTint = mix(vec3(1.0, 0.76, 0.48), vec3(0.62, 0.76, 0.9), uNight);
    color += sunTint * (sunCore * 0.075 + sunHalo * 0.026 + streak * 0.007)
      * (0.28 + uWarmth * 0.9) * (1.0 - uNight * 0.75);

    color += bloom * uBloomStrength * mix(vec3(1.0, 0.95, 0.86), vec3(0.66, 0.82, 1.0), uNight * 0.65);

    color *= uExposure;
    color = acesFilm(color);

    // Gentle cinematic grade: cool velvety shadows, warm porcelain light.
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 shadowTint = vec3(0.88, 0.96, 1.02);
    vec3 highlightTint = mix(vec3(1.02, 0.99, 0.94), vec3(0.92, 0.97, 1.05), uNight);
    color *= mix(shadowTint, highlightTint, smoothstep(0.08, 0.82, luma));
    color = mix(vec3(luma), color, 1.055);
    color = (color - 0.5) * 1.035 + 0.5;

    // Vignette and a breath of exposure falloff toward the top corners.
    vec2 vc = centered * vec2(uResolution.x / uResolution.y, 1.0);
    float vignette = smoothstep(1.06, 0.24, length(vc));
    color *= mix(0.74, 1.0, vignette);
    color *= mix(0.96, 1.0, smoothstep(0.0, 0.45, uv.y));

    // Fine-grain film texture, quantized to 24 fps so it feels photographic.
    float grain = hash12(gl_FragCoord.xy + floor(uTime * 24.0) * 17.13) - 0.5;
    color += grain * (0.007 + luma * 0.004);
    color = clamp(color, 0.0, 1.0);

    // A whisper of warm light leakage near the upper-left glass edge.
    vec2 leakCenter = vec2(0.17, 0.83);
    float leak = exp(-dot((uv - leakCenter) * vec2(1.1, 1.55), (uv - leakCenter) * vec2(1.1, 1.55)) * 11.0);
    color += vec3(0.022, 0.016, 0.01) * leak * (0.35 + uWarmth * 0.65);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

class FullscreenPass {
  constructor(material) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.isMobile = window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;

    const targetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    };

    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      ...targetOptions,
      samples: renderer.capabilities.isWebGL2 ? (this.isMobile ? 2 : 4) : 0,
    });
    this.brightTarget = new THREE.WebGLRenderTarget(1, 1, { ...targetOptions, depthBuffer: false });
    this.blurTargetA = new THREE.WebGLRenderTarget(1, 1, { ...targetOptions, depthBuffer: false });
    this.blurTargetB = new THREE.WebGLRenderTarget(1, 1, { ...targetOptions, depthBuffer: false });

    this.brightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.sceneTarget.texture },
        uThreshold: { value: 0.87 },
        uKnee: { value: 0.28 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BRIGHT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2() },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.finalMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneTarget.texture },
        tBloom: { value: this.blurTargetA.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uExposure: { value: 1.06 },
        uBloomStrength: { value: 0.46 },
        uNight: { value: 0 },
        uFocus: { value: 0.52 },
        uAperture: { value: this.isMobile ? 3.0 : 4.2 },
        uWarmth: { value: 0.6 },
        uRaysStrength: { value: 0.085 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: FINAL_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.brightPass = new FullscreenPass(this.brightMaterial);
    this.blurPass = new FullscreenPass(this.blurMaterial);
    this.finalPass = new FullscreenPass(this.finalMaterial);
  }

  setSize(width, height) {
    this.sceneTarget.setSize(width, height);
    const halfWidth = Math.max(1, Math.floor(width * 0.5));
    const halfHeight = Math.max(1, Math.floor(height * 0.5));
    this.brightTarget.setSize(halfWidth, halfHeight);
    this.blurTargetA.setSize(halfWidth, halfHeight);
    this.blurTargetB.setSize(halfWidth, halfHeight);
    this.finalMaterial.uniforms.uResolution.value.set(width, height);
  }

  render(scene, camera, time, atmosphere) {
    const renderer = this.renderer;
    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);

    this.brightPass.render(renderer, this.brightTarget);

    const w = this.brightTarget.width;
    const h = this.brightTarget.height;

    // Two separable Gaussian iterations create a wide, soft photographic bloom.
    this.blurMaterial.uniforms.tDiffuse.value = this.brightTarget.texture;
    this.blurMaterial.uniforms.uDirection.value.set(1.35 / w, 0);
    this.blurPass.render(renderer, this.blurTargetA);

    this.blurMaterial.uniforms.tDiffuse.value = this.blurTargetA.texture;
    this.blurMaterial.uniforms.uDirection.value.set(0, 1.35 / h);
    this.blurPass.render(renderer, this.blurTargetB);

    this.blurMaterial.uniforms.tDiffuse.value = this.blurTargetB.texture;
    this.blurMaterial.uniforms.uDirection.value.set(2.5 / w, 0);
    this.blurPass.render(renderer, this.blurTargetA);

    this.blurMaterial.uniforms.tDiffuse.value = this.blurTargetA.texture;
    this.blurMaterial.uniforms.uDirection.value.set(0, 2.5 / h);
    this.blurPass.render(renderer, this.blurTargetB);

    this.finalMaterial.uniforms.tBloom.value = this.blurTargetB.texture;
    this.finalMaterial.uniforms.uTime.value = time;
    this.finalMaterial.uniforms.uNight.value = atmosphere.night;
    this.finalMaterial.uniforms.uWarmth.value = atmosphere.warmth;
    this.finalMaterial.uniforms.uExposure.value = atmosphere.exposure ?? 1.02;
    this.finalMaterial.uniforms.uFocus.value = atmosphere.focus ?? 0.515;
    this.finalPass.render(renderer, null);
    renderer.setRenderTarget(null);
  }

  dispose() {
    this.sceneTarget.dispose();
    this.brightTarget.dispose();
    this.blurTargetA.dispose();
    this.blurTargetB.dispose();
    this.brightMaterial.dispose();
    this.blurMaterial.dispose();
    this.finalMaterial.dispose();
    this.brightPass.dispose();
    this.blurPass.dispose();
    this.finalPass.dispose();
  }
}
