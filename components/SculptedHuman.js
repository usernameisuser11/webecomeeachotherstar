import * as T from "three";

// Smooth implicit surfaces are polygonized into connected anatomical meshes.
// All parts are generated numerically, not primitives assembled as a mannequin.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
function smooth(a,b,k){const h=clamp(.5+.5*(b-a)/k);return mix(b,a,h)-k*h*(1-h);}
function ell(x,y,z,cx,cy,cz,rx,ry,rz){
 x=(x-cx)/rx;y=(y-cy)/ry;z=(z-cz)/rz;
 return (Math.sqrt(x*x+y*y+z*z)-1)*Math.min(rx,ry,rz);
}
function taper(x,y,z,a,b,r0,r1){
 const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
 const t=clamp(((x-a[0])*dx+(y-a[1])*dy+(z-a[2])*dz)/(dx*dx+dy*dy+dz*dz));
 return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t,z-a[2]-dz*t)-mix(r0,r1,t);
}
function union(fields,k){return (x,y,z)=>{let f=fields[0](x,y,z);for(let i=1;i<fields.length;i++)f=smooth(f,fields[i](x,y,z),k);return f;};}
const E=(a,b,c,d,e,f)=>(x,y,z)=>ell(x,y,z,a,b,c,d,e,f);
const C=(a,b,r,s)=>(x,y,z)=>taper(x,y,z,a,b,r,s);

