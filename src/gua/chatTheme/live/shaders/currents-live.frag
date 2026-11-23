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
float wrap16(float x){return x-16.0*floor(x/16.0);}
float strands(float d,float hc,float s){return min(min(abs(d-hc+s),abs(d-hc)),abs(d-hc-s));}
void main(){
  float k=u_res.x/390.0;
  vec2 frag=vec2(gl_FragCoord.x,u_res.y-gl_FragCoord.y);
  vec2 og=(u_origin.x+u_origin.y>0.5)?u_origin:vec2(u_res.x*0.83,u_res.y*0.113);
  vec2 o=vec2(og.x,u_res.y-og.y);
  vec2 dv=frag-o;
  float dist=length(dv);
  float R=0.45*u_res.x;
  float near=exp(-(dist*dist)/(R*R));
  float ring=sin(dist/(11.0*k)-u_time*7.0);
  float env=u_pulse*exp(-dist/R);
  vec2 p=frag+(dv/max(dist,1.0))*ring*env*6.0*k+u_tilt*6.0*k+vec2(u_time*0.8*k,u_time*0.35*k);
  float cell=44.0*k;
  vec2 id=floor(p/cell);
  vec2 f=p-id*cell;
  float h=hash12(vec2(wrap16(id.x),wrap16(id.y))+0.5);
  float fl=step(h,0.5);
  vec2 c1=mix(vec2(cell,0.0),vec2(0.0),fl);
  vec2 c2=mix(vec2(0.0,cell),vec2(cell),fl);
  float hc=0.5*cell, s=0.2*cell;
  float e1=strands(length(f-c1),hc,s);
  float e2=strands(length(f-c2),hc,s);
  float e=min(e1,e2);
  float cov=clamp(0.55*k+0.5-e,0.0,1.0);
  vec2 v=mix(f-c2,f-c1,step(e1,e2));
  float ang=atan(v.y,v.x);
  float g=0.5+0.5*sin(ang*4.0+h*40.0+u_time*0.32+(id.x+id.y)*1.7);
  float glint=smoothstep(0.72,1.0,g);
  vec3 top,bot,line,hi,glow;
  if(u_dark>0.5){
    top=vec3(0.0745,0.0667,0.0941); bot=vec3(0.0706,0.0627,0.0902);
    line=vec3(0.1569,0.1451,0.2118); hi=vec3(0.2588,0.2314,0.4000); glow=vec3(0.4510,0.3725,0.7451);
  } else {
    top=vec3(0.9490,0.9373,0.9608); bot=vec3(0.9255,0.9098,0.9451);
    line=vec3(0.8706,0.8471,0.9098); hi=vec3(0.7765,0.7333,0.8824); glow=vec3(0.8196,0.7451,0.9608);
  }
  vec3 base=mix(top,bot,frag.y/u_res.y);
  vec3 lc=mix(line,hi,clamp(glint*0.6+env*1.2,0.0,1.0));
  vec3 col=mix(base,lc,clamp(cov*(1.0+env*1.5),0.0,1.0));
  col=mix(col,glow,mix(0.28,0.16,u_dark)*u_pulse*near);
  float n=hash12(gl_FragCoord.xy)+hash12(gl_FragCoord.yx+17.17)-1.0;
  gl_FragColor=vec4(col+n*(1.5/255.0),1.0);
}