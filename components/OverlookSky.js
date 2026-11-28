import * as T from "three";

const galaxyPlane=new T.Vector3(.62,.34,.32).normalize();

export function makeSky(){
 const material=new T.ShaderMaterial({
  side:T.BackSide,depthWrite:false,toneMapped:false,
  uniforms:{galaxyPlane:{value:galaxyPlane},detail:{value:1}},
  vertexShader:`
 varying vec3 direction;
 void main(){
  direction=position;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
 }
`,fragmentShader:`
 varying vec3 direction;
 uniform vec3 galaxyPlane;
 uniform float detail;
 float gaussian(float x){return exp(-x*x);}
 float hash(vec2 p){
  vec3 q=fract(vec3(p.xyx)*vec3(.1031,.11369,.13787));
  q+=dot(q,q.yzx+19.19);
  return fract((q.x+q.y)*q.z);
 }
 float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*f*(10.+f*(-15.+6.*f));
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);
 }
 float clouds(vec2 p){
  mat2 turn=mat2(.83,.56,-.56,.83)*2.05;
  float v=.54*noise(p);
  p=turn*p+vec2(9.2,4.6);
  v+=.26*noise(p);
  p=turn*p+vec2(3.4,8.1);
  v+=.13*noise(p);
  if(detail>.5)v+=.065*noise(turn*p+vec2(5.7,3.2));
  return v;
 }
 void main(){
  vec3 d=normalize(direction);
  float altitude=max(0.,d.y),horizon=exp(-abs(d.y+.018)*9.2);
  vec3 color=mix(vec3(.031,.044,.086),vec3(.0035,.006,.023),smoothstep(.015,.60,altitude));
  color+=vec3(.021,.024,.038)*horizon;
  color+=vec3(.009,.003,.017)*gaussian((altitude-.31)*5.8);
  float band=dot(d,galaxyPlane)-.038*sin(d.y*8.2+d.x*2.1);
  if(abs(band)<.43){
   vec2 field=vec2(d.y*9.4+d.z*3.5-d.x*1.7,band*14.);
   float flow=clouds(field*vec2(.9,.48)+vec2(1.4,8.7));
   field+=vec2(.9,-1.4)*(flow-.48);
   float vapor=clouds(field*1.58+vec2(6.1,3.8));
   float folds=clouds(vec2(field.x*2.6+field.y*1.1,field.y*3.2-field.x*.56)+20.);
   float filament=pow(1.-abs(2.*folds-1.),5.);
   float dust=clouds(field*vec2(1.8,3.85)+vec2(12.4,7.6));
   float cleft=band+(vapor-.46)*.143+.031*sin(field.x*1.37+flow);
   float extinction=gaussian(cleft*26.)*smoothstep(.27,.71,dust+.12*flow);
   float halo=gaussian(band*4.95)*(1.-smoothstep(.31,.43,abs(band)));
   float core=gaussian((band+(flow-.5)*.09)*10.4);
   float glow=pow(smoothstep(.20,.81,.62*vapor+.26*flow+.14*filament),1.18);
   vec3 tint=mix(vec3(.048,.091,.202),vec3(.138,.075,.226),smoothstep(.32,.72,flow));
   tint=mix(tint,vec3(.218,.115,.163),smoothstep(.52,.78,vapor)*.43);
   color+=halo*vec3(.024,.027,.066)*(.17+.83*vapor);
   color+=tint*core*(.11+1.24*glow)*(1.-.88*extinction);
   color+=vec3(.135,.178,.234)*core*pow(glow,2.8)*(1.-.74*extinction);
  }
  color+=(hash(gl_FragCoord.xy)-.5)*.00072;
  gl_FragColor=vec4(max(color,vec3(0.)),1.);
  #include <colorspace_fragment>
 }
`
 });
 const mesh=new T.Mesh(new T.SphereGeometry(340,36,24),material);
 mesh.renderOrder=-100;
 return mesh;
}

