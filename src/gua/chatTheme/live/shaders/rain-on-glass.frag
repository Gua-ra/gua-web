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

vec3 scene(vec2 p,float asp,bool dk){
  vec3 c;
  if(dk) c=mix(vec3(0.0627,0.0941,0.1490),vec3(0.0431,0.0667,0.1098),smoothstep(0.3,1.0,p.y));
  else   c=mix(vec3(0.8275,0.8784,0.8471),vec3(0.7882,0.8471,0.8863),smoothstep(0.3,1.0,p.y));
  for(int i=0;i<7;i++){
    float fi=float(i);
    vec2 h=hash22(vec2(fi*3.1,7.7));
    vec2 ct=vec2(asp*(0.06+0.88*h.x),0.60+0.30*h.y);
    if(i>4) ct.y=0.22+0.18*h.y;
    float r=mix(0.05,0.11,fract(h.x*7.3+h.y));
    float dd=length(p-ct)/r;
    float disc=smoothstep(1.0,0.70,dd)*(0.78+0.22*smoothstep(0.5,0.92,dd));
    vec3 lc;
    if(dk) lc=fi<2.0?vec3(0.8863,0.6471,0.3608):(fi<4.0?vec3(0.7882,0.3765,0.4784):vec3(0.2471,0.6196,0.6902));
    else   lc=fi<3.0?vec3(0.4980,0.6588,0.5451):(fi<5.0?vec3(0.6157,0.7490,0.5412):vec3(0.6588,0.7686,0.7059));
    float a=(i>4?0.45:0.85)*disc;
    if(dk) c+=lc*a*0.50; else c=mix(c,lc,a*0.75);
  }
  return c;
}
void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time;
  bool dk=u_dark>0.5;
  vec2 o=sendAt(asp);
  float sg=sendGlow(q,o,asp);
  float bb=bubbleBand(q.y);
  // Wipe: a clear vertical streak above the sent bubble that refills from the top.
  float wtop=o.y+0.75*sqrt(u_pulse);
  float wx=abs(q.x-o.x+0.03*(q.y-o.y));
  float wipe=step(0.02,u_pulse)*smoothstep(0.085,0.045,wx)*smoothstep(o.y-0.02,o.y+0.01,q.y)*smoothstep(wtop,wtop-0.03,q.y);
  vec2 off=vec2(0.0);
  float shade=0.0; float hi=0.0;
  // Beaded drops: two grids.
  for(int i=0;i<2;i++){
    float fi=float(i);
    float sc=mix(16.0,34.0,fi);
    vec2 gp=q*sc+vec2(fi*0.37,fi*0.71);
    vec2 id=floor(gp); vec2 f=fract(gp)-0.5;
    float h=hash12(id+fi*41.0);
    vec2 jo=(hash22(id+fi*9.0)-0.5)*0.55;
    float r=mix(0.10,0.30,fract(h*13.1))*(1.0-0.25*fi);
    float on=step(mix(0.35,0.20,fi)+0.25*bb,h)*(1.0-wipe);
    vec2 v=(f-jo)/r;
    float l=length(v*vec2(1.0,0.92));
    float in_=smoothstep(1.0,0.86,l)*on;
    off+=-v*in_*(r/sc)*2.6;
    shade+=in_*smoothstep(0.55,1.0,l)*smoothstep(-0.2,0.6,-v.y);
    hi+=in_*exp(-dot(v-vec2(-0.35,0.40),v-vec2(-0.35,0.40))*14.0);
  }
  // Sliding drops: one per column, each leaving a clear trail with a few beads.
  float cw=asp/7.0;
  float ci=floor(q.x/cw);
  float ch=hash12(vec2(ci,3.3));
  float per=11.0+9.0*ch;
  float yd=1.15-fract(t/per+ch)*1.4;
  float xd=(ci+0.5)*cw+cw*0.22*sin(yd*9.0+ch*6.0);
  vec2 dv=(q-vec2(xd,yd))/vec2(0.020,0.026);
  float run=smoothstep(1.0,0.85,length(dv))*step(0.35,ch)*(1.0-wipe);
  off+=-dv*run*0.025;
  shade+=run*smoothstep(0.5,1.0,length(dv))*smoothstep(-0.2,0.6,-dv.y);
  hi+=run*exp(-dot(dv-vec2(-0.3,0.4),dv-vec2(-0.3,0.4))*12.0);
  float trail=step(0.35,ch)*smoothstep(0.012,0.006,abs(q.x-xd))*step(yd,q.y)*smoothstep(yd+0.35,yd+0.02,q.y);
  vec3 col=scene(q+off,asp,dk);
  float wedge=exp(-sq((wx-0.072)/0.005))*smoothstep(o.y-0.02,o.y+0.01,q.y)*smoothstep(wtop,wtop-0.03,q.y)*step(0.02,u_pulse);
  // Fine mist on the glass, cleared by trails and by the wipe.
  float mist=(1.0-max(trail,wipe))*(0.65+0.35*vnoise(q*vec2(40.0,28.0)));
  if(dk){
    col=mix(col,vec3(0.1569,0.1961,0.2745),mist*0.45*(1.0-0.2*bb));
    col=mix(col,vec3(0.0196,0.0314,0.0549),clamp(shade,0.0,1.0)*0.25);
    col*=1.0+0.35*clamp(hi+shade,0.0,1.0);
    col+=vec3(0.8667,0.9098,1.0000)*clamp(hi,0.0,1.0)*0.40;
    col+=vec3(0.4353,0.6275,0.8471)*0.16*sg+vec3(0.7490,0.8275,0.9412)*wedge*0.10;
  } else {
    col=mix(col,vec3(0.9529,0.9647,0.9608),mist*0.62*(1.0-0.15*bb));
    col=mix(col,vec3(0.5608,0.6314,0.6039),clamp(shade,0.0,1.0)*0.40);
    col=mix(col,vec3(1.0),clamp(hi,0.0,1.0)*0.85);
    
    col=mix(col,vec3(0.4941,0.5765,0.5373),wedge*0.35);
    col=mix(col,vec3(0.7686,0.8667,0.7843),clamp(sg*0.40,0.0,1.0));
  }
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}