import * as T from "three";
import { createHuman } from "./SculptedHuman.js";
import { makeSky, makeStars, makeMeteorLights } from "./OverlookSky.js";
import { makeRiver } from "./OverlookWater.js";

// All geometry, materials, atmosphere and vegetation are generated at runtime.
// No background images, billboard trees, character sprites or remote art.
const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function random(seed){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
function hash(x,z,s){let n=Math.imul(x,374761393)^Math.imul(z,668265263)^s;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x,z,s){let a=Math.floor(x),b=Math.floor(z),u=x-a,v=z-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return (hash(a,b,s)*(1-u)+hash(a+1,b,s)*u)*(1-v)+(hash(a,b+1,s)*(1-u)+hash(a+1,b+1,s)*u)*v;}
function fbm(x,z,s){let a=0,w=.52;for(let i=0;i<5;i++){a+=w*noise(x,z,s+i*37);x=x*1.91+3.2;z=z*2.03-1.7;w*=.48;}return a;}
const WATER_LEVEL=-1.52;
const MEADOW_WIDTH=188,MEADOW_DEPTH=112,MEADOW_CENTER=16;
const fogColor=new T.Color("#344563");
const smoothstepLocal=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);

// Both functions return the intersection of the land with the river surface.
function nearBank(x){
 return -18.3+4.9*Math.sin(x*.102-.32)+1.47*Math.sin(x*.225+.31)+(noise(x*.21,0,113)-.5)*1.35;
}
function farBank(x){
 return -43.3+6.2*Math.sin(x*.069+1.02)-3.2*Math.cos(x*.133-.3)+(noise(x*.14,0,192)-.5)*1.55
  -1.23*Math.exp(-Math.pow((x-5)/13,2))+.61*Math.sin(x*.27+.8);
}
function ground(x,z){
 const distance=z-nearBank(x);
 if(distance<=0)return WATER_LEVEL-.93*smoothstepLocal(0,5.8,-distance);
 const shore=smoothstepLocal(0,9.6,distance);
 const broad=-.77+1.41*Math.exp(-Math.pow((z-3)/24,2));
 const detail=.31*(fbm(x*.085,z*.085,39)-.5)+.064*Math.sin(x*.28+z*.17);
 const clearing=Math.exp(-Math.pow((z+3)/3.5,2))*Math.exp(-Math.pow(x/12,4));
 const rolling=.23*Math.sin(x*.19+z*.16)+.13*Math.sin(x*.43-z*.29)+.31*(fbm(x*.10,z*.12,913)-.48);
 const bankDetail=.18*(fbm(x*.36,z*.41,273)-.46)*Math.sin(shore*Math.PI);
 return T.MathUtils.lerp(WATER_LEVEL,broad+detail,shore)+bankDetail
  +shore*(1-.92*clearing)*Math.exp(-Math.pow((z+9.7)/8.3,2))*rolling;
}
function distantBank(x,z){
 const d=farBank(x)-z;
 if(d<=0)return WATER_LEVEL-1.10*smoothstepLocal(0,6,-d);
 const ledge=.70*smoothstepLocal(0,4.6,d)+.62*smoothstepLocal(3,13,d);
 const swale=fbm(x*.073-z*.043,z*.104,319);
 const terrace=1-Math.abs(2*fbm(x*.089,z*.119,611)-1);
 const rolls=1.6*swale+.36*Math.sin(x*.23+z*.27)+.57*noise(x*.115,z*.105,774);
 const westShoulder=1.45*Math.exp(-Math.pow((x+18+d*.36)/10,2)-Math.pow((d-18)/10,2));
 const eastShoulder=2.10*Math.exp(-Math.pow((x-15-d*.29)/12,2)-Math.pow((d-22)/11,2));
 const foothills=smoothstepLocal(4,18,d)*(1-smoothstepLocal(41,73,d))
  *(.41+1.31*terrace+rolls+westShoulder+eastShoulder);
 const relief=smoothstepLocal(4.5,11,d)*Math.exp(-Math.pow((d-12)/13,2));
 const gullies=.20*Math.sin(x*.145+z*.22)+.23*(fbm(x*.18,z*.22,815)-.5);
 const bankDetail=.21*(fbm(x*.29,z*.37,193)-.48)*smoothstepLocal(0,3,d)+relief*gullies;
 return WATER_LEVEL+ledge+foothills+bankDetail;
}
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
  const wetMud=new T.Color("#424b3d"),clearingTurf=new T.Color("#486b32");
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
      c.lerp(clearingTurf,worn*.10);
      const wet=1-clamp((y-WATER_LEVEL)/.85,0,1);
      if(wet>0)c.lerp(wetMud,wet*.78);
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

  };
  material.customProgramCacheKey=()=>"natural-land-v2";
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
// Bake moisture, exposed rock and sky-facing light into a single foothill surface.
const shoreMud=new T.Color("#3c4939"),shoreMoss=new T.Color("#536b49");
const hillside=new T.Color("#354a49"),rockDust=new T.Color("#52606b");
function farBankTint(x,z,y){
 const d=farBank(x)-z;
 const moss=smoothstepLocal(.02,.9,y-WATER_LEVEL);
 const shade=fbm(x*.13,z*.15,49),strata=fbm(x*.10+z*.037,z*.13,431);
 const c=shoreMud.clone().lerp(shoreMoss,moss*(.46+.56*shade));
 const dx=(distantBank(x+.31,z)-distantBank(x-.31,z))/.62;
 const dz=(distantBank(x,z+.31)-distantBank(x,z-.31))/.62;
 const slope=Math.hypot(dx,dz);
 c.lerp(hillside,.12+smoothstepLocal(4,32,d)*.43);
 const rock=smoothstepLocal(.14,.49,slope)*smoothstepLocal(.38,.70,strata)*smoothstepLocal(3,18,d);
 c.lerp(rockDust,.49*rock);
 const light=clamp((1+.38*dx+.48*dz)/Math.sqrt(1+slope*slope),.65,1.22);
 c.multiplyScalar(light*(.84+.27*shade));
 const haze=smoothstepLocal(44,142,Math.hypot(x,z-15));
 return c.lerp(fogColor,.13+.40*haze);
}
function makeFarBank(small){
 const g=new T.PlaneGeometry(198,78,small?142:198,small?74:101);
 g.rotateX(-Math.PI/2);
 const p=g.attributes.position,colors=[];
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),z=farBank(x)+p.getZ(i)-36,y=distantBank(x,z);
  p.setXYZ(i,x,y,z);
  const c=farBankTint(x,z,y);
  colors.push(c.r,c.g,c.b);
 }
 g.setAttribute("color",new T.Float32BufferAttribute(colors,3));
 const material=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false,fog:false});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 bankPosition;")
   .replace("#include <begin_vertex>","#include <begin_vertex>\nbankPosition=position;");
  shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>
 varying vec3 bankPosition;
 float bankHash(vec2 p){
  vec3 q=fract(p.xyx*vec3(.1031,.1030,.0973));
  q+=dot(q,q.yzx+23.33);
  return fract((q.x+q.y)*q.z);
 }
 float bankNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(bankHash(i),bankHash(i+vec2(1.,0.)),f.x),
             mix(bankHash(i+vec2(0.,1.)),bankHash(i+vec2(1.)),f.x),f.y);
 }
