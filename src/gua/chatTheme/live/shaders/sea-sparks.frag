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

// Exact cell hash: every value is a whole number below 2^20, which fp32 holds exactly, so a fused
// multiply-add cannot change it and a spark lit in the baked still is lit on every GPU.
// (x+0.5)/1019 is at least 1/2038 from a whole number and the product below is within 1e-4 of it,
// so floor() is exact.
float ihm(float x){return x-1019.0*floor((x+0.5)*(1.0/1019.0));}
float icube(float n){return ihm(ihm(n*n)*n);}
// c: whole-number cell within +-4096, s: whole-number salt; returns a whole number in 0..1018.
float ih(vec2 c,float s){return icube(ihm(icube(ihm(c.x*19.0+c.y*56.0+s*211.0+101.0))+c.x*233.0+s*331.0+13.0));}
// For whole n in 1..1018, n*K stays at least 9e-4 from a whole number (n = 0 gives exactly 0), so fract() cannot wrap.
vec2 ih2(float n){return fract(n*vec2(0.3271483,0.9194175));}
// Swell-noise lattice value for c.y within +-50 (3..16 here); the cross term gives each row its own stride.
float iv(vec2 c){float x=ihm(c.x);return icube(ihm(x*13.0+c.y*56.0+x*c.y*19.0+1156.0));}
// vnoise on the exact hash, so no lattice value can jump between 0 and 1 where the GPU fuses.
float ivnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(iv(i),iv(i+vec2(1.0,0.0)),f.x),mix(iv(i+vec2(0.0,1.0)),iv(i+vec2(1.0,1.0)),f.x),f.y)/1019.0;}
void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time;
  bool dk=u_dark>0.5;
  vec2 o=sendAt(asp);
  float od=length(q-o);
  float sg=sendGlow(q,o,asp);
  vec3 col;
  if(dk){
    // Plankton gather in two slow diagonal streams; the middle stays quieter.
    float sv=q.y-0.9*(q.x-asp*0.5)+0.05*sin(q.x*7.0+t*0.05);
    float stream=exp(-sq((sv-0.80)/0.13))+exp(-sq((sv-0.18)/0.15))+0.25;
    float glow=0.0; float halo=0.0; float tint=0.0;
    for(int i=0;i<3;i++){
      float fi=float(i);
      float sc=15.0+fi*9.0;
      vec2 p=q+u_tilt*(0.004+fi*0.008);
      p+=0.035*vec2(sin(p.y*4.0+t*0.07+fi),sin(p.x*5.0-t*0.06+fi*2.0));
      p.y+=t*(0.004+fi*0.002);
      p*=sc;
      vec2 id=floor(p);
      vec2 f=fract(p)-0.5;
      float n=ih(id,fi);
      vec2 h=ih2(n);
      float on=step(509.5,n)*clamp(stream*0.9,0.2,1.0);
      vec2 jo=(h-0.5)*0.32+0.05*vec2(sin(t*0.4+h.x*6.28),cos(t*0.33+h.y*6.28));
      vec2 v=f-jo;
      float r2=dot(v,v);
      float tw=(0.55+0.45*sin(t*(0.5+h.y*0.9)+h.x*6.28))*on*(1.0-fi*0.25);
      glow+=exp(-r2*200.0)*tw;
      halo+=exp(-r2*22.0)*tw*smoothstep(0.5,0.32,max(abs(f.x),abs(f.y)));
      tint+=tw*h.y;
    }
    tint=clamp(tint/1.5,0.0,1.0);
    vec3 c=mix(vec3(0.3333,0.9412,0.8863),vec3(0.3529,0.6510,1.0000),tint);
    col=mix(vec3(0.0157,0.1255,0.1725),vec3(0.0078,0.0392,0.0863),smoothstep(0.0,1.0,q.y));
    col+=vec3(0.0471,0.2706,0.3294)*(stream-0.25)*0.30;
    col+=c*(glow*0.75+halo*0.16)*(1.0+2.0*sg);
    // Send flare: about 40 sparks around the bubble flare to pale cyan and fade.
    vec2 fp=(q-o)*30.0;
    vec2 fid=floor(fp); vec2 ff=fract(fp)-0.5;
    float fn=ih(fid,6.0);
    vec2 fh=ih2(fn);
    vec2 fv=ff-(fh-0.5)*0.6;
    float fon=step(458.5,fn);
    float fl=(exp(-dot(fv,fv)*70.0)+0.25*exp(-dot(fv,fv)*9.0))*fon*exp(-sq(od/(0.26*asp+0.05)))*u_pulse*(0.75+0.25*sin(u_time*9.0+fh.x*6.28));
    col+=vec3(0.6235,0.9569,1.0000)*(fl*1.5+sg*0.18);
  } else {
    // Shallow water seen at a low angle: deeper aqua at the top, pale over the sand below.
    float bb=bubbleBand(q.y);
    col=mix(vec3(0.9529,0.9725,0.9647),vec3(0.8667,0.9412,0.9451),smoothstep(0.05,0.55,q.y));
    col=mix(col,vec3(0.7490,0.8824,0.8980),smoothstep(0.55,1.0,q.y));
    // Swell crests: thin bright lines that compress towards the top (perspective).
    float zy=1.0/(1.25-q.y);
    float cr=sin(zy*26.0+2.0*sin(q.x*5.0*zy*0.5+t*0.20)+1.2*sin(q.x*13.0-t*0.25)-t*0.55);
    float brk=smoothstep(0.45,0.80,ivnoise(vec2(q.x*9.0*sqrt(zy),zy*4.0)+vec2(t*0.06,0.0)));
    float crest=pow(max(cr,0.0),12.0)*brk;
    float trough=pow(max(-cr,0.0),3.0);
    float topk=smoothstep(0.35,0.85,q.y);
    col=mix(col,vec3(0.6627,0.8392,0.8627),trough*0.22*(0.25+0.75*topk)*(0.5+0.5*brk));
    col=mix(col,vec3(1.0),crest*0.75*(0.2+0.8*topk));
    // Crisp four-point glints that flash briefly, mostly up in the deeper water.
    float gl=0.0;
    for(int i=0;i<2;i++){
      float fi=float(i);
      float sc=16.0+fi*11.0;
      vec2 p=(q+u_tilt*0.006*(fi+1.0))*sc;
      vec2 id=floor(p); vec2 f=fract(p)-0.5;
      float n=ih(id,fi+3.0);
      float h=n/1019.0;
      vec2 jo=(ih2(n)-0.5)*0.6;
      vec2 v=(f-jo)*u_res.y/sc;
      float boost=exp(-sq(od/(0.25*asp+0.04)))*u_pulse;
      float on=step(mix(0.90,0.55,topk)-0.45*boost,h)*(1.0-0.6*bb);
      float tw=pow(max(sin(t*(0.9+h*1.4)+h*40.0),0.0),4.0)*(0.3+0.7*brk);
      tw=max(tw,boost*(0.6+0.4*sin(u_time*7.0+h*30.0)));
      float sz=mix(1.2,2.8,fract(h*7.3))*(1.0-fi*0.25)*(1.0+0.6*boost);
      vec2 av=abs(v);
      float star=exp(-dot(v,v)/(sz*sz))+0.7*exp(-av.x/(sz*2.6)-sq(av.y/(sz*0.30)))+0.7*exp(-av.y/(sz*2.6)-sq(av.x/(sz*0.30)));
      gl+=star*tw*on;
    }
    col=mix(col,vec3(0.6235,0.8275,0.8627),clamp(sg*0.55,0.0,1.0));
    col=mix(col,vec3(1.0),clamp(gl,0.0,1.0));
  }
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}