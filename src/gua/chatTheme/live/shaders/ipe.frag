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

void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time;
  bool dk=u_dark>0.5;
  vec2 o=sendAt(asp);
  float sg=sendGlow(q,o,asp);
  vec3 sk0,sk1,bk,bl0,bl1,bl2,pt0,pt1;
  if(dk){
    sk0=vec3(0.0784,0.1020,0.2000);sk1=vec3(0.1373,0.1451,0.2745);bk=vec3(0.0431,0.0392,0.0784);
    bl0=vec3(0.4784,0.3098,0.0941);bl1=vec3(0.8510,0.6196,0.1961);bl2=vec3(1.0000,0.8471,0.4667);pt0=vec3(0.7529,0.5412,0.1725);pt1=vec3(1.0000,0.8588,0.5020);
  } else {
    sk0=vec3(0.9725,0.9490,0.9333);sk1=vec3(0.8863,0.9255,0.9608);bk=vec3(0.4157,0.3333,0.3765);
    bl0=vec3(0.7882,0.4000,0.5608);bl1=vec3(0.9137,0.5765,0.7137);bl2=vec3(0.9843,0.8275,0.8902);pt0=vec3(0.8941,0.5412,0.6902);pt1=vec3(0.9765,0.8118,0.8784);
  }
  vec3 col=mix(sk0,sk1,smoothstep(0.1,1.0,q.y));
  if(dk) col=mix(col,vec3(0.2275,0.1843,0.3333),exp(-sq((q.y-0.62)/0.22))*0.30);
  vec2 cp=q+u_tilt*0.010;
  // Canopy seen out of focus: soft blossom masses across the top, ragged towards 30%.
  float cn=vnoise(cp*vec2(3.2,4.0)+vec2(1.3,t*0.004))*0.6+vnoise(cp*vec2(7.0,8.0)+vec2(7.1,2.2+t*0.006))*0.4;
  float edge=0.76+0.05*sin(cp.x*4.0+0.7);
  float mass=smoothstep(-0.04,0.10,cp.y-edge+(cn-0.5)*0.30);
  vec3 cc=mix(bl0,bl1,smoothstep(0.3,0.75,cn));
  cc=mix(cc,bl2,smoothstep(0.62,0.85,vnoise(cp*vec2(6.0,7.0)+vec2(3.0,9.0)))*0.55);
  col=mix(col,cc,mass*0.92);
  // Defocused blossoms: bokeh discs with a brighter rim, mostly along the canopy edge.
  for(int i=0;i<7;i++){
    float fi=float(i);
    vec2 h=hash22(vec2(fi*5.3,1.7));
    vec2 c=vec2(asp*(0.04+0.92*h.x),0.80+0.16*h.y+0.010*sin(t*0.08+fi*1.7));
    float r=0.030+0.028*fract(h.x*7.1+h.y*3.3);
    float dd=length(cp+u_tilt*0.012*(1.0+fi*0.1)-c)/r;
    float bo=smoothstep(1.0,0.86,dd)*(0.75+0.25*smoothstep(0.55,0.95,dd));
    col=mix(col,mix(bl1,bl2,0.35+0.4*h.y),bo*0.55);
  }
  // Falling petals in three depth layers; the send gusts them away from the bubble.
  float bb=bubbleBand(q.y);
  for(int i=0;i<3;i++){
    float fi=float(i);
    float sc=7.0+fi*4.0;
    vec2 p=q+u_tilt*(0.004+0.008*(2.0-fi));
    vec2 ov=p-o; float od=length(ov);
    p-=ov/(od+0.001)*0.14*u_pulse*exp(-od*5.0);
    p.y+=t*(0.018-fi*0.004);
    p.x+=0.035*sin(p.y*2.5+t*0.15+fi*2.0);
    vec2 gp=p*sc;
    vec2 id=floor(gp); vec2 f=fract(gp)-0.5;
    float h=hash12(id+fi*19.0);
    vec2 jo=(hash22(id+fi*3.0)-0.5)*0.5;
    float on=step(0.58,h);
    float ang=t*(0.25+0.4*h)*sign(h-0.79)+h*20.0;
    vec2 v=f-jo;
    v=mat2(cos(ang),sin(ang),-sin(ang),cos(ang))*v;
    float sz=mix(0.085,0.12,fract(h*7.0))*(1.0-fi*0.10);
    vec2 e=v/vec2(sz,sz*0.62);
    e.x+=0.18*e.y*e.y;
    float rr=length(e);
    float soft=mix(0.10,0.30,1.0-fi*0.5);
    float petal=smoothstep(1.0,1.0-soft,rr)*on;
    vec3 pc=mix(pt1,pt0,smoothstep(-0.8,0.9,e.x));
    float al=mix(0.92,0.60,fi*0.5)*(1.0-mix(0.30,0.45,u_dark)*bb);
    col=mix(col,pc,petal*al);
  }
  if(dk) col+=vec3(1.0000,0.7882,0.3765)*0.16*sg;
  else   col=mix(col,vec3(0.9569,0.7373,0.8235),clamp(sg*0.55,0.0,1.0));
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}