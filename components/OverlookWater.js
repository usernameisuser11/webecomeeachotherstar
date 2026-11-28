import * as T from "three";

function riverSurface(small, nearBank, farBank, ground, foothill, level) {
 const nx=small?132:184,nz=small?14:22;
 const positions=[],depths=[],indices=[];
 for(let j=0;j<=nz;j++){
  for(let i=0;i<=nx;i++){
   const x=(i/nx-.5)*188;
   // The water extends beneath both banks. The actual terrain hides this overlap.
   const z=T.MathUtils.lerp(farBank(x)-2,nearBank(x)+2,j/nz);
   positions.push(x,level,z);
   depths.push(Math.max(0,level-Math.max(ground(x,z),foothill(x,z))));
   if(i<nx&&j<nz){
    const a=j*(nx+1)+i;
    indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);
   }
  }
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute("position",new T.Float32BufferAttribute(positions,3));
 geometry.setAttribute("waterDepth",new T.Float32BufferAttribute(depths,1));
 geometry.setIndex(indices);
 return geometry;
}

export function makeRiver({small,nearBank,farBank,ground,foothill,level,fogColor}){
 const target=new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter});
 // An sRGB target avoids banding in the darker reflected colors. Sampling decodes it.
 target.texture.colorSpace=T.SRGBColorSpace;
 const mirror=new T.PerspectiveCamera();
 mirror.layers.set(1);
 const reflectionMatrix=new T.Matrix4();
 const clipPlane=new T.Plane(new T.Vector3(0,1,0),-level+.014);
 const cameraPlane=new T.Plane(),clip=new T.Vector4(),corner=new T.Vector4();
 const direction=new T.Vector3(),focus=new T.Vector3();
 const previousPosition=new T.Vector3(Infinity,0,0),previousDirection=new T.Vector3();
 let previousTime=-Infinity,previousAspect=0;
 const uniforms={
  time:{value:0},valleyFog:{value:fogColor},
  reflection:{value:target.texture},reflectionMatrix:{value:reflectionMatrix},reflectionReady:{value:0}
 };
 const material=new T.ShaderMaterial({toneMapped:false,uniforms,
  vertexShader:`
 attribute float waterDepth;
 uniform mat4 reflectionMatrix;
 varying float vDepth;
 varying vec3 vWorld;
 varying vec4 vMirror;
 void main() {
   vec4 world = modelMatrix * vec4(position, 1.);
   vWorld = world.xyz;
   vDepth = waterDepth;
   vMirror = reflectionMatrix * world;
   gl_Position = projectionMatrix * viewMatrix * world;
 }
`,
  fragmentShader:`
 uniform sampler2D reflection;
 uniform vec3 valleyFog;
 uniform float time, reflectionReady;
 varying float vDepth;
 varying vec3 vWorld;
 varying vec4 vMirror;
 float gaussian(float x){return exp(-x*x);}
 void main() {
   vec2 p = vWorld.xz;
   float drift = sin(p.x*.29 + p.y*.16 - time*.27);
   float a = p.x*.34 + p.y*1.5 + drift*.53 - time*.66;
   float b = -p.x*.65 + p.y*3.2 + drift*.72 - time*.91;
   float c = p.x*.21 - p.y*5.7 + sin(p.x*.41) - time*1.4;
   float fine = 1.-smoothstep(.17,.65,length(fwidth(p)));
   vec2 slope = vec2(.24,.62)*cos(a) + vec2(-.28,.82)*cos(b) + vec2(.10,-.60)*cos(c)*fine;
   float depth = smoothstep(.025,.72,vDepth);
   vec3 n = normalize(vec3(-slope.x*.034,1.,-slope.y*.019));
   vec3 v = normalize(cameraPosition-vWorld);
   float fresnel = .07 + .87*pow(1.-clamp(dot(n,v),0.,1.),3.4);
   float bedPattern = .5 + .5*sin(p.x*1.8 + drift*3. + sin(p.y*1.7));
   vec3 gravel = mix(vec3(.020,.027,.020),vec3(.039,.047,.033),bedPattern);
   vec3 water = mix(gravel,vec3(.008,.016,.023),depth);
   vec2 uv = vMirror.xy/max(.001,vMirror.w)*.5+.5;
   uv += slope*vec2(.0046,.0032)*(.25+.75*depth);
   float inside = smoothstep(0.,.012,uv.x)*smoothstep(0.,.012,1.-uv.x)
                * smoothstep(0.,.012,uv.y)*smoothstep(0.,.012,1.-uv.y);
   if (reflectionReady>.5 && inside>0. && vMirror.w>0.) {
     vec3 mirrored = texture2D(reflection,uv).rgb;
     water = mix(water,mirrored*vec3(.85,.94,1.),inside*fresnel*(.28+.71*depth));
   }
   float glint = pow(max(0.,sin(a)*.5+sin(b)*.33+sin(c)*.17*fine),9.);
   float moon = gaussian((p.x+p.y*.20+9.)*.062);
   water += vec3(.054,.075,.112)*glint*moon*fresnel*depth*.52;
   float margin = gaussian((vDepth-.064)*18.);
   water += vec3(.010,.014,.011)*margin*smoothstep(.25,.9,.5+.5*sin(a+drift*4.));
   float dist = length(cameraPosition-vWorld);
   float haze = 1.-exp(-dist*dist*.000061);
   gl_FragColor = vec4(mix(water,valleyFog,haze*.17),1.);
   #include <colorspace_fragment>
 }
`
 });
 const mesh=new T.Mesh(riverSurface(small,nearBank,farBank,ground,foothill,level),material);

 function reflect(renderer,scene,camera,now,quality,reducedMotion){
  camera.updateMatrixWorld();
  camera.getWorldDirection(direction);
  const moved=previousPosition.distanceToSquared(camera.position)>.012
    ||previousDirection.distanceToSquared(direction)>.000018;
  const interval=moved?160:quality<.85?1100:670;
  if(Math.abs(camera.aspect-previousAspect)<.001&&((reducedMotion&&!moved)||now-previousTime<interval))return;
  previousTime=now;
  previousAspect=camera.aspect;
  previousPosition.copy(camera.position);
  previousDirection.copy(direction);
  const width=Math.round((small?240:480)*quality);
  const height=Math.max(96,Math.min(small?374:330,Math.round(width/camera.aspect)));
  if(target.width!==width||target.height!==height)target.setSize(width,height);
  mirror.position.copy(camera.position);
  mirror.position.y=2*level-camera.position.y;
  direction.y*=-1;
  mirror.up.set(0,-1,0);
  mirror.lookAt(focus.copy(mirror.position).add(direction));
  mirror.updateMatrixWorld();
  mirror.projectionMatrix.copy(camera.projectionMatrix);
  reflectionMatrix.multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse);

  // Clip the mirrored view at the waterline for every material, including custom shaders.
  cameraPlane.copy(clipPlane).applyMatrix4(mirror.matrixWorldInverse);
  clip.set(cameraPlane.normal.x,cameraPlane.normal.y,cameraPlane.normal.z,cameraPlane.constant);
  const p=mirror.projectionMatrix.elements;
  corner.set((Math.sign(clip.x)+p[8])/p[0],(Math.sign(clip.y)+p[9])/p[5],-1,(1+p[10])/p[14]);
  clip.multiplyScalar(2/clip.dot(corner));
  p[2]=clip.x;
  p[6]=clip.y;
  p[10]=clip.z+1.;
  p[14]=clip.w;

  const previousTarget=renderer.getRenderTarget();
  try{
   renderer.setRenderTarget(target);
   renderer.render(scene,mirror);
   uniforms.reflectionReady.value=1;
  }finally{
   renderer.setRenderTarget(previousTarget);
  }
 }

 function invalidate(){
  previousAspect=0;
  uniforms.reflectionReady.value=0;
 }
 return {mesh,material,reflect,invalidate,dispose:()=>target.dispose()};
}
