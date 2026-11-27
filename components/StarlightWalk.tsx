"use client";
import { paintTraveler } from "./TravelerArt";
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
      const g = ctx!, base = h * (w < 600 ? .82 : .88);
      const unit = Math.min(w / 410, h / 750, 1.25);
      // Keep the original painted meadow visible; the figures share its ground.
      const now = Date.now()+clock.current;
      for (const p of peers.current) {
        const x = w*p.x, y = base + 5 + Math.sin(p.x*12)*2;
        g.save(); g.translate(x,y); g.scale(unit,unit);
        paintTraveler(g,p,t,now,still,p.id===ownId.current);
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
