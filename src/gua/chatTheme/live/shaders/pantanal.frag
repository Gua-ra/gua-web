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

float trees(vec2 p,float hz,float asp){
  float m=step(p.y,hz+0.004+0.004*sin(p.x*30.0));
  // Broad rounded crowns.
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec2 c=vec2(asp*(0.18+0.36*fi)+0.03*sin(fi*5.0),hz+0.035+0.012*fi);
    float r=0.045+0.015*fract(fi*0.618);
    vec2 v=(p-c)/vec2(1.7,1.0);
    float bump=0.014*(vnoise(p*150.0+fi*7.0)-0.5)+0.012*(vnoise(p*45.0+fi*3.0)-0.5);
    float lob=0.25*r*sin(v.x*90.0+fi)*smoothstep(-0.3*r,r,v.y);
    m=max(m,smoothstep(r+0.0015,r-0.0015,length(v)+bump+lob*0.15)*step(hz,p.y));
  }
  // Fan palms: thin trunk plus a spiky round crown.
  for(int i=0;i<5;i++){
    float fi=float(i);
    float x0=asp*fract(0.09+fi*0.217);
    float ht=0.085+0.035*fract(fi*0.71);
    float lean=0.06*(fract(fi*0.37)-0.5);
    float yy=(p.y-hz)/ht;
    float tx=x0+lean*yy*ht;
    float trunk=smoothstep(0.0022,0.0012,abs(p.x-tx))*step(0.0,yy)*step(yy,1.0);
    vec2 v=p-vec2(x0+lean*ht,hz+ht);
    float a=atan(v.y,v.x);
    float rc=0.024*(0.45+0.55*sqrt(abs(sin(a*7.0+fi))))*(0.75+0.25*smoothstep(-1.2,0.6,sin(a)));
    float crown=smoothstep(rc+0.002,rc-0.001,length(v*vec2(1.0,1.25)));
    m=max(m,max(trunk,crown));
  }
  return m;
}
void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time;
  bool dk=u_dark>0.5;
  vec2 o=sendAt(asp);
  float sg=sendGlow(q,o,asp);
  float hz=0.58;
  float px=1.0/u_res.y;
  bool water=q.y<hz;
  vec2 p=q+vec2(u_tilt.x*0.008,0.0);
  if(water){
    p.y=2.0*hz-q.y;
    p.x+=0.0025*sin(q.y*180.0+t*0.8)*smoothstep(0.0,0.1,hz-q.y);
  }
  float s=clamp((p.y-hz)/(1.0-hz),0.0,1.0);
  vec3 sky,tc;
  if(dk){
    sky=mix(vec3(0.1412,0.2118,0.2902),vec3(0.0627,0.1098,0.1882),smoothstep(0.0,0.4,s));
    sky=mix(sky,vec3(0.0314,0.0549,0.1098),smoothstep(0.4,1.0,s));
    tc=vec3(0.0196,0.0392,0.0588);
  } else {
    sky=mix(vec3(0.9725,0.8667,0.7373),vec3(0.9529,0.9216,0.8627),smoothstep(0.0,0.45,s));
    sky=mix(sky,vec3(0.8902,0.9255,0.9333),smoothstep(0.45,1.0,s));
    vec2 sv=p-vec2(asp*0.30,hz+0.075);
    sky=mix(sky,vec3(1.0000,0.9412,0.8392),exp(-dot(sv,sv)*90.0)*0.8);
    sky=mix(sky,vec3(1.0000,0.9725,0.9255),smoothstep(0.030,0.026,length(sv)));
    tc=vec3(0.4980,0.5765,0.5255);
  }
  float tm=trees(p,hz,asp);
  vec3 col=mix(sky,tc,tm);
  if(!dk){
    // Back treeline, paler in the mist.
    float bt=hz+0.012+0.006*sin(p.x*17.0)+0.004*sin(p.x*41.0+1.0);
    col=mix(col,vec3(0.7373,0.7843,0.7216),smoothstep(bt+px,bt-px,p.y)*(1.0-tm)*step(hz,p.y));
    // Mist drifting along the treeline.
    float mi=exp(-sq((p.y-hz-0.03)/0.035))*(0.55+0.45*sin(p.x*6.0-t*0.03+sin(p.x*2.0+t*0.02)*2.0));
    col=mix(col,vec3(0.9686,0.9451,0.9020),clamp(mi,0.0,1.0)*0.65);
  }
  if(water){
    float dd=(hz-q.y)/hz;
    col=mix(col,dk?vec3(0.0314,0.0667,0.1098):vec3(0.9098,0.9294,0.9098),0.50+0.45*smoothstep(0.0,0.30,dd));
    float ln=0.5+0.5*sin(q.y*260.0+3.0*sin(q.x*9.0+t*0.2));
    col=mix(col,col*(dk?1.25:0.97),ln*0.25*(1.0-0.5*bubbleBand(q.y)));
  }
  if(!dk){
    // Water hyacinth pads near the bottom edge.
    float pads=smoothstep(0.62,0.66,vnoise(q*vec2(9.0,24.0)+vec2(t*0.005,0.0)))*smoothstep(0.10,0.02,q.y);
    col=mix(col,vec3(0.6157,0.7216,0.6078),pads*0.5);
  }
  // Fireflies (dark) or gold motes (light). Far ones hug the treeline and mirror in the water.
  float ff=0.0;
  for(int i=0;i<2;i++){
    float fi=float(i);
    float sc=mix(26.0,11.0,fi);
    vec2 fp=(i==0)?p:q;
    fp+=vec2(0.012*sin(fp.y*7.0+t*0.11+fi),0.008*sin(fp.x*6.0-t*0.09));
    fp.x+=t*0.002*(1.0+fi);
    vec2 gp=fp*sc;
    vec2 id=floor(gp); vec2 f=fract(gp)-0.5;
    float h=hash12(id+fi*23.0);
    vec2 jo=(hash22(id+fi*2.0)-0.5)*0.6+0.12*vec2(sin(t*0.25+h*30.0),cos(t*0.21+h*20.0));
    vec2 v=(f-jo)*u_res.y/sc;
    float zone=(i==0)?exp(-sq((fp.y-hz-0.06)/0.07)):(1.0-0.75*bubbleBand(q.y))*step(0.8,fp.y*0.0+1.0);
    float on=step(i==0?0.35:0.70,h)*zone;
    float near=exp(-sq(length(q-o)/(0.30*asp)))*u_pulse;
    float blink=smoothstep(0.1,1.0,sin(t*(0.35+0.4*h)+h*40.0));
    blink=max(blink*(1.0-near),near);
    float rr=(i==0)?1.7:2.8;
    ff+=(exp(-dot(v,v)/(rr*rr))+0.30*exp(-dot(v,v)/(rr*rr*14.0)))*on*blink*((water&&i==0)?0.45:1.0);
  }
  vec2 fp2=(q-o)*24.0;
  vec2 fid=floor(fp2); vec2 fv=fract(fp2)-0.5-(hash22(fid+5.1)-0.5)*0.6;
  float fla=(exp(-dot(fv,fv)*90.0)+0.2*exp(-dot(fv,fv)*10.0))*step(0.55,hash12(fid*1.9+2.0))
           *exp(-sq(length(q-o)/(0.24*asp+0.05)))*u_pulse;
  if(dk){
    col+=vec3(0.8510,0.9412,0.4157)*(ff*0.9+fla*1.3);
    col+=vec3(0.7843,0.9098,0.4157)*0.16*sg;
  } else {
    col=mix(col,vec3(0.9647,0.7725,0.3961),clamp(ff*0.55+fla*0.8,0.0,1.0));
    col=mix(col,vec3(0.8118,0.8784,0.7686),clamp(sg*0.45,0.0,1.0));
  }
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}