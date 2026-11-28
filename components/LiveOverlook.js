import * as T from "three";
import { createHuman } from "./SculptedHuman.js";

// All geometry, materials, atmosphere and vegetation are generated at runtime.
// No background images, billboard trees, character sprites or remote art.
const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function random(seed){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
function hash(x,z,s){let n=Math.imul(x,374761393)^Math.imul(z,668265263)^s;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x,z,s){let a=Math.floor(x),b=Math.floor(z),u=x-a,v=z-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return (hash(a,b,s)*(1-u)+hash(a+1,b,s)*u)*(1-v)+(hash(a,b+1,s)*(1-u)+hash(a+1,b+1,s)*u)*v;}
function fbm(x,z,s){let a=0,w=.52;for(let i=0;i<5;i++){a+=w*noise(x,z,s+i*37);x=x*1.91+3.2;z=z*2.03-1.7;w*=.48;}return a;}
// Continuous grassy promontory, with an irregular bank descending into the lake.
const WATER_LEVEL=-1.52;
// The two banks follow different curves. Their spacing varies gently across
// the valley, with a wider bend to one side and a narrower distant channel.
function nearBank(x){
 return -20.8+2.8*Math.cos(x*.094+.48)+1.15*Math.sin(x*.218)+(noise(x*.095,0,113)-.5)*2.4;
}
function farBank(x){
 return -43.0+4.1*Math.sin(x*.071-.55)+1.7*Math.sin(x*.16+1.2)+(noise(x*.065,0,192)-.5)*2.2;
}
function ground(x,z){
 const t=clamp((z-nearBank(x))/8.5,0,1),shore=t*t*(3-2*t);
 const broad=-.72+1.42*Math.exp(-Math.pow((z-3)/24,2));
 const detail=.32*(fbm(x*.085,z*.085,39)-.5)+.065*Math.sin(x*.28+z*.17);
 const bankDetail=Math.sin(Math.PI*t)*(.16*(fbm(x*.30,z*.35,273)-.5)+.08*(noise(x*.75,z*.56,83)-.5));
 // Soft asymmetric undulations only in the transition toward the river.
 // The water level and seating area remain unchanged.
 const inland=1-Math.exp(-Math.pow((z-nearBank(x))/5.5,2));
 const band=Math.exp(-Math.pow((z+9.5)/5.8,2));
 const seating=Math.exp(-Math.pow((z+3)/3.4,2))*Math.exp(-Math.pow(x/12,4));
 const waves=.24*Math.sin(x*.21+z*.17)+.13*Math.sin(x*.44-z*.31)+.22*(fbm(x*.105,z*.12,913)-.5);
 const mound=.19*Math.exp(-Math.pow((x-9)/8.2,2))+ .14*Math.exp(-Math.pow((x+16)/7.3,2));
 return -2.35+shore*(2.35+broad+detail)+bankDetail+inland*band*(1-.9*seating)*(waves+mound);
}
function distantBank(x,z){
 const d=farBank(x)-z,t=clamp((d+3.0)/11.2,0,1),r=t*t*(3-2*t);
 const terrain=.16+.74*fbm(x*.10,z*.13,319)+.24*Math.sin(x*.11+z*.19)+.12*Math.sin(x*.31-z*.12);
 // Low foothills rise behind the opposite shoreline, leaving the water's
 // shallow edge unchanged. Broad irregular crests avoid a continuous wall.
 const inland=clamp((d-5)/13,0,1),fade=inland*inland*(3-2*inland);
 const shoulder=Math.exp(-Math.pow((d-17)/16,2));
 const mounds=.15+1.65*fbm(x*.055,z*.077,611)+.53*noise(x*.105,z*.095,774);
 return -2.2+r*(1.65+terrain)+Math.sin(Math.PI*t)*.19*(fbm(x*.28,z*.29,193)-.5)+fade*shoulder*mounds;
}
const fogColor=new T.Color("#354c71");
// Shared, restrained meadow lighting. Green albedo is not overwritten by the
// strongly blue directional lights used for mountains and sky.
// One procedural shading model for the soil canopy and real grass geometry.
function turfMaterial(blades,wind){
 return new T.ShaderMaterial({
  side:T.DoubleSide,vertexColors:!blades,toneMapped:false,
  defines:blades?{TURF_BLADES:1}:{},
  uniforms:{wind:wind||{value:0}},
  vertexShader:`
   varying vec3 vWorld;varying vec3 vTint;varying float vTip;
   uniform float wind;
   #ifdef TURF_BLADES
    attribute float bladeFlex;
   #endif
   void main(){
    vec3 p=position;vTip=0.;
    #ifdef TURF_BLADES
     vTip=bladeFlex;
     vec2 q=instanceMatrix[3].xz;
     float gust=sin(wind*.74-q.x*.31-q.y*.27);
     p.x+=bladeFlex*bladeFlex*(.065*gust+.022*sin(wind*1.43+q.x*.67));
     p.z+=bladeFlex*bladeFlex*.032*gust;
     vec4 w=modelMatrix*instanceMatrix*vec4(p,1.);
     vTint=instanceColor;
    #else
     vec4 w=modelMatrix*vec4(p,1.);
     vTint=color;
    #endif
    vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;
   }
  `,fragmentShader:`
   precision highp float;
   varying vec3 vWorld;varying vec3 vTint;varying float vTip;
   float turfHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float turfNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(turfHash(i),turfHash(i+vec2(1.,0.)),f.x),mix(turfHash(i+vec2(0.,1.)),turfHash(i+vec2(1.,1.)),f.x),f.y);}
   void main(){
    vec2 p=vWorld.xz;
    vec2 q=mat2(.94,-.34,.34,.94)*p;
    float broad=turfNoise(p*.20);
    float softSlope=turfNoise(p*vec2(.36,.27)+vec2(2.,8.));
    float flow=turfNoise(p*.67);
    // Narrow, elongated, irregular grass-like detail, antialiased with distance.
    float fine=turfNoise(q*vec2(42.,9.)+vec2(flow*2.8,0.));
    float micro=turfNoise(q*vec2(74.,24.));
    float footprint=max(length(dFdx(p)),length(dFdy(p)));
    float fineFade=1.-smoothstep(.025,.17,footprint);
    float microFade=1.-smoothstep(.012,.075,footprint);
    float middle=turfNoise(q*vec2(8.,3.2)+vec2(flow*1.6,0.));
    float textureFactor=.72+.27*broad+.24*softSlope;
    textureFactor+=(middle-.5)*.19+(fine-.5)*.30*fineFade+(micro-.5)*.13*microFade;
    vec3 col=vTint*textureFactor;
    #ifdef TURF_BLADES
     col*=mix(.73,1.36,smoothstep(.0,.98,vTip));
    #endif
    // Green moonlit meadow, not blue-painted soil. The light is deliberately
    // separate from the blue mountain lighting.
    float moon=clamp(.45-p.x*.016-p.y*.010,0.,1.);
    col*=mix(vec3(.63,.71,.62),vec3(1.08,1.17,.94),moon);
    float dist=length(cameraPosition-vWorld),haze=1.-exp(-dist*dist*.000055);
    col=mix(col,vec3(.024,.048,.040),haze*.43);
    gl_FragColor=vec4(col,1.);
    #include <colorspace_fragment>
   }
  `
 });
}
function meshTerrain(width,depth,segments,z0,height,low,high){
  const meadow=height===ground;
  const geo=new T.PlaneGeometry(width,depth,segments,Math.round(segments*.64));geo.rotateX(-Math.PI/2);
  const a=geo.attributes.position,col=[],c0=new T.Color(low),c1=new T.Color(high);
  for(let i=0;i<a.count;i++){
    const x=a.getX(i),z=a.getZ(i)+z0,y=height(x,z);
    a.setXYZ(i,x,y,z);
    const coarse=fbm(x*.075,z*.095,17),fine=fbm(x*.42,z*.55,79);
    const shade=meadow?clamp(.33+coarse*.33+fine*.07,0,1):clamp(.18+coarse*.44+fine*.19+(y+1)*.018,0,1);
    const c=c0.clone().lerp(c1,shade);
    if(meadow){
      const worn=Math.exp(-Math.pow((z+3)/3.6,2))*Math.exp(-Math.pow(x/10,4));
      c.lerp(new T.Color("#486b32"),worn*.10);
      const wet=1-clamp((y-WATER_LEVEL)/.85,0,1);
      if(wet>0)c.lerp(new T.Color("#424b3d"),wet*.78);
    }
    col.push(c.r,c.g,c.b);
  }
  geo.setAttribute("color",new T.Float32BufferAttribute(col,3));geo.computeVertexNormals();
  if(meadow)return new T.Mesh(geo,turfMaterial(false));
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.96,side:T.DoubleSide});
  material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 landPos;").replace("#include <begin_vertex>","#include <begin_vertex>\nlandPos=position;");
   shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>
   varying vec3 landPos;
   float landHash(vec3 q){return fract(sin(dot(q,vec3(127.1,311.7,74.7)))*43758.5453);}
   float landNoise(vec3 q){vec3 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);
     return mix(mix(mix(landHash(i),landHash(i+vec3(1,0,0)),f.x),mix(landHash(i+vec3(0,1,0)),landHash(i+vec3(1,1,0)),f.x),f.y),
     mix(mix(landHash(i+vec3(0,0,1)),landHash(i+vec3(1,0,1)),f.x),mix(landHash(i+vec3(0,1,1)),landHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
   `).replace("#include <color_fragment>",`#include <color_fragment>
     float broad=landNoise(landPos*.75);
     float detail=landNoise(landPos*3.1)*.65+landNoise(landPos*11.)*.35;
     diffuseColor.rgb*=.73+.34*broad+.19*detail;
   `);
   if(meadow)shader.fragmentShader=shader.fragmentShader.replace("diffuseColor.rgb*=.73+.34*broad+.19*detail;","diffuseColor.rgb*=.94+.10*broad+.02*detail;").replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>\n     float lawn=landNoise(vec3(landPos.x*.23,2.,landPos.z*.27));\n     float fineTurf=landNoise(vec3(landPos.x*11.,1.,landPos.z*14.));\n     float filter=1.-smoothstep(.035,.19,length(fwidth(landPos.xz)));\n     diffuseColor.rgb*=mix(.94,1.06,lawn)*mix(1.,.94+.12*fineTurf,filter);\n   `);
  };
  material.customProgramCacheKey=()=>meadow?"quiet-lawn-soil-v1":"natural-land-v2";
  return new T.Mesh(geo,material);
}
// Each range has its own asymmetric ridge profile, with a broad central valley.
// Subordinate ridges descend along the slopes instead of repeating rounded hills.
const ridgeProfiles={
  11:[[-120,.31],[-93,.46],[-74,.39],[-52,.69],[-40,.91],[-32,.70],[-23,.61],[-13,.37],[1,.46],[17,.66],[29,.84],[38,.64],[48,.55],[64,.72],[83,.47],[120,.28]],
  47:[[-100,.35],[-76,.52],[-57,.84],[-43,.68],[-30,.48],[-18,.30],[-5,.20],[9,.27],[23,.48],[34,.68],[47,.88],[59,.65],[75,.45],[100,.32]],
  87:[[-80,.45],[-59,.73],[-44,.93],[-30,.68],[-20,.43],[-9,.14],[4,.09],[13,.21],[25,.47],[38,.77],[52,.87],[67,.60],[80,.39]]
};
function ridgeProfile(x,profile){
 let i=0;while(i<profile.length-2&&x>profile[i+1][0])i++;
 const [a,ha]=profile[i],[b,hb]=profile[i+1],t=clamp((x-a)/(b-a),0,1);
 // A little rounding at the crest without turning every peak into a dome.
 const u=.72*t+.28*t*t*(3-2*t);return ha+(hb-ha)*u;
}
function mountainHeight(seed,center,amp,spread){
 const profile=ridgeProfiles[seed]||ridgeProfiles[11];
 return (x,z)=>{
  const bend=(noise(x*.019,0,seed)-.5)*15+3*Math.sin(x*.037+seed);
  const dz=z-center+bend;
  const crest=ridgeProfile(x,profile)*amp;
  const slope=dz>0?spread*1.30:spread*.88;
  const flank=Math.exp(-Math.pow(Math.abs(dz)/slope,1.48));
  const broad=(fbm(x*.034,z*.037,seed)-.5)*amp*.15;
  const drainage=1-Math.abs(2*fbm(x*.073+dz*.027,z*.085,seed+71)-1);
  const rock=(fbm(x*.15,z*.19,seed+53)-.5)*amp*.033;
  const ravines=-(.024+.037*Math.min(1,Math.abs(dz)/spread))*amp*drainage;
  return -9+flank*(crest+broad+rock+ravines);
 };
}
function makeSky(){
 const geo=new T.SphereGeometry(340,48,32);
 const mat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,toneMapped:false,uniforms:{time:{value:0}},vertexShader:`
 varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
 `,fragmentShader:`
 precision highp float;
 varying vec3 dir;uniform float time;
 // Stable high precision hash and quintic interpolation, with rotation
 // between octaves so the nebula has no axis-aligned block boundaries.
 float h(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float n(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);
 }
 float fb(vec3 p){
  float v=0.,a=.54;
  mat3 rot=mat3(.00,.80,.60,-.80,.36,-.48,-.60,-.48,.64);
  for(int i=0;i<5;i++){v+=a*n(p);p=rot*p*2.04+vec3(13.7,7.1,5.2);a*=.49;}
  return v;
 }
 void main(){
  vec3 d=normalize(dir);float alt=max(0.,d.y);
  vec3 col=mix(vec3(.061,.084,.157),vec3(.003,.008,.029),smoothstep(0.,.61,alt));
  float horizon=exp(-abs(d.y+.02)*10.);
  col+=vec3(.031,.036,.060)*horizon;
  vec3 plane=normalize(vec3(.62,.32,.39));
  vec3 warp=vec3(fb(d*7.+3.),fb(d*7.+17.),fb(d*7.+31.))-.5;
  vec3 q=d+warp*.075;
  float band=dot(q,plane);
  float core=exp(-pow(band*10.5,2.));
  float veil=exp(-pow(band*4.4,2.));
  float cloud=fb(q*25.+vec3(0.,1.,5.));
  float wisps=fb(q*54.+vec3(8.,3.,2.));
  float dust=fb(q*37.+vec3(3.,9.,15.));
  float lane=smoothstep(.39,.68,dust+.09*(wisps-.5));
  float light=pow(clamp(cloud*.85+wisps*.25,0.,1.),1.7)*(1.-.76*lane);
  vec3 cool=vec3(.062,.102,.194),violet=vec3(.145,.084,.212),rose=vec3(.20,.123,.19);
  vec3 spectrum=mix(cool,violet,smoothstep(.27,.72,cloud));
  spectrum=mix(spectrum,rose,smoothstep(.57,.85,wisps)*.45);
  col+=veil*vec3(.022,.033,.077)*(.24+.76*cloud);
  col+=core*spectrum*(.19+1.85*light);
  col+=core*vec3(.115,.136,.194)*pow(light,2.)*.85;
  // Fine dither below a display step, stable in screen space.
  col+=(h(vec3(gl_FragCoord.xy,0.))-.5)*.00065;
  gl_FragColor=vec4(max(col,vec3(0.)),1.);
  #include <colorspace_fragment>
 }
 `});
 const mesh=new T.Mesh(geo,mat);mesh.renderOrder=-100;return mesh;
}
function makeStars(rand){
 const p=[],sizes=[],phases=[],colors=[],strengths=[];
 const palette=["#c9dfff","#e3ebff","#ffffff","#fff0d3","#decaff"].map(v=>new T.Color(v));
 const starRand=random(83921);
 for(let i=0;i<11500;i++){
  let x,y,z;
  if(i<6500){x=(starRand()-.5)*2.3;y=starRand()*.98+.02;z=-.23-starRand()*1.5;}
  else{
   // Galactic dust band: sample the same inclined plane as the nebula.
   x=(starRand()-.5)*2.1;z=-.55-starRand()*.95;
   y=clamp((-.62*x-.39*z)/.32+(starRand()-.5)*.48,.03,1.3);
  }
  const v=new T.Vector3(x,y,z).normalize().multiplyScalar(270);
  p.push(v.x,v.y,v.z);
  const power=Math.pow(starRand(),5.6);
  sizes.push(.62+power*3.4);strengths.push(.25+.75*Math.pow(starRand(),.65));phases.push(starRand()*TAU);
  const c=palette[Math.floor(starRand()*palette.length)];colors.push(c.r,c.g,c.b);
 }
 const geo=new T.BufferGeometry();
 geo.setAttribute("position",new T.Float32BufferAttribute(p,3));geo.setAttribute("size",new T.Float32BufferAttribute(sizes,1));geo.setAttribute("phase",new T.Float32BufferAttribute(phases,1));geo.setAttribute("color",new T.Float32BufferAttribute(colors,3));geo.setAttribute("strength",new T.Float32BufferAttribute(strengths,1));
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending,uniforms:{time:{value:0},scale:{value:1}},vertexShader:`
 attribute float size,phase,strength;attribute vec3 color;varying vec3 tint;varying float ph,lum;
 uniform float scale;
 void main(){tint=color;ph=phase;lum=strength;gl_PointSize=max(1.,size*scale);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
 `,fragmentShader:`
 varying vec3 tint;varying float ph,lum;uniform float time;
 void main(){
  float r=length(gl_PointCoord-.5)*2.;
  float core=exp(-r*r*11.);float halo=exp(-r*r*3.4)*.22;
  float shimmer=.83+.17*sin(time*(.48+.28*sin(ph))+ph);
  float alpha=(core+halo)*(1.-smoothstep(.74,1.,r))*lum*shimmer;
  gl_FragColor=vec4(tint,alpha);
 }
 `});
 return new T.Points(geo,material);
}
// Live planar reflection. Only the distant landscape is drawn into this small
// render target; it is regenerated on the GPU, never loaded from an image.
// A continuous low riparian bank hides the far edge of the water mesh.
function smoothstepLocal(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
// Shared earth/grass colors for both the far-bank surface and the blades
// growing on it. Bake gentle directional shading and atmosphere into the
// vertices instead of relying on a custom fragment shader.
function farBankTint(x,z,y){
 const d=farBank(x)-z,moisture=smoothstepLocal(.02,.98,y-WATER_LEVEL);
 const shade=fbm(x*.13,z*.15,49),swath=noise(x*.085,z*.10,431);
 const wet=new T.Color("#344630"),grass=new T.Color("#526f3d"),deep=new T.Color("#344f36");
 const c=wet.lerp(grass,moisture*(.44+.47*shade));
 c.lerp(deep,.12+.22*swath+.27*smoothstepLocal(12,48,d));
 const dx=(distantBank(x+.3,z)-distantBank(x-.3,z))/.6;
 const dz=(distantBank(x,z+.3)-distantBank(x,z-.3))/.6;
 const normalLight=clamp((1+.31*dx+.42*dz)/Math.sqrt(1+dx*dx+dz*dz),.70,1.16);
 c.multiplyScalar(normalLight*(.89+.17*noise(x*.36,z*.29,553)));
 const haze=smoothstepLocal(36,115,Math.hypot(x,z-15));
 c.lerp(new T.Color("#3a5051"),.13+.25*haze);
 return c;
}
function makeFarBank(small){
 const nx=small?180:240,nz=small?80:112;
 const g=new T.PlaneGeometry(198,65,nx,nz);g.rotateX(-Math.PI/2);
 const p=g.attributes.position,colors=[];
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),v=(p.getZ(i)+32.5)/65;
  const z=farBank(x)-60+v*65,y=distantBank(x,z);
  p.setXYZ(i,x,y,z);
  const c=farBankTint(x,z,y);colors.push(c.r,c.g,c.b);
 }
 g.setAttribute("color",new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
 // Standard Three.js path, no custom GLSL, no image or texture.
 const material=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,toneMapped:false,fog:false});
 const mesh=new T.Mesh(g,material);mesh.layers.enable(1);return mesh;
}
// The water is a curving ribbon, not a rectangular plane extending to the horizon.
function riverGeometry(small){
 const nx=small?140:190,nz=small?23:34,p=[],uv=[],shore=[],idx=[];
 for(let j=0;j<=nz;j++){
  const t=j/nz;
  for(let i=0;i<=nx;i++){
   const u=i/nx,x=(u-.5)*194,near=nearBank(x)+6,far=farBank(x)-5;
   const z=far+(near-far)*t;
   const depth=Math.max(0,WATER_LEVEL-Math.max(ground(x,z),distantBank(x,z)));
   p.push(x,z,0);uv.push(u,t);shore.push(clamp(depth/1.0,0,1));
   if(i<nx&&j<nz){const k=j*(nx+1)+i;idx.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1);}
  }
 }
 const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(p,3));g.setAttribute("uv",new T.Float32BufferAttribute(uv,2));g.setAttribute("waterDepth",new T.Float32BufferAttribute(shore,1));g.setIndex(idx);g.computeVertexNormals();
 return g;
}
function makeLake(small){
 const level=WATER_LEVEL;
 const target=new T.WebGLRenderTarget(small?320:600,small?320:420,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true});
 const mirror=new T.PerspectiveCamera(),projection=new T.Matrix4(),direction=new T.Vector3(),focus=new T.Vector3();
 mirror.layers.set(1);
 const uniforms={time:{value:0},reflection:{value:target.texture},reflectionMatrix:{value:projection},reflectionReady:{value:0},riverFog:{value:fogColor}};
 const mat=new T.ShaderMaterial({side:T.DoubleSide,uniforms,vertexShader:`
  attribute float waterDepth;varying float depthFade;varying vec3 world;varying vec4 reflected;uniform mat4 reflectionMatrix;uniform float time;
  void main(){
   vec3 p=position;depthFade=waterDepth;
   p.z+=(.005*sin(p.x*.60+p.y*.26+time*.38)+.004*sin(p.y*1.15-p.x*.29-time*.30))*smoothstep(0.,.7,waterDepth);
   vec4 w=modelMatrix*vec4(p,1.);world=w.xyz;reflected=reflectionMatrix*w;
   gl_Position=projectionMatrix*viewMatrix*w;
  }`,fragmentShader:`
  precision highp float;
  varying float depthFade;varying vec3 world;varying vec4 reflected;
  uniform sampler2D reflection;uniform float time,reflectionReady;uniform vec3 riverFog;
  void main(){
   vec2 p=world.xz;
   float flow=p.x-time*.35;
   float drift=sin(flow*.15+p.y*.09);
   float q1=flow*.28+p.y*1.1+1.45*drift;
   float q2=flow*.72-p.y*2.5+sin(flow*.19)*1.2;
   float q3=flow*.18+p.y*4.1+sin(p.y*.16)*1.5;
   float a=sin(q1),b=sin(q2),c=sin(q3);
   vec2 slope=vec2(.28*cos(q1)+.24*cos(q2)+.06*cos(q3),1.1*cos(q1)-.84*cos(q2)+.85*cos(q3));
   float deep=smoothstep(.035,.95,depthFade);
   vec3 v=normalize(cameraPosition-world);
   vec3 surfaceNormal=normalize(vec3(-slope.x*.013,1.,-slope.y*.008));
   float fresnel=.14+.64*pow(1.-clamp(dot(v,surfaceNormal),0.,1.),3.7);
   vec2 uv=reflected.xy/max(.0001,reflected.w)*.5+.5;
   uv+=vec2(slope.x*.0017,slope.y*.0014)*deep;
   float inside=step(.001,uv.x)*step(uv.x,.999)*step(.001,uv.y)*step(uv.y,.999)*step(.0001,reflected.w);
   vec2 sampleUV=clamp(uv,vec2(.005),vec2(.995));
   vec3 refl=texture2D(reflection,sampleUV).rgb*.62;
   refl+=texture2D(reflection,sampleUV+vec2(.0018,.0023)).rgb*.19;
   refl+=texture2D(reflection,sampleUV-vec2(.0018,.0023)).rgb*.19;
   vec3 shallow=vec3(.021,.034,.030),deepColor=vec3(.009,.020,.033);
   vec3 base=mix(shallow,deepColor,deep);
   float reflectionMix=fresnel*reflectionReady*inside*(.20+.43*deep);
   vec3 color=mix(base,refl*vec3(.66,.77,.83),reflectionMix);
   float glint=pow(max(0.,a*.48+b*.34+c*.18),21.);
   float patch=.55+.45*sin(flow*.094+p.y*.16+1.6*drift);
   color+=vec3(.046,.073,.103)*glint*patch*deep*(.25+.75*fresnel);
   float shoreline=exp(-pow((depthFade-.075)*17.,2.));
   float brokenEdge=smoothstep(.0,.8,.5+.5*sin(p.x*1.7+sin(p.x*.42+p.y)*2.6));
   color+=vec3(.009,.014,.013)*shoreline*brokenEdge*(.65+.35*a);
   // Match distant water to the same atmosphere as the adjacent terrain.
   float dist=length(cameraPosition-world),haze=1.-exp(-dist*dist*.000081);
   color=mix(color,riverFog,haze*.44);
   gl_FragColor=vec4(color,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 const mesh=new T.Mesh(riverGeometry(small),mat);
 mesh.rotation.x=Math.PI/2;mesh.position.set(0,level,0);
 let last=-Infinity,lastAspect=0;const lastCamera=new T.Vector3(Infinity,0,0),lastDirection=new T.Vector3();
 function reflect(renderer,scene,camera,ms){
  camera.updateMatrixWorld(true);camera.getWorldDirection(direction);
  const moved=lastCamera.distanceToSquared(camera.position)>.015||lastDirection.distanceToSquared(direction)>.00004;
  if(ms-last<(moved?110:420)&&Math.abs(camera.aspect-lastAspect)<.01)return;
  last=ms;lastAspect=camera.aspect;lastCamera.copy(camera.position);lastDirection.copy(direction);
  const width=small?320:600,height=Math.max(140,Math.min(small?520:580,Math.round(width/camera.aspect)));
  if(target.width!==width||target.height!==height)target.setSize(width,height);
  mirror.position.copy(camera.position);mirror.position.y=2*level-camera.position.y;
  direction.y=-direction.y;mirror.up.set(0,-1,0);
  focus.copy(mirror.position).add(direction);mirror.lookAt(focus);
  mirror.fov=camera.fov;mirror.aspect=camera.aspect;mirror.near=camera.near;mirror.far=camera.far;
  mirror.updateProjectionMatrix();mirror.updateMatrixWorld(true);
  projection.multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse);
  const previous=renderer.getRenderTarget(),clip=renderer.clippingPlanes;
  try{
   renderer.clippingPlanes=[new T.Plane(new T.Vector3(0,1,0),-level+.015)];
   renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,mirror);
   uniforms.reflectionReady.value=1;
  }catch(e){uniforms.reflectionReady.value=0;console.warn("Water reflection unavailable",e);}
  finally{renderer.setRenderTarget(previous);renderer.clippingPlanes=clip;}
 }
 return {mesh,material:mat,reflect,dispose(){target.dispose();}};
}
// A grass tuft contains individually shaped curved leaves, not upright uniform strips.
// Reference techniques: Bezier blades (ChrisHowDev/WebGLProcedualGrass), per-blade
// variation (gzatravkin/GrassSimulation), root-to-tip color (three-stylized).
function tuftGeometry(seed,leaves,segments){
 const r=random(seed),p=[],col=[],ids=[],flex=[];
 for(let n=0;n<leaves;n++){
  const angle=n*2.399963+r()*.55,dx=Math.cos(angle),dz=Math.sin(angle);
  const bx=-dz,bz=dx,offset=.018+r()*.035;
  const height=.52+r()*.48,lean=.18+r()*.56,wide=.024+r()*.021;
  const base=p.length/3;
  for(let j=0;j<=segments;j++){
   const t=j/segments,curvature=t*t,spread=offset+lean*curvature;
   const cx=dx*spread,cz=dz*spread;
   const y=height*(t-.20*lean*t*t*t);
   const width=wide*Math.pow(1-t,.72)*(.82+.18*Math.sin(t*Math.PI));
   const fold=width*.26*Math.sin(Math.PI*t);
   p.push(cx-bx*width,y,cz-bz*width,cx+dx*fold,y,cz+dz*fold,cx+bx*width,y,cz+bz*width);
   const light=.59+.41*Math.pow(t,.78);
   for(let k=0;k<3;k++){col.push(light*.94,light,light*.92);flex.push(t);}
   if(j<segments){const k=base+j*3;ids.push(k,k+3,k+1,k+1,k+3,k+4,k+1,k+4,k+2,k+2,k+4,k+5);}
  }
 }
 const g=new T.BufferGeometry();
 g.setAttribute("position",new T.Float32BufferAttribute(p,3));g.setAttribute("color",new T.Float32BufferAttribute(col,3));
 g.setAttribute("bladeFlex",new T.Float32BufferAttribute(flex,1));g.setIndex(ids);g.computeVertexNormals();return g;
}
// Low individual grass leaves. No radial clumps or repeated star-shaped tufts
// in the open lawn. Surface color supplies distant turf at subpixel distances.
// A continuous sward: near blades are closely spaced and far blades are
// progressively lower detail. No radial clusters or high contrast green spikes.
// Packed 3D grass patches: leaves grow at separately jittered roots rather
// than radiating out from one point. Near patches use more curved leaf segments.
function lawnPatch(seed,segments,leaves){
 const r=random(seed),p=[],idx=[],tips=[],colors=[];
 for(let n=0;n<leaves;n++){
  const rootX=(r()-.5)*1.6,rootZ=(r()-.5)*1.6;
  const angle=r()*TAU,dx=Math.cos(angle),dz=Math.sin(angle),bx=-dz,bz=dx;
  const height=.69+r()*.47,bend=.16+r()*.53,w=.065+r()*.044;
  const variation=.89+r()*.20;
  const start=p.length/3;
  for(let j=0;j<=segments;j++){
   const t=j/segments,x=rootX+dx*bend*t*t,z=rootZ+dz*bend*t*t,y=height*(t-.10*t*t*t);
   const half=w*Math.pow(1-t,.72);
   p.push(x-bx*half,y,z-bz*half,x+bx*half,y,z+bz*half);tips.push(t,t);
   const shade=(.48+.70*Math.pow(t,.65))*variation;
   colors.push(shade*.94,shade,shade*.89,shade*.94,shade,shade*.89);
   if(j<segments){const k=start+j*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
 }
 const g=new T.BufferGeometry();
 g.setAttribute("position",new T.Float32BufferAttribute(p,3));
 g.setAttribute("bladeFlex",new T.Float32BufferAttribute(tips,1));g.setAttribute("color",new T.Float32BufferAttribute(colors,3));g.setIndex(idx);
 g.computeVertexNormals();return g;
}
function makeMeadow(scene,rand,small){
 const wind={value:0},r=random(923781),o=new T.Object3D();
 // Three.js' standard instancing path handles geometry and colors; no custom
 // instancing shader declarations. The only addition is gentle root-fixed wind.
 const mat=new T.MeshBasicMaterial({color:"#ffffff",vertexColors:true,side:T.DoubleSide,toneMapped:false,fog:false});
 mat.onBeforeCompile=shader=>{
  shader.uniforms.turfWind=wind;
  shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nuniform float turfWind;\nattribute float bladeFlex;")
   .replace("#include <begin_vertex>",`#include <begin_vertex>
    #ifdef USE_INSTANCING
     vec2 q=instanceMatrix[3].xz;
     float gust=sin(turfWind*.74-q.x*.31-q.y*.27);
     transformed.x+=bladeFlex*bladeFlex*.055*gust;
     transformed.z+=bladeFlex*bladeFlex*.035*gust;
    #endif
   `);
 };
 mat.customProgramCacheKey=()=>"visible-grass-basic-v1";
 const deep=new T.Color("#305324"),green=new T.Color("#679845"),c=new T.Color();
 // Cache exact triangular heightfield. Thousands of patches can sample it
 // without evaluating fractal noise four times per patch.
 const nx=small?180:220,nz=Math.round(nx*.64),dx=140/nx,dz=100/nz;
 const heights=new Float32Array((nx+1)*(nz+1));
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)heights[i+j*(nx+1)]=ground(-70+i*dx,-29+j*dz);
 function heightAt(x,z){
  const gx=clamp((x+70)/dx,0,nx-1e-5),gz=clamp((z+29)/dz,0,nz-1e-5),i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,k=i+j*(nx+1);
  const a=heights[k],b=heights[k+1],c=heights[k+nx+1],d=heights[k+nx+2];
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
 }
 const zones=[
  {x0:-18,x1:18,z0:-8,z1:18,step:small?.23:.175,detail:3,leaves:9},
  {x0:-35,x1:35,z0:-19,z1:25,step:small?.44:.34,detail:2,leaves:6}
 ];
 for(let k=0;k<zones.length;k++){
  const zone=zones[k],cols=Math.ceil((zone.x1-zone.x0)/zone.step),rows=Math.ceil((zone.z1-zone.z0)/zone.step),list=[];
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
   const x=zone.x0+(i+r())*(zone.x1-zone.x0)/cols,z=zone.z0+(j+r())*(zone.z1-zone.z0)/rows;
   if(k===1&&x>-18&&x<18&&z>-8&&z<18)continue;
   const y=heightAt(x,z);if(y<-.95)continue;
   const seating=Math.exp(-Math.pow((z+3)/3.1,2))*Math.exp(-Math.pow(x/12,4));
   const broad=noise(x*.20,z*.24,87),far=1-smoothstepLocal(-18,-8,z);
   const transition=Math.exp(-Math.pow((z+10)/5.6,2));
   const swath=noise(x*.22,z*.31,842);
   const h=(.12+.12*Math.pow(r(),1.25))*(.90+.18*broad)*(1-.35*seating)*(1-.28*far)*(1+transition*(swath-.35)*.38);
   list.push([x,y,z,h,broad]);
  }
  const mesh=new T.InstancedMesh(lawnPatch(717+k*97,zone.detail,zone.leaves),mat,list.length);
  for(let i=0;i<list.length;i++){
   const [x,y,z,h,broad]=list[i];
   const yaw=r()*TAU;
   o.position.set(x,y-.008,z);o.rotation.set(0,yaw,0);
   o.scale.set(zone.step*(.66+r()*.12),h,zone.step*(.66+r()*.12));
   o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
   const coarse=fbm(x*.075,z*.095,17),fine=noise(x*.42,z*.55,79);
   const blend=clamp(.31+coarse*.40+fine*.08+(r()-.5)*.19,0,1);
   const transition=Math.exp(-Math.pow((z+10)/5.6,2));
   const damp=clamp((z-nearBank(x)-3)/9,0,1);
   const swath=noise(x*.18,z*.21,842);
   c.copy(deep).lerp(green,blend).multiplyScalar((.86+.17*broad)*(1+transition*(swath-.5)*.12-.07*transition*(1-damp)));mesh.setColorAt(i,c);
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
  mesh.computeBoundingSphere();mesh.frustumCulled=false;scene.add(mesh);
 }
 return wind;
}
// Sparse low riverbank growth, in small naturally clustered patches only.
// Uses the same geometric grass blades and standard material as the meadow.
// A low, broken carpet of real grass geometry on the opposite shore. It
// links the grassy foreground with the wooded foothills without filling the river.
function makeDistantGroundCover(scene,small){
 const r=random(91872),o=new T.Object3D(),items=[];
 const mountain=mountainHeight(87,-61,17,15);
 const g=lawnPatch(811,2,7);
 const mat=new T.MeshBasicMaterial({color:"#ffffff",vertexColors:true,side:T.DoubleSide,toneMapped:false,fog:false});
 const spacing=small?.74:.53;
 for(let x0=-58;x0<58;x0+=spacing){
  for(let d0=3.4;d0<17.0;d0+=spacing){
   const x=x0+r()*spacing,d=d0+r()*spacing,z=farBank(x)-d;
   const y=distantBank(x,z);
   // Never put grass over a mountain surface or in the water.
   if(y<WATER_LEVEL+.30||mountain(x,z)>y-.12)continue;
   const patch=noise(x*.20,z*.24,591);
   const fade=smoothstepLocal(3.4,6.1,d)*(1-smoothstepLocal(12,17,d));
   if(r()>fade*(.50+.45*patch))continue;
   items.push([x,y,z,(.10+.11*r())*(.65+.35*fade),patch]);
  }
 }
 if(!items.length){g.dispose();mat.dispose();return;}
 const mesh=new T.InstancedMesh(g,mat,items.length);
 items.forEach(([x,y,z,h,p],i)=>{
  o.position.set(x,y-.045,z);o.rotation.set(0,r()*TAU,0);
  const w=spacing*(.65+r()*.14);o.scale.set(w,h,w);o.updateMatrix();
  mesh.setMatrixAt(i,o.matrix);
  mesh.setColorAt(i,farBankTint(x,z,y).multiplyScalar(.94+.12*p));
 });
 mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 mesh.computeBoundingSphere();mesh.layers.enable(1);scene.add(mesh);
}

function makeFieldTransition(scene,small){
 const r=random(55491),o=new T.Object3D(),items=[];
 const centers=[[-26,7],[-18,9],[-10,7.2],[3.5,8.0],[13,6.5],[22,7.8],[30,6.0]];
 for(const [cx,offset] of centers){
  const count=small?18:32;
  for(let j=0;j<count;j++){
   const x=cx+(r()-.5)*3.8,z=nearBank(x)+offset+(r()-.5)*2.5;
   const y=ground(x,z);if(y<-.80||z>-6)continue;
   items.push([x,y,z,.13+.17*r(),r()]);
  }
 }
 const g=lawnPatch(1307,3,9);
 const mat=new T.MeshBasicMaterial({color:"#ffffff",vertexColors:true,side:T.DoubleSide,toneMapped:false,fog:false});
 const mesh=new T.InstancedMesh(g,mat,items.length),dark=new T.Color("#315326"),light=new T.Color("#668a41");
 items.forEach(([x,y,z,h,t],i)=>{
  o.position.set(x,y-.018,z);o.rotation.set(0,r()*TAU,0);
  const width=.17+r()*.12;o.scale.set(width,h,width);o.updateMatrix();
  mesh.setMatrixAt(i,o.matrix);mesh.setColorAt(i,dark.clone().lerp(light,t*.65));
 });
 mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 mesh.computeBoundingSphere();scene.add(mesh);
}

// Low weathered rocks, embedded in the earth, with procedural mineral and moss colors.
// Small broadleaf ground cover provides an organic transition from lawn to woodland.
// Riparian detail follows the actual water height rather than a straight strip.
function makeRiverEdges(scene,small){
 const r=random(70061),o=new T.Object3D();
 function shoreAt(x,far){
  const base=far?farBank(x):nearBank(x);
  let lo=base-6,hi=base+9;
  const height=far?distantBank:ground;
  for(let i=0;i<13;i++){
   const z=(lo+hi)*.5;
   if((height(x,z)>WATER_LEVEL)===far)lo=z;else hi=z;
  }
  return (lo+hi)*.5;
 }
 const n=small?160:300,reed=new T.InstancedMesh(tuftGeometry(927,6,5),new T.MeshStandardMaterial({color:"#ffffff",vertexColors:true,roughness:1,side:T.DoubleSide}),n);
 const a=new T.Color("#465444"),b=new T.Color("#6d7852");
 for(let i=0;i<n;i++){
  const far=i%3!==0;
  let x=(r()-.5)*(far?140:55);
  for(let j=0;j<5&&fbm(x*.25,far?4:1,781)<.47;j++)x=(r()-.5)*(far?140:55);
  const z=shoreAt(x,far)+(far?-1:1)*(.35+Math.pow(r(),2)*1.3),y=(far?distantBank:ground)(x,z);
  const h=.12+Math.pow(r(),2)*.23;
  o.position.set(x,y-.015,z);o.rotation.set(0,r()*TAU,0);o.scale.set(h*.86,h,h*.86);o.updateMatrix();reed.setMatrixAt(i,o.matrix);reed.setColorAt(i,a.clone().lerp(b,r()*.9));
 }
 scene.add(reed);
 const stoneGeo=new T.IcosahedronGeometry(1,2),p=stoneGeo.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),m=.78+.27*fbm(x*3,z*3+y,294);p.setXYZ(i,x*m,y*m,z*m);}
 stoneGeo.computeVertexNormals();
 const count=small?90:180,stones=new T.InstancedMesh(stoneGeo,new T.MeshStandardMaterial({color:"#ffffff",roughness:.98}),count);
 const c=new T.Color("#50574c"),d=new T.Color("#7b7566");
 for(let i=0;i<count;i++){
  const x=(r()-.5)*60,far=i%4===0,z=shoreAt(x,far)+(far?-1:1)*(.13+r()*.9);
  const y=(far?distantBank:ground)(x,z),radius=.035+Math.pow(r(),3)*.18;
  o.position.set(x,y-.025,z);o.rotation.set(r()*.28,r()*TAU,r()*.2);o.scale.set(radius*1.3,radius*.42,radius*.9);o.updateMatrix();stones.setMatrixAt(i,o.matrix);stones.setColorAt(i,c.clone().lerp(d,r()));
 }
 scene.add(stones);
}

function makeGroundCover(scene,small){
 const r=random(91401),positions=[],colors=[],indices=[];
 const shadow=new T.Color("#344b35"),tip=new T.Color("#7a9261");
 for(let frond=0;frond<7;frond++){
  const a=frond*TAU/7+r()*.25,dx=Math.cos(a),dz=Math.sin(a),bx=-dz,bz=dx;
  const len=.65+r()*.35;
  for(let j=1;j<9;j++){
   const t=j/9,mid= len*t,hy=.60*Math.sin(t*2.0);
   const leafLen=(.12+.25*Math.sin(t*Math.PI))*len;
   for(const sign of [-1,1]){
    const x=dx*mid,z=dz*mid,w=.06*Math.sin(t*Math.PI),k=positions.length/3;
    positions.push(x,hy,z,
     x+bx*leafLen*sign*.48+dx*w,hy+.025,z+bz*leafLen*sign*.48+dz*w,
     x+bx*leafLen*sign+dx*.11,hy-.035,z+bz*leafLen*sign+dz*.11,
     x+bx*leafLen*sign*.48-dx*w,hy-.013,z+bz*leafLen*sign*.48-dz*w);
    indices.push(k,k+1,k+2,k,k+2,k+3);
    for(let i=0;i<4;i++){const c=shadow.clone().lerp(tip,i===2?.83:.38+r()*.26);colors.push(c.r,c.g,c.b);}
   }
  }
 }
 const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(positions,3));g.setAttribute("color",new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
 const n=small?44:90,m=new T.InstancedMesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}),n),o=new T.Object3D();
 for(let i=0;i<n;i++){
  let x=0,z=0,y=-3;
  for(let k=0;k<20;k++){
   x=(r()<.5?-1:1)*(6+r()*14);z=-17+r()*18;y=ground(x,z);
   if(y>-.8&&fbm(x*.22,z*.19,781)>.46&&Math.abs(z+3)>2.2)break;
  }
  const size=.13+r()*.24;
  o.position.set(x,y>-.8&&Math.abs(z+3)>2.2?y-.008:-20,z);o.rotation.set(0,r()*TAU,0);o.scale.set(size,size*(.52+r()*.22),size);o.updateMatrix();m.setMatrixAt(i,o.matrix);
 }
 scene.add(m);
}

function makeRocks(scene,rand){
 const r=random(23988),o=new T.Object3D(),dark=new T.Color("#414b49"),light=new T.Color("#77796a");
 for(let variant=0;variant<3;variant++){
  const geo=new T.IcosahedronGeometry(1,3),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=.77+.35*fbm(x*2.2+variant*3,z*2.1+y,82+variant);
   p.setXYZ(i,x*k+.09*y*y,y*k,z*k+.13*x*y);
  }
  geo.computeVertexNormals();
  const mesh=new T.InstancedMesh(geo,new T.MeshStandardMaterial({color:"#ffffff",roughness:1}),12);
  for(let i=0;i<12;i++){
   let x=(r()<.5?-1:1)*(12+r()*13),z=-17+r()*22;
   if(i%5===0){x=(r()-.5)*29;z=-15+r()*3;}
   const y=ground(x,z),radius=.09+Math.pow(r(),2.8)*.68;
   o.position.set(x,y<-.95?-20:y-.07,z);o.scale.set(radius*(1.3+r()*.5),radius*.43,radius*(.8+r()*.3));
   o.rotation.set(r()*.4,r()*TAU,r()*.4);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);mesh.setColorAt(i,dark.clone().lerp(light,r()*.85));
  }
  scene.add(mesh);
 }
}
// Curved, tapering branches use a varying cross section, not stacked cylinders.
// A single merged mesh per woodland reduces draw calls and joint seams.
function addBranch(buffer,curve,r0,r1,steps,sides,color,seed){
 const frames=curve.computeFrenetFrames(steps,false);
 const offset=buffer.p.length/3;
 for(let i=0;i<=steps;i++){
  const t=i/steps,c=curve.getPointAt(t),r=r0*Math.pow(1-t,.82)+r1*t;
  const n=frames.normals[i],b=frames.binormals[i];
  for(let j=0;j<sides;j++){
   const angle=j/sides*TAU,k=1+.12*Math.sin(angle*3+t*9+seed)+.045*Math.sin(angle*5-t*17);
   const q=c.clone().addScaledVector(n,Math.cos(angle)*r*k).addScaledVector(b,Math.sin(angle)*r*k);
   buffer.p.push(q.x,q.y,q.z);
   const shade=.73+.23*Math.sin(angle*3+seed)*Math.sin(angle*3+seed)+.12*t;
   buffer.c.push(color.r*shade,color.g*shade,color.b*shade);
   if(i<steps){const a=offset+i*sides+j,e=offset+i*sides+(j+1)%sides;buffer.i.push(a,e,a+sides,e,e+sides,a+sides);}
  }
 }
}
function branchMesh(data){
 const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(data.p,3));g.setAttribute("color",new T.Float32BufferAttribute(data.c,3));g.setIndex(data.i);g.computeVertexNormals();
 return new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));
}
function curveOf(a,b,c){return new T.CatmullRomCurve3([a,b,c]);}
// Deciduous woodland, with the original memory tree kept separately.
function makeWoodland(scene,rand,small,distant=false){
 const r=random(distant?731459:839127),data={p:[],c:[],i:[]},clusters=[],o=new T.Object3D();
 const bark=new T.Color("#594b40"),dark=new T.Color("#34583b"),light=new T.Color("#72955d");
 // A few deciduous trees frame the clearing, with the memory tree remaining
 // the distinctive foreground specimen. No evenly spaced avenue or conical crowns.
 const sites=small?[
  [-10.7,-12.8,3.5],[5.2,-11.8,3.4],[10.5,-9.9,4.5],
  [-17.6,-15.0,4.4],[-23.0,-11.2,5.0],[18.7,-15.0,4.0],
  [8.5,-13.0,2.2],
  // Modest foreground trees frame the vertical view without filling the sky.
  [2.65,1.8,1.85],[-3.1,.0,1.65]
 ]:[
  [-15.4,-12.8,3.5],[10.7,-12.9,3.4],[19.8,-9.9,4.5],
  [-21.1,-13.1,4.4],[-26.3,-11.2,5.0],[27.3,-15.0,4.0],
  [6.1,-13.2,2.2],[-4.8,-16.5,2.0],[-18.2,-14.0,2.7],
  [15.6,-16.2,2.8],
  // Asymmetric foreground and mid-ground framing, well clear of the seated row.
  [-8.0,3.1,2.15],[7.4,2.6,2.45],[12.4,-4.5,2.8]
 ];
 const memoryX=small?-3.8:-7.8;
 function makeTree(x,z,height,seed){
  const y=distant?distantBank(x,z):ground(x,z);
  if(y<-.65||(!distant&&Math.hypot(x-memoryX,z+10.8)<4.3))return;
  const spread=height*(.32+r()*.08),lean=(r()-.5)*height*.16,leanZ=(r()-.5)*height*.10;
  const base=new T.Vector3(x,y-.03,z),mid=new T.Vector3(x+lean*.24,y+height*.32,z+leanZ*.25);
  const tip=new T.Vector3(x+lean,y+height*.70,z+leanZ);
  const trunk=curveOf(base,mid,tip);
  const radius=height*(.040+r()*.009);
  addBranch(data,trunk,radius,.023*height,16,10,bark,seed);
  for(let k=0;k<4;k++){
   const angle=k*TAU/4+r()*.6,dx=Math.cos(angle),dz=Math.sin(angle);
   const e=new T.Vector3(x+dx*radius*2.5,y-.025,z+dz*radius*2.5);
   addBranch(data,curveOf(new T.Vector3(x,y+radius*.85,z),new T.Vector3(x+dx*radius*1.5,y+.02,z+dz*radius*1.5),e),radius*.45,.009,5,6,bark,seed+k);
  }
  function grow(start,dir,len,width,depth){
   const end=start.clone().addScaledVector(dir,len);
   const middle=start.clone().lerp(end,.50).add(new T.Vector3((r()-.5)*len*.19,-len*.06,(r()-.5)*len*.19));
   const curve=curveOf(start,middle,end);
   addBranch(data,curve,width,width*.28,depth>1?7:4,depth>1?7:5,bark,r()*TAU);
   if(depth===0){
    // Small, irregular overlapping foliage volumes along terminal twigs.
    // The leaves themselves will be individual meshes scattered inside them.
    const size=height*(.072+r()*.036);
    for(let j=0;j<3;j++){
     const t=.40+j*.29;
     clusters.push({center:curve.getPointAt(t),size:size*(.80+r()*.35),tone:.23+r()*.49,seed:r()*10000});
    }
    return;
   }
   const children=depth===2?3:2;
   for(let j=0;j<children;j++){
    const angle=r()*TAU+j*2.399963;
    const d=dir.clone().multiplyScalar(.59).add(new T.Vector3(Math.cos(angle)*.55,.31+r()*.21,Math.sin(angle)*.55)).normalize();
    grow(curve.getPointAt(.55+j*.40/Math.max(1,children-1)),d,len*(.55+r()*.17),width*.47,depth-1);
   }
  }
  const main=6+Math.floor(r()*2),rotation=r()*TAU;
  for(let k=0;k<main;k++){
   const t=.36+.61*k/(main-1),angle=k*2.399963+rotation;
   const d=new T.Vector3(Math.cos(angle)*(.78+.14*r()),.53+.26*r(),Math.sin(angle)*(.78+.14*r())).normalize();
   grow(trunk.getPointAt(t),d,spread*(.78+r()*.28)*(1-.19*t),radius*(.37-.12*t),2);
  }
  grow(tip,new T.Vector3(lean*.20,1,leanZ*.20).normalize(),height*.22,radius*.23,2);
 }
 if(distant){
  // Irregular little groves with openings through to the mountains.
  const groves=[[-41,5],[-24,4],[12,3],[28,4],[47,4]];
  const placed=[];
  let seed=0;
  for(const [center,count] of groves){
   for(let j=0;j<(small?Math.max(2,count-1):count);j++){
    for(let attempt=0;attempt<12;attempt++){
     const x=center+(r()-.5)*13,z=farBank(x)-5.0-r()*5.8;
     if(placed.some(q=>Math.hypot(q[0]-x,q[1]-z)<2.4))continue;
     if(distantBank(x,z)<-.38)continue;
     const mountain=mountainHeight(87,-61,17,15)(x,z);
     if(mountain>distantBank(x,z)+.4)continue;
     const h=1.45+Math.pow(r(),1.2)*1.30;
     placed.push([x,z]);makeTree(x,z,h,++seed);break;
    }
   }
  }
 }else sites.forEach(([x,z,h],i)=>makeTree(x,z,h,i+1));
 if(!clusters.length)return;
 scene.add(branchMesh(data));
 // Small folded, oval leaves, geometrically rendered with standard instance
 // colors. Use many overlapping leaves instead of balls, disks or image cards.
 const p=[],idx=[],cols=[];
 for(let i=0;i<=4;i++){
  const t=i/4,w=.47*Math.pow(Math.sin(t*Math.PI),.85),y=t-.5,fold=.13*Math.sin(t*Math.PI);
  p.push(-w,y,0,0,y,fold,w,y,0);
  cols.push(.79,.85,.76,1.04,1.07,.96,.87,.93,.83);
  if(i<4){const k=i*3;idx.push(k,k+1,k+3,k+1,k+4,k+3,k+1,k+2,k+4,k+2,k+5,k+4);}
 }
 const g=new T.BufferGeometry();
 g.setAttribute("position",new T.Float32BufferAttribute(p,3));
 g.setAttribute("color",new T.Float32BufferAttribute(cols,3));
 g.setIndex(idx);g.computeVertexNormals();
 const m=new T.MeshBasicMaterial({color:"#ffffff",vertexColors:true,side:T.DoubleSide,toneMapped:false,fog:true});
 const countPer=distant?(small?13:20):(small?25:43);
 const mesh=new T.InstancedMesh(g,m,clusters.length*countPer);
 let i=0;
 for(const c of clusters){
  for(let j=0;j<countPer;j++){
   const az=j*2.399963+c.seed,vertical=2*r()-1,radial=Math.sqrt(1-vertical*vertical),radius=Math.cbrt(r())*c.size;
   const dx=Math.cos(az)*radial,dz=Math.sin(az)*radial;
   o.position.copy(c.center).add(new T.Vector3(dx*radius*1.23,vertical*radius*.75,dz*radius));
   o.rotation.set((r()-.5)*2.7,r()*TAU,(r()-.5)*2.6);
   const leaf=c.size*(.23+r()*.24);
   o.scale.set(leaf*.85,leaf,leaf);o.updateMatrix();
   mesh.setMatrixAt(i,o.matrix);
   mesh.setColorAt(i,dark.clone().lerp(light,Math.max(0,Math.min(1,c.tone+vertical*.12+(r()-.5)*.22))).multiplyScalar(.76+.18*r()));
   i++;
  }
 }
 mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 mesh.computeBoundingSphere();scene.add(mesh);
}
function makeMemoryTree(scene,rand,small){
 const r=random(193781),group=new T.Group(),data={p:[],c:[],i:[]};
 const x=small?-3.8:-7.8,z=-10.8;group.position.set(x,ground(x,z),z);
 const bark=new T.Color("#64524b"),twigs=[],canopy=[];
 const root=new T.Vector3(0,0,0),baseTip=new T.Vector3(.12,2.65,-.10);
 const trunk=curveOf(root,new T.Vector3(-.17,1.35,.12),baseTip);
 addBranch(data,trunk,.255,.065,18,12,bark,1);
 // Flared roots blend into the ground instead of the trunk ending at a flat disk.
 for(let i=0;i<6;i++){
  const a=i*TAU/6+r()*.35,len=.47+r()*.34;
  const end=new T.Vector3(Math.cos(a)*len,-.05,Math.sin(a)*len);
  addBranch(data,curveOf(new T.Vector3(0,.19,0),end.clone().multiplyScalar(.5).add(new T.Vector3(0,.035,0)),end),.095,.008,7,7,bark,i);
 }
 function grow(a,d,len,rad,depth){
  const end=a.clone().addScaledVector(d,len),mid=a.clone().lerp(end,.47).add(new T.Vector3((r()-.5)*len*.22,-len*.07,(r()-.5)*len*.22));
  const curve=curveOf(a,mid,end);
  addBranch(data,curve,rad,rad*.31,depth>1?8:5,depth>1?7:5,bark,r()*TAU);
  if(depth<1){twigs.push(curve);canopy.push(end);return;}
  const n=depth===3?3:2;
  for(let j=0;j<n;j++){
   const angle=r()*TAU+j*2.39996,child=d.clone().multiplyScalar(.48).add(new T.Vector3(Math.cos(angle)*.61,.22+r()*.36,Math.sin(angle)*.61)).normalize();
   grow(curve.getPointAt(.68+r()*.30),child,len*(.58+r()*.19),rad*.48,depth-1);
  }
 }
 for(let i=0;i<6;i++){
  const t=.43+i*.102,a=trunk.getPointAt(t),angle=i*2.399963+.3;
  grow(a,new T.Vector3(Math.cos(angle)*.82,.56+r()*.31,Math.sin(angle)*.82).normalize(),1.0+r()*.6,.095*(1-t*.5),3);
 }
 grow(baseTip,new T.Vector3(.06,1,.02),.95,.055,2);
 group.add(branchMesh(data));
 const leafGeo=new T.BufferGeometry(),lp=[],li=[],lc=[];
 for(let i=0;i<=8;i++){
  const t=i/8,w=.048*Math.sin(t*Math.PI)**.77,y=(t-.5)*.16;
  lp.push(-w,y,.011*Math.sin(t*Math.PI),0,y,.024*Math.sin(t*Math.PI),w,y,.011*Math.sin(t*Math.PI));
  lc.push(.72,.78,.72,.95,1,.93,.78,.84,.78);
  if(i<8){const a=i*3;li.push(a,a+1,a+3,a+1,a+4,a+3,a+1,a+2,a+4,a+2,a+5,a+4);}
 }
 leafGeo.setAttribute("position",new T.Float32BufferAttribute(lp,3));leafGeo.setAttribute("color",new T.Float32BufferAttribute(lc,3));leafGeo.setIndex(li);leafGeo.computeVertexNormals();
 const mat=new T.MeshStandardMaterial({color:"#ffffff",vertexColors:true,emissive:"#407d72",emissiveIntensity:.30,roughness:.85,side:T.DoubleSide});
 const each=small?18:29,leaves=new T.InstancedMesh(leafGeo,mat,twigs.length*each),o=new T.Object3D();
 const a=new T.Color("#486b59"),b=new T.Color("#94b49a"),Y=new T.Vector3(0,1,0);
 let k=0;
 for(const twig of twigs){
  for(let i=0;i<each;i++){
   const t=.23+r()*.77,origin=twig.getPointAt(t),angle=i*2.399963;
   const d=new T.Vector3(Math.cos(angle),.20+r()*.55,Math.sin(angle)).normalize();
   o.position.copy(origin).addScaledVector(d,.06+r()*.12);o.quaternion.setFromUnitVectors(Y,d);o.rotateY(r()*.9);
   const scale=.62+r()*.68;o.scale.set(scale,scale,scale);o.updateMatrix();leaves.setMatrixAt(k,o.matrix);leaves.setColorAt(k++,a.clone().lerp(b,r()));
  }
 }
 group.add(leaves);scene.add(group);return {group,mat,leaves};
}
function contactShadow(radiusX,radiusZ,strength){
  const g=new T.PlaneGeometry(radiusX*2,radiusZ*2,12,12);g.rotateX(-Math.PI/2);
  const m=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{strength:{value:strength}},vertexShader:`
    varying vec2 coord;void main(){coord=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `,fragmentShader:`
    varying vec2 coord;uniform float strength;void main(){float a=exp(-dot(coord,coord)*4.2);a*=1.-smoothstep(.62,1.,length(coord));gl_FragColor=vec4(.012,.018,.027,a*strength);}
  `});
  const mesh=new T.Mesh(g,m);mesh.renderOrder=2;
  const p=g.attributes.position,base=Float32Array.from(p.array);
  return {mesh,place(x,z,scale=1){mesh.position.set(x,0,z);mesh.scale.set(scale,1,scale);for(let i=0;i<p.count;i++){const px=base[i*3],pz=base[i*3+2];p.setY(i,ground(x+px*scale,z+pz*scale)+.025);}p.needsUpdate=true;g.computeBoundingSphere();},dispose(){g.dispose();m.dispose();}};
}

// A subtle ribbon of animated water vapour. The translucent surface follows
// the far shore, with zero opacity at both ends and at its top and base.
function makeValleyMist(){
 const p=[],uv=[],idx=[],n=120;
 for(let i=0;i<=n;i++){
  const u=i/n,x=(u-.5)*142,z=farBank(x)+1.6;
  p.push(x,WATER_LEVEL+.10,z,x,WATER_LEVEL+1.45+.32*noise(x*.08,0,37),z-.75);
  uv.push(u,0,u,1);
  if(i<n){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}
 }
 const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(p,3));g.setAttribute("uv",new T.Float32BufferAttribute(uv,2));g.setIndex(idx);
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,uniforms:{time:{value:0}},vertexShader:`
  varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
 `,fragmentShader:`
  varying vec2 vUv;uniform float time;
  void main(){
   float x=vUv.x,y=vUv.y;
   float envelope=sin(y*3.14159265)*smoothstep(0.,.12,x)*(1.-smoothstep(.88,1.,x));
   float drift=.50+.25*sin(x*36.-time*.10+sin(x*14.)*1.8)+.18*sin(x*78.+time*.05);
   float alpha=envelope*max(0.,drift)*.052;
   gl_FragColor=vec4(.12,.20,.25,alpha);
   #include <colorspace_fragment>
  }
 `});
 const mesh=new T.Mesh(g,material);mesh.renderOrder=1;return mesh;
}

export function createLiveOverlook(){
 const small=window.innerWidth<760,rand=random(2261127);
 const renderer=new T.WebGLRenderer({antialias:!small,powerPreference:"high-performance",alpha:false,preserveDrawingBuffer:true});
 renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
 const scene=new T.Scene();scene.fog=new T.FogExp2(fogColor,.009);
 const camera=new T.PerspectiveCamera(49,1,.1,700);camera.position.set(0,3.0,15);camera.lookAt(0,9.4,-48);
 const ambient=new T.HemisphereLight("#c3d2ff","#48564b",1.60);scene.add(ambient);
 const moonlight=new T.DirectionalLight("#c6d9ff",2.35);moonlight.position.set(-28,19,-30);scene.add(moonlight);
 const rim=new T.DirectionalLight("#f0c5b4",.52);rim.position.set(35,8,-40);scene.add(rim);
 const sky=makeSky(),stars=makeStars(rand);scene.add(sky,stars);sky.layers.enable(1);stars.layers.enable(1);
 scene.add(meshTerrain(240,112,180,-142,mountainHeight(11,-143,42,29),"#263953","#8496be"));
 scene.add(meshTerrain(200,90,156,-99,mountainHeight(47,-99,30,23),"#21354e","#56758e"));
 scene.add(meshTerrain(155,62,132,-60,mountainHeight(87,-61,17,15),"#1b313e","#456771"));
 for(const object of scene.children)if(object.isMesh||object.isLight)object.layers.enable(1);
 scene.add(makeFarBank(small));makeDistantGroundCover(scene,small);
 const lake=makeLake(small);scene.add(lake.mesh);
 scene.add(meshTerrain(140,100,small?180:220,21,ground,"#264b23","#608b40"));
 const wind=makeMeadow(scene,rand,small);makeRocks(scene,rand);makeRiverEdges(scene,small);makeFieldTransition(scene,small);
 const beforeForest=new Set(scene.children);makeWoodland(scene,rand,small);makeWoodland(scene,rand,small,true);
 for(const object of scene.children)if(!beforeForest.has(object))object.layers.enable(1);
 const mist=makeValleyMist();scene.add(mist);
 const tree=makeMemoryTree(scene,rand,small);const people=new Map();
 let w=0,h=0,last=-Infinity,dead=false;
 const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 function render(ctx,width,height,ms,peers,count){
   if(dead||renderer.getContext().isContextLost())return false;
   const scale=Math.min(small?1.0:1.25,Math.sqrt((small?650000:1400000)/Math.max(1,width*height)));
   const nw=Math.max(1,Math.round(width*scale)),nh=Math.max(1,Math.round(height*scale));
   if(nw!==w||nh!==h){w=nw;h=nh;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();last=-Infinity;}
   if(ms-last>=1000/(small?24:30)){
     const dt=Number.isFinite(last)?Math.min(.12,(ms-last)*.001):.033;const t=reduced?0:ms*.001;sky.material.uniforms.time.value=t;stars.material.uniforms.time.value=t;stars.material.uniforms.scale.value=scale;
     lake.material.uniforms.time.value=t;wind.value=t;mist.material.uniforms.time.value=t;
     tree.mat.emissiveIntensity=.22+Math.min(1.0,count*.013)+.08*Math.sin(t*.8);
     const ids=new Set(peers.map(p=>p.id));
     for(const [id,v] of people)if(!ids.has(id)){scene.remove(v.root,v.shadow.mesh);people.delete(id);v.shadow.dispose();v.dispose();}
     // When seated, bring the camera closer and lower it, retaining a broad sky.
     const close=peers.length>0;
     const distance=close?(small?10.4:12.5):15;
     const eyeY=close?2.65:3.0;
     camera.position.z+=(distance-camera.position.z)*Math.min(1,dt*3.2);
     camera.position.y+=(eyeY-camera.position.y)*Math.min(1,dt*3.2);
     camera.lookAt(0,close?6.0:9.4,-48);
     for(const p of peers){
       let v=people.get(p.id);if(!v){v=createHuman(p.hue);v.shadow=contactShadow(.75,.85,.58);people.set(p.id,v);scene.add(v.root,v.shadow.mesh);}
       const z=-3.0,span=2*(camera.position.z-z)*Math.tan(camera.fov*Math.PI/360)*camera.aspect;
       const x=(p.x-.5)*span*.98;
       const stagger=small&&peers.length>4?(Math.round(p.x*100)%2)*.48:0;
       v.root.position.set(x,ground(x,z-stagger)+.04,z-stagger);
       v.root.scale.setScalar(small&&peers.length>5?.86:1.06);
       v.shadow.place(x,z-stagger,p.pose==="lie"?1.35:.95);
       v.update(p,t,Date.now(),dt,reduced);
       if(p.pose==="lie")v.root.position.y+=.22;
     }
     lake.reflect(renderer,scene,camera,ms);
     renderer.render(scene,camera);last=ms;
   }
   ctx.drawImage(renderer.domElement,0,0,width,height);return true;
 }
 function dispose(){dead=true;lake.dispose();for(const v of people.values()){scene.remove(v.root,v.shadow.mesh);v.shadow.dispose();v.dispose();}people.clear();scene.traverse(o=>{if(o.isMesh||o.isPoints){if(o.geometry&&!o.geometry.userData.sharedHuman)o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m?.dispose());}});renderer.dispose();renderer.forceContextLoss();}
 return {render,dispose};
}
