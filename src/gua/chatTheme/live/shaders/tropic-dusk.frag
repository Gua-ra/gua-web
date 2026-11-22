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

float cn(vec2 p){ return 0.5+0.25*sin(p.x*1.7+sin(p.y*2.3))+0.25*sin(p.x*3.9-p.y*1.3+1.7*sin(p.x*0.7)); }
void main(){
  float asp=u_res.x/u_res.y;
  vec2 q=gl_FragCoord.xy/u_res.y;
  float t=u_time;
  bool dk=u_dark>0.5;
  vec2 o=sendAt(asp);
  float sg=sendGlow(q,o,asp);
  float hz=0.62;
  vec2 sun=vec2(asp*0.66+u_tilt.x*0.01,hz+0.055);
  float s=clamp((q.y-hz)/(1.0-hz),0.0,1.0);
  float sw=1.0+u_pulse;
  vec3 col,sunc,glc,cl,cd;
  if(dk){
    col=mix(vec3(0.9098,0.5255,0.4157),vec3(0.6118,0.3059,0.4078),smoothstep(0.0,0.22,s));
    col=mix(col,vec3(0.2902,0.1725,0.3333),smoothstep(0.15,0.55,s));
    col=mix(col,vec3(0.1647,0.1137,0.2471),smoothstep(0.5,1.0,s));
    sunc=vec3(1.0000,0.8157,0.5412); glc=vec3(1.0000,0.6902,0.4392); cl=vec3(0.9490,0.6275,0.4941); cd=vec3(0.2275,0.1412,0.2824);
  } else {
    col=mix(vec3(0.9647,0.7647,0.6941),vec3(0.9765,0.8392,0.7647),smoothstep(0.0,0.3,s));
    col=mix(col,vec3(0.9922,0.9216,0.8510),smoothstep(0.25,1.0,s));
    sunc=vec3(1.0000,0.9569,0.8784); glc=vec3(1.0000,0.9059,0.7686); cl=vec3(1.0000,0.9608,0.9176); cd=vec3(0.9294,0.7255,0.6745);
  }
  vec2 dv=q-sun; dv.y*=1.3;
  float sd=length(dv);
  float gr=mix(9.0,6.5,u_dark)/(1.0+0.3*u_pulse);
  col+=glc*exp(-sd*gr)*mix(0.45,0.42,u_dark)*(1.0+0.6*u_pulse);
  if(!dk) col=mix(col,vec3(1.0000,0.9451,0.8627),exp(-sd*16.0)*0.6);
  // Three cloud bands in the upper sky.
  for(int i=0;i<3;i++){
    float fi=float(i);
    float y0=hz+0.12+fi*0.085+0.02*sin(fi*2.7);
    float x=q.x*(2.4+fi*0.6)-t*0.006*(1.0+fi*0.35)+fi*3.7;
    float yy=q.y-y0-0.018*sin(x*1.3+fi);
    float th=0.016+0.010*fi;
    float band=exp(-yy*yy/(th*th));
    float br=smoothstep(0.36,0.72,cn(vec2(x,fi*1.7+yy*8.0)));
    float lt=smoothstep(th,-th,yy)*exp(-abs(q.x-sun.x)*1.4);
    vec3 cc=mix(cd,cl,clamp(lt*1.5+0.2,0.0,1.0));
    col=mix(col,cc,band*br*mix(0.70,0.80,u_dark)*(1.0-fi*0.15));
  }
  float disc=smoothstep(0.036,0.031,length(q-sun));
  col=mix(col,min(sunc*(1.0+0.15*u_pulse),vec3(1.0)),disc);
  float px=1.0/u_res.y;
  // Sea below the horizon.
  if(q.y<hz){
    float dd=(hz-q.y)/hz;
    vec3 sea;
    if(dk){
      sea=mix(vec3(0.4157,0.2275,0.3529),vec3(0.1686,0.1294,0.2510),smoothstep(0.0,0.35,dd));
      sea=mix(sea,vec3(0.1333,0.1020,0.2078),smoothstep(0.4,1.0,dd));
    } else {
      sea=mix(vec3(0.9098,0.7882,0.7529),vec3(0.6118,0.7922,0.8392),smoothstep(0.0,0.30,dd));
      sea=mix(sea,vec3(0.6863,0.8353,0.8627),smoothstep(0.5,1.0,dd));
    }
    float bb=bubbleBand(q.y);
    // Long low swell lines, very faint.
    float freq=140.0/(dd+0.25);
    float wl=0.5+0.5*sin(q.y*freq+2.0*sin(q.x*6.0/(dd+0.3)+t*0.3)+t*0.5);
    sea=mix(sea,sea*mix(0.96,0.90,u_dark),wl*(1.0-0.5*bb));
    float pw=0.020+dd*0.16;
    float path=exp(-sq((q.x-sun.x)/pw));
    float gl=pow(0.5+0.5*sin(q.y*freq*1.8+3.0*sin(q.x*40.0/(dd+0.3)+t*0.6)+t*0.8),8.0)
            *smoothstep(0.55,0.9,0.5+0.5*sin(q.x*90.0/(dd+0.2)-t*0.4+q.y*30.0));
    float pathA=path*(1.0-dd*0.55)*(1.0-0.45*bb);
    sea+=glc*exp(-sq((q.x-sun.x)/(0.10+dd*0.3)))*(1.0-dd)*mix(0.10,0.12,u_dark)*sw;
    sea=mix(sea,vec3(1.0000,0.8902,0.7608),clamp(gl*(0.25*pathA+0.06*(1.0-bb))+gl*sg*0.6,0.0,1.0));
    sea=mix(sea,mix(vec3(1.0000,0.9137,0.8118),vec3(1.0000,0.7059,0.5412),u_dark),clamp(pathA*0.18*sw,0.0,1.0));
    if(!dk){
      // Wet sand and a soft foam line at the very bottom.
      float fy=0.055+0.008*sin(q.x*9.0+t*0.15)+0.004*sin(q.x*23.0-t*0.2);
      float foam=exp(-sq((q.y-fy)/0.004));
      sea=mix(sea,vec3(0.9412,0.8627,0.7843),smoothstep(fy+0.002,fy-0.004,q.y));
      sea=mix(sea,vec3(1.0000,1.0000,1.0000),foam*0.7);
    }
    col=sea;
  }
  col+=mix(vec3(1.0000,0.8235,0.6275)*0.16,vec3(1.0000,0.6196,0.4314)*0.22,u_dark)*sg;
  // Rounded headland on the left (28% to 40% from the top), and a low far one on the right.
  float hx=q.x+u_tilt.x*0.008;
  float hill=hz+0.095*exp(-sq((hx-0.00)/0.11))+0.050*exp(-sq((hx-0.14)/0.06))+0.010*exp(-sq((hx-0.22)/0.03));
  float hm=smoothstep(hill+px,hill-px,q.y)*step(hz-0.0015,q.y);
  vec3 hc=mix(vec3(0.8275,0.6275,0.6196),vec3(0.1647,0.0902,0.2078),u_dark);
  hc=mix(hc,mix(vec3(0.9020,0.7216,0.6824),vec3(0.2902,0.1569,0.2510),u_dark),smoothstep(hz+0.06,hz,q.y)*0.5);
  col=mix(col,hc,hm);
  float far=hz+0.012*exp(-sq((hx-asp*0.98)/0.07));
  col=mix(col,mix(vec3(0.9059,0.7412,0.6980),vec3(0.3529,0.2000,0.3216),u_dark),smoothstep(far+px,far-px,q.y)*step(hz-0.0015,q.y)*(1.0-hm));
  // Headland reflection.
  if(q.y<hz){
    float ry=2.0*hz-q.y;
    float rh=smoothstep(hill+px,hill-px,ry)*smoothstep(hz-0.05,hz,q.y);
    col=mix(col,hc,rh*0.35);
  }
  gl_FragColor=vec4(dither(clamp(col,0.0,1.0)),1.0);
}