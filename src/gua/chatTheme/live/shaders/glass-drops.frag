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

float smin(float a,float b,float k){float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}
vec3 bgc(vec2 p,vec3 b0,vec3 b1,vec3 bs,float bw){
  vec3 c=mix(b0,b1,clamp(p.y,0.0,1.0));
  float a=0.5+0.5*sin(p.x*5.0+p.y*9.0+0.8*sin(p.y*2.3-p.x*1.7+u_time*0.04)+u_time*0.025);
  float r=0.5+0.5*sin(p.x*48.0-p.y*20.0);
  return mix(c,bs,bw*(0.75*a*a+0.25*r*a));
}
void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time;
  vec3 B0,B1,BS,D0,D1,RM,GW,PG; float RA,RIM,BW,CT,SH;
  if(u_dark>0.5){
    B0=vec3(0.0745,0.0431,0.0980);B1=vec3(0.1176,0.0627,0.1490);BS=vec3(0.1647,0.0824,0.1922);D0=vec3(0.8510,0.3765,0.4980);D1=vec3(0.4196,0.1647,0.3333);RM=vec3(1.0000,0.7020,0.7686);GW=vec3(0.9412,0.5412,0.6275);PG=vec3(0.4784,0.1725,0.3333);
    RA=0.750;RIM=0.500;BW=0.600;CT=0.550;SH=0.000;
  } else {
    B0=vec3(0.9686,0.9137,0.9255);B1=vec3(0.9843,0.9569,0.9373);BS=vec3(0.9529,0.8627,0.8510);D0=vec3(0.9686,0.7647,0.7098);D1=vec3(0.9373,0.5569,0.5020);RM=vec3(1.0000,1.0000,1.0000);GW=vec3(0.9843,0.8510,0.8000);PG=vec3(0.9647,0.7608,0.7333);
    RA=0.750;RIM=0.900;BW=0.550;CT=0.400;SH=0.100;
  }
  vec2 o=sendAt(asp);
  vec2 p=q+u_tilt*0.02;
  float d=1000.0; vec2 g=vec2(0.0,1.0);
  for(int i=0;i<6;i++){
    float fi=float(i);
    float pr=floor(fi*0.5);
    float sd=mod(fi,2.0)*2.0-1.0;
    float yy=fract(t/58.0+pr*0.3333+0.08)*1.5-0.25;
    float lane=asp*(0.20+0.30*pr)+0.035*sin(t*0.07+pr*2.1)+0.025*sin(yy*5.0+pr);
    float sep=0.050+0.032*sin(t*0.09+pr*1.7);
    float ang=t*0.045+pr*2.0;
    vec2 c=vec2(lane,yy)+sd*sep*vec2(cos(ang),0.7*sin(ang));
    vec2 oc=c-o;
    c+=oc/(length(oc)+0.001)*0.07*u_pulse*exp(-length(oc)*5.0);
    float r=asp*mix(0.070,0.138,fract(fi*0.618+0.15));
    vec2 v=p-c; float l=length(v);
    float di=l-r;
    float h=clamp(0.5+0.5*(di-d)/0.022,0.0,1.0);
    g=mix(v/(l+0.0001),g,h);
    d=mix(di,d,h)-0.022*h*(1.0-h);
  }
  // The bead that buds from the sent bubble.
  vec2 bc=o+vec2(-0.05*asp,0.060);
  vec2 bv=p-bc; float bl=length(bv);
  float bdi=bl-asp*0.11*u_pulse;
  float bh=clamp(0.5+0.5*(bdi-d)/0.03,0.0,1.0);
  g=mix(bv/(bl+0.0001),g,bh);
  d=mix(bdi,d,bh)-0.03*bh*(1.0-bh);
  g=normalize(g);
  float px=1.0/u_res.y;
  float inside=smoothstep(px,-px,d);
  float s=clamp(-d/0.030,0.0,1.0);
  float sl=sqrt(max(1.0-s*s,0.0));
  vec3 n=normalize(vec3(g*sl*1.4,0.25+s));
  float fac=dot(g*sl,vec2(-0.64,0.77));
  // Refraction: the background seen through the bead is pulled in and its ribbing magnified.
  vec3 bgR=bgc(p-n.xy*0.07,B0,B1,BS,min(BW*2.2,1.0));
  float edgeB=sq(1.0-s);
  vec3 tint=mix(D0,D1,clamp(0.15-0.35*fac+0.85*edgeB,0.0,1.0));
  vec3 body=mix(bgR,tint,RA*(CT+(1.0-CT)*edgeB));
  float caus=sq(max(-fac,0.0))*smoothstep(0.10,0.55,s);
  body=mix(body,GW,caus*0.75);
  vec3 H=normalize(vec3(-0.42,0.52,1.0));
  float nh=max(dot(n,H),0.0);
  float spec=pow(nh,90.0)*1.3+pow(nh,14.0)*0.22;
  float rim=exp(-abs(d)/(1.1*px));
  float fade=max(1.0-0.6*bubbleBand(q.y),u_pulse*exp(-length(q-bc)*9.0));
  vec3 col=bgc(p,B0,B1,BS,BW);
  float shadow=exp(-max(d,0.0)*16.0)*max(dot(g,vec2(0.55,-0.83)),0.0)*(1.0-inside);
  col=mix(col,D1,shadow*SH*fade);
  // Outside: a soft coloured caustic thrown down-right, a faint halo all round.
  float outd=max(d,0.0);
  float thrown=exp(-outd*30.0)*max(dot(g,vec2(0.55,-0.83)),0.0)*(1.0-inside);
  float halo=exp(-outd*40.0)*(1.0-inside);
  col=mix(col,GW,clamp((thrown*0.45+halo*0.12)*fade,0.0,1.0));
  col=mix(col,body,inside*fade);
  col=mix(col,vec3(1.0),clamp(spec,0.0,1.0)*inside*fade);
  col=mix(col,RM,rim*RIM*fade*(0.35+0.65*max(fac,0.0)));
  float sg=sendGlow(q,o,asp);
  col=mix(col,PG,clamp(sg*0.65,0.0,1.0));
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}