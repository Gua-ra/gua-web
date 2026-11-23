/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.

hash12 and hash22 are "Hash without Sine" by David Hoskins, used under the MIT licence; see THIRD_PARTY_NOTICES.md.
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

float phs(vec2 p,float t){
  vec2 w=p+0.09*vec2(sin(p.y*2.9+t*0.9),sin(p.x*2.5-t*0.7+1.3))
          +0.035*vec2(sin(p.y*6.1-t*0.6+2.0),sin(p.x*5.7+t*0.5));
  return length(w-vec2(-0.30,1.30))*24.0+2.4*sin(w.x*2.1-w.y*1.6+t*0.8)+1.2*sin(w.x*4.3+w.y*3.1-t*0.6)-t*1.2;
}
void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time*0.10;
  vec2 o=sendAt(asp);
  vec2 p=q+u_tilt*0.012;
  float od=length(q-o);
  float wave=exp(-sq((od-ringR(asp))/0.06))*sqrt(u_pulse);
  float e=1.5/u_res.y;
  float ph=phs(p,t)+2.2*wave;
  float phx=phs(p+vec2(e,0.0),t);
  float phy=phs(p+vec2(0.0,e),t);
  float gm=max(length(vec2(phx-ph+2.2*wave,phy-ph+2.2*wave))/e,1.0);
  float x=fract(ph/6.2832);
  float dc=min(x,1.0-x)*6.2832/gm*u_res.y;
  float ridge=exp(-sq(dc/1.3));
  float lit=pow(smoothstep(0.30,1.0,x),1.6);
  float shade=smoothstep(0.0,0.03,x)*(1.0-smoothstep(0.03,0.42,x));
  float k=1.0-0.4*bubbleBand(q.y);
  float hc=fract(ph*0.035+q.x*0.35+q.y*0.25+t*0.25)*3.0;
  vec3 col;
  if(u_dark>0.5){
    vec3 s0=vec3(0.2275,0.2000,0.3294),s1=vec3(0.1176,0.2275,0.2667),s2=vec3(0.2745,0.1882,0.2784);
    vec3 sh=hc<1.0?mix(s0,s1,smoothstep(0.0,1.0,hc)):(hc<2.0?mix(s1,s2,smoothstep(1.0,2.0,hc)):mix(s2,s0,smoothstep(2.0,3.0,hc)));
    col=mix(vec3(0.0471,0.0549,0.0824),vec3(0.1216,0.1373,0.2039),lit);
    col=mix(col,sh,sq(lit)*0.85*k);
    col=mix(col,vec3(0.0275,0.0314,0.0471),shade*0.75);
    col=mix(col,vec3(0.6039,0.6510,0.8118),ridge*0.30*mix(0.75,1.0,k));
    col+=vec3(0.3765,0.4392,0.6588)*0.30*sendGlow(q,o,asp);
    col=mix(col,vec3(0.6039,0.6510,0.8118),wave*0.18);
  } else {
    vec3 s0=vec3(0.9529,0.8392,0.9098),s1=vec3(0.8353,0.9020,0.9686),s2=vec3(0.8667,0.9529,0.9020);
    vec3 sh=hc<1.0?mix(s0,s1,smoothstep(0.0,1.0,hc)):(hc<2.0?mix(s1,s2,smoothstep(1.0,2.0,hc)):mix(s2,s0,smoothstep(2.0,3.0,hc)));
    col=vec3(0.9569,0.9451,0.9647);
    col=mix(col,sh,(0.25+0.75*lit)*0.9*k);
    col=mix(col,vec3(0.8627,0.8392,0.8941),shade*0.70*k);
    col=mix(col,vec3(1.0),ridge*0.70);
    col=mix(col,vec3(0.8627,0.7843,0.9412),clamp(sendGlow(q,o,asp)*0.7,0.0,1.0));
  }
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}