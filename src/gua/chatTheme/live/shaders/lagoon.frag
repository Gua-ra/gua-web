/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

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

float caust(vec2 w,float t,float e){
  w+=0.40*vec2(sin(w.y*1.3+t),cos(w.x*1.2-t*0.8));
  w+=0.22*vec2(sin(w.y*2.6-t*1.1+1.0),cos(w.x*2.3+t*0.9+2.0));
  float a=1.0-abs(sin(w.x*1.6+w.y*0.5));
  float b=1.0-abs(sin(w.y*1.7-w.x*0.9+1.3));
  float c=1.0-abs(sin((w.x-w.y)*1.2+0.7+t*0.3));
  float m=a*b*c;
  return pow(a,e)+pow(b,e)+pow(c,e)+m*m*1.5;
}
void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time*0.32;
  vec2 o=sendAt(asp);
  vec2 dv=q-o;
  float d=length(dv);
  float rr=ringR(asp);
  float ring=exp(-sq((d-rr)/0.016))*sqrt(u_pulse);
  vec2 rip=dv/(d+0.001)*(0.012*ring+0.02*u_pulse*sin(d*40.0-u_time*7.0)*exp(-d*4.0));
  vec2 w=(q+rip+u_tilt*0.01)*7.0;
  float bb=bubbleBand(q.y);
  float e=mix(8.0,15.0,bb);
  float v=caust(w,t,e)*0.55+caust(w*0.6+vec2(4.0,2.0),t*0.7+3.0,e)*0.45;
  float sg=sendGlow(q,o,asp);
  vec3 col;
  if(u_dark>0.5){
    col=mix(vec3(0.0235,0.1255,0.1647),vec3(0.0392,0.1843,0.2275),0.5+0.5*sin(q.x*3.0+q.y*2.0+t*0.2));
    col=mix(col,vec3(0.0157,0.0941,0.1255),smoothstep(0.4,1.0,q.y));
    float k=1.0-0.4*bb;
    col+=vec3(0.2471,0.6627,0.7098)*v*0.16*k;
    col+=vec3(0.6588,0.9490,0.9255)*sq(v)*0.05*k;
    col+=vec3(0.4980,0.8784,0.9020)*(0.30*ring+0.16*sg);
  } else {
    col=mix(vec3(0.9490,0.9137,0.8392),vec3(0.9098,0.9608,0.9490),smoothstep(0.18,0.62,q.y));
    col=mix(col,vec3(0.8431,0.9333,0.9176),smoothstep(0.55,1.0,q.y)*0.55);
    float k=1.0-0.5*bb;
    col=mix(col,col*vec3(0.9059,0.9333,0.9020),(1.0-clamp(v,0.0,1.0))*0.35*k);
    col=mix(col,vec3(1.0),clamp(v*0.35*k,0.0,1.0));
    col=mix(col,vec3(0.6627,0.8627,0.8627),clamp(sg*0.55,0.0,1.0));
    col=mix(col,vec3(1.0000,1.0000,1.0000),clamp(ring*0.85,0.0,1.0));
    col=mix(col,vec3(0.5490,0.7961,0.8118),clamp(exp(-sq((d-ringR(asp)+0.02)/0.012))*sqrt(u_pulse)*0.35,0.0,1.0));
  }
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}