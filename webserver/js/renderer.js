import { SceneNode } from './scene-graph.js';
export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.program = null; // erhmm TODO, should there be a default program...?
    this.uniforms = {};
    this.nodesToDraw = [];
    this.projectionMatrix = glMatrix.mat4.create();
    this.aspectRatio = 1.0;
    this.iResolution = [1, 1]; // Initialize with default values
    this.viewMatrix = glMatrix.mat4.create();
    glMatrix.mat4.translate( this.viewMatrix,  this.viewMatrix, [0,0,-3]);

  }

  setProgram(program, uniforms) {
    this.program = program;
    this.uniforms = uniforms;
  }
  renderScene(rootNode) {
    const gl = this.gl;

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    //gl.useProgram(this.program);

    glMatrix.mat4.perspective(
        this.projectionMatrix,
         Math.PI / 4 ,  // e.g., Math.PI / 4 for 45 degrees
        this.aspectRatio,           // width / height
        0.1,                  // near clipping plane, e.g., 0.1
        100                    // far clipping plane, e.g., 100
    );
    console.log(  this.projectionMatrix,);


    rootNode.traverse((node) => {
      if (node.visible && node.mesh) {
        if(node.isTransparent){
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);


          this.drawNode(node);


          gl.disable(gl.BLEND);
        }
        else {
          this.drawNode(node);
        }
      }
    });

  }

  // TODO each node has their program, eventually
  drawNode(node) {

    const gl = this.gl;
    gl.useProgram(node.program)

    const worldMatrix = node.getWorldMatrix();

    const mvpMatrix = glMatrix.mat4.create();

    glMatrix.mat4.multiply(mvpMatrix, this.projectionMatrix, this.viewMatrix);
    glMatrix.mat4.multiply(mvpMatrix, mvpMatrix, worldMatrix);

    for (const [name, value] of Object.entries(this.uniforms)) {
      const location = gl.getUniformLocation(node.program, name);
      if (!location) continue;

      if (typeof value === 'function') {
        const result = value(node);
        if (Array.isArray(result) && result.length === 16) {
          gl.uniformMatrix4fv(location, false, result);
        } else if (typeof result === 'number') {
          gl.uniform1f(location, result);
        } else if (Array.isArray(result)) {
          gl.uniform1fv(location, result);
        }
      } else if (typeof value === 'number') {
        gl.uniform1f(location, value);
      } else if (Array.isArray(value)) {
        if (value.length === 16) {
          gl.uniformMatrix4fv(location, false, value);
        } else {
          gl.uniform1fv(location, value);
        }
      }
    }

    const transformLocation = gl.getUniformLocation(node.program, "uMVP");
    if (transformLocation !== null && transformLocation !== -1) {

        gl.uniformMatrix4fv(transformLocation, false, mvpMatrix);
      }

    const iResolutionLocation = gl.getUniformLocation(node.program, "iResolution");
    if (iResolutionLocation !== null && iResolutionLocation !== -1 && this.iResolution) {
        gl.uniform2f(iResolutionLocation, this.iResolution[0], this.iResolution[1]);
    }

      /*const modelLocation = gl.getUniformLocation(this.program, "uModelMatrix");
      if (modelLocation !== null && modelLocation !== -1) {
        gl.uniformMatrix4fv(modelLocation, false, worldMatrix);
        }*/

    const vao = node.mesh.vao;
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, node.mesh.vertexCount);
    gl.bindVertexArray(null);
  }


  setAspectRatio(aspectRatio) {
    this.aspectRatio = aspectRatio;
  }
  setIResolution(resolution) {
      this.iResolution = resolution;
  }


}
