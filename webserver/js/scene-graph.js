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
  }

  getWorldMatrix() {
    if (this.dirty ) {
      console.log(`🔄 Recalculating ${this.name}`);
      console.log('  Position:', this.position);
      console.log('  Rotation:', this.rotation);
      console.log('  Scale:', this.scale);

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

      console.log('  Result:', Array.from(this.worldMatrix));
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
  setRotation(x, y = 0, z ) {
      this.rotation = [x, y, z];
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

  setScale(x, y,z) {
    this.scale = [x, y,z];
    this.setDirty();
  }
  setDirty() {
      this.dirty = true;
      // Propagate to all children
      for (const child of this.children) {
          child.setDirty();
      }
  }


}
