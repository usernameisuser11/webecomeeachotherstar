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
function ground(x,z){
  const bank=-20.5+3.6*Math.cos(x*.12)+4.1*(noise(x*.085,0,113)-.5);
  const t=clamp((z-bank)/8,0,1),shore=t*t*(3-2*t);
  const broad=-.72+1.42*Math.exp(-Math.pow((z-3)/24,2));
  const detail=.32*(fbm(x*.085,z*.085,39)-.5)+.065*Math.sin(x*.28+z*.17);
  return -2.35+shore*(2.35+broad+detail);
}
const fogColor=new T.Color("#354c71");
function meshTerrain(width,depth,segments,z0,height,low,high){
  const meadow=height===ground;
  const geo=new T.PlaneGeometry(width,depth,segments,Math.round(segments*.64));geo.rotateX(-Math.PI/2);
  const a=geo.attributes.position,col=[],c0=new T.Color(low),c1=new T.Color(high);
  for(let i=0;i<a.count;i++){
    const x=a.getX(i),z=a.getZ(i)+z0,y=height(x,z);
    a.setXYZ(i,x,y,z);
    const coarse=fbm(x*.075,z*.095,17),fine=fbm(x*.42,z*.55,79);
    const shade=clamp(.18+coarse*.44+fine*.19+(meadow?0:(y+1)*.018),0,1);
    const c=c0.clone().lerp(c1,shade);
    if(meadow){
      const worn=Math.exp(-Math.pow((z+3)/3.6,2))*Math.exp(-Math.pow(x/10,4));
      c.lerp(new T.Color("#586348"),worn*.22);
      if(y<-.9)c.lerp(new T.Color("#494a3e"),clamp((-.9-y)*.7,0,.7));
    }
    col.push(c.r,c.g,c.b);
  }
  geo.setAttribute("color",new T.Float32BufferAttribute(col,3));geo.computeVertexNormals();
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
function makeSky(){
  const geo=new T.SphereGeometry(340,32,20);
  const mat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{time:{value:0}},vertexShader:`
    varying vec3 dir;
    void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `,fragmentShader:`
    precision highp float;
    varying vec3 dir;uniform float time;
    float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fb(vec3 p){float v=0.,a=.53;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec3(11.4,7.2,5.1);a*=.48;}return v;}
    void main(){
      vec3 d=normalize(dir);float alt=max(0.,d.y);
      vec3 col=mix(vec3(.105,.127,.245),vec3(.007,.015,.051),smoothstep(0.,.64,alt));
      float warm=pow(max(0.,1.-abs(d.y+.03)*5.),2.)*pow(max(0.,d.x*.5+.5),2.);
      col+=vec3(.14,.056,.045)*warm;
      vec3 normal=normalize(vec3(.62,.32,.39));float band=dot(d,normal);
      float twist=(fb(d*11.)-.5)*.14;
      float core=exp(-pow((band+twist)*8.5,2.));
      float veil=exp(-pow((band+twist)*3.6,2.));
      float neb=fb(d*24.+vec3(0,1,5));
      float dust=smoothstep(.37,.78,fb(d*57.+4.));
      col+=veil*vec3(.025,.043,.105)*(neb+.25);
      col+=core*vec3(.16,.105,.24)*(.15+neb*1.35)*(1.-dust*.86);
      col+=core*vec3(.11,.115,.18)*pow(max(0.,neb),2.);
      float horizon=exp(-abs(d.y+.025)*10.);
      col+=vec3(.04,.054,.081)*horizon;
      gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
    }
  `});
  const m=new T.Mesh(geo,mat);m.renderOrder=-100;return m;
}
function makeStars(rand){
  const p=[],sizes=[],phases=[],colors=[],a=new T.Color("#b8d7ff"),b=new T.Color("#fff0d2");
  for(let i=0;i<7800;i++){
    let x,y,z;
    if(i<4700){x=(rand()-.5)*2;y=rand()*.9+.025;z=-.22-rand()*1.5;}
    else {x=(rand()-.5)*1.8;y=rand()*.76;z=-(.55+rand());y=clamp(y+(.22-x*.34),.02,.96);}
    const v=new T.Vector3(x,y,z).normalize().multiplyScalar(270);
    p.push(v.x,v.y,v.z);sizes.push(.65+Math.pow(rand(),6)*2.15);phases.push(rand()*TAU);
    const c=a.clone().lerp(b,Math.pow(rand(),2));colors.push(c.r,c.g,c.b);
  }
  const geo=new T.BufferGeometry();geo.setAttribute("position",new T.Float32BufferAttribute(p,3));geo.setAttribute("size",new T.Float32BufferAttribute(sizes,1));geo.setAttribute("phase",new T.Float32BufferAttribute(phases,1));geo.setAttribute("color",new T.Float32BufferAttribute(colors,3));
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{time:{value:0},scale:{value:1}},vertexShader:`
    attribute float size,phase;attribute vec3 color;varying vec3 tint;varying float ph;
    uniform float scale;void main(){tint=color;ph=phase;gl_PointSize=size*scale;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `,fragmentShader:`
    varying vec3 tint;varying float ph;uniform float time;
    void main(){float r=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-r),1.8)*(.57+.36*sin(time*.75+ph));gl_FragColor=vec4(tint,a);}
  `});
  return new T.Points(geo,material);
}
function makeLake(){
  const mat=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{time:{value:0}},vertexShader:`
   varying vec2 p;uniform float time;
   void main(){p=position.xy;vec3 q=position;q.z+=.036*sin(p.x*.6+p.y*.23+time*.6)+.016*sin(p.y*1.5-p.x*.4-time*.5);gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.);}
  `,fragmentShader:`
   precision highp float;varying vec2 p;uniform float time;
   void main(){float w=sin(p.y*2.7+p.x*.41+time*.7+sin(p.x*.29+p.y*.14-time*.3)*1.6);float q=sin(p.y*5.2-p.x*.75-time*.9);
     float crossed=sin(p.x*1.7+p.y*3.1-time*.52+sin(p.x*.42+p.y*.33)*2.);
     float glint=pow(max(0.,w*.53+q*.29+crossed*.18),9.);
     float stripe=exp(-abs(p.x+sin(p.y*.19+time*.13)*2.+sin(p.y*.06)*4.)*.085);
     float farWater=smoothstep(-40.,40.,p.y);
     vec3 c=mix(vec3(.014,.034,.055),vec3(.039,.065,.115),farWater);
     c+=vec3(.065,.095,.14)*(.5+.5*w)*(.11+.10*farWater);
     c+=vec3(.20,.25,.36)*glint*(.045+.19*stripe);gl_FragColor=vec4(c,1.);
     #include <colorspace_fragment>
   }
  `});
  const mesh=new T.Mesh(new T.PlaneGeometry(160,130,75,55),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(0,-1.52,-62);return mesh;
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
   const light=.46+.54*Math.pow(t,.67);
   for(let k=0;k<3;k++){col.push(light*.94,light,light*.92);flex.push(t);}
   if(j<segments){const k=base+j*3;ids.push(k,k+3,k+1,k+1,k+3,k+4,k+1,k+4,k+2,k+2,k+4,k+5);}
  }
 }
 const g=new T.BufferGeometry();
 g.setAttribute("position",new T.Float32BufferAttribute(p,3));g.setAttribute("color",new T.Float32BufferAttribute(col,3));
 g.setAttribute("bladeFlex",new T.Float32BufferAttribute(flex,1));g.setIndex(ids);g.computeVertexNormals();return g;
}
function makeMeadow(scene,rand,small){
 const wind={value:0},local=random(923781),o=new T.Object3D();
 const m=new T.MeshStandardMaterial({color:"#ffffff",vertexColors:true,side:T.DoubleSide,roughness:.93});
 m.onBeforeCompile=shader=>{
   shader.uniforms.wind=wind;
   shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nuniform float wind;\nattribute float bladeFlex;\nvarying float vBladeTip;")
   .replace("#include <begin_vertex>",`#include <begin_vertex>
      vBladeTip=bladeFlex;
      #ifdef USE_INSTANCING
        vec2 p=instanceMatrix[3].xz;
        float mainWave=sin(wind*.78-p.x*.24-p.y*.15);
        float gust=pow(.5+.5*sin(wind*.30-p.x*.16-p.y*.10),3.);
        float fine=sin(wind*1.9+p.x*.87-p.y*.59);
        float f=bladeFlex*bladeFlex;
        // Keep the roots fixed while a broad gust moves across the meadow.
        vec2 sway=vec2(.15*mainWave+.12*gust+.027*fine,.065*mainWave+.035*fine)*f;
        vec3 worldSway=vec3(sway.x,0.,sway.y);
        vec3 xAxis=normalize(instanceMatrix[0].xyz);
        vec3 zAxis=normalize(instanceMatrix[2].xyz);
        transformed.x+=dot(worldSway,xAxis);
        transformed.z+=dot(worldSway,zAxis);
        transformed.y-=f*.024*gust;
      #endif`);
   shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nvarying float vBladeTip;")
    .replace("#include <color_fragment>",`#include <color_fragment>
      diffuseColor.rgb*=mix(vec3(.88,.91,.91),vec3(1.09,1.06,.97),pow(vBladeTip,1.6));
    `)
    .replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
      totalEmissiveRadiance+=diffuseColor.rgb*vec3(.08,.11,.15)*pow(vBladeTip,2.);
    `);
 };
 m.customProgramCacheKey=()=>"soft-tuft-meadow-v1";
 const dark=new T.Color("#486451"),light=new T.Color("#7d9471"),dry=new T.Color("#8b8469"),c=new T.Color();
 const counts=small?[1150,1050,850]:[2150,1800,1550];
 for(let group=0;group<3;group++){
  const g=tuftGeometry(781+group*71,group===0?5:group===1?4:3,group===0?6:4);
  const mesh=new T.InstancedMesh(g,m,counts[group]);
  for(let i=0;i<counts[group];i++){
   let x=0,z=0,patch=0,y=-3;
   for(let attempt=0;attempt<12;attempt++){
    x=(local()-.5)*44;z=-17.8+local()*31;
    y=ground(x,z);patch=fbm(x*.29,z*.32,87);
    if(y>-.95&&local()<.22+.72*patch)break;
   }
   const seat=Math.exp(-Math.pow((z+3)/3.5,2))*Math.exp(-Math.pow(x/13,4));
   const near=clamp((z-3)/9,0,1),edge=clamp((Math.abs(x)-7)/13,0,1);
   const height=y<-.95?0:(.043+Math.pow(local(),2.5)*(.135+.075*edge))*(.72+.57*patch)*(1-.72*seat)*(1-.55*near);
   const spread=height*(.68+local()*.38);
   o.position.set(x,y-.01,z);o.rotation.set(0,local()*TAU,0);o.scale.set(spread,height,spread);o.updateMatrix();
   // Zero-size rejected locations are hidden by the mesh scale.
   if(height===0){o.position.y=-20;o.scale.setScalar(.0001);o.updateMatrix();}
   mesh.setMatrixAt(i,o.matrix);
   c.copy(dark).lerp(light,Math.pow(local(),1.35)*.8).lerp(dry,local()*.14);mesh.setColorAt(i,c);
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;scene.add(mesh);
 }
 // Small wildflowers grow in irregular patches away from the seating strip.
 const flowerCount=small?65:130;
 const petalGeo=new T.SphereGeometry(.035,9,6);
 const petals=new T.InstancedMesh(petalGeo,new T.MeshStandardMaterial({roughness:.85}),flowerCount*5);
 const stems=new T.InstancedMesh(new T.CylinderGeometry(.0035,.005,1,5),new T.MeshStandardMaterial({color:"#667b57",roughness:1}),flowerCount);
 const centers=new T.InstancedMesh(new T.SphereGeometry(.013,7,5),new T.MeshStandardMaterial({color:"#d4b890",roughness:.84}),flowerCount);
 const palette=["#a99ac5","#c3cedc","#d8b99b","#a3aecb"].map(v=>new T.Color(v));
 for(let i=0;i<flowerCount;i++){
   let x,z,y;
   for(let j=0;j<14;j++){
    x=(local()-.5)*34;z=-15+local()*22;y=ground(x,z);
    if(y>-.85&&Math.abs(z+3)>3.1&&fbm(x*.21,z*.28,177)>.41)break;
   }
   if(y<-.85||Math.abs(z+3)<3.1)y=-20;
   const h=.055+local()*.10;
   o.position.set(x,y+h*.5,z);o.rotation.set(0,0,0);o.scale.set(1,h,1);o.updateMatrix();stems.setMatrixAt(i,o.matrix);
   o.position.set(x,y+h,z);o.scale.set(1,.58,1);o.updateMatrix();centers.setMatrixAt(i,o.matrix);
   for(let j=0;j<5;j++){
    const a=j*TAU/5+i*2.39;
    o.position.set(x+Math.cos(a)*.022,y+h,z+Math.sin(a)*.022);
    o.rotation.set(.13*Math.cos(a),-a,.12*Math.sin(a));o.scale.set(.90,.22,.44);o.updateMatrix();
    petals.setMatrixAt(i*5+j,o.matrix);petals.setColorAt(i*5+j,palette[i%4]);
   }
 }
 scene.add(stems,petals,centers);return wind;
}
function makeRocks(scene,rand){
  const geo=new T.IcosahedronGeometry(1,2),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=.83+.25*fbm(x*3,z*3+y,82);p.setXYZ(i,x*k,y*k,z*k);}
  geo.computeVertexNormals();const mesh=new T.InstancedMesh(geo,new T.MeshStandardMaterial({color:"#67737b",roughness:.98}),55),o=new T.Object3D();
  for(let i=0;i<55;i++){let x=(rand()-.5)*48,z=-16+rand()*30,r=.16+Math.pow(rand(),3)*1.1;if(Math.abs(z+3.0)<1.7)z+=2.8;o.position.set(x,ground(x,z)-.12,z);o.scale.set(r*1.5,r*.62,r);o.rotation.set(rand()*.4,rand()*TAU,rand()*.4);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);}
  scene.add(mesh);
}
// Volumetric woodland: tapered wood, uneven boughs and many individual needle blades.
function makeWoodland(scene,rand,small){
 const o=new T.Object3D(),Y=new T.Vector3(0,1,0);
 const wood=[],twigs=[],needles=[];
 const barkColors=["#403e43","#504447","#34373d"].map(x=>new T.Color(x));
 const greenColors=["#355b58","#43655c","#587a67","#78917a"].map(x=>new T.Color(x));
 const segment=(list,a,b,r,c)=>{
  const d=b.clone().sub(a),length=d.length();
  if(length<.001)return;
  o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(Y,d.normalize());o.scale.set(r,length,r);o.updateMatrix();list.push([o.matrix.clone(),c]);
 };
 const n=small?23:45;
 for(let k=0;k<n;k++){
  const side=k%2?1:-1,x=side*(4.5+Math.pow(rand(),1.35)*27),z=-9-rand()*19;
  const y=ground(x,z),h=2.3+Math.pow(rand(),1.6)*4.4;
  const base=new T.Vector3(x,y,z),tip=new T.Vector3(x+(rand()-.5)*.55,y+h,z+(rand()-.5)*.5);
  segment(wood,base,tip,.065+h*.014,barkColors[k%3]);
  const rings=6+Math.floor(rand()*5);
  for(let j=0;j<rings;j++){
   const t=.26+j/rings*.72,center=base.clone().lerp(tip,t);
   const size=h*(.19*Math.pow(1-t,.72)+.023);
   const count=4+Math.floor(rand()*3);
   for(let q=0;q<count;q++){
    const a=q*TAU/count+j*2.39+(rand()-.5)*.7;
    const end=center.clone().add(new T.Vector3(Math.cos(a)*size*(.7+rand()*.65),-size*.15+rand()*.17,Math.sin(a)*size*(.7+rand()*.65)));
    const bend=center.clone().lerp(end,.46).add(new T.Vector3(0,-size*.13,0));
    segment(twigs,center,bend,.018+(1-t)*.021,barkColors[(k+j)%3]);segment(twigs,bend,end,.014,barkColors[k%3]);
    const direction=end.clone().sub(center).normalize();
    for(let l=0;l<4;l++){
     const stem=bend.clone().lerp(end,(l+.25)/4);
     const outward=new T.Vector3(-direction.z,0,direction.x).multiplyScalar((l%2?1:-1)*size*.18);
     const e=stem.clone().add(outward).addScaledVector(direction,size*.17).add(new T.Vector3(0,.05+rand()*.09,0));
     const d=e.clone().sub(stem);
     o.position.copy(stem);o.quaternion.setFromUnitVectors(Y,d.clone().normalize());o.scale.set(size*.53,d.length()+size*.24,size*.53);o.updateMatrix();
     needles.push([o.matrix.clone(),greenColors[Math.floor(rand()*greenColors.length)]]);
    }
   }
  }
 }
 const twigGeo=new T.CylinderGeometry(.32,1,1,7,2);
 const woodMat=new T.MeshStandardMaterial({color:"#ffffff",roughness:.99});
 function inst(geo,mat,list){const m=new T.InstancedMesh(geo,mat,list.length);list.forEach(([matrix,c],i)=>{m.setMatrixAt(i,matrix);m.setColorAt(i,c);});m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;scene.add(m);}
 inst(twigGeo,woodMat,wood);inst(twigGeo,woodMat,twigs);
 const positions=[],indices=[];
 for(let j=0;j<38;j++){
  const angle=j*2.399963,originY=.07+rand()*.80,len=.20+rand()*.37;
  const dx=Math.cos(angle),dz=Math.sin(angle),bx=-dz*.014,bz=dx*.014;
  const i=positions.length/3;
  positions.push(-bx,originY,-bz,bx,originY,bz,dx*len*.53+bx*.55,originY+len*.18,dz*len*.53+bz*.55,dx*len,originY+len*.38,dz*len,dx*len*.53-bx*.55,originY+len*.18,dz*len*.53-bz*.55);
  indices.push(i,i+1,i+2,i,i+2,i+4,i+4,i+2,i+3);
 }
 const leaf=new T.BufferGeometry();leaf.setAttribute("position",new T.Float32BufferAttribute(positions,3));leaf.setIndex(indices);leaf.computeVertexNormals();
 inst(leaf,new T.MeshStandardMaterial({color:"#ffffff",side:T.DoubleSide,roughness:1}),needles);
}

function makeMemoryTree(scene,rand,small){
 const group=new T.Group();const x=small?-3.2:-7.0,z=-11.6;group.position.set(x,ground(x,z),z);
 const bark=new T.MeshStandardMaterial({color:"#4b404b",roughness:.98});
 const tips=[];
 function branch(start,dir,len,r,depth){
   const end=start.clone().addScaledVector(dir,len);
   const mid=start.clone().lerp(end,.53).add(new T.Vector3((rand()-.5)*len*.23,0,(rand()-.5)*len*.25));
   const curve=new T.CatmullRomCurve3([start,mid,end]);const g=new T.TubeGeometry(curve,8,r,6,false);group.add(new T.Mesh(g,bark));
   if(depth===0){tips.push(end);return;}
   const count=depth===4?4:2;
   for(let i=0;i<count;i++){const ang=rand()*TAU+i*2.4;const child=dir.clone().multiplyScalar(.46).add(new T.Vector3(Math.cos(ang)*.69,.45+rand()*.30,Math.sin(ang)*.69)).normalize();branch(end,child,len*(.57+rand()*.17),r*.58,depth-1);}
 }
 branch(new T.Vector3(),new T.Vector3(.04,1,.02).normalize(),2.15,.18,4);
 const leafGeo=new T.BufferGeometry();
 const lp=[],li=[];for(let i=0;i<=8;i++){const t=i/8,w=.047*Math.sin(t*Math.PI)**.72,y=(t-.5)*.145;
 lp.push(-w,y,.013*Math.sin(t*Math.PI),0,y,.031*Math.sin(t*Math.PI),w,y,.013*Math.sin(t*Math.PI));
 if(i<8){const a=i*3;li.push(a,a+1,a+3,a+1,a+4,a+3,a+1,a+2,a+4,a+2,a+5,a+4);}}
 leafGeo.setAttribute("position",new T.Float32BufferAttribute(lp,3));leafGeo.setIndex(li);leafGeo.computeVertexNormals();
 const mat=new T.MeshStandardMaterial({color:"#81b5a4",emissive:"#3e9b94",emissiveIntensity:.4,roughness:.84,side:T.DoubleSide});
 const leaves=new T.InstancedMesh(leafGeo,mat,tips.length*70),o=new T.Object3D();
 let k=0;for(const tip of tips){for(let i=0;i<70;i++){o.position.copy(tip).add(new T.Vector3((rand()-.5)*.9,(rand()-.5)*.72,(rand()-.5)*.9));o.rotation.set(rand()*2,rand()*TAU,rand()*2);o.scale.set(.8+rand()*.9,.8+rand()*.7,.8+rand()*.8);o.updateMatrix();leaves.setMatrixAt(k++,o.matrix);}}
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

export function createLiveOverlook(){
 const small=window.innerWidth<760,rand=random(2261127);
 const renderer=new T.WebGLRenderer({antialias:!small,powerPreference:"high-performance",alpha:false,preserveDrawingBuffer:true});
 renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
 const scene=new T.Scene();scene.fog=new T.FogExp2(fogColor,.009);
 const camera=new T.PerspectiveCamera(49,1,.1,700);camera.position.set(0,3.0,15);camera.lookAt(0,9.4,-48);
 const ambient=new T.HemisphereLight("#c3d2ff","#48564b",1.60);scene.add(ambient);
 const moonlight=new T.DirectionalLight("#c6d9ff",2.35);moonlight.position.set(-28,19,-30);scene.add(moonlight);
 const rim=new T.DirectionalLight("#f0c5b4",.52);rim.position.set(35,8,-40);scene.add(rim);
 const sky=makeSky(),stars=makeStars(rand);scene.add(sky,stars);
 scene.add(meshTerrain(240,112,180,-142,mountainHeight(11,-143,42,29),"#263953","#8496be"));
 scene.add(meshTerrain(200,90,156,-99,mountainHeight(47,-99,30,23),"#21354e","#56758e"));
 scene.add(meshTerrain(155,62,132,-60,mountainHeight(87,-61,17,15),"#1b313e","#456771"));
 const lake=makeLake();scene.add(lake);
 scene.add(meshTerrain(100,62,108,2,ground,"#253f40","#69865c"));
 const wind=makeMeadow(scene,rand,small);makeRocks(scene,rand);makeWoodland(scene,rand,small);
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
     lake.material.uniforms.time.value=t;wind.value=t;
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
     renderer.render(scene,camera);last=ms;
   }
   ctx.drawImage(renderer.domElement,0,0,width,height);return true;
 }
 function dispose(){dead=true;for(const v of people.values()){scene.remove(v.root,v.shadow.mesh);v.shadow.dispose();v.dispose();}people.clear();scene.traverse(o=>{if(o.isMesh||o.isPoints){if(o.geometry&&!o.geometry.userData.sharedHuman)o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m?.dispose());}});renderer.dispose();renderer.forceContextLoss();}
 return {render,dispose};
}
