export const vertexShaderSource = `#version 300 es
  in vec2 aPos;
  in vec2 aTexCoord;
  uniform float uTime;
  uniform float turbolence_influence;
  uniform mat4 uMVP;
  out vec2 vTexCoord;

  void main() {
    float id = float(gl_VertexID+1);
    float turbx = (sin(id*uTime)/100.0)*turbolence_influence;
    float turby = (cos(id*uTime)/100.0)*turbolence_influence;
    float floatingy = 0.0*(sin(uTime/4.0)/100.0);

    gl_Position = uMVP * vec4(aPos, 0.0, 1.0)+vec4(turbx,turby+floatingy,0.0,0.0);
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
  uniform float uSeekProgress;
  uniform float uHeartAnim;
  uniform float uTime;


  float threshold = 5.0;
  float dot2(vec2 v) {
      return dot(v, v);
  }
  float sdHeart(vec2 p )
  {
      p.x = abs(p.x);

      if( p.y+p.x>1.0 )
          return sqrt(dot2(p-vec2(0.25,0.75))) - sqrt(2.0)/4.0;
      return sqrt(min(dot2(p-vec2(0.00,1.00)),
                      dot2(p-0.5*max(p.x+p.y,0.0)))) * sign(p.x-p.y);
  }

  float sdfCircle(vec2 p, float r){
    return length(p) -r;
  }

  float sdBox( vec2 p, in vec2 b )
  {
      vec2 d = abs(p)-b;
      return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
  }

  vec2 seekCirclePosition(vec2 leftMargin,vec2 rightMargin, float t){


    return leftMargin + t*(rightMargin-leftMargin);

  }

  void main() {



    vec2 pixelCoord = (uv * 0.5 + 0.5) * iResolution;
    vec2 position = pixelCoord / iResolution.y;
    float aspect = iResolution.x / iResolution.y;


    vec2 leftMargin = vec2(0.05*iResolution.x/iResolution.y,0.05);
    vec2 rightMargin = vec2(iResolution.x / iResolution.y - 0.05*iResolution.x/iResolution.y,0.05);

    vec2 circle_position = seekCirclePosition(leftMargin,rightMargin,uSeekProgress);
    float y_offset = 0.0;

    // the sinewave before the circle
    if(position.x < circle_position.x){
      y_offset = sin(pixelCoord.x/7.0 - uTime/1.0)/250.0;

    }

    vec2 box_pos = position - vec2(iResolution.x / iResolution.y * 0.5, 0.05) + vec2(0.0,y_offset);

    float dist = sdBox(box_pos, vec2(iResolution.x / iResolution.y * 0.45, 0.005));

    // draw slider bar
    if (dist < -0.003){
      fragColor = vec4(1.0, 1.0, 1.0, 1.0);
    } else if(dist < 0.000) {
      fragColor = vec4(0.0, 0.0, 0.0, 0.9);
    }
    else{
      fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }




    // im a genius
    float ball = sdfCircle(position-circle_position, 0.015);

    if (ball <0.0){
      fragColor = vec4(1.0, 1.0, 1.0, 1.0);
    } else if (ball < 0.004){
      fragColor = vec4(0.0, 0.0, 0.0, 0.7);

    }


    float heartSizePx = 50.0;
    vec2 heartCenterPx = vec2(iResolution.x*0.925, 80 ); // anchor near bottom-right, in pixels

    vec2 heartPos = (pixelCoord - heartCenterPx) / heartSizePx;
    float heart = sdHeart(heartPos);
    if (heart < 0.0 + uHeartAnim/2.0) {
      fragColor = vec4(1.0, 1.0-uHeartAnim, 1.0-uHeartAnim, 1.0);
    } else if(heart < 0.05){
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }

  }
`;
// left margin =
// f(t) = leftMargin + t(offset) dove leftmargin+offset = rightmargin
// f(0) = leftMargin
// f(1) = rightMargin
//