export function makeStars(random,small){
 const positions=[],sizes=[],phases=[],colors=[],strengths=[];
 const palette=["#b8d6ff","#d9e7ff","#fff9ee","#ffe0b7","#d5bbff"].map(hex=>new T.Color(hex));
 const point=new T.Vector3(),count=small?7900:10500;
 for(let i=0;i<count;i++){
  const x=(random()-.5)*2.3,z=-.35-random()*1.3,clustered=i>count*.70;
  const y=clustered?-(galaxyPlane.x*x+galaxyPlane.z*z)/galaxyPlane.y+(random()-random())*.39 : -.07+random()*1.25;
  if(y<-.10||y>1.45)continue;
  point.set(x,y,z).normalize().multiplyScalar(265);
  positions.push(point.x,point.y,point.z);
  sizes.push(1.03+Math.pow(random(),clustered?5.7:4.4)*6.4);
  strengths.push((.25+Math.pow(random(),.55)*.49)*(clustered?.65:1.));
  phases.push(random()*Math.PI*2);
  const color=palette[Math.floor(random()*palette.length)];
  colors.push(color.r,color.g,color.b);
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute("position",new T.Float32BufferAttribute(positions,3));
 geometry.setAttribute("size",new T.Float32BufferAttribute(sizes,1));
 geometry.setAttribute("phase",new T.Float32BufferAttribute(phases,1));
 geometry.setAttribute("tint",new T.Float32BufferAttribute(colors,3));
 geometry.setAttribute("strength",new T.Float32BufferAttribute(strengths,1));
 const material=new T.ShaderMaterial({
  transparent:true,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending,
  uniforms:{time:{value:0},scale:{value:1}},
  vertexShader:`
 attribute float size,phase,strength;
 attribute vec3 tint;
 varying vec3 starTint;
 varying float starPhase,starLight,starSize;
 uniform float scale;
 void main(){
  starTint=tint;starPhase=phase;starLight=strength;starSize=size;
  gl_PointSize=max(1.,size*scale);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
 }
`,fragmentShader:`
 varying vec3 starTint;
 varying float starPhase,starLight,starSize;
 uniform float time;
 void main(){
  vec2 p=gl_PointCoord*2.-1.;
  float r=dot(p,p);
  float bright=smoothstep(2.,7.,starSize);
  float core=exp(-r*mix(5.,31.,bright));
  float halo=exp(-r*4.)*bright*.23;
  float shimmer=.91+.072*sin(time*(.63+.32*sin(starPhase))+starPhase)+.018*sin(time*1.41-starPhase);
  float alpha=(core+halo)*(1.-smoothstep(.54,1.,r))*starLight*shimmer;
  gl_FragColor=vec4(mix(starTint,vec3(1.),core*.33),alpha);
  #include <colorspace_fragment>
 }
`
 });
 return new T.Points(geometry,material);
}

export function makeMeteorLights(){
 const capacity=12;
 const heads=new Float32Array(capacity*4),optics=new Float32Array(capacity*4),tints=new Float32Array(capacity*3);
 const palette={ice:new T.Color("#8cc9ff"),mint:new T.Color("#8df0da"),amber:new T.Color("#ffc89b")};
 const geometry=new T.InstancedBufferGeometry();
 geometry.setAttribute("position",new T.Float32BufferAttribute([-1,-1,0,1,-1,0,-1,1,0,1,1,0],3));
 geometry.setIndex([0,1,2,1,3,2]);
 const head=new T.InstancedBufferAttribute(heads,4).setUsage(T.DynamicDrawUsage);
 const optical=new T.InstancedBufferAttribute(optics,4).setUsage(T.DynamicDrawUsage);
 const tint=new T.InstancedBufferAttribute(tints,3).setUsage(T.DynamicDrawUsage);
 geometry.setAttribute("head",head);
 geometry.setAttribute("optical",optical);
 geometry.setAttribute("tint",tint);
 geometry.instanceCount=0;
 const material=new T.ShaderMaterial({
  side:T.DoubleSide,transparent:true,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending,
  uniforms:{viewport:{value:new T.Vector2(1,1)}},
  vertexShader:`
 attribute vec4 head,optical;
 attribute vec3 tint;
 uniform vec2 viewport;
 varying vec2 shape;
 varying vec3 meteorTint;
 varying float alpha,kind;
 void main(){
  vec2 forward=head.zw,perpendicular=vec2(-forward.y,forward.x);
  float along=optical.w>1.5 ? position.x*optical.y : (position.x-1.)*.5*optical.x;
  vec2 p=(head.xy+forward*along+perpendicular*position.y*optical.y)/viewport*2.-1.;
  // Screen-aligned optics at a view-space depth behind the mountains.
  vec4 depth=projectionMatrix*vec4(0.,0.,-280.,1.);
  gl_Position=vec4(p.x,-p.y,depth.z/depth.w,1.);
  shape=position.xy;meteorTint=tint;alpha=optical.z;kind=optical.w;
 }
`,fragmentShader:`
 varying vec2 shape;
 varying vec3 meteorTint;
 varying float alpha,kind;
 void main(){
  float glow,core;
  if(kind>1.5){
   float r=dot(shape,shape);
   core=exp(-r*93.);
   glow=core+.48*exp(-r*14.)+.11*exp(-r*4.);
   glow*=1.-smoothstep(.70,1.,r);
  }else{
   float t=shape.x*.5+.5;
   float fade=smoothstep(0.,.43,t)*pow(t,.51);
   float y=shape.y/(.16+.84*t);
   float bead=smoothstep(.04,.92,.5+.5*sin(t*37.+sin(t*11.)*2.));
   core=exp(-y*y*(kind>.5?104.:61.))*fade;
   glow=(core+exp(-y*y*7.)*fade*.44)*(kind>.5?1.:.35+.65*bead);
  }
  gl_FragColor=vec4(mix(meteorTint,vec3(1.,.985,.965),min(1.,core*1.4)),glow*alpha);
  #include <colorspace_fragment>
 }
`
 });
 const mesh=new T.Mesh(geometry,material);
 mesh.frustumCulled=false;
 mesh.renderOrder=4;
 mesh.visible=false;
 function write(index,meteor,distance,width,strength,kind){
  const offset=index*4;
  heads[offset]=meteor.x;heads[offset+1]=meteor.y;heads[offset+2]=meteor.dx;heads[offset+3]=meteor.dy;
  optics[offset]=distance;optics[offset+1]=width;optics[offset+2]=strength;optics[offset+3]=kind;
  palette[meteor.tint].toArray(tints,index*3);
 }
 function update(meteors,width,height){
  material.uniforms.viewport.value.set(width,height);
  let i=0;
  for(const meteor of meteors){
   const {length,wake,light,persistence,fireball}=meteor;
   if(i+3>capacity)break;
   if(persistence>.004&&wake>5)write(i++,meteor,wake,fireball?10:5.5,persistence,0);
   if(light>.004){
    if(length>2)write(i++,meteor,length,fireball?8.5:5.5,light,1);
    write(i++,meteor,0,fireball?15:9,light,2);
   }
  }
  geometry.instanceCount=i;
  mesh.visible=i>0;
  if(i)head.needsUpdate=optical.needsUpdate=tint.needsUpdate=true;
 }
 return {mesh,update};
}
