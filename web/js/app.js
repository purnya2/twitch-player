import { vertexShaderSource, fragmentShaderSource, slider_vertexShaderSource, slider_fragmentShaderSource } from './shaders.js';
import { compileShader, createProgram, createBufferInfo, createTexture } from './webgl-utils.js';
import { SceneNode } from './scene-graph.js';
import { Renderer } from './renderer.js';

export class App {
  constructor(canvasId) {
    // Setup canvas and WebGL context
    this.canvas = document.getElementById(canvasId);
    this.gl = this.canvas.getContext("webgl2");
    this.textcanvas = document.getElementById("text");
    this.ctx = this.textcanvas.getContext("2d");

    // Set canvas size
    this.updateCanvasSize();
    window.addEventListener('resize', () => this.updateCanvasSize());

    this.startTime = performance.now();
    this.setupScene();
    this.loop = this.loop.bind(this);
    this.seekbarPos = 0.0;

    this.offsetTextScroll = 0.0

    this.i = 0.0 //todo do i need u?
    this.setupSSE();

    this.track_data = null;
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
  setupSSE() {
    const eventSource = new EventSource('/sse');
    eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Update seekbar position
            if (data.time_elapsed_millis !== undefined) {
              //console.log(data)
              this.track_data = {
                  ...this.track_data,
                  time_elapsed_millis: data.time_elapsed_millis
              };
              this.seekbarPos = data.time_elapsed_millis/ data.track_length_millis;
            }

            // Update track info if needed
            if (data.track_name) {
              //console.log('SSE data:', data);
              this.track_data = {
                  ...this.track_data,
                  ...data
              };

            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        };
    eventSource.onerror = (error) => {
        console.error('SSE error:', error);
    };
    this.eventSource = eventSource;
  }
  loop() {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    let td = this.track_data;
    if (this.refAlbum) {
      //this.refAlbum2.setRotation(0, 0, this.i);
      //this.refAlbum2.setPosition(Math.sin(this.i) * 0.5, Math.cos(this.i) * 0.5, 0);
      //this.refAlbum.setRotation(0, 0, -this.i);
      //this.refAlbum2.setScale(0.5, 0.5, 1.0)
      let albumScalePixel = this.refAlbum.getScalePixel(this.canvas)
      this.refAlbum.setPositionPixel(this.canvas.width * 0.05 + albumScalePixel[0] / 2, 100, 0, this.canvas);
      this.refAlbum.setScalePixel(100 ,100, 1.0,this.canvas);



      if (td) {
        if (!this.refAlbum.coverArtUrl || this.refAlbum.coverArtUrl != td.cover_art_url) {
          this.refAlbum.coverArtUrl = td.cover_art_url;
          let oldTexture = this.refAlbum.texture;
          this.refAlbum.texture = createTexture(this.gl, td.cover_art_url)
          if(oldTexture){
            this.gl.deleteTexture(oldTexture);
          }
        }


        // WHAT THE FUCK AM I DOINGGGG
        // TRACK TITLE
        this.ctx.font = "48px '0xProto Nerd Font', serif";
        this.ctx.lineWidth = 5;
        this.ctx.strokeStyle = "#000000";
        this.ctx.fillStyle = "#FFFFFF";
        if (td.track_name.length > 13) {
          this.offsetTextScroll -= 1.0;
          const textWidth = this.ctx.measureText(td.track_name+" ").width;

          if (this.offsetTextScroll <= -textWidth ) {
            this.offsetTextScroll = 0;
          }

          this.ctx.strokeText(td.track_name + " " + td.track_name, this.canvas.width * 0.05 + albumScalePixel[0]+10+this.offsetTextScroll, this.ctx.canvas.height - 100);
          this.ctx.fillText(td.track_name + " " + td.track_name, this.canvas.width * 0.05 + albumScalePixel[0]+10+this.offsetTextScroll, this.ctx.canvas.height - 100);
          this.ctx.save();
          var gradient = this.ctx.createLinearGradient(this.canvas.width * 0.05 + albumScalePixel[0], 0, this.canvas.width,0 );
          gradient.addColorStop(0, "rgba(255, 255, 255, 1.0)");
          gradient.addColorStop(0.01, "rgba(255, 255, 255, 0.0)");
          gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.0)");
          gradient.addColorStop(0.5, "rgba(255, 255, 255, 1.0)");

          gradient.addColorStop(1, "rgba(255, 255, 255, 1.0)");
          this.ctx.globalCompositeOperation = "destination-out";
          this.ctx.fillStyle = gradient;
          this.ctx.fillRect(0, 0, this.canvas.width,this.ctx.canvas.height );
          this.ctx.restore();

        } else {
          this.ctx.strokeText(td.track_name, this.canvas.width * 0.05 + albumScalePixel[0]+10+this.offsetTextScroll, this.ctx.canvas.height - 100);
          this.ctx.fillText(td.track_name, this.canvas.width * 0.05 + albumScalePixel[0]+10+this.offsetTextScroll, this.ctx.canvas.height - 100);
          this.offsetTextScroll = 0.0;
        }




        //TODO the font should be modular for the day i wanna push this on github i think idk
        // artist TITLE
        this.ctx.font = "25px '0xProto Nerd Font', serif";
        this.ctx.lineWidth = 3;

        this.ctx.strokeText(td.artist_name, this.canvas.width * 0.05 + albumScalePixel[0] +10, this.ctx.canvas.height-60);

        this.ctx.fillText(td.artist_name, this.canvas.width * 0.05 + albumScalePixel[0] +10, this.ctx.canvas.height-60);

        // time
        // everything here is written like shite!
        let time_pos_x = this.canvas.width * 0.95
        const totalSecondsElapsed = Math.floor(td.time_elapsed_millis  / 1000);
        const minutesElapsed = Math.floor(totalSecondsElapsed / 60);
        const secondsElapsed = totalSecondsElapsed % 60;
        const totalSeconds = Math.floor(td.track_length_millis / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        const timeElapsed = `${String(minutesElapsed).padStart(2, '0')}:${String(secondsElapsed).padStart(2, '0')}`;
        const time = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        const timeText = timeElapsed + "/" + time
        this.ctx.font = "15px '0xProto Nerd Font', serif";

        this.ctx.textAlign = "right";
        this.ctx.strokeText(timeText,time_pos_x, this.ctx.canvas.height-60);

        this.ctx.fillText(timeText, time_pos_x, this.ctx.canvas.height-60);
        this.ctx.textAlign = "left";


        // likes
        this.ctx.textAlign = "center";
        this.ctx.font = "20px '0xProto Nerd Font', serif";
        this.ctx.lineWidth = 3;
        this.ctx.fillStyle = "#000000";
        let aspect =  this.canvas.height/ this.canvas.width;
        console.log(aspect)
        this.ctx.fillText("0", this.canvas.width * 0.925 , this.canvas.height-105.0);
        this.ctx.textAlign = "left";

      }
    }

    if (this.slider) {
      const smoothingFactor = 0.10;
      this.smoothSeekbarPos = this.smoothSeekbarPos || this.seekbarPos;
      this.smoothSeekbarPos += (this.seekbarPos - this.smoothSeekbarPos) * smoothingFactor;
      this.slider.uniforms[0].value = this.smoothSeekbarPos;
      this.prevSeekbarPos = this.seekbarPos;
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
