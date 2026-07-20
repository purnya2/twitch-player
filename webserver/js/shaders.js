export const vertexShaderSource = `#version 300 es
  in vec2 aPos;
  in vec2 aTexCoord;
  uniform float uRotation;
  uniform mat4 uMVP;
  out vec2 vTexCoord;

  void main() {
    gl_Position = uMVP * vec4(aPos, 0.0, 1.0);
    vTexCoord = vec2(aTexCoord.x,-aTexCoord.y);
  }
`;

export const fragmentShaderSource = `#version 300 es
  precision highp float;
  in vec2 vTexCoord;
  out vec4 fragColor;
  uniform sampler2D u_texture;

  void main() {
    fragColor = texture(u_texture, vTexCoord);
  }
`;
export const slider_vertexShaderSource = `#version 300 es
  in vec2 aPos;
  out vec2 uv;


  void main() {
    gl_Position =  vec4(aPos, 0.0, 1.0);
    uv = aPos;
  }
`;

export const slider_fragmentShaderSource = `#version 300 es
  precision highp float;
  out vec4 fragColor;
  in vec2 uv;
  uniform vec2 iResolution;

  float threshold = 5.0;
  float sdfCircle(vec2 p, float r){
    return length(p) -r;
  }

  float sdBox( vec2 p, in vec2 b )
  {
      vec2 d = abs(p)-b;
      return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
  }

  void main() {
    vec2 pixelCoord = (uv * 0.5 + 0.5) * iResolution;
    vec2 position = pixelCoord / iResolution.y;

    float dist = sdBox(position - vec2(iResolution.x / iResolution.y * 0.5, 0.1), vec2(iResolution.x / iResolution.y * 0.4, 0.01));
    // draw slider bar
    if (dist <0.0){
      fragColor = vec4(-uv.x, uv.y, 0.0, 1.0);
    } else{
      fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }

    float ball = sdfCircle(position-vec2(0.0,-0.9), 0.02);
    if (ball <0.0){
      fragColor = vec4(1.0, uv.y, 0.0, 1.0);
    } else{
    }

  }
`;
