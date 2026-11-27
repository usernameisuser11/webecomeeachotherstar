"use client";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

type Pose = "idle" | "walk" | "sit" | "lie";
type Peer = { id: string; x: number; hue: number; pose: Pose; waveUntil: number; glowUntil: number };
type Props = { canvasRef: RefObject<HTMLCanvasElement | null>; paused: boolean; onLeave: () => void };
export default function StarlightWalk({ canvasRef, paused, onLeave }: Props) {
  const socket = useRef<WebSocket | null>(null);
  const peers = useRef<Peer[]>([]);
  const ownId = useRef("");
  const clock = useRef(0);
  const [status, setStatus] = useState("연결 중…");
  const [count, setCount] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    const url = new URL("/presence/starlight", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    socket.current = ws; peers.current = []; ownId.current = "";
    setReady(false); setCount(null); setStatus("연결 중…");
    ws.onmessage = event => {
      if (disposed) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "welcome") {
          ownId.current = data.id; clock.current = data.serverTime - Date.now();
          setReady(true); setStatus("같은 하늘 아래");
        } else if (data.type === "peers" && Array.isArray(data.peers)) {
          peers.current = data.peers; setCount(data.peers.length);
        }
      } catch {}
    };
    ws.onclose = () => {
      if (disposed) return;
      peers.current = []; ownId.current = ""; setReady(false); setCount(null);
      setStatus("연결 종료 · 정원이 찼거나 연결이 끊겼어요");
    };
    ws.onerror = () => { if (!disposed) setStatus("연결을 확인해 주세요"); };
    return () => { disposed = true; peers.current = []; ownId.current = ""; ws.close(); socket.current = null; };
  }, [retry]);
  const send = (type: string, pose?: Pose) => {
    const mine = peers.current.find(p => p.id === ownId.current);
    if (paused || !mine || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify(type === "state" ? { type, x: mine.x, pose } : { type }));
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0, last = 0, w = 0, h = 0;
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    function frame(t: number) {
      raf = requestAnimationFrame(frame);
      if (t - last < 1000 / 30 || !w || !h) return;
      last = t; ctx!.clearRect(0, 0, w, h);
      const g = ctx!, base = h * (w < 600 ? .78 : .84);
      const unit = Math.min(w / 365, h / 700, 1.25);
      // A low grassy bank draws the group together without covering the sky.
      const bank = g.createLinearGradient(0, base - 9, 0, h);
      bank.addColorStop(0, "#132c34"); bank.addColorStop(.28, "#071b24"); bank.addColorStop(1, "#020a14");
      g.fillStyle = bank; g.beginPath(); g.moveTo(0, base + 13);
      g.bezierCurveTo(w*.23,base+3,w*.32,base-8,w*.53,base);
      g.bezierCurveTo(w*.72,base+5,w*.89,base-4,w,base+11);
      g.lineTo(w,h); g.lineTo(0,h); g.closePath(); g.fill();
      g.strokeStyle = "rgba(145,185,170,.22)"; g.lineWidth = .7;
      for (let i=0;i<Math.min(160,w/3);i++) {
        const x = (i*37.37)%w, y=base+9+Math.sin(i*2.31)*5;
        const bend=still?0:Math.sin(t*.001+i*.62)*1.6;
        g.beginPath(); g.moveTo(x,y); g.quadraticCurveTo(x+1,y-4,x+bend+2,y-5-(i%6)); g.stroke();
      }
      const now = Date.now()+clock.current;
      for (const p of peers.current) {
        const x = w*p.x, y = base + 5 + Math.sin(p.x*12)*2;
        g.save(); g.translate(x,y); g.scale(unit,unit);
        const breathing=still?0:Math.sin(t*.0015+p.x*20)*.7;
        const sit=p.pose==="sit", lie=p.pose==="lie";
        const bodyY = lie?-8:sit?-17:-25;
        const headY = lie?-12:sit?-30:-40;
        g.fillStyle="rgba(0,0,0,.35)"; g.beginPath();g.ellipse(0,2,13,3,0,0,Math.PI*2);g.fill();
        const halo=g.createRadialGradient(0,-12,0,0,-12,26);
        halo.addColorStop(0,`hsla(${p.hue},65%,70%,${p.glowUntil>now?.33:.10})`);halo.addColorStop(1,"transparent");
        g.fillStyle=halo;g.fillRect(-28,-40,56,56);
        g.strokeStyle=`hsl(${p.hue} 35% 46%)`;g.lineWidth=1.2;
        g.fillStyle="#182733"; g.beginPath();g.ellipse(lie?4:0,bodyY,lie?14:8,lie?5:sit?12:15,0,0,Math.PI*2);g.fill();g.stroke();
        g.fillStyle="#1b2b36";g.beginPath();g.arc(lie?-10:0,headY+breathing,6.5,0,Math.PI*2);g.fill();g.stroke();
        // No eyes or face: every person is facing away, towards the stars.
        g.strokeStyle=`hsla(${p.hue},65%,76%,.75)`;g.beginPath();g.arc(lie?-10:0,headY+breathing,6.7,Math.PI*1.08,Math.PI*1.85);g.stroke();
        g.lineCap="round";g.lineWidth=4;g.strokeStyle="#22313c";
        if(sit){g.beginPath();g.moveTo(-5,-12);g.quadraticCurveTo(-12,-4,-8,-1);g.moveTo(5,-12);g.quadraticCurveTo(12,-4,8,-1);g.stroke();}
        else if(!lie){g.beginPath();g.moveTo(-4,-14);g.lineTo(-5,0);g.moveTo(4,-14);g.lineTo(5,0);g.stroke();}
        if(p.waveUntil>now){g.strokeStyle=`hsl(${p.hue} 50% 65%)`;g.beginPath();g.moveTo(6,bodyY);g.lineTo(13,bodyY-8);g.lineTo(11+Math.sin(t*.01)*3,bodyY-15);g.stroke();}
        if(p.id===ownId.current){g.fillStyle="rgba(234,245,244,.8)";g.beginPath();g.arc(0,8,1.8,0,Math.PI*2);g.fill();}
        g.restore();
      }
    }
    raf=requestAnimationFrame(frame);
    return () => {cancelAnimationFrame(raf);ro.disconnect();};
  },[canvasRef]);
  return <>
    <canvas ref={canvasRef} aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%",zIndex:3,pointerEvents:"none"}}/>
    {!paused && <div className="starlight-seat-panel" style={{position:"absolute",zIndex:10,left:"50%",bottom:"max(8px, env(safe-area-inset-bottom))",transform:"translateX(-50%)",width:"min(94%, 440px)",textAlign:"center",color:"#dcebe8",fontSize:11}}>
      <div role="status" style={{marginBottom:5}}>{count===null?status:count===1?"혼자서도 아름다운 밤":`${count}명이 같은 하늘을 바라보고 있어요`}</div>
      <div style={{display:"flex",justifyContent:"center",gap:5,flexWrap:"wrap"}}>
        {ready?<>{([["sit","앉기"],["lie","눕기"],["idle","서기"]] as const).map(([p,label])=><button key={p} className="scene-pill" onClick={()=>send("state",p)}>{label}</button>)}<button className="scene-pill" onClick={()=>send("wave")}>인사</button><button className="scene-pill" onClick={()=>send("glow")}>빛</button></>:<button className="scene-pill" onClick={()=>setRetry(v=>v+1)}>다시 연결</button>}
        <button className="scene-pill" onClick={onLeave}>나가기</button>
      </div>
    </div>}
  </>;
}
