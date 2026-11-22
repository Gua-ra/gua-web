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

// Exact cell hash: every value is a whole number below 2^20, which fp32 holds exactly, so a fused
// multiply-add cannot change it and what the baked still shows is what every GPU draws.
// (x+0.5)/1019 is at least 1/2038 from a whole number and the product below is within 1e-4 of it,
// so floor() is exact.
float ihm(float x){return x-1019.0*floor((x+0.5)*(1.0/1019.0));}
float icube(float n){return ihm(ihm(n*n)*n);}
// c: whole-number cell within +-4096, s: whole-number salt; returns a whole number in 0..1018.
float ih(vec2 c,float s){return icube(ihm(icube(ihm(c.x*19.0+c.y*56.0+s*211.0+101.0))+c.x*233.0+s*331.0+13.0));}
// For whole n in 1..1018, n*K stays at least 9e-4 from a whole number (n = 0 gives exactly 0), so fract() cannot wrap.
vec2 ih2(float n){return fract(n*vec2(0.3271483,0.9194175));}
// One cube per point of a 1D lattice: x whole within +-4096, y a whole row. Neighbours along x stay nearly
// uncorrelated and each row is a different stretch of the sequence. Returns a whole number in 0..1018.
float ih1(float x,float y){return icube(ihm(x*56.0+y*7.0+97.0));}
// 2D lattice value for a reduced x (ihm) and y within +-50; the cross term gives each row its own stride.
float ivx(float x,float y){return icube(ihm(x*13.0+y*56.0+x*y*19.0+1156.0));}
float iv(vec2 c){return ivx(ihm(c.x),c.y);}
// vnoise on the exact hash, so no lattice value can jump between 0 and 1 where the GPU fuses.
float ivnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);float a=ihm(i.x);float b=ihm(i.x+1.0);
  return mix(mix(ivx(a,i.y),ivx(b,i.y),f.x),mix(ivx(a,i.y+1.0),ivx(b,i.y+1.0),f.x),f.y)/1019.0;}
