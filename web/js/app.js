import { vertexShaderSource, fragmentShaderSource, slider_vertexShaderSource, slider_fragmentShaderSource } from './shaders.js';
import { compileShader, createProgram, createBufferInfo, createTexture } from './webgl-utils.js';
import { SceneNode } from './scene-graph.js';
import { Renderer } from './renderer.js';
import { TrackDisplay } from './TrackDisplay.js';
import { SSEHandler } from './SSEHandler.js';

export class App {
  constructor(canvasId) {
    // Setup canvas and WebGL context
    this.canvas = document.getElementById(canvasId);
    this.gl = this.canvas.getContext("webgl2");
    this.textcanvas = document.getElementById("text");
    this.ctx = this.textcanvas.getContext("2d");

    this.trackDisplay = new TrackDisplay(this.ctx, this.canvas);

    // Set canvas size
    this.updateCanvasSize();
    window.addEventListener('resize', () => this.updateCanvasSize());

    this.startTime = performance.now();
    this.setupScene();
    this.loop = this.loop.bind(this);
    this.seekbarPos = 0.0;

    this.offsetTextScroll = 0.0

    this.i = 0.0 //todo do i need u?
    this.sseHandler = new SSEHandler('/sse', this.OnMessage)
    this.track_data = null;
    this.likes = 0;
  }
  createAlbumArt(name) {
     const gl = this.gl;

    const vertices = new Float32Array([
        -0.5, -0.5, 0.0, 0.0,
        0.5, -0.5, 1.0, 0.0,
        -0.5,  0.5, 0.0, 1.0,
        0.5,  0.5, 1.0, 1.0
    ]);

    const indices = new Uint16Array([
        0, 1, 2,
        2, 1, 3
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
    ],indices);
    albumArt.uniforms = [
      { name: 'uTime', program: albumArt.program, value: 0.0 },
      { name: 'turbolence_influence', program: albumArt.program, value: 0.0 }

    ]
    albumArt.texture = createTexture(gl, './default_cover.png');
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
      { name: 'uSeekProgress', program: slider.program, value: 0.0 },
      { name: 'uHeartAnim', program: slider.program, value: 0.0 }
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

  OnMessage = (data) => {
    // Update seekbar position
    if (data.time_elapsed_millis !== undefined) {
      this.track_data = {
        ...this.track_data,
        time_elapsed_millis: data.time_elapsed_millis
      };
      this.seekbarPos = data.time_elapsed_millis / data.track_length_millis;
    }

    // Update track info if needed
    if (data.hasOwnProperty("track_name")) {
      this.track_data = {
        ...this.track_data,
        ...data
      };

    }

    // Update the likes
    if (data.hasOwnProperty('likesAmount')) {
      this.likes = data.likesAmount;
      if (data.isNewLike) {
        this.heartAnim = 1.0;
      }
      console.log(data);

    }

  }

  loop() {
    this.time = this.time || 0.0;
    this.time += 0.1;
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    let albumScalePixel = this.refAlbum.getScalePixel(this.canvas)
    this.updateAlbumPositionAndScale(albumScalePixel);
    this.refAlbum.uniforms[0].value = this.time;

    this.updateAlbumArt();
    this.trackDisplay.render(this.track_data, albumScalePixel,this.likes);

    this.updateSlider();

    this.renderer.setIResolution([ this.canvas.width, this.canvas.height])
    this.renderer.setAspectRatio(this.aspectRatio);

    this.renderer.renderScene(this.root);
    requestAnimationFrame(this.loop);
  }

  updateSlider() {
    const smoothingFactor = 0.10;
    this.smoothSeekbarPos = this.smoothSeekbarPos || this.seekbarPos;
    this.smoothSeekbarPos += (this.seekbarPos - this.smoothSeekbarPos) * smoothingFactor;
    this.slider.uniforms[0].value = this.smoothSeekbarPos;
    this.prevSeekbarPos = this.seekbarPos;

    this.heartAnim = this.heartAnim || 0.0;
    this.heartAnim = lerp(this.heartAnim, 0.0, 0.1);
    this.slider.uniforms[1].value = this.heartAnim;
    if (this.heartAnim <= 0.01){
      //console.log("pump");
      //this.heartAnim = 0.1;
    }

  }

  updateAlbumArt() {
    this.turbolence = this.turbolence || 0.0;
    this.turbolence = lerp(this.turbolence, 0.0, 0.1);
    this.refAlbum.uniforms[1].value = this.turbolence
    if (this.track_data &&(!this.refAlbum.coverArtUrl || this.refAlbum.coverArtUrl != this.track_data.cover_art_url )) {
      this.refAlbum.coverArtUrl = this.track_data.cover_art_url;
      let oldTexture = this.refAlbum.texture;
      this.refAlbum.texture = createTexture(this.gl, this.track_data.cover_art_url)


      if (oldTexture) {
        this.gl.deleteTexture(oldTexture);
      }

      this.turbolence = 10.0;
    }
  }
  updateAlbumPositionAndScale(albumScalePixel) {
    this.refAlbum.setPositionPixel(this.canvas.width * 0.05 + albumScalePixel[0] / 2, 100, 0, this.canvas);
    this.refAlbum.setScalePixel(100 ,100, 1.0,this.canvas);
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

    if (this.textcanvas) {
      this.textcanvas.width = displayWidth;
      this.textcanvas.height = displayHeight;
    }

    this.aspectRatio = this.canvas.width / this.canvas.height;



  }


}
function lerp(start, end, t) {
    // t should be between 0 and 1
    return start + (end - start) * t;
}
