export function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

export function createBufferInfo(gl, vertices, attributes) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  for (const attr of attributes) {
    const location = gl.getAttribLocation(attr.program, attr.name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(
      location,
      attr.size,
      gl.FLOAT,
      false,
      attr.stride,
      attr.offset
    );
  }

  gl.bindVertexArray(null);
  const totalComponents = attributes.reduce((sum, attr) => sum + attr.components, 0);
  const vertexCount = vertices.length / totalComponents;
  return { vao, vertexCount };
}
// createTexture loads image asynchronously
export function createTexture(gl, url, fallbackColor = [0, 0, 0, 0]) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Fallback texture (magenta) - should work immediately
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array(fallbackColor));

  // Image loads later - might not be ready for first frame
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  image.addEventListener('load', function() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
  });

  return texture;
}
