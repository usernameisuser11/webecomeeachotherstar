"use client";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { LivePeer } from "./LiveOverlook";

type Pose = "idle" | "walk" | "sit" | "lie";
type Peer = { id: string; x: number; hue: number; pose: Pose; waveUntil: number; glowUntil: number };
type Props = { livePeers: RefObject<LivePeer[]>; liveReady: boolean; paused: boolean; onLeave: () => void };
export default function StarlightWalk({ livePeers, liveReady, paused, onLeave }: Props) {
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
    socket.current = ws; peers.current = []; livePeers.current = []; ownId.current = "";
    setReady(false); setCount(null); setStatus("연결 중…");
    ws.onmessage = event => {
      if (disposed) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "welcome") {
          ownId.current = data.id; clock.current = data.serverTime - Date.now();
          setReady(true); setStatus("같은 하늘 아래");
        } else if (data.type === "peers" && Array.isArray(data.peers)) {
          peers.current = data.peers; livePeers.current = data.peers.map((p: Peer) => ({...p,waveUntil:p.waveUntil-clock.current,glowUntil:p.glowUntil-clock.current})); setCount(data.peers.length);
        }
      } catch {}
    };
    ws.onclose = () => {
      if (disposed) return;
      peers.current = []; livePeers.current = []; ownId.current = ""; setReady(false); setCount(null);
      setStatus("연결 종료 · 정원이 찼거나 연결이 끊겼어요");
    };
    ws.onerror = () => { if (!disposed) setStatus("연결을 확인해 주세요"); };
    return () => { disposed = true; peers.current = []; livePeers.current = []; ownId.current = ""; ws.close(); socket.current = null; };
  }, [retry, livePeers]);
  const send = (type: string, pose?: Pose) => {
    const mine = peers.current.find(p => p.id === ownId.current);
    if (paused || !mine || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify(type === "state" ? { type, x: mine.x, pose } : { type }));
  };
  return <>

    {!paused && <div className="starlight-seat-panel" style={{position:"absolute",zIndex:10,left:"50%",bottom:"max(8px, env(safe-area-inset-bottom))",transform:"translateX(-50%)",width:"min(94%, 440px)",textAlign:"center",color:"#dcebe8",fontSize:11}}>
      <div role="status" style={{marginBottom:5}}>{!liveReady?"3D 풍경을 사용할 수 없습니다 · 연결 상태: "+status:count===null?status:count===1?"혼자서도 아름다운 밤":`${count}명이 같은 하늘을 바라보고 있어요`}</div>
      <div style={{display:"flex",justifyContent:"center",gap:5,flexWrap:"wrap"}}>
        {ready?<>{([["sit","앉기"],["lie","눕기"],["idle","서기"]] as const).map(([p,label])=><button key={p} className="scene-pill" onClick={()=>send("state",p)}>{label}</button>)}<button className="scene-pill" onClick={()=>send("wave")}>인사</button><button className="scene-pill" onClick={()=>send("glow")}>빛</button></>:<button className="scene-pill" onClick={()=>setRetry(v=>v+1)}>다시 연결</button>}
        <button className="scene-pill" onClick={onLeave}>나가기</button>
      </div>
    </div>}
  </>;
}
