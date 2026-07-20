import { vertexShaderSource, fragmentShaderSource, slider_vertexShaderSource, slider_fragmentShaderSource } from './shaders.js';
import { compileShader, createProgram, createBufferInfo, createTexture } from './webgl-utils.js';
import { SceneNode } from './scene-graph.js';
import { Renderer } from './renderer.js';

export class App {
  constructor(canvasId) {
    // Setup canvas and WebGL context
    this.canvas = document.getElementById(canvasId);
    this.gl = this.canvas.getContext("webgl2");

    if (!this.gl) {
      document.body.innerHTML = "WebGL 2.0 not supported!";
      throw new Error("No WebGL 2");
    }

    // Set canvas size
    this.updateCanvasSize();
    window.addEventListener('resize', () => this.updateCanvasSize());

    this.startTime = performance.now();
    this.setupScene();
    this.loop = this.loop.bind(this);

    this.i = 0.0
  }
  createAlbumArt(name) {
     const gl = this.gl;

    const vertices = new Float32Array([
         -0.5, -0.5, 0.0, 0.0,
          0.5, -0.5, 1.0, 0.0,
         -0.5,  0.5, 0.0, 1.0,
         -0.5,  0.5, 0.0, 1.0,
          0.5, -0.5, 1.0, 0.0,
          0.5,  0.5, 1.0, 1.0,
       ]);

    const albumArt = new SceneNode(name);
    albumArt.is2D = true;
    const vertexShader = compileShader(gl,vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl,
      fragmentShaderSource,
      gl.FRAGMENT_SHADER,
    );

    albumArt.program = createProgram(gl, vertexShader, fragmentShader);
    albumArt.mesh = createBufferInfo(gl, vertices, [
        { name: 'aPos', program: albumArt.program, size: 2, stride: 16, offset: 0, components: 2 },
        { name: 'aTexCoord', program: albumArt.program, size: 2, stride: 16, offset: 8, components: 2 }
    ]);

    albumArt.texture = createTexture(gl, './default_cover.png');;
    albumArt.setPosition(0, 0, 0);
    albumArt.setPositionPixel(10, 0, 0,this.canvas);

    albumArt.setScalePixel(100.0, 100.0, 1.0,this.canvas);
    albumArt.setRotation(0.0, 0, 0.0);
    return albumArt
  }

  createSlider() {
    const gl = this.gl;


    const vertices = new Float32Array([
      -1, -1,   // bottom-left
       1, -1,   // bottom-right
      -1,  1,   // top-left
      -1,  1,   // top-left
       1, -1,   // bottom-right
       1,  1    // top-right
    ]);

    const slider = new SceneNode("slider");
    slider.isTransparent = true;
    const vertexShader = compileShader(gl,slider_vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl,slider_fragmentShaderSource,gl.FRAGMENT_SHADER);

    slider.program = createProgram(gl, vertexShader, fragmentShader);
    slider.mesh = createBufferInfo(gl, vertices, [
      { name: 'aPos', program: slider.program, size: 2, stride: 8, offset: 0, components: 2 }

    ]);
    slider.uniforms = [
      { name: 'uSeekProgress', program: slider.program, value: 0.0 }
    ]

    /*slider.setPosition(0, 0, 0);
   */
    return slider
  }
  setupScene() {
    const gl = this.gl;

    this.root = new SceneNode('Root');

    let albumArt = this.createAlbumArt("AlbumArt");
    let albumArt2 = this.createAlbumArt("AlbumArt2");

    this.slider = this.createSlider();

    this.root.addChild(albumArt);
    this.root.addChild(this.slider);

    //this.root.addChild(albumArt2)
    this.refAlbum2 = albumArt2;
    this.refAlbum = albumArt;




    this.renderer = new Renderer(gl);

  }

  loop() {
    if (this.refAlbum) {
      //this.refAlbum2.setRotation(0, 0, this.i);
      //this.refAlbum2.setPosition(Math.sin(this.i) * 0.5, Math.cos(this.i) * 0.5, 0);
      //this.refAlbum.setRotation(0, 0, -this.i);
      //this.refAlbum2.setScale(0.5, 0.5, 1.0)
      let albumScalePixel = this.refAlbum.getScalePixel(this.canvas)
      console.log(albumScalePixel);
      this.refAlbum.setPositionPixel(this.canvas.width * 0.05 + albumScalePixel[0] / 2, 100, 0, this.canvas);
      this.refAlbum.setScalePixel(albumScalePixel[0], albumScalePixel[1], 1.0,this.canvas);

    }

    if (this.slider) {
      this.i += 0.01;

      // just a test to see if the seekbar changes
      this.slider.uniforms[0].value = (Math.sin(this.i )+ 1.0)/2;
    }
    this.renderer.setIResolution([ this.canvas.width, this.canvas.height])
    this.renderer.setAspectRatio(this.aspectRatio);

    this.renderer.renderScene(this.root);
    requestAnimationFrame(this.loop);
  }
  start() {
    this.loop();
  }

  updateCanvasSize() {
    const gl = this.gl;
    const container = this.canvas.parentElement || document.body;

    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;
    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.aspectRatio = this.canvas.width / this.canvas.height;

  }


}