`)
   .replace("#include <color_fragment>",`#include <color_fragment>
    vec2 p=bankPosition.xz;
    float soil=bankNoise(vec2(p.x*.44+p.y*.32,p.y*.75));
    float grain=bankNoise(vec2(p.x*2.1-p.y*.31,p.y*1.34));
    float filter=1.-smoothstep(.15,.68,length(fwidth(p)));
    diffuseColor.rgb*=(.81+.38*soil)*mix(1.,.88+.24*grain,filter);
   `);
 };
 material.customProgramCacheKey=()=>"river-foothill";
 const mesh=new T.Mesh(g,material);
 mesh.layers.enable(1);
 return mesh;
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
function meadowSampler(mesh){
 const {width,height,widthSegments:nx,heightSegments:nz}=mesh.geometry.parameters;
 const p=mesh.geometry.attributes.position;
 return (x,z)=>{
  const gx=clamp((x+width*.5)*nx/width,0,nx-1e-6),gz=clamp((z-MEADOW_CENTER+height*.5)*nz/height,0,nz-1e-6);
  const i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,k=i+j*(nx+1);
  const a=p.getY(k),b=p.getY(k+1),c=p.getY(k+nx+1),d=p.getY(k+nx+2);
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
 };
}
function treeShade(x,z,roots){
 let shade=0;
 for(const root of roots){
  const dx=(x-root.x)/root.radius,dz=(z-root.z)/(root.radius*.79);
  const r2=dx*dx+dz*dz;
  if(r2<1)shade=Math.max(shade,(1-r2)*(1-r2));
 }
 return 1-.35*shade;
}
function shadeTerrainAtTrees(mesh,roots){
 const p=mesh.geometry.attributes.position,c=mesh.geometry.attributes.color;
 for(let i=0;i<p.count;i++){
  const shade=treeShade(p.getX(i),p.getZ(i),roots);
  c.setXYZ(i,c.getX(i)*shade,c.getY(i)*shade,c.getZ(i)*shade);
 }
}
function makeMeadow(scene,small,heightAt,roots,wind){
 const r=random(923781),o=new T.Object3D();
 const up=new T.Vector3(0,1,0),normal=new T.Vector3();
 // Three.js' standard instancing path handles geometry and colors; no custom
 // instancing shader declarations. The only addition is gentle root-fixed wind.
 const mat=new T.MeshBasicMaterial({color:"#ffffff",vertexColors:true,side:T.DoubleSide,toneMapped:false,fog:false});
 mat.onBeforeCompile=shader=>{
  shader.uniforms.turfWind=wind;
  shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nuniform float turfWind;\nattribute float bladeFlex;");
  const project=T.ShaderChunk.project_vertex.replace("mvPosition = modelViewMatrix",`
   vec2 q=instanceMatrix[3].xz;
   float gust=.71*sin(turfWind*.81-dot(q,vec2(.27,.34)))+.29*sin(turfWind*1.31+q.x*.53-q.y*.39);
   float flex=bladeFlex*bladeFlex*length(instanceMatrix[1].xyz);
   mvPosition.x+=.17*flex*gust;
   mvPosition.z+=.108*flex*gust;
   mvPosition = modelViewMatrix
  `);
  shader.vertexShader=shader.vertexShader.replace("#include <project_vertex>",project);
 };
 mat.customProgramCacheKey=()=>"visible-grass-basic-v1";
 const deep=new T.Color("#305324"),green=new T.Color("#679845"),c=new T.Color();
 const batches=[];
 const zones=[
  {x0:small?-11:-18,x1:small?11:18,z0:-9,z1:12,step:small?.23:.175,detail:2,leaves:9},
  {x0:small?-21:-36,x1:small?21:36,z0:-25,z1:12,step:small?.44:.34,detail:1,leaves:6}
 ];
 for(let k=0;k<zones.length;k++){
  const zone=zones[k],cols=Math.ceil((zone.x1-zone.x0)/zone.step),rows=Math.ceil((zone.z1-zone.z0)/zone.step),list=[];
  const inner=zones[0];
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
   const x=zone.x0+(i+r())*(zone.x1-zone.x0)/cols,z=zone.z0+(j+r())*(zone.z1-zone.z0)/rows;
   if(k===1&&x>inner.x0&&x<inner.x1&&z>inner.z0&&z<inner.z1)continue;
   const y=heightAt(x,z);if(y<WATER_LEVEL+.42)continue;
   const seating=Math.exp(-Math.pow((z+3)/3.1,2))*Math.exp(-Math.pow(x/12,4));
   const broad=noise(x*.20,z*.24,87),far=1-smoothstepLocal(-18,-8,z);
   const transition=Math.exp(-Math.pow((z+10)/5.6,2));
   const swath=noise(x*.22,z*.31,842);
   const h=(.12+.12*Math.pow(r(),1.25))*(.90+.18*broad)*(1-.35*seating)*(1-.28*far)*(1+transition*(swath-.35)*.38);
   list.push([x,y,z,h,broad]);
  }
  // Keep adaptive thinning even across the entire lawn.
  for(let i=list.length-1;i>0;i--){
   const j=Math.floor(r()*(i+1));
   [list[i],list[j]]=[list[j],list[i]];
  }
  const mesh=new T.InstancedMesh(lawnPatch(717+k*97,zone.detail,zone.leaves),mat,list.length);
  for(let i=0;i<list.length;i++){
   const [x,y,z,h,broad]=list[i];
   const yaw=r()*TAU;
   o.position.set(x,y-.013,z);
   normal.set(heightAt(x-.14,z)-heightAt(x+.14,z),.28,heightAt(x,z-.14)-heightAt(x,z+.14)).normalize();
   o.quaternion.setFromUnitVectors(up,normal);
   o.rotateY(yaw);
   o.scale.set(zone.step*(.66+r()*.12),h,zone.step*(.66+r()*.12));
   o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
   const coarse=fbm(x*.075,z*.095,17),fine=noise(x*.42,z*.55,79);
   const blend=clamp(.31+coarse*.40+fine*.08+(r()-.5)*.19,0,1);
   const transition=Math.exp(-Math.pow((z+10)/5.6,2));
   const damp=smoothstepLocal(2,10,z-nearBank(x));
   const swath=noise(x*.18,z*.21,842);
   const wash=.94+.12*noise(x*.15+z*.12,z*.10,191);
   c.copy(deep).lerp(green,blend).multiplyScalar((.86+.17*broad)*wash
     *(1+transition*(swath-.5)*.12-.10*transition*(1-damp))*treeShade(x,z,roots));
   mesh.setColorAt(i,c);
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
  mesh.computeBoundingSphere();scene.add(mesh);
  batches.push({mesh,count:mesh.count});
 }
 return quality=>{
  for(let i=0;i<batches.length;i++){
   const {mesh,count}=batches[i];
   mesh.count=Math.round(count*T.MathUtils.lerp(i===0?.77:.54,1,quality));
  }
 };
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
 const spacing=small?.79:.55;
 for(let x0=-58;x0<58;x0+=spacing){
  for(let d0=1.45;d0<27.0;d0+=spacing){
   const x=x0+r()*spacing,d=d0+r()*spacing,z=farBank(x)-d;
   const y=distantBank(x,z);
   // Never put grass over a mountain surface or in the water.
   if(y<WATER_LEVEL+.21||mountain(x,z)>y-.12)continue;
   const patch=noise(x*.20,z*.24,591);
   const fade=smoothstepLocal(1.4,5.4,d)*(1-smoothstepLocal(11,27,d));
   if(r()>fade*smoothstepLocal(.24,.63,patch)*.94)continue;
   items.push([x,y,z,(.13+.22*r())*(.53+.47*fade),patch]);
  }
 }
 if(!items.length){g.dispose();mat.dispose();return;}
 const mesh=new T.InstancedMesh(g,mat,items.length);
 items.forEach(([x,y,z,h,p],i)=>{
  o.position.set(x,y-.045,z);o.rotation.set(0,r()*TAU,0);
  const w=spacing*(.65+r()*.14);o.scale.set(w,h,w);o.updateMatrix();
  mesh.setMatrixAt(i,o.matrix);
  mesh.setColorAt(i,farBankTint(x,z,y).multiplyScalar(.92+.21*p));
 });
 mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 mesh.computeBoundingSphere();scene.add(mesh);
}

function makeFarShoreStones(scene,small){
 const r=random(136172),o=new T.Object3D(),sites=[];
 const g=new T.IcosahedronGeometry(1,2),p=g.attributes.position;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=.76+.31*fbm(x*2.6,z*2.2+y,519);
  p.setXYZ(i,x*k,y*k,z*k);
 }
 g.computeVertexNormals();
 const n=small?30:55,groups=[-31,-14,9,28,42];
 for(let i=0;i<n;i++){
  const x=groups[i%groups.length]+(r()-.5)*9.5,z=farBank(x)-3.7-r()*3.9,y=distantBank(x,z);
  if(y<WATER_LEVEL+.10||y>.50)continue;
  sites.push([x,y,z,.12+Math.pow(r(),2)*.31]);
 }
 const mat=new T.MeshStandardMaterial({color:"#ffffff",roughness:1,side:T.DoubleSide});
 const mesh=new T.InstancedMesh(g,mat,sites.length),a=new T.Color("#4e6254"),b=new T.Color("#777d68");
 sites.forEach(([x,y,z,size],i)=>{
  o.position.set(x,y-.04,z);o.rotation.set(r()*.35,r()*TAU,r()*.20);
  o.scale.set(size*(1.3+r()*.5),size*.45,size*(.7+r()*.4));o.updateMatrix();
  mesh.setMatrixAt(i,o.matrix);mesh.setColorAt(i,a.clone().lerp(b,r()*.75));
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

function makeFieldTransition(scene,small,heightAt){
 const r=random(55491),o=new T.Object3D(),items=[];
 const centers=[[-26,7],[-18,9],[-10,7.2],[3.5,8.0],[13,6.5],[22,7.8],[30,6.0]];
 for(const [cx,offset] of centers){
  const count=small?18:32;
  for(let j=0;j<count;j++){
   const x=cx+(r()-.5)*3.8,z=nearBank(x)+offset+(r()-.5)*2.5;
   const y=heightAt(x,z);if(y<WATER_LEVEL+.45||z>-6)continue;
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
function makeRiverEdges(scene,small,heightAt){
 const r=random(70061),o=new T.Object3D();
 function shoreAt(x,far){return far?farBank(x):nearBank(x);}
 const n=small?160:300,reed=new T.InstancedMesh(tuftGeometry(927,6,5),new T.MeshStandardMaterial({color:"#ffffff",vertexColors:true,roughness:1,side:T.DoubleSide}),n);
 const a=new T.Color("#465444"),b=new T.Color("#6d7852");
 for(let i=0;i<n;i++){
  const far=i%3!==0;
  let x=(r()-.5)*(far?140:55);
  for(let j=0;j<5&&fbm(x*.25,far?4:1,781)<.47;j++)x=(r()-.5)*(far?140:55);
  const z=shoreAt(x,far)+(far?-1:1)*(.48+Math.pow(r(),2)*1.45),y=(far?distantBank:heightAt)(x,z);
  const h=.13+Math.pow(r(),2)*.43;
  o.position.set(x,y-.015,z);o.rotation.set(0,r()*TAU,0);o.scale.set(h*.86,h,h*.86);o.updateMatrix();reed.setMatrixAt(i,o.matrix);reed.setColorAt(i,a.clone().lerp(b,r()*.9));
 }
 scene.add(reed);
 const stoneGeo=new T.IcosahedronGeometry(1,2),p=stoneGeo.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),m=.78+.27*fbm(x*3,z*3+y,294);p.setXYZ(i,x*m,y*m,z*m);}
 stoneGeo.computeVertexNormals();
 const count=small?90:180,stones=new T.InstancedMesh(stoneGeo,new T.MeshStandardMaterial({color:"#ffffff",roughness:.98}),count);
 const c=new T.Color("#50574c"),d=new T.Color("#7b7566");
 for(let i=0;i<count;i++){
  const x=(r()-.5)*60,far=i%4===0,z=shoreAt(x,far)+(far?-1:1)*(.12+r()*1.14);
  const y=(far?distantBank:heightAt)(x,z),radius=.039+Math.pow(r(),3)*.29;
  o.position.set(x,y-.025,z);o.rotation.set(r()*.28,r()*TAU,r()*.2);o.scale.set(radius*1.3,radius*.42,radius*.9);o.updateMatrix();stones.setMatrixAt(i,o.matrix);stones.setColorAt(i,c.clone().lerp(d,r()));
 }
 scene.add(stones);
}

function makeGroundCover(scene,small,heightAt){
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
   x=(r()<.5?-1:1)*(6+r()*14);z=-17+r()*18;y=heightAt(x,z);
   if(y>-.8&&fbm(x*.22,z*.19,781)>.46&&Math.abs(z+3)>2.2)break;
  }
  const size=.13+r()*.24;
  o.position.set(x,y>-.8&&Math.abs(z+3)>2.2?y-.008:-20,z);o.rotation.set(0,r()*TAU,0);o.scale.set(size,size*(.52+r()*.22),size);o.updateMatrix();m.setMatrixAt(i,o.matrix);
 }
 scene.add(m);
}

function makeRocks(scene,heightAt){
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
   const y=heightAt(x,z),radius=.09+Math.pow(r(),2.8)*.68;
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
   buffer.flex.push(Math.max(0,q.y-buffer.baseY));
   const shade=.73+.23*Math.sin(angle*3+seed)*Math.sin(angle*3+seed)+.12*t;
   buffer.c.push(color.r*shade,color.g*shade,color.b*shade);
   if(i<steps){const a=offset+i*sides+j,e=offset+i*sides+(j+1)%sides;buffer.i.push(a,e,a+sides,e,e+sides,a+sides);}
  }
 }
}

function treeWind(material,wind,leaves=false){
 material.onBeforeCompile=shader=>{
  shader.uniforms.treeTime=wind;
  shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nuniform float treeTime;\nattribute float treeFlex;");
  if(leaves){
   shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
    float leafPhase=dot(instanceMatrix[3].xz,vec2(4.1,3.3));
    transformed.z+=.088*sin(treeTime*2.41+leafPhase)*position.y;
   `);
  }
  const project=T.ShaderChunk.project_vertex.replace("mvPosition = modelViewMatrix",`
    vec2 treePosition=(modelMatrix * mvPosition).xz;
    float gust=sin(treeTime*.81-dot(treePosition,vec2(.27,.34)));
    float flex=treeFlex*treeFlex;
    mvPosition.x+=.0037*flex*gust;
    mvPosition.z+=.0024*flex*gust;
    mvPosition = modelViewMatrix
  `);
  shader.vertexShader=shader.vertexShader.replace("#include <project_vertex>",project);
 };
 material.customProgramCacheKey=()=>leaves?"leaf-wind":"branch-wind";
 return material;
}
function branchMesh(data,wind){
 const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(data.p,3));g.setAttribute("color",new T.Float32BufferAttribute(data.c,3));g.setIndex(data.i);g.computeVertexNormals();
 g.setAttribute("treeFlex",new T.Float32BufferAttribute(data.flex,1));
 return new T.Mesh(g,treeWind(new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}),wind));
}
function curveOf(a,b,c){return new T.CatmullRomCurve3([a,b,c]);}
// Deciduous woodland, with the original memory tree kept separately.
function makeWoodland(scene,small,heightAt,wind,distant=false){
 const r=random(distant?731459:839127),data={p:[],c:[],i:[],flex:[],baseY:0},clusters=[],roots=[],o=new T.Object3D();
 const bark=new T.Color("#594b40"),dark=new T.Color("#2b4b39"),light=new T.Color("#648267");
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
  const y=heightAt(x,z);
  if(y<WATER_LEVEL+.53||(!distant&&Math.hypot(x-memoryX,z+10.8)<3.5))return;
  roots.push({x,z,radius:height*.47});
  data.baseY=y;
  const spread=height*((distant?.44:.32)+r()*.11),lean=(r()-.5)*height*.16,leanZ=(r()-.5)*height*.10;
  const base=new T.Vector3(x,y-.074,z),mid=new T.Vector3(x+lean*.24,y+height*.32,z+leanZ*.25);
  const tip=new T.Vector3(x+lean,y+height*.70,z+leanZ);
  const trunk=curveOf(base,mid,tip);
  const radius=height*(.040+r()*.009);
  addBranch(data,trunk,radius,.020*height,distant?8:16,distant?7:10,bark,seed);
  for(let k=0;k<4;k++){
   const angle=k*TAU/4+r()*.6,dx=Math.cos(angle),dz=Math.sin(angle);
   const ex=x+dx*radius*2.5,ez=z+dz*radius*2.5;
   const e=new T.Vector3(ex,heightAt(ex,ez)-.052,ez);
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
    const size=height*((distant?.125:.083)+r()*.049);
    const tuftCount=distant?4:3;
    for(let j=0;j<tuftCount;j++){
     const t=.32+j*.66/(tuftCount-1);
     clusters.push({center:curve.getPointAt(t),size:size*(.72+r()*.48),baseY:y,tone:.18+r()*.64,seed:r()*10000});
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
  const main=(distant?4:6)+Math.floor(r()*2),rotation=r()*TAU;
  for(let k=0;k<main;k++){
   const t=.36+.61*k/(main-1),angle=k*2.399963+rotation;
   const d=new T.Vector3(Math.cos(angle)*(.78+.14*r()),.53+.26*r(),Math.sin(angle)*(.78+.14*r())).normalize();
   grow(trunk.getPointAt(t),d,spread*(.78+r()*.28)*(1-.19*t),radius*(.37-.12*t),distant?1:2);
  }
  grow(tip,new T.Vector3(lean*.20,1,leanZ*.20).normalize(),height*.22,radius*.23,distant?1:2);
 }
 if(distant){
  // Irregular little groves with openings through to the mountains.
  const groves=[[-46,4],[-31,5],[-18,4],[-5,4],[8,5],[21,3],[35,5],[49,4]];
  const mountains=mountainHeight(87,-61,17,15);
  const placed=[];
  let seed=0;
  for(const [center,count] of groves){
   for(let j=0;j<(small?Math.max(2,count-1):count);j++){
    for(let attempt=0;attempt<12;attempt++){
     const x=center+(r()-.5)*13,z=farBank(x)-2.7-r()*18;
     if(placed.some(q=>Math.hypot(q[0]-x,q[1]-z)<2.4))continue;
     const y=heightAt(x,z);
     if(y<WATER_LEVEL+.46||mountains(x,z)>y-.09)continue;
     const h=1.20+Math.pow(r(),1.4)*1.86;
     placed.push([x,z]);makeTree(x,z,h,++seed);break;
    }
   }
  }
 }else sites.forEach(([x,z,h],i)=>makeTree(x,Math.max(z,nearBank(x)+5.5),h,i+1));
 if(!clusters.length)return roots;
 const branches=branchMesh(data,wind);
 if(distant)branches.layers.enable(1);
 scene.add(branches);
 // Small folded, oval leaves, geometrically rendered with standard instance
 // colors. Use many overlapping leaves instead of balls, disks or image cards.
 const p=[],idx=[],cols=[],segments=distant?2:4;
 for(let i=0;i<=segments;i++){
  const t=i/segments,w=.47*Math.pow(Math.sin(t*Math.PI),.85),y=t-.5,fold=.13*Math.sin(t*Math.PI);
  p.push(-w,y,0,0,y,fold,w,y,0);
  cols.push(.79,.85,.76,1.04,1.07,.96,.87,.93,.83);
  if(i<segments){const k=i*3;idx.push(k,k+1,k+3,k+1,k+4,k+3,k+1,k+2,k+4,k+2,k+5,k+4);}
 }
 const g=new T.BufferGeometry();
 g.setAttribute("position",new T.Float32BufferAttribute(p,3));
 g.setAttribute("color",new T.Float32BufferAttribute(cols,3));
 g.setIndex(idx);g.computeVertexNormals();
 const m=treeWind(new T.MeshBasicMaterial({color:"#ffffff",vertexColors:true,side:T.DoubleSide,toneMapped:false,fog:true}),wind,true);
 const countPer=distant?(small?21:28):(small?23:35);
 const heights=new Float32Array(clusters.length*countPer);
 const mesh=new T.InstancedMesh(g,m,clusters.length*countPer);
 let i=0;
 for(const c of clusters){
  for(let j=0;j<countPer;j++){
   const az=j*2.399963+c.seed,vertical=2*r()-1,radial=Math.sqrt(1-vertical*vertical),radius=Math.cbrt(r())*c.size;
   const dx=Math.cos(az)*radial,dz=Math.sin(az)*radial;
   o.position.copy(c.center).add(new T.Vector3(dx*radius*1.23,vertical*radius*.75,dz*radius));
   o.rotation.set((r()-.5)*2.7,r()*TAU,(r()-.5)*2.6);
   const leaf=c.size*(.22+r()*.30);
   o.scale.set(leaf*.85,leaf,leaf);o.updateMatrix();
   mesh.setMatrixAt(i,o.matrix);
   heights[i]=Math.max(0,o.position.y-c.baseY);
   mesh.setColorAt(i,dark.clone().lerp(light,clamp(c.tone+vertical*.14+(r()-.5)*.22,0,1)).multiplyScalar(.67+.27*r()));
   i++;
  }
 }
 mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 g.setAttribute("treeFlex",new T.InstancedBufferAttribute(heights,1));
 mesh.computeBoundingSphere();
 if(distant)mesh.layers.enable(1);
 scene.add(mesh);
 return roots;
}
function makeMemoryTree(scene,small,heightAt,wind){
 const r=random(193781),group=new T.Group(),data={p:[],c:[],i:[],flex:[],baseY:0};
 const x=small?-3.8:-7.8,z=-10.8;group.position.set(x,heightAt(x,z)-.045,z);
 const bark=new T.Color("#64524b"),twigs=[];
 const root=new T.Vector3(0,0,0),baseTip=new T.Vector3(.12,2.65,-.10);
 const trunk=curveOf(root,new T.Vector3(-.17,1.35,.12),baseTip);
 addBranch(data,trunk,.255,.065,18,12,bark,1);
 // Flared roots blend into the ground instead of the trunk ending at a flat disk.
 for(let i=0;i<6;i++){
  const a=i*TAU/6+r()*.35,len=.47+r()*.34;
  const dx=Math.cos(a)*len,dz=Math.sin(a)*len;
  const end=new T.Vector3(dx,heightAt(x+dx,z+dz)-group.position.y-.055,dz);
  addBranch(data,curveOf(new T.Vector3(0,.19,0),end.clone().multiplyScalar(.5).add(new T.Vector3(0,.035,0)),end),.095,.008,7,7,bark,i);
 }
 function grow(a,d,len,rad,depth){
  const end=a.clone().addScaledVector(d,len),mid=a.clone().lerp(end,.47).add(new T.Vector3((r()-.5)*len*.22,-len*.07,(r()-.5)*len*.22));
  const curve=curveOf(a,mid,end);
  addBranch(data,curve,rad,rad*.31,depth>1?8:5,depth>1?7:5,bark,r()*TAU);
  if(depth<1){twigs.push(curve);return;}
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
 group.add(branchMesh(data,wind));
 const leafGeo=new T.BufferGeometry(),lp=[],li=[],lc=[];
 for(let i=0;i<=8;i++){
  const t=i/8,w=.048*Math.sin(t*Math.PI)**.77,y=(t-.5)*.16;
  lp.push(-w,y,.011*Math.sin(t*Math.PI),0,y,.024*Math.sin(t*Math.PI),w,y,.011*Math.sin(t*Math.PI));
  lc.push(.72,.78,.72,.95,1,.93,.78,.84,.78);
  if(i<8){const a=i*3;li.push(a,a+1,a+3,a+1,a+4,a+3,a+1,a+2,a+4,a+2,a+5,a+4);}
 }
 leafGeo.setAttribute("position",new T.Float32BufferAttribute(lp,3));leafGeo.setAttribute("color",new T.Float32BufferAttribute(lc,3));leafGeo.setIndex(li);leafGeo.computeVertexNormals();
 const mat=treeWind(new T.MeshStandardMaterial({color:"#ffffff",vertexColors:true,emissive:"#407568",emissiveIntensity:.26,roughness:.85,side:T.DoubleSide}),wind,true);
 const each=small?18:29,leaves=new T.InstancedMesh(leafGeo,mat,twigs.length*each),o=new T.Object3D();
 const a=new T.Color("#486b59"),b=new T.Color("#94b49a"),Y=new T.Vector3(0,1,0);
 const heights=new Float32Array(leaves.count);
 let k=0;
 for(const twig of twigs){
  for(let i=0;i<each;i++){
   const t=.23+r()*.77,origin=twig.getPointAt(t),angle=i*2.399963;
   const d=new T.Vector3(Math.cos(angle),.20+r()*.55,Math.sin(angle)).normalize();
   o.position.copy(origin).addScaledVector(d,.06+r()*.12);o.quaternion.setFromUnitVectors(Y,d);o.rotateY(r()*.9);
   const scale=.62+r()*.68;o.scale.set(scale,scale,scale);o.updateMatrix();leaves.setMatrixAt(k,o.matrix);heights[k]=o.position.y;leaves.setColorAt(k++,a.clone().lerp(b,r()));
  }
 }
 leafGeo.setAttribute("treeFlex",new T.InstancedBufferAttribute(heights,1));
 group.add(leaves);scene.add(group);return {group,mat,leaves};
}
function contactShadow(radiusX,radiusZ,strength,heightAt){
  const g=new T.PlaneGeometry(radiusX*2,radiusZ*2,12,12);g.rotateX(-Math.PI/2);
  const m=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{strength:{value:strength}},vertexShader:`
    varying vec2 coord;void main(){coord=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `,fragmentShader:`
    varying vec2 coord;uniform float strength;void main(){float a=exp(-dot(coord,coord)*4.2);a*=1.-smoothstep(.62,1.,length(coord));gl_FragColor=vec4(.012,.018,.027,a*strength);}
  `});
  const mesh=new T.Mesh(g,m);mesh.renderOrder=2;
  const p=g.attributes.position,base=Float32Array.from(p.array);
  return {mesh,place(x,z,scale=1){mesh.position.set(x,0,z);mesh.scale.set(scale,1,scale);for(let i=0;i<p.count;i++){const px=base[i*3],pz=base[i*3+2];p.setY(i,heightAt(x+px*scale,z+pz*scale)+.025);}p.needsUpdate=true;g.computeBoundingSphere();},dispose(){g.dispose();m.dispose();}};
}

