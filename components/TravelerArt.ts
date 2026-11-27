type Pose = "idle" | "walk" | "sit" | "lie";
type Visitor = { hue: number; pose: Pose; waveUntil: number; glowUntil: number; x: number };
function fill(g: CanvasRenderingContext2D, path: string, paint: string | CanvasGradient) {
  g.fillStyle=paint;g.fill(new Path2D(path));
}
function stroke(g: CanvasRenderingContext2D,path:string,paint:string,width:number) {
  g.strokeStyle=paint;g.lineWidth=width;g.lineCap="round";g.lineJoin="round";g.stroke(new Path2D(path));
}
export function paintTraveler(g:CanvasRenderingContext2D,p:Visitor,t:number,now:number,still:boolean,mine:boolean) {
  const seated=p.pose==="sit", lying=p.pose==="lie";
  const breath=still?0:Math.sin(t*.0017+p.x*21)*.55;
  const glow=p.glowUntil>now;
  g.save();
  const shadow=g.createRadialGradient(0,2,0,0,2,23);
  shadow.addColorStop(0,"rgba(3,7,14,.58)");shadow.addColorStop(1,"rgba(3,7,14,0)");
  g.save();g.scale(1,.26);g.fillStyle=shadow;g.fillRect(-24,-25,48,50);g.restore();
  if(lying){g.translate(-8,-4);g.rotate(-1.28);g.scale(.88,.88);}
  else if(!seated){g.translate(0,-10);g.scale(.93,1.06);}
  if(seated){
    const pants=g.createLinearGradient(-10,-19,12,4);pants.addColorStop(0,"#425364");pants.addColorStop(1,"#151e2b");
    fill(g,"M -12 -20 Q -20 -16 -23 -8 Q -26 -2 -17 0 L -5 -1 Q 1 -6 -3 -15 L 5 -15 Q 8 -5 15 -1 Q 24 2 24 -5 Q 20 -16 13 -20 Z",pants);
    stroke(g,"M -17 -10 Q -12 -6 -6 -5 M 10 -11 Q 14 -5 19 -4","rgba(163,175,195,.22)",.8);
    fill(g,"M -21 -5 Q -28 -4 -28 0 Q -21 4 -13 0 L -15 -4 Z M 18 -5 Q 25 -4 28 0 Q 23 3 13 0 Z","#19212b");
  }else{
    fill(g,"M -11 -25 L 11 -25 Q 13 -14 9 1 L 7 11 L 0 11 L -1 -6 L -4 10 L -11 10 Q -14 -12 -11 -25 Z","#293544");
    fill(g,"M -12 9 L -4 9 L -4 13 L -15 13 Z M 0 9 L 9 9 L 12 13 L 0 13 Z","#151b25");
  }
  g.translate(0,breath);
  const coat=g.createLinearGradient(-19,-40,21,-8);
  coat.addColorStop(0,`hsl(${p.hue} 30% 49%)`);coat.addColorStop(.40,`hsl(${p.hue} 26% 31%)`);coat.addColorStop(1,`hsl(${p.hue} 23% 17%)`);
  // A continuous cloth silhouette with shoulders, elbow, waist and hem.
  fill(g,"M -7 -39 Q -15 -40 -19 -33 Q -23 -25 -19 -14 L -14 -10 Q -5 -8 1 -10 Q 9 -7 15 -11 L 20 -15 Q 22 -29 15 -36 Q 10 -40 6 -39 Z",coat);
  stroke(g,"M -15 -34 Q -18 -27 -15 -17 M 13 -34 Q 17 -26 15 -18 M -11 -14 Q 0 -17 11 -14","rgba(193,208,225,.25)",.85);
  stroke(g,"M -5 -37 Q -2 -31 -3 -25 L -4 -12 M 7 -32 Q 9 -25 8 -17","rgba(5,14,28,.27)",.8);
  fill(g,"M -7 -40 Q -6 -45 -5 -46 L 6 -46 L 8 -40 Q 4 -35 0 -35 Q -5 -36 -7 -40 Z","#9e8e8d");
  const hair=g.createLinearGradient(-13,-61,12,-40);
  hair.addColorStop(0,"#8c858b");hair.addColorStop(.34,"#4b4655");hair.addColorStop(1,"#242431");
  fill(g,"M -10 -43 Q -14 -49 -12 -57 Q -11 -64 -4 -66 Q 4 -69 10 -62 Q 16 -57 12 -48 Q 11 -43 6 -41 L 1 -44 L -4 -41 Z",hair);
  stroke(g,"M -11 -57 Q -7 -64 0 -65 M -8 -60 Q -1 -61 2 -64 M 5 -63 Q 12 -59 12 -53","rgba(215,211,230,.43)",.7);
  stroke(g,"M -8 -55 Q -10 -50 -7 -45 M 4 -59 Q 8 -53 5 -45","rgba(18,16,27,.48)",.8);
  stroke(g,"M -16 -35 Q -20 -28 -19 -22 M 12 -37 Q 18 -33 19 -25",`hsla(${p.hue},52%,76%,.56)`,.85);
  if(p.waveUntil>now){
    const a=still?0:Math.sin(t*.012)*3;
    stroke(g,`M 16 -32 Q 24 -35 25 -47 L ${25+a} -54`,`hsl(${p.hue} 29% 42%)`,6);
    stroke(g,`M ${25+a} -53 l 1 -5`,"#b8a4a0",3);
  }
  if(glow){
    g.globalCompositeOperation="screen";
    for(let i=0;i<12;i++){const a=i*2.399+t*.001;const r=13+(i%5)*5;g.fillStyle=`hsla(${p.hue},80%,85%,${.25+.25*Math.sin(a)})`;g.fillRect(Math.cos(a)*r,-35+Math.sin(a)*r,1.2,1.2);}
  }
  if(mine){g.fillStyle="rgba(230,236,211,.62)";g.fillRect(-1,5,2,2);}
  g.restore();
}
