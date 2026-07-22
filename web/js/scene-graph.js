export class SceneNode {
  constructor(name = '') {
    this.name = name;
    this.parent = null;
    this.children = [];

    this.position = [0, 0, 0];
    this.rotation = [0, 0, 0];  // ← ADD THIS
    this.quaternion = glMatrix.quat.create();
    this.scale = [1, 1,1];
    this.localMatrix = glMatrix.mat4.create();
    this.transformMatrix = glMatrix.mat4.create();
    this.worldMatrix = glMatrix.mat4.create();
    this.dirty = true;

    this.mesh = null;
    this.texture = null;
    this.visible = true;
    this.program = null
    this.isTransparent = false;
    this.uniforms = [];
  }

  getWorldMatrix() {
    if (this.dirty ) {


      // Start with identity
      glMatrix.mat4.identity(this.localMatrix);

      // ✅ USE this.position, this.rotation, this.scale
      glMatrix.mat4.translate(this.localMatrix, this.localMatrix, this.position);
      glMatrix.mat4.rotateX(this.localMatrix, this.localMatrix, this.rotation[0] || 0);
      glMatrix.mat4.rotateY(this.localMatrix, this.localMatrix, this.rotation[1] || 0);
      glMatrix.mat4.rotateZ(this.localMatrix, this.localMatrix, this.rotation[2] || 0);
      glMatrix.mat4.scale(this.localMatrix, this.localMatrix, this.scale);

      if (this.parent) {

        const parentMatrix = this.parent.getWorldMatrix();
        glMatrix.mat4.multiply(this.worldMatrix, parentMatrix, this.localMatrix);
      } else {
        glMatrix.mat4.copy(this.worldMatrix, this.localMatrix);
      }

      this.dirty = false;
    }
    return this.worldMatrix;
  }

  addChild(child) {
    this.children.push(child);
    child.parent = this;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index != -1) {
      this.children.splice(index, 1);
      child.parent = null;

    }
  }
  traverse(callback) {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }

  setPosition(x, y,z) {
    this.position = [x, y,z];
    this.setDirty();
  }

  setPositionPixel(x, y, z, canvas) {
    let aspectRatio = canvas.width / canvas.height;
    const ndcX = (x / canvas.width) * 2 - 1;
    const ndcY = (y / canvas.height) * 2 - 1;

    const worldX = ndcX * aspectRatio;
    const worldY = ndcY;

    this.position = [worldX, worldY, z || 0];
    this.setDirty();
  }

  setRotation(x, y = 0, z ) {
      this.rotation = [x, y, z];
      this.setDirty();
  }

  setScale(x, y,z) {
    this.scale = [x, y,z];
    this.setDirty();
  }
  setScalePixel(x, y, z, canvas) {
    // Convert pixel size to world units
    // 1 world unit = canvas.height/2 pixels (since NDC goes from -1 to 1)
    const pixelsPerWorldUnit = canvas.height / 2;

    const scaleX = x / pixelsPerWorldUnit;
    const scaleY = y / pixelsPerWorldUnit;
    const scaleZ = z || 1;

    this.scale = [scaleX, scaleY, scaleZ];
    this.setDirty();
  }
  // Set rotation from Euler angles
    setRotationEuler(x, y, z) {
      glMatrix.quat.fromEuler(this.quaternion, x, y, z);
      this.setDirty();
    }

    // Rotate around local axes
    rotateX(angle) {
      const q = glMatrix.quat.create();
      glMatrix.quat.setAxisAngle(q, [1, 0, 0], angle);
      glMatrix.quat.multiply(this.quaternion, this.quaternion, q);
      this.setDirty();
    }

    rotateY(angle) {
      const q = glMatrix.quat.create();
      glMatrix.quat.setAxisAngle(q, [0, 1, 0], angle);
      glMatrix.quat.multiply(this.quaternion, this.quaternion, q);
      this.setDirty();
    }

    rotateZ(angle) {
      const q = glMatrix.quat.create();
      glMatrix.quat.setAxisAngle(q, [0, 0, 1], angle);
      glMatrix.quat.multiply(this.quaternion, this.quaternion, q);
      this.setDirty();
    }


  setDirty() {
      this.dirty = true;
      // Propagate to all children
      for (const child of this.children) {
          child.setDirty();
      }
  }

  getScalePixel(canvas) {
    const pixelsPerWorldUnit = canvas.height / 2;
    return [
      this.scale[0] * pixelsPerWorldUnit,
      this.scale[1] * pixelsPerWorldUnit,
      this.scale[2]
    ];
  }


}
