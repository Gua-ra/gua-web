precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_dark;
uniform float u_pulse;
uniform vec2 u_tilt;
uniform vec2 u_origin;
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float sq(float x){return x*x;}
vec3 dither(vec3 c){float n=hash12(gl_FragCoord.xy)+hash12(gl_FragCoord.yx+17.17)-1.0;return c+n*(1.5/255.0);}
vec2 sendAt(float asp){return (u_origin.x+u_origin.y>0.5)?u_origin/u_res.y:vec2(asp*0.83,0.113);}
float sendGlow(vec2 q,vec2 o,float asp){vec2 v=(q-o)/(0.45*asp);return u_pulse*exp(-3.0*dot(v,v));}
float ringR(float asp){return 0.02+0.75*asp*pow(max(1.0-u_pulse,0.0),0.6);}
float bubbleBand(float y){return smoothstep(0.03,0.12,y)*smoothstep(0.62,0.50,y);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1.0,0.0)),f.x),mix(hash12(i+vec2(0.0,1.0)),hash12(i+vec2(1.0,1.0)),f.x),f.y);}

float phs(vec2 p,float t){
  return p.x*30.0+p.y*9.0
    +3.2*sin(p.y*3.1+p.x*2.0+t)
    +1.6*sin(p.y*5.3-p.x*6.0-t*0.7+1.0)
    +0.8*sin(p.x*9.0+p.y*3.0+t*0.5);
}
void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time*0.09;
  vec2 o=sendAt(asp);
  vec2 p=q+u_tilt*0.015;
  vec2 dv=q-o;
  float d=length(dv);
  float crease=exp(-sq((d-ringR(asp))/0.05))*sqrt(u_pulse);
  p+=dv/(d+0.001)*0.045*crease;
  float ph=phs(p,t)+3.0*crease;
  float s2=sin(phs(p*0.35+vec2(3.1,1.7),t*0.8+2.0)*0.5);
  float body=0.5+0.5*cos(ph-0.9);
  body=mix(body,0.5+0.5*s2,0.30);
  float sheen=pow(max(cos(ph-0.5),0.0),10.0)*(0.55+0.45*s2);
  float mid=smoothstep(0.05,0.40,abs(q.y-0.5));
  float k=mix(0.75,1.0,mid);
  float sg=sendGlow(q,o,asp);
  sheen+=crease*0.35*(0.5+0.5*cos(ph));
  vec3 col;
  if(u_dark>0.5){
    vec3 lo=vec3(0.0235,0.1020,0.0941), md=vec3(0.0706,0.2510,0.2275), hi=vec3(0.1843,0.4784,0.4157);
    col=mix(lo,md,smoothstep(0.0,0.7,body));
    col=mix(col,hi,smoothstep(0.6,1.0,body)*k);
    col+=vec3(0.9137,0.8431,0.6824)*sheen*0.35*k;
    col+=vec3(0.1843,0.4784,0.4157)*0.35*sg;
  } else {
    vec3 lo=vec3(0.7882,0.8392,0.8000), md=vec3(0.9137,0.9412,0.9176), hi=vec3(1.0000,1.0000,1.0000);
    col=mix(lo,md,smoothstep(0.0,0.6,body));
    col=mix(col,hi,smoothstep(0.55,1.0,body));
    col=mix(md,col,k);
    col+=vec3(1.0)*sheen*0.18;
    col=mix(col,vec3(0.7490,0.8627,0.7961),clamp(sg*0.5,0.0,1.0));
  }
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}