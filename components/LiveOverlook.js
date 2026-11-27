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
const ground=(x,z)=>-0.85+1.65*Math.exp(-Math.pow((z-4)/21,2))+.55*(fbm(x*.09,z*.09,39)-.5)+.13*Math.sin(x*.28+z*.17);
const fogColor=new T.Color("#354c71");
function meshTerrain(width,depth,segments,z0,height,low,high){
  const geo=new T.PlaneGeometry(width,depth,segments,Math.round(segments*.64));geo.rotateX(-Math.PI/2);
  const a=geo.attributes.position,col=[],c0=new T.Color(low),c1=new T.Color(high);
  for(let i=0;i<a.count;i++){
    const x=a.getX(i),z=a.getZ(i)+z0,y=height(x,z);
    a.setXYZ(i,x,y,z);
    const shade=clamp(.18+fbm(x*.10,z*.10,17)*.46+fbm(x*.42,z*.55,79)*.17+(y+1)*.022,0,1);
    const c=c0.clone().lerp(c1,shade);col.push(c.r,c.g,c.b);
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
  material.customProgramCacheKey=()=>"natural-land-v1";
  return new T.Mesh(geo,material);
}
function mountainHeight(seed,center,amp,spread){
  return (x,z)=>{
    const r=fbm(x*.022,z*.041,seed);
    const folded=1-Math.abs(2*fbm(x*.055,z*.071,seed+54)-1);
    const spine=Math.exp(-Math.pow((z-center+(noise(x*.018,0,seed)-.5)*22)/spread,2));
    const ridgeFine=1-Math.abs(2*fbm(x*.115+noise(x*.02,z*.02,seed)*2,z*.15,seed+89)-1);
    const erosion=1-Math.pow(1-Math.abs(2*noise(x*.085+z*.021,z*.10,seed+137)-1),2);
    const peaks=.15+.85*Math.pow(clamp(r*.83+folded*.31,0,1),1.37);
    const crest=amp*(peaks+.09*ridgeFine-.065*erosion);
    return -9+spine*(crest+3.0*noise(x*.19,z*.18,seed+2));
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
     float glint=pow(max(0.,w*.64+q*.36),12.);float stripe=exp(-abs(p.x+sin(p.y*.19+time*.13)*2.)*.12);
     vec3 c=mix(vec3(.017,.033,.072),vec3(.052,.084,.138),smoothstep(-40.,40.,p.y));
     c+=vec3(.16,.21,.32)*glint*(.09+.31*stripe);gl_FragColor=vec4(c,1.);
     #include <colorspace_fragment>
   }
  `});
  const mesh=new T.Mesh(new T.PlaneGeometry(160,130,75,55),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(0,-1.52,-62);return mesh;
}
function bladeGeometry(){
  const p=[],idx=[];
  for(let i=0;i<=7;i++){const t=i/7,wide=.058*Math.pow(1-t,.66),x=t*t*.18; p.push(x-wide,t,0,x+wide,t,.025*Math.sin(t*Math.PI));if(i<7){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}}
  const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function makeMeadow(scene,rand,small){
  const wind={value:0},g=bladeGeometry(),m=new T.MeshStandardMaterial({color:"#ffffff",side:T.DoubleSide,roughness:1});
  m.onBeforeCompile=s=>{s.uniforms.wind=wind;s.vertexShader=s.vertexShader.replace("#include <common>","#include <common>\nuniform float wind;").replace("#include <begin_vertex>",`#include <begin_vertex>
    #ifdef USE_INSTANCING
      float ph=instanceMatrix[3].x*.25+instanceMatrix[3].z*.19;
      transformed.x+=pow(max(0.,position.y),1.7)*(.15*sin(wind*.84+ph)+.05*sin(wind*2.1+ph*3.));
      transformed.z+=pow(max(0.,position.y),1.6)*.085*sin(wind*.69+ph);
    #endif`);};
  const count=small?5700:11500,mesh=new T.InstancedMesh(g,m,count),o=new T.Object3D(),dark=new T.Color("#294b45"),light=new T.Color("#9caa71"),c=new T.Color();
  for(let i=0;i<count;i++){
    let x=(rand()-.5)*43,z=-19+rand()*35;const clear=Math.abs(z+3.0)<1.55&&Math.abs(x)<18;
    const height=(.20+Math.pow(rand(),1.9)*.88)*(clear?.32:1);
    o.position.set(x,ground(x,z)-.025,z);o.rotation.set(0,rand()*TAU,(rand()-.5)*.30);o.scale.set(.5+rand()*.8,height,.8);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
    c.copy(dark).lerp(light,rand()*.83);mesh.setColorAt(i,c);
  }
  mesh.frustumCulled=false;scene.add(mesh);
  // Flowers are actual petal meshes; clusters have varied stem heights.
  const flowerCount=small?170:320,petals=new T.InstancedMesh(new T.SphereGeometry(.055,7,5),new T.MeshStandardMaterial({roughness:.8}),flowerCount*5);
  const stems=new T.InstancedMesh(new T.CylinderGeometry(.011,.018,1,5),new T.MeshStandardMaterial({color:"#687b4c",roughness:1}),flowerCount);
  const palette=["#ba9ad9","#c7d7f2","#e4bb90","#aab9e4"].map(s=>new T.Color(s));
  for(let i=0;i<flowerCount;i++){
    let x=(rand()-.5)*36,z=-15+rand()*25;if(Math.abs(z+3.0)<1.6)z+=3;
    const y=ground(x,z),h=.24+rand()*.44;
    o.position.set(x,y+h*.5,z);o.rotation.set(0,0,(rand()-.5)*.13);o.scale.set(1,h,1);o.updateMatrix();stems.setMatrixAt(i,o.matrix);
    for(let j=0;j<5;j++){let a=j*TAU/5;o.position.set(x+Math.cos(a)*.06,y+h,z+Math.sin(a)*.06);o.rotation.set(0,-a,0);o.scale.set(1.4,.48,.68);o.updateMatrix();petals.setMatrixAt(i*5+j,o.matrix);petals.setColorAt(i*5+j,palette[i%4]);}
  }
  scene.add(stems,petals);return wind;
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
export function createLiveOverlook(){
 const small=window.innerWidth<760,rand=random(2261127);
 const renderer=new T.WebGLRenderer({antialias:!small,powerPreference:"high-performance",alpha:false,preserveDrawingBuffer:true});
 renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
 const scene=new T.Scene();scene.fog=new T.FogExp2(fogColor,.009);
 const camera=new T.PerspectiveCamera(49,1,.1,700);camera.position.set(0,3.0,15);camera.lookAt(0,9.4,-48);
 const ambient=new T.HemisphereLight("#b7c9ff","#354a4a",2.0);scene.add(ambient);
 const moonlight=new T.DirectionalLight("#bdccff",2.1);moonlight.position.set(-16,24,-25);scene.add(moonlight);
 const rim=new T.DirectionalLight("#efbcb9",.65);rim.position.set(35,8,-40);scene.add(rim);
 const sky=makeSky(),stars=makeStars(rand);scene.add(sky,stars);
 scene.add(meshTerrain(220,100,150,-133,mountainHeight(11,-135,43,26),"#263953","#8496be"));
 scene.add(meshTerrain(180,82,128,-96,mountainHeight(47,-94,29,20),"#21354e","#56758e"));
 scene.add(meshTerrain(135,53,112,-58,mountainHeight(87,-60,14,12),"#1b313e","#456771"));
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
     for(const [id,v] of people)if(!ids.has(id)){scene.remove(v.root);people.delete(id);v.dispose();}
     // When seated, bring the camera closer and lower it, retaining a broad sky.
     const close=peers.length>0;
     const distance=close?(small?10.4:12.5):15;
     const eyeY=close?2.65:3.0;
     camera.position.z+=(distance-camera.position.z)*Math.min(1,dt*3.2);
     camera.position.y+=(eyeY-camera.position.y)*Math.min(1,dt*3.2);
     camera.lookAt(0,close?6.0:9.4,-48);
     for(const p of peers){
       let v=people.get(p.id);if(!v){v=createHuman(p.hue);people.set(p.id,v);scene.add(v.root);}
       const z=-3.0,span=2*(camera.position.z-z)*Math.tan(camera.fov*Math.PI/360)*camera.aspect;
       const x=(p.x-.5)*span*.98;
       const stagger=small&&peers.length>4?(Math.round(p.x*100)%2)*.48:0;
       v.root.position.set(x,ground(x,z-stagger)+.04,z-stagger);
       v.root.scale.setScalar(small&&peers.length>5?.86:1.06);
       v.update(p,t,Date.now(),dt,reduced);
       if(p.pose==="lie")v.root.position.y+=.22;
     }
     renderer.render(scene,camera);last=ms;
   }
   ctx.drawImage(renderer.domElement,0,0,width,height);return true;
 }
 function dispose(){dead=true;for(const v of people.values()){scene.remove(v.root);v.dispose();}people.clear();scene.traverse(o=>{if(o.isMesh||o.isPoints){if(o.geometry&&!o.geometry.userData.sharedHuman)o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m?.dispose());}});renderer.dispose();renderer.forceContextLoss();}
 return {render,dispose};
}