// A subtle ribbon of animated water vapour. The translucent surface follows
// the far shore, with zero opacity at both ends and at its top and base.
function makeValleyMist(){
 const p=[],uv=[],idx=[],n=120;
 for(let i=0;i<=n;i++){
  const u=i/n,x=(u-.5)*142,z=farBank(x)+1.25;
  p.push(x,WATER_LEVEL+.10,z,x,WATER_LEVEL+.96+.71*noise(x*.092,0,37),z-.75);
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
   float drift=.55+.25*sin(x*36.-time*.11+sin(x*14.)*1.8)+.20*sin(x*78.+time*.07);
   float pockets=smoothstep(.28,.83,drift+.11*sin(x*141.+y*2.));
   float alpha=envelope*pockets*.084;
   gl_FragColor=vec4(.105,.157,.205,alpha);
   #include <colorspace_fragment>
  }
 `});
 const mesh=new T.Mesh(g,material);mesh.renderOrder=1;return mesh;
}

export function createLiveOverlook(){
 const small=window.innerWidth<760;
 const renderer=new T.WebGLRenderer({antialias:!small,powerPreference:"high-performance",alpha:false,preserveDrawingBuffer:true});
 renderer.setPixelRatio(1);
 renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.07;
 const scene=new T.Scene();
 scene.fog=new T.FogExp2(fogColor,.009);
 const camera=new T.PerspectiveCamera(49,1,.1,700);
 camera.position.set(0,4.31,15);
 let aimY=10.6;
 camera.lookAt(0,aimY,-48);
 const ambient=new T.HemisphereLight("#cbd7ff","#445446",1.45);
 const moonlight=new T.DirectionalLight("#c6dcff",2.15);
 moonlight.position.set(-28,19,-30);
 const rim=new T.DirectionalLight("#d9bfdf",.50);
 rim.position.set(35,8,-40);
 const sky=makeSky(small),stars=makeStars(random(83921),small);
 const ranges=[
  meshTerrain(240,112,small?146:180,-142,mountainHeight(11,-143,42,29),"#263953","#8496be"),
  meshTerrain(200,90,small?124:156,-99,mountainHeight(47,-99,30,23),"#21354e","#56758e"),
  meshTerrain(155,62,small?110:132,-60,mountainHeight(87,-61,17,15),"#1c313d","#4b696d")
 ];
 for(const object of [ambient,moonlight,rim,sky,stars,...ranges]){
  object.layers.enable(1);
  scene.add(object);
 }
 const farTerrain=makeFarBank(small),wind={value:0};
 const meadow=meshTerrain(MEADOW_WIDTH,MEADOW_DEPTH,small?172:226,MEADOW_CENTER,ground,"#264b23","#608b40");
 const heightAt=meadowSampler(meadow);
 const lake=makeRiver({small,nearBank,farBank,ground,foothill:distantBank,level:WATER_LEVEL,fogColor});
 const mist=makeValleyMist(),meteors=makeMeteorLights();
 scene.add(meadow,farTerrain,lake.mesh,mist,meteors.mesh);
 const meadowTrees=makeWoodland(scene,small,heightAt,wind);
 const farTrees=makeWoodland(scene,small,distantBank,wind,true);
 const tree=makeMemoryTree(scene,small,heightAt,wind);
 meadowTrees.push({x:tree.group.position.x,z:tree.group.position.z,radius:1.8});
 shadeTerrainAtTrees(meadow,meadowTrees);
 shadeTerrainAtTrees(farTerrain,farTrees);
 const setGrassQuality=makeMeadow(scene,small,heightAt,meadowTrees,wind);
 makeDistantGroundCover(scene,small);
 makeFarShoreStones(scene,small);
 makeRocks(scene,heightAt);
 makeRiverEdges(scene,small,heightAt);
 makeFieldTransition(scene,small,heightAt);
 makeGroundCover(scene,small,heightAt);

 const people=new Map();
 const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
 const qualityLevels=[1,.83,.69];
 let w=0,h=0,last=-Infinity,previousTick=0,dead=false;
 let qualityIndex=0,samples=0,slowFrames=0;
 function restore(){
  last=-Infinity;
  lake.invalidate();
 }
 renderer.domElement.addEventListener("webglcontextrestored",restore);

 function render(ctx,width,height,ms,peers,count,activeMeteors){
  if(dead||renderer.getContext().isContextLost())return false;
  const portrait=width<760,reduced=motion.matches;
  const tick=ms-previousTick;
  previousTick=ms;
  if(tick>0&&tick<1000&&!document.hidden){
   samples++;
   if(tick>(portrait?46:36))slowFrames++;
   if(samples>=28){
    if(slowFrames>samples*.46&&qualityIndex<qualityLevels.length-1){
     qualityIndex++;
     setGrassQuality(1-qualityIndex*.36);
     lake.invalidate();
    }
    samples=slowFrames=0;
   }
  }else{
   samples=slowFrames=0;
  }
  const quality=qualityLevels[qualityIndex];
  const scale=Math.min(portrait?1:1.16,Math.sqrt((portrait?545000:1210000)/Math.max(1,width*height)))*quality;
  const nw=Math.max(1,Math.round(width*scale)),nh=Math.max(1,Math.round(height*scale));
  if(nw!==w||nh!==h){
   w=nw;h=nh;
   renderer.setSize(w,h,false);
   camera.aspect=width/height;
   camera.updateProjectionMatrix();
   last=-Infinity;
  }
  if(ms-last>=1000/(portrait?30:32)-.8){
   const dt=Number.isFinite(last)?Math.min(.12,(ms-last)*.001):.033;
   const t=reduced?0:ms*.001;
   sky.material.uniforms.detail.value=qualityIndex===0?1:0;
   stars.material.uniforms.time.value=t;
   stars.material.uniforms.scale.value=Math.max(.83,scale);
   lake.material.uniforms.time.value=t;
   wind.value=t;
   mist.material.uniforms.time.value=t;
   tree.mat.emissiveIntensity=.21+Math.min(.96,count*.013)+.055*Math.sin(t*.8);
   for(const [id,visitor] of people){
    if(!peers.some(peer=>peer.id===id)){
     scene.remove(visitor.root,visitor.shadow.mesh);
     people.delete(id);
     visitor.shadow.dispose();
     visitor.dispose();
    }
   }
   const close=peers.length>0;
   const distance=close?(small?10.4:12.5):15;
   const settle=reduced?1:Math.min(1,dt*3.2);
   camera.position.z+=(distance-camera.position.z)*settle;
   camera.position.y+=((close?3.77:4.31)-camera.position.y)*settle;
   aimY+=((close?7.18:10.6)-aimY)*settle;
   camera.lookAt(0,aimY,-48);
   const span=2*(camera.position.z+3.0)*Math.tan(camera.fov*Math.PI/360)*camera.aspect;
   const time=Date.now();
   for(const p of peers){
    let visitor=people.get(p.id);
    if(!visitor){
     visitor=createHuman(p.hue);
     visitor.shadow=contactShadow(.75,.85,.58,heightAt);
     people.set(p.id,visitor);
     scene.add(visitor.root,visitor.shadow.mesh);
    }
    const x=(p.x-.5)*span*.98;
    const z=-3.0-(portrait&&peers.length>4?(Math.round(p.x*100)%2)*.48:0);
    visitor.root.position.set(x,heightAt(x,z)+.04,z);
    visitor.root.scale.setScalar(portrait&&peers.length>5?.86:1.06);
    const shadowSize=p.pose==="lie"?1.35:.95;
    if(x!==visitor.shadow.x||z!==visitor.shadow.z||shadowSize!==visitor.shadow.size){
     visitor.shadow.place(x,z,shadowSize);
     Object.assign(visitor.shadow,{x,z,size:shadowSize});
    }
    visitor.update(p,t,time,dt,reduced);
    if(p.pose==="lie")visitor.root.position.y+=.22;
   }
   lake.reflect(renderer,scene,camera,ms,quality,reduced);
   meteors.update(activeMeteors,width,height);
   renderer.render(scene,camera);
   last=ms;
  }
  ctx.drawImage(renderer.domElement,0,0,width,height);
  return true;
 }

 function dispose(){
  if(dead)return;
  dead=true;
  renderer.domElement.removeEventListener("webglcontextrestored",restore);
  lake.dispose();
  for(const visitor of people.values()){
   scene.remove(visitor.root,visitor.shadow.mesh);
   visitor.shadow.dispose();
   visitor.dispose();
  }
  people.clear();
  const geometries=new Set(),materials=new Set();
  scene.traverse(object=>{
   if(!object.isMesh&&!object.isPoints)return;
   if(object.isInstancedMesh)object.dispose();
   if(object.geometry&&!object.geometry.userData.sharedHuman)geometries.add(object.geometry);
   if(Array.isArray(object.material))object.material.forEach(material=>materials.add(material));
   else materials.add(object.material);
  });
  geometries.forEach(geometry=>geometry.dispose());
  materials.forEach(material=>material.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
 }
 return {render,dispose};
}
