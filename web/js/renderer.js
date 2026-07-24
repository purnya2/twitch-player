import { SceneNode } from './scene-graph.js';
export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.program = null; // erhmm TODO, should there be a default program...?
    this.uniforms = {};
    this.nodesToDraw = [];
    this.projectionMatrix = glMatrix.mat4.create();
    this.aspectRatio = 1.0;
    this.iResolution = [1, 1];
    this.viewMatrix = glMatrix.mat4.create();
    glMatrix.mat4.translate( this.viewMatrix,  this.viewMatrix, [0,0,-3]);
    this.orthoProjectionMatrix = glMatrix.mat4.create();
    this.identityViewMatrix = glMatrix.mat4.create(); // identity
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

  drawNode(node) {

    const gl = this.gl;
    gl.useProgram(node.program)

    const worldMatrix = node.getWorldMatrix();
    const mvpMatrix = glMatrix.mat4.create();

    const is2D = node.is2D || false;
    const projMatrix = is2D ? this.orthoProjectionMatrix : this.projectionMatrix;
    const viewMatrix = is2D ? this.identityViewMatrix : this.viewMatrix;
    glMatrix.mat4.multiply(mvpMatrix, projMatrix, viewMatrix);
    glMatrix.mat4.multiply(mvpMatrix, mvpMatrix, worldMatrix);

    for (const uniform of node.uniforms) {
      const location = gl.getUniformLocation(node.program, uniform.name);

      if (!location) continue;

      const value = uniform.value;

      if (typeof value === 'function') {

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

    if (node.texture) {
      if (!node.textureUniformLocation) {
        node.textureUniformLocation =  gl.getUniformLocation(node.program, 'uTexture');
      }

      gl.activeTexture(gl.TEXTURE0);

      gl.bindTexture(gl.TEXTURE2D, node.texture);

      gl.uniform1i(node.textureUniformLocation, 0);
    }



      /*const modelLocation = gl.getUniformLocation(this.program, "uModelMatrix");
      if (modelLocation !== null && modelLocation !== -1) {
        gl.uniformMatrix4fv(modelLocation, false, worldMatrix);
        }*/

    const vao = node.mesh.vao;
    gl.bindVertexArray(vao);

    if (node.mesh.hasIndices) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, node.mesh.indexBuffer);
        gl.drawElements(gl.TRIANGLES, node.mesh.indexCount, gl.UNSIGNED_SHORT, 0);
    } else {
        gl.drawArrays(gl.TRIANGLES, 0, node.mesh.vertexCount);
    }

    gl.bindVertexArray(null);
  }


  setAspectRatio(aspectRatio) {
    this.aspectRatio = aspectRatio;
    const left = -aspectRatio;
    const right = aspectRatio;
    const bottom = -1;
    const top = 1;
    glMatrix.mat4.ortho(this.orthoProjectionMatrix, left, right, bottom, top, -1, 1);

  }
  setIResolution(resolution) {
      this.iResolution = resolution;
  }


}