float flakes(vec2 q,vec2 o,float t,float asp){
  float acc=0.0;
  for(int i=0;i<3;i++){
    float fi=float(i);
    float sc=14.0+fi*10.0;
    vec2 p=q;
    vec2 ov=p-o; float od=length(ov);
    p-=ov/(od+0.001)*0.10*u_pulse*exp(-od*6.0);
    p.y+=t*(0.018-fi*0.004);
    p.x+=0.02*sin(p.y*3.0+t*0.2+fi*2.0)+u_tilt.x*(0.004+fi*0.006);
    p*=sc;
    vec2 id=floor(p); vec2 f=fract(p)-0.5;
    // Rows fold into 64 (exact: a power of two) to keep iv's row small; the snow repeats only after 64 rows.
    float n=iv(vec2(id.x+fi*307.0,id.y-64.0*floor(id.y*0.015625)-32.0));
    float h=n/1019.0;
    vec2 jo=(ih2(n)-0.5)*0.6;
    float rpx=mix(3.4,1.4,fi*0.5)*(0.7+0.6*h);
    float r=length(f-jo)*u_res.y/sc;
    float on=step(0.62-0.55*exp(-od*6.0)*u_pulse,h);
    acc+=on*smoothstep(rpx,rpx*0.2,r)*(1.0-fi*0.22);
  }
  return acc;
}
// 1D value noise along x that repeats every n cells, so a drift of n cells per 1800 s wraps
// without a jump; y selects an independent row. The lattice index is reduced with a half-cell margin, so a
// division a few ulps off cannot pick the wrong cell.
float vn1(float x,float y,float n){
  float i=floor(x); float f=x-i;
  float a=i-n*floor((i+0.5)/n);
  float b=a+1.0; b-=n*step(n-0.5,b);
  return mix(ih1(a,y+20.0),ih1(b,y+20.0),f*f*(3.0-2.0*f))/1019.0;
}
// Send surge at distance dA along the band from the sent bubble: a brightening there and a front
// that runs outward as the envelope decays. Zero at p = 0.
float surgeAt(float dA,float p){
  float fr=0.04+0.56*pow(max(1.0-p,0.0),0.8);
  return p*(exp(-dA/0.22)+1.5*exp(-sq((dA-fr)/0.13)));
}
// The aurora band at p. c is the 1800 s cycle angle and tc the cycle fraction: every slow motion
// runs a whole number of cycles per 1800 s. pz is the eased send pulse and ox the sent bubble's x.
vec3 aurora(vec2 p,float asp,float c,float tc,float pz,float ox){
  // Every slow layout motion is a whole number of turns per loop, taken from powers of one unit phasor,
  // so they cost two trig calls.
  vec2 z1=vec2(cos(c),sin(c));
  vec2 z2=vec2(z1.x*z1.x-z1.y*z1.y,2.0*z1.x*z1.y);
  vec2 z3=vec2(z2.x*z1.x-z2.y*z1.y,z2.x*z1.y+z2.y*z1.x);
  vec2 z4=vec2(z2.x*z2.x-z2.y*z2.y,2.0*z2.x*z2.y);
  vec2 z5=vec2(z4.x*z1.x-z4.y*z1.y,z4.x*z1.y+z4.y*z1.x);
  vec2 z6=vec2(z3.x*z3.x-z3.y*z3.y,2.0*z3.x*z3.y);
  vec2 z7=vec2(z6.x*z1.x-z6.y*z1.y,z6.x*z1.y+z6.y*z1.x);
  // The band's lower edge is a wide V with a rounded tip and asymmetric arms; a vortex warp curls one
  // arm over a dark gap. m turns the layout over once per loop, and while it turns the band is a
  // broad, even U.
  float m=clamp(0.8+2.4*dot(z1,vec2(0.8085,-0.5885)),-1.0,1.0);
  float hm=0.5+0.5*m;
  float xf=asp*(0.5-0.12*m+0.09*dot(z2,vec2(0.3894,0.9211))+0.04*dot(z5,vec2(0.8912,0.4536)));
  float yf=0.655+0.018*dot(z3,vec2(0.9093,-0.4161))+0.01*z7.y;
  // The fold never closes tighter than this, so its tip stays round instead of a chevron.
  float ef=0.078+0.015*dot(z4,vec2(0.7174,0.6967));
  float ka=0.95+0.12*dot(z3,vec2(0.9917,-0.1288));
  float kb=(-0.05+0.1*dot(z2,vec2(0.2392,-0.971)))*m;
  // The vortex sits a little above the curled arm, so the arm wraps part way round a dark gap instead of
  // knotting on itself. Its turn has the sign of m, so it fades out as the layout turns over and it
  // jumps to the other side only at m = 0, where it has no effect.
  float vx=asp*(0.5+sign(m)*(0.07*dot(z3,vec2(0.8415,0.5403))-0.36));
  vec2 v1=vec2(vx,min(yf+ka*(sqrt(sq(vx-xf)+ef*ef)-ef)+kb*(vx-xf)+0.075+0.02*dot(z4,vec2(0.5985,-0.8011)),0.86));
  float S1=(1.45+0.3*dot(z6,vec2(0.2955,0.9553)))*m;
  float R1=0.14;
  vec2 d1=p-v1;
  float th=S1*exp(-dot(d1,d1)/(R1*R1));
  float cs=cos(th); float sn=sin(th);
  vec2 e1=vec2(cs*d1.x-sn*d1.y,sn*d1.x+cs*d1.y);
  vec2 w=v1+e1;
  float dx=w.x-xf;
  float far=smoothstep(0.06,0.35,abs(dx));
  float ph=11.0*w.x-38.0*c+1.0;
  float fa=0.02+0.016*far;
  w.y+=fa*sin(ph);
  float hy=sqrt(dx*dx+ef*ef);
  float ph2=17.0*w.x+23.0*c+2.0;
  // The arms bow upward as they leave the fold, so neither runs as a straight ruler edge.
  float yl=yf+ka*(hy-ef)+kb*dx+0.6*dx*dx+0.012*sin(ph2);
  float F=w.y-yl;
  // Slope for the distance estimate, taken from a fold rounded by the distance |F|, so the glow's
  // contours round off below the tight fold instead of creasing straight down from it.
  float dyl=ka*dx/sqrt(dx*dx+sq(ef+0.7*abs(F)))+kb+1.2*dx+0.204*cos(ph2);
  // Screen gradient of F = w.y - yl, chained back through the fold wave and the vortex, so f is a
  // screen distance and g tells how much the band is squeezed on screen.
  vec2 g=vec2(-dyl,1.0);
  g.x+=11.0*fa*cos(ph)*g.y;
  vec2 gr=vec2(cs*g.x+sn*g.y,-sn*g.x+cs*g.y);
  g=gr-2.0*th/(R1*R1)*d1*dot(vec2(-e1.y,e1.x),g);
  float G=length(g);
  float f=F/G;
  // Rays converge on a point high overhead.
  vec2 V=vec2(asp*(0.5+0.1*dot(z2,vec2(0.9636,0.2675))),1.8);
  float ra=(p.x-V.x)/(V.y-p.y);
  float r1=vn1(ra*170.0+tc*900.0,1.0,900.0);
  float r2=vn1(ra*65.0-tc*120.0,2.0,120.0);
  float r3=vn1(ra*20.0+tc*60.0,3.0,60.0);
  float rt=smoothstep(0.15,0.95,0.5*r1+0.5*r2);
  float lf=mix(smoothstep(0.0,0.25,dx),smoothstep(0.0,-0.25,dx),hm);
  float rg=mix(smoothstep(0.0,-0.3,dx),smoothstep(0.0,0.3,dx),hm);
  float fold=exp(-dx*dx/0.004);
  float al=0.5+0.5*sin(6.0*w.x+29.0*c+0.4);
  // Long stretches of the band dim, the lower margin most, so the bright edge never runs as one even
  // stroke.
  float gm=smoothstep(0.1,0.75,vn1(w.x*4.0-tc*60.0,7.0,60.0));
  // Higher parts of the band are nearer the zenith, so they are thicker and softer.
  float so=(0.026*(r3-0.5)+0.005*(r2-0.5))*(1.0-0.7*fold);
  float top=(0.085+0.04*lf+0.025*rg+0.2*clamp(p.y-0.62,0.0,0.35))*(0.7+0.6*r3)*(0.9+0.2*r2)*(0.8+0.4*al);
  float es=0.014+0.03*lf+0.045*rg*far;
  float fe=f-so;
  float up=max(fe,0.0);
  float inside=smoothstep(-es,es,fe);
  float gp=ivnoise(w*vec2(5.0,6.0)+3.0*z1+vec2(0.6*z5.x,0.0));
  float bm=0.5+0.5*smoothstep(0.2,0.7,gp);
  float sk=smoothstep(0.25,0.8,gp);
  float u=up/top;
  float body=inside*exp(-u*u)*mix(1.0,0.35+0.65*rt,smoothstep(0.0,0.05,up)*(0.45+0.55*(1.0-lf)))*bm;
  body+=inside*0.55*exp(-up/0.03)*(1.0-0.5*lf)*(0.55+0.45*gm)*(0.75+0.25*rt);
  body+=(0.5*rt+0.12)*r3*(0.2+0.8*rg*rg)*exp(-max(F,0.0)/(0.05+0.26*rg*rg))*smoothstep(-0.01,0.02,F);
  float below=(1.0-inside)*exp(fe/(0.03+0.02*lf+0.05*rg*far))*0.5*(0.6+0.4*gm);
  float glow=exp(-abs(f)/0.08)*0.2;
  float halo=(0.3+0.9*sk)/(1.0+sq(f/0.13));
  float lo=(1.0-inside)*exp(f/0.125);
  float veil=lo*0.17*smoothstep(-0.3,1.0,sin(5.0*w.x-17.0*c+1.0));
  float rip=smoothstep(0.2,1.0,sin(9.0*w.x-47.0*c+0.7));
  float inten=(0.65+0.55*fold+0.35*rip+0.3*al+0.15*lf)*clamp(G,0.7,1.6);
  // The send surge brightens the band itself and the glow just under it, not the sky far below.
  float sv=0.0;
  if(pz>0.0) sv=surgeAt(abs(p.x-ox),pz);
  vec3 cl=mix(vec3(0.2039,0.9490,0.4980),vec3(0.7686,1.0000,0.2902),max(fold,0.3*rip)*exp(-up/0.045));
  vec3 cb=mix(cl,vec3(0.1333,0.8000,0.5412),smoothstep(0.5,1.2,u));
  cb=mix(cb,vec3(0.4784,0.3098,0.8157),smoothstep(1.1,2.2,u)*0.6);
  float endm=smoothstep(0.12,0.3,abs(dx));
  vec3 ac=(cb*body*1.65+mix(vec3(0.1804,0.9098,0.5412),vec3(0.6275,0.2510,0.7843),lf*0.8)*below)*(1.0+1.3*sv)+vec3(0.1804,0.9098,0.5412)*(glow+veil);
  ac=mix(ac,ac.g*0.75*vec3(0.6353,0.2353,0.7843),endm*0.35*smoothstep(0.0,0.08,up+0.04));
  ac+=vec3(0.4784,0.1725,0.6588)*lf*lo*0.3;
  ac*=inten;
  vec3 hc=mix(vec3(0.1176,0.6196,0.4392),vec3(0.1647,0.1961,0.5647),smoothstep(0.12,0.35,f));
  hc=mix(hc,vec3(0.3216,0.1647,0.5333),max(endm,lf*0.6)*smoothstep(0.0,-0.2,f));
  ac+=hc*halo*0.16;
  return ac;
}
void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time;
  bool dk=u_dark>0.5;
  vec2 o=sendAt(asp);
  float hz=0.15;
  float s=clamp((q.y-hz)/(1.0-hz),0.0,1.0);
  vec3 col;
  if(dk) col=mix(mix(vec3(0.0549,0.1529,0.2000),vec3(0.0235,0.0627,0.1412),smoothstep(0.0,0.25,s)),vec3(0.0196,0.0392,0.1098),smoothstep(0.25,0.6,s));
  else {
    col=mix(vec3(0.9686,0.9373,0.9176),vec3(0.9176,0.9451,0.9686),smoothstep(0.0,0.75,s));
    col=mix(col,vec3(0.8627,0.9059,0.9451),smoothstep(0.55,1.0,s)*0.6);
    vec2 sv=q-vec2(asp*0.74,0.80);
    col=mix(col,vec3(1.0000,0.9725,0.9333),exp(-dot(sv,sv)*14.0)*0.75);
    col=mix(col,vec3(1.0000,0.9922,0.9725),smoothstep(0.034,0.028,length(sv))*0.9);
    // Far hills in winter haze.
    float fh=hz+0.055+0.025*sin(q.x*5.0+1.3)+0.012*sin(q.x*13.0+0.4);
    col=mix(col,vec3(0.8392,0.8784,0.9176),smoothstep(fh+0.002,fh-0.002,q.y)*0.8);
  }
  if(dk){
    // One 2 pi cycle per 1800 s.
    float cyc=u_time*0.0034906585;
    float tc=u_time/1800.0;
    float pz=u_pulse*smoothstep(0.0,0.08,u_pulse);
    // Low in the sky the aurora adds only a few LSB, so it fades out there and is skipped below.
    vec3 ac=vec3(0.0);
    if(q.y>0.2) ac=aurora(q+u_tilt*vec2(0.012,0.008),asp,cyc,tc,pz,o.x)*smoothstep(0.2,0.4,q.y);
    // Hue-preserving roll-off, then a whitish lime core where it saturates.
    float mx=max(ac.g,max(ac.r,ac.b));
    vec3 tm=ac*(1.0-exp(-mx))/max(mx,0.0001);
    tm+=(vec3(0.9412,1.0000,0.8471)-tm)*smoothstep(2.4,4.2,mx)*0.25;
    tm*=1.0-0.6*bubbleBand(q.y);
    float lum=dot(tm,vec3(0.3,0.5,0.2));
    // Stars with a radius in device pixels, twinkling at whole cycles per 1800 s, fading behind the aurora.
    vec2 sp=(q+u_tilt*vec2(0.02,0.0133))*70.0; vec2 id=floor(sp); vec2 f=fract(sp)-0.5;
    float ns=ih(id,0.0);
    float h=ns/1019.0;
    vec2 jo=ih2(ns)-0.5;
    float tw=0.6+0.4*sin(6.2831853*fract(tc*floor(229.0+430.0*h))+h*40.0);
    float sb=fract(h*13.0);
    float sr=length(f-jo*0.7)*u_res.y/70.0;
    float st=step(0.925,h)*smoothstep(1.1+1.3*sb,0.3,sr)*tw*(0.45+0.55*sb);
    col+=st*0.55*smoothstep(0.2,0.42,q.y)*exp(-1.3*lum);
    col+=tm;
  }
  // Two spruce ridges with parallax; each cell holds one narrow tiered spruce.
  for(int l=0;l<2;l++){
    float fl=float(l);
    float x=q.x+u_tilt.x*(0.006+0.012*fl);
    float n=mix(44.0,27.0,fl);
    float cx=x*n;
    float idx=floor(cx);
    float hh=ih1(idx,fl*7.0+1.0)/1019.0;
    float fx=fract(cx)-0.5-(ih1(idx,fl*3.0+5.0)/1019.0-0.5)*0.25;
    float base=hz-0.02-fl*0.05+0.014*sin(x*7.0+fl*3.0)+0.006*sin(x*19.0+fl);
    float ht=mix(0.035,0.085,hh*hh)*mix(0.85,1.3,fl);
    float vrel=(base+ht-q.y)/ht;
    float tier=fract(vrel*4.5+hh);
    float w=vrel*0.40*(0.68+0.32*tier);
    float aa=n/u_res.y;
    float tree=smoothstep(w+aa,w-aa,abs(fx))*step(0.0,vrel);
    float ground=smoothstep(base+0.002,base-0.002,q.y);
    vec3 tc;
    if(dk){
      tc=mix(vec3(0.0431,0.1098,0.1529),vec3(0.0157,0.0353,0.0588),fl);
      col=mix(col,tc,max(tree,ground));
    } else {
      tc=mix(vec3(0.6627,0.7216,0.7843),vec3(0.4353,0.5176,0.6000),fl);
      tc=mix(tc,vec3(0.5608,0.6392,0.7216),(1.0-fl)*smoothstep(0.5,1.0,vrel)*0.6);
      float sn=ih1(idx,floor(vrel*4.5+hh)+fl*9.0+40.0)/1019.0;
      tc=mix(tc,vec3(0.9490,0.9647,0.9804),smoothstep(0.22,0.04,tier)*step(0.70,sn)*0.45*smoothstep(0.0,0.2,abs(fx)*2.0/max(w,0.001)-0.3));
      col=mix(col,tc,tree*(1.0-ground));
      col=mix(col,mix(vec3(1.0000,1.0000,1.0000),vec3(0.9294,0.9490,0.9686),fl*0.6+(base-q.y)*3.0),ground);
    }
  }
  float sg=sendGlow(q,o,asp);
  if(dk){
    col+=vec3(0.2392,0.9608,0.6510)*0.12*sg;
  } else {
    float fk=flakes(q,o,t,asp);
    col=mix(col,vec3(1.0),clamp(fk,0.0,1.0));
    col=mix(col,vec3(0.7490,0.8353,0.9333),clamp(sg*0.55,0.0,1.0));
  }
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}