// Indexed marching tetrahedra with shared edge vertices and smooth normals.
function surface(field,bounds,step){
 const [x0,y0,z0,x1,y1,z1]=bounds;
 const nx=Math.ceil((x1-x0)/step)+1,ny=Math.ceil((y1-y0)/step)+1,nz=Math.ceil((z1-z0)/step)+1;
 const sx=(x1-x0)/(nx-1),sy=(y1-y0)/(ny-1),sz=(z1-z0)/(nz-1);
 const plane=nx*ny,N=plane*nz,vals=new Float32Array(N),p=[],idx=[],edgeMap=new Map();
 for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)vals[i+j*nx+k*plane]=field(x0+i*sx,y0+j*sy,z0+k*sz);
 const pos=id=>{const k=Math.floor(id/plane),r=id-k*plane,j=Math.floor(r/nx),i=r-j*nx;return [x0+i*sx,y0+j*sy,z0+k*sz];};
 const edge=(a,b)=>{let key=Math.min(a,b)*N+Math.max(a,b),old=edgeMap.get(key);if(old!==undefined)return old;
   const u=pos(a),v=pos(b),t=clamp(vals[a]/(vals[a]-vals[b]));const id=p.length/3;
   p.push(mix(u[0],v[0],t),mix(u[1],v[1],t),mix(u[2],v[2],t));edgeMap.set(key,id);return id;};
 function tri(a,b,c,normal){if(a===b||b===c||a===c)return;
   const ax=p[b*3]-p[a*3],ay=p[b*3+1]-p[a*3+1],az=p[b*3+2]-p[a*3+2],bx=p[c*3]-p[a*3],by=p[c*3+1]-p[a*3+1],bz=p[c*3+2]-p[a*3+2];
   if((ay*bz-az*by)*normal[0]+(az*bx-ax*bz)*normal[1]+(ax*by-ay*bx)*normal[2]<0)idx.push(a,c,b);else idx.push(a,b,c);
 }
 const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
 for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
   const a=i+j*nx+k*plane,ids=[a,a+1,a+1+nx,a+nx,a+plane,a+plane+1,a+plane+1+nx,a+plane+nx];
   let mask=0;for(let q=0;q<8;q++)if(vals[ids[q]]<0)mask|=1<<q;
   if(mask===0||mask===255)continue;
   for(const tet of tets){
     const inside=[],outside=[];for(const q of tet)(vals[ids[q]]<0?inside:outside).push(ids[q]);
     if(!inside.length||!outside.length)continue;
     const mean=list=>{let x=0,y=0,z=0;for(const id of list){const q=pos(id);x+=q[0];y+=q[1];z+=q[2];}return [x/list.length,y/list.length,z/list.length];};
     const ip=mean(inside),op=mean(outside),n=op.map((v,j)=>v-ip[j]);
     if(inside.length===1){const v=outside.map(q=>edge(inside[0],q));tri(v[0],v[1],v[2],n);}
     else if(outside.length===1){const v=inside.map(q=>edge(outside[0],q));tri(v[0],v[1],v[2],n);}
     else {const a=edge(inside[0],outside[0]),b=edge(inside[0],outside[1]),c=edge(inside[1],outside[0]),d=edge(inside[1],outside[1]);tri(a,b,c,n);tri(b,d,c,n);}
   }
 }
 const geo=new T.BufferGeometry();geo.setAttribute("position",new T.Float32BufferAttribute(p,3));geo.setIndex(idx);geo.computeVertexNormals();geo.computeBoundingSphere();return geo;
}
const shoulder=[.232,.91,.012],elbow=[.326,.69,.025],wrist=[.311,.44,-.116];
function jacketField(){
 const base=union([
  E(0,.62,.015,.245,.292,.145),E(0,.80,.002,.269,.205,.149),
  E(0,.47,.02,.205,.16,.14),E(0,.95,.018,.152,.102,.112),
  ...[-1,1].flatMap(s=>[
   E(s*.205,.865,.012,.101,.128,.10),
   C([s*shoulder[0],shoulder[1],shoulder[2]],[s*elbow[0],elbow[1],elbow[2]],.104,.078),
   C([s*elbow[0],elbow[1],elbow[2]],[s*wrist[0],wrist[1],wrist[2]],.078,.051)
  ])
 ],.052);
 return (x,y,z)=>{
   let d=base(x,y,z);
   // Continuous small folds at elbows, waist and shoulder blades.
   const waist=Math.exp(-Math.pow((y-.47)/.13,2)),arm=clamp((Math.abs(x)-.19)*8);
   const ribs=Math.sin(y*67+x*15+3*Math.sin(x*21))*Math.sin(x*19+z*23);
   const fold=.0065*ribs*(.24+.76*waist)+.0075*arm*Math.sin(y*69+z*24);
   return d+fold;
 };
}
function armWeights(geo,hands=false){
 const p=geo.attributes.position,ids=[],weights=[];
 for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),a=Math.abs(x),side=x>=0?1:3;
   const shoulderW=hands?1:clamp((a-.169)/.111),elbowW=hands?1:clamp((.746-y)/.19);
   const sw=shoulderW*shoulderW*(3-2*shoulderW),ew=elbowW*elbowW*(3-2*elbowW);
   ids.push(0,side,side+1,0);weights.push(1-sw,sw*(1-ew),sw*ew,0);
 }
 geo.setAttribute("skinIndex",new T.Uint16BufferAttribute(ids,4));geo.setAttribute("skinWeight",new T.Float32BufferAttribute(weights,4));return geo;
}
function headField(){
 return union([E(0,1.126,-.018,.136,.171,.133),E(0,1.047,-.027,.104,.106,.116),E(0,1.088,-.133,.036,.043,.051),E(0,.994,-.002,.067,.099,.066),E(-.132,1.099,-.001,.025,.047,.023),E(.132,1.099,-.001,.025,.047,.023)],.021);
}
function hairField(){
 const cap=E(0,1.168,.013,.147,.155,.142);
 return (x,y,z)=>{
   const a=Math.atan2(x,z+.012),top=1.052+.081*clamp((-z+.005)*7)+.011*Math.sin(a*7+.6);
   const grooves=.0042*Math.sin(a*20+y*35+1.4*Math.sin(y*18+a));
   return Math.max(cap(x,y,z)+grooves,top-y);
 };
}
function handField(){
 const f=[];
 for(const s of [-1,1]){
  f.push(E(s*.308,.414,-.137,.047,.064,.037));
  for(let j=0;j<4;j++){const x=s*(.282+j*.014),len=.031+Math.sin((j+.4)*.8)*.015;
    f.push(C([x,.387,-.151],[x+s*.002,.387-len,-.168],.011,.0085));}
  f.push(C([s*.278,.425,-.145],[s*.256,.395,-.158],.017,.011));
 }
 return union(f,.009);
}
function pantsField(sit){
 const f=[E(0,sit?.325:.39,.019,.218,.147,.146)];
 for(const s of [-1,1]){
  if(sit){
   f.push(C([s*.121,.35,.008],[s*.202,.292,-.29],.123,.092),C([s*.202,.292,-.29],[s*.125,.093,-.482],.093,.062));
  }else{
   f.push(C([s*.108,.40,0],[s*.101,.052,.013],.118,.083),C([s*.101,.052,.013],[s*.102,-.32,-.006],.082,.054));
  }
 }
 const g=union(f,.045);
 return (x,y,z)=>g(x,y,z)+.0042*Math.sin(y*77+z*31+Math.abs(x)*27)*Math.sin(z*31+y*16);
}
function shoeField(sit){
 const f=[];for(const s of [-1,1]){
   if(sit){f.push(E(s*.126,.073,-.533,.072,.062,.126),E(s*.127,.085,-.489,.062,.072,.065));}
   else{f.push(E(s*.104,-.32,-.074,.073,.059,.131),E(s*.104,-.296,-.004,.064,.075,.067));}
 }
 return union(f,.02);
}
let cache=null;
function models(){
 if(cache)return cache;
 cache={
  coat:armWeights(surface(jacketField(),[-.48,.31,-.26,.48,1.10,.23],.018)),
  hands:armWeights(surface(handField(),[-.4,.31,-.20,.4,.49,-.075],.009),true),
  head:surface(headField(),[-.175,.89,-.20,.175,1.32,.15],.009),
  hair:surface(hairField(),[-.17,1.03,-.15,.17,1.34,.18],.0078),
  seatedPants:surface(pantsField(true),[-.39,.015,-.59,.39,.52,.20],.018),
  standingPants:surface(pantsField(false),[-.28,-.39,-.16,.28,.55,.19],.018),
  seatedShoes:surface(shoeField(true),[-.22,0,-.68,.22,.18,-.41],.012),
  standingShoes:surface(shoeField(false),[-.21,-.4,-.22,.21,-.20,.085],.012)
 };
 Object.values(cache).forEach(g=>g.userData.sharedHuman=true);
 return cache;
}
function mat(color,roughness=.83){return new T.MeshStandardMaterial({color,roughness,metalness:0});}
function skinned(geometry,material){
 const mesh=new T.SkinnedMesh(geometry,material),base=new T.Bone(),r=new T.Bone(),re=new T.Bone(),l=new T.Bone(),le=new T.Bone();
 r.position.set(...shoulder);l.position.set(-shoulder[0],shoulder[1],shoulder[2]);
 re.position.set(elbow[0]-shoulder[0],elbow[1]-shoulder[1],elbow[2]-shoulder[2]);le.position.set(-re.position.x,re.position.y,re.position.z);
 base.add(r,l);r.add(re);l.add(le);mesh.add(base);mesh.updateMatrixWorld(true);
 mesh.bind(new T.Skeleton([base,r,re,l,le]));mesh.frustumCulled=false;return {mesh,r,re};
}
export function createHuman(hue){
 const m=models(),root=new T.Group(),body=new T.Group();root.add(body);
 const cloth=mat(new T.Color().setHSL(hue/360,.29,.30),.95),skin=mat("#b99b87",.78),hair=mat("#302733",.95),pants=mat("#303b4a",.96),shoes=mat("#242934",.88);
 const jacket=skinned(m.coat,cloth),hands=skinned(m.hands,skin);body.add(jacket.mesh,hands.mesh,new T.Mesh(m.head,skin),new T.Mesh(m.hair,hair));
 // A narrow collar and cloth seam, real geometry follows the back.
 const seamGeo=new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(-.145,.918,.105),new T.Vector3(-.075,.890,.147),new T.Vector3(0,.874,.154),new T.Vector3(.075,.89,.147),new T.Vector3(.145,.918,.105)]),32,.008,6,false);
 body.add(new T.Mesh(seamGeo,mat(new T.Color().setHSL(hue/360,.20,.21),.9)));
 const sit=new T.Group(),stand=new T.Group();sit.add(new T.Mesh(m.seatedPants,pants),new T.Mesh(m.seatedShoes,shoes));stand.add(new T.Mesh(m.standingPants,pants),new T.Mesh(m.standingShoes,shoes));root.add(sit,stand);
 const glowMat=new T.MeshBasicMaterial({color:new T.Color().setHSL(hue/360,.65,.75),transparent:true,opacity:0,depthWrite:false});
 const glow=new T.Mesh(new T.SphereGeometry(.028,10,8),glowMat);glow.position.set(0,1.30,.10);root.add(glow);
 let wave=0,poseBlend=0;
 function update(p,t,now,dt,reduced){
  const seated=p.pose==="sit",lying=p.pose==="lie";
  sit.visible=seated;stand.visible=!seated;
  poseBlend+=( (seated?0:.39)-poseBlend)*Math.min(1,dt*7);
  body.position.y=seated?0:poseBlend;
  stand.position.y=poseBlend;
  // A short breathing motion, and a rigged greeting with elbow articulation.
  body.rotation.x=reduced?0:.012*Math.sin(t*1.4+p.x*21);
  const target=p.waveUntil>now?1:0;wave+=(target-wave)*Math.min(1,dt*9);
  for(const rig of [jacket,hands]){
    rig.r.rotation.z=wave*(1.25+.13*Math.sin(t*6));
    rig.r.rotation.x=wave*.19;
    rig.re.rotation.z=wave*(.76+.15*Math.sin(t*7.6));
  }
  glowMat.opacity=p.glowUntil>now?.78:0;
  root.rotation.x=lying?Math.PI*.48:0;
  if(lying){body.position.y=.39;stand.position.y=.39;}
 }
 function dispose(){
  const geos=new Set(),mats=new Set(),skeletons=new Set();root.traverse(o=>{if(o.isMesh){if(!o.geometry.userData.sharedHuman)geos.add(o.geometry);mats.add(o.material);if(o.skeleton)skeletons.add(o.skeleton);}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());
 }
 return {root,update,dispose};
}
