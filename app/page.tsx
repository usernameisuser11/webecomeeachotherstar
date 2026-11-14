"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Camera, Check, CircleHelp, Flag, Heart, Link2, Plus, ShieldCheck, Sparkles, Tags, Trash2, Volume2, VolumeX, Waypoints, X } from "lucide-react";
import NightSky, { type Glow, type Star } from "../components/NightSky";
import StellarParticles from "../components/StellarParticles";

type SkyState = { stars: Star[]; glows: Glow[]; liveStarIds: string[] };
type SkyTheme = "forest" | "violet" | "ocean" | "dawn";
type Room = { id: string; name: string; visibility: "public" | "private"; theme: SkyTheme; createdAt: number };
type ActiveRoom = Room & { inviteKey?: string };
type ModerationItem = { starId: string; name: string; reason: string; createdAt: number };
const reportReasons = [
  { value: "abuse", label: "욕설·괴롭힘" },
  { value: "spam", label: "광고·도배" },
  { value: "privacy", label: "개인정보 노출" },
  { value: "other", label: "기타" },
];
const themes: { id: SkyTheme; label: string; note: string }[] = [
  { id: "forest", label: "별이 머무는 숲", note: "깊고 고요한 밤" },
  { id: "violet", label: "보랏빛 성운", note: "은은한 자줏빛" },
  { id: "ocean", label: "푸른 새벽", note: "청록빛 수평선" },
  { id: "dawn", label: "노을 끝의 밤", note: "따뜻한 여운" },
];
const colors = [
  { hue: 187, label: "새벽의 민트", hex: "#a1f2eb" },
  { hue: 213, label: "깊은 하늘", hex: "#9fd6ff" },
  { hue: 263, label: "보랏빛 밤", hex: "#d3b6ff" },
  { hue: 316, label: "분홍 성운", hex: "#ffb3df" },
  { hue: 38, label: "금빛 소원", hex: "#ffe2a2" },
];

function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
}

async function api(payload?: Record<string, unknown>, room?: ActiveRoom | null): Promise<{ [key: string]: any }> {
  const roomPayload = room ? { ...(payload ?? { action: "view" }), roomId: room.id, inviteKey: room.inviteKey } : payload;
  const response = await fetch(room ? "/api/room-sky" : "/api/sky", roomPayload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(roomPayload), cache: "no-store" } : { cache: "no-store" });
  const data: { [key: string]: any } = await response.json();
  if (!response.ok) throw new Error(data.error || "연결에 실패했습니다.");
  return data;
}

const storageKey = (base: string, roomId?: string) => roomId ? `${base}:${roomId}` : base;
const privateWish = (roomId?: string) => { try { return localStorage.getItem(storageKey("our-sky-private-wish-v1", roomId)) || ""; } catch { return ""; } };

export default function Home() {
  const [sky, setSky] = useState<SkyState>({ stars: [], glows: [], liveStarIds: [] });
  const [skyCapacity, setSkyCapacity] = useState(500);
  const [token, setToken] = useState("");
  const [myStarId, setMyStarId] = useState<string | null>(null);
  const [intro, setIntro] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [wish, setWish] = useState("");
  const [hue, setHue] = useState(187);
  const [showerKey, setShowerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [showConstellations, setShowConstellations] = useState(true);
  const [showStarNames, setShowStarNames] = useState(false);
  const [skyDisplayOpen, setSkyDisplayOpen] = useState(false);
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [roomPanel, setRoomPanel] = useState<"directory" | "create" | "moderation" | null>(null);
  const [moderationRoom, setModerationRoom] = useState<Room | null>(null);
  const [moderationItems, setModerationItems] = useState<ModerationItem[]>([]);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("abuse");
  const [reportingRoomId, setReportingRoomId] = useState<string | null>(null);
  const [roomReportReason, setRoomReportReason] = useState("abuse");
  const [roomName, setRoomName] = useState("");
  const [roomVisibility, setRoomVisibility] = useState<"public" | "private">("public");
  const [roomTheme, setRoomTheme] = useState<SkyTheme>("forest");
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const skyCanvas = useRef<HTMLCanvasElement | null>(null);
  const meteorCanvas = useRef<HTMLCanvasElement | null>(null);
  const particleCanvas = useRef<HTMLCanvasElement | null>(null);
  const skyDisplayRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const tokenRef = useRef("");
  const myStarRef = useRef<string | null>(null);
  const roomRef = useRef<ActiveRoom | null>(null);

  useEffect(() => {
    if (!skyDisplayOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!skyDisplayRef.current?.contains(event.target as Node)) setSkyDisplayOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSkyDisplayOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [skyDisplayOpen]);

  useEffect(() => {
    let personalToken = "";
    try {
      personalToken = localStorage.getItem("our-sky-token-v1") || newToken();
      localStorage.setItem("our-sky-token-v1", personalToken);
      const oldId = localStorage.getItem("our-sky-star-id-v1");
      if (oldId) { setMyStarId(oldId); myStarRef.current = oldId; }
      setName(localStorage.getItem("our-sky-star-name-v1") || "");
      setWish(privateWish());
      setShowConstellations(localStorage.getItem("our-sky-constellations-v1") !== "off");
      setShowStarNames(localStorage.getItem("our-sky-star-labels-v1") === "on");
    } catch { personalToken = newToken(); }
    tokenRef.current = personalToken;
    setToken(personalToken);
  }, []);

  const switchRoom = useCallback((room: ActiveRoom | null) => {
    roomRef.current = room;
    setActiveRoom(room);
    setSky({ stars: [], glows: [], liveStarIds: [] });
    setSelectedId(null); setPlacing(false); setShowCreate(false); setRoomPanel(null);
    setReportingId(null);
    setIntro(false);
    try {
      const starId = localStorage.getItem(storageKey("our-sky-star-id-v1", room?.id)) || null;
      myStarRef.current = starId; setMyStarId(starId);
      setName(localStorage.getItem(storageKey("our-sky-star-name-v1", room?.id)) || "");
      setWish(privateWish(room?.id));
      const url = new URL(window.location.href);
      if (room) url.searchParams.set("room", room.id); else url.searchParams.delete("room");
      url.hash = room?.visibility === "private" && room.inviteKey ? `invite=${room.inviteKey}` : "";
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } catch { myStarRef.current = null; setMyStarId(null); }
  }, []);

  useEffect(() => {
    const roomId = new URLSearchParams(window.location.search).get("room");
    if (!roomId) return;
    let inviteKey = new URLSearchParams(window.location.hash.slice(1)).get("invite") || "";
    try { if (!inviteKey) inviteKey = localStorage.getItem(`our-sky-invite:${roomId}`) || ""; } catch {}
    const pending: ActiveRoom = { id: roomId, name: "", visibility: "public", theme: "forest", createdAt: 0, inviteKey };
    api(undefined, pending).then(data => {
      if (data.room) {
        if (data.room.visibility === "private" && inviteKey) try { localStorage.setItem(`our-sky-invite:${roomId}`, inviteKey); } catch {}
        switchRoom({ ...data.room, inviteKey });
      }
    }).catch(error => { setToast(error instanceof Error ? error.message : "초대 링크를 확인해 주세요."); });
  }, [switchRoom]);

  const loadRooms = useCallback(async () => {
    try {
      const [all, mine] = await Promise.all([
        fetch("/api/rooms", { cache: "no-store" }).then(async r => { const data: { rooms: Room[]; error?: string } = await r.json(); if (!r.ok) throw Error(data.error); return data; }),
        tokenRef.current ? fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mine", token: tokenRef.current }) }).then(async r => { const data: { rooms: Room[]; error?: string } = await r.json(); if (!r.ok) throw Error(data.error); return data; }) : Promise.resolve({ rooms: [] }),
      ]);
      setPublicRooms(all.rooms || []); setMyRooms(mine.rooms || []);
    } catch (error) { setToast(error instanceof Error ? error.message : "방을 불러오지 못했습니다."); }
  }, []);

  useEffect(() => { if (token) loadRooms(); }, [token, loadRooms]);

  const openRooms = () => { setIntro(false); setRoomPanel("directory"); loadRooms(); };

  const enterRoom = async (room: Room) => {
    let inviteKey = "";
    try { inviteKey = localStorage.getItem(`our-sky-invite:${room.id}`) || ""; } catch {}
    if (room.visibility === "private" && !inviteKey) { setToast("비공개 방은 초대 링크로 입장할 수 있습니다."); return; }
    switchRoom({ ...room, inviteKey });
  };

  const createRoom = async () => {
    if (busy || !tokenRef.current) return;
    if (!roomName.trim() || [...roomName.trim()].length > 20) { setToast("방 이름은 1~20글자로 적어 주세요."); return; }
    setBusy(true);
    try {
      const inviteKey = roomVisibility === "private" ? newToken() : "";
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", token: tokenRef.current, name: roomName.trim(), visibility: roomVisibility, theme: roomTheme, inviteKey }) });
      const data: { room: Room; error?: string } = await response.json();
      if (!response.ok) throw Error(data.error || "방을 만들지 못했습니다.");
      if (inviteKey) localStorage.setItem(`our-sky-invite:${data.room.id}`, inviteKey);
      switchRoom({ ...data.room, inviteKey });
      setMyRooms(previous => [data.room, ...previous.filter(room => room.id !== data.room.id)]);
      setRoomName("");
      setToast(roomVisibility === "private" ? "비공개 하늘이 만들어졌습니다. 초대 링크를 공유해 주세요." : "새로운 하늘이 열렸습니다.");
    } catch (error) { setToast(error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };

  const deleteRoom = async (room: Room) => {
    if (!window.confirm(`‘${room.name}’ 방을 삭제하시겠습니까? 이 방에 남긴 별과 빛도 함께 사라집니다.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", token: tokenRef.current, roomId: room.id }) });
      const data: { ok?: boolean; error?: string } = await response.json();
      if (!response.ok) throw Error(data.error || "삭제하지 못했습니다.");
      if (roomRef.current?.id === room.id) switchRoom(null);
      try { localStorage.removeItem(`our-sky-invite:${room.id}`); } catch {}
      await loadRooms(); setToast("방이 삭제되었습니다.");
    } catch (error) { setToast(error instanceof Error ? error.message : "방을 삭제하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const openModeration = async (room: Room) => {
    setBusy(true);
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reports", token: tokenRef.current, roomId: room.id }) });
      const data: { reports?: ModerationItem[]; error?: string } = await response.json();
      if (!response.ok) throw Error(data.error || "신고 내역을 불러오지 못했습니다.");
      setModerationRoom(room); setModerationItems(data.reports || []); setRoomPanel("moderation");
    } catch (error) { setToast(error instanceof Error ? error.message : "신고 내역을 불러오지 못했습니다."); }
    finally { setBusy(false); }
  };

  const removeReportedStar = async (room: Room, item: ModerationItem) => {
    if (!window.confirm(`신고된 별 ‘${item.name}’을(를) 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      let inviteKey = "";
      try { inviteKey = localStorage.getItem(`our-sky-invite:${room.id}`) || ""; } catch {}
      await api({ action: "delete-star", targetId: item.starId, token: tokenRef.current }, { ...room, inviteKey });
      setModerationItems(prev => prev.filter(entry => entry.starId !== item.starId));
      if (roomRef.current?.id === room.id) await refresh();
      setToast("신고된 별을 삭제했습니다.");
    } catch (error) { setToast(error instanceof Error ? error.message : "삭제하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const reportRoom = async (room: Room) => {
    setBusy(true);
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "report-room", token: tokenRef.current, roomId: room.id, reason: roomReportReason }) });
      const data: { error?: string } = await response.json(); if (!response.ok) throw Error(data.error || "신고하지 못했습니다.");
      setReportingRoomId(null);
      setToast("신고가 접수되었습니다. 확인 후 필요한 조치를 진행하겠습니다.");
    } catch (error) { setToast(error instanceof Error ? error.message : "신고하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const copyRoomLink = async () => {
    if (!activeRoom) return;
    const url = new URL(window.location.href);
    url.searchParams.set("room", activeRoom.id);
    url.hash = activeRoom.visibility === "private" && activeRoom.inviteKey ? `invite=${activeRoom.inviteKey}` : "";
    try { await navigator.clipboard.writeText(url.href); setToast("초대 링크를 복사했습니다."); }
    catch { setToast("주소창의 링크를 복사해 주세요."); }
  };

  const refresh = useCallback(async () => {
    const requestedRoom = roomRef.current;
    try {
      const data = await api(undefined, requestedRoom);
      if (requestedRoom?.id !== roomRef.current?.id) return;
      setSky({ stars: data.stars || [], glows: data.glows || [], liveStarIds: data.liveStarIds || [] });
      setSkyCapacity(data.capacity || 500);
      if (myStarRef.current && Array.isArray(data.stars) && !data.stars.some((s: Star) => s.id === myStarRef.current)) {
        myStarRef.current = null;
        setMyStarId(null);
        try { localStorage.removeItem(storageKey("our-sky-star-id-v1", requestedRoom?.id)); } catch {}
      }
      setOnline(true);
    } catch { setOnline(false); }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 11000);
    return () => window.clearInterval(timer);
  }, [refresh, activeRoom?.id]);

  useEffect(() => {
    if (!token) return;
    const ping = () => { if (myStarRef.current && document.visibilityState === "visible") api({ action: "ping", token: tokenRef.current }, roomRef.current).catch(() => {}); };
    ping();
    const timer = window.setInterval(ping, 21000);
    return () => window.clearInterval(timer);
  }, [token, activeRoom?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3900);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const myStar = sky.stars.find(s => s.id === myStarId);
  const selected = sky.stars.find(s => s.id === selectedId);
  const liveOther = sky.liveStarIds.some(id => id !== myStarId);
  const ownsCurrentRoom = !!activeRoom && myRooms.some(room => room.id === activeRoom.id);

  const startCreate = () => {
    setIntro(false);
    if (myStarId) { setSelectedId(myStarId); setToast("이미 이 하늘에 남기신 별이 있습니다."); return; }
    setShowCreate(true);
  };
  const beginPlacing = () => {
    if (!name.trim() || [...name.trim()].length > 12) { setToast("별 이름을 1~12글자로 적어 주세요."); return; }
    setShowCreate(false); setIntro(false); setPlacing(true);
  };
  const createAt = async (x: number, y: number) => {
    if (busy || !tokenRef.current) return;
    setBusy(true);
    try {
      const result = await api({ action: "create", token: tokenRef.current, name: name.trim(), x, y, hue }, roomRef.current);
      setMyStarId(result.id); myStarRef.current = result.id;
      try {
        localStorage.setItem(storageKey("our-sky-star-id-v1", roomRef.current?.id), result.id);
        localStorage.setItem(storageKey("our-sky-star-name-v1", roomRef.current?.id), name.trim());
        localStorage.setItem(storageKey("our-sky-private-wish-v1", roomRef.current?.id), wish.trim());
      } catch {}
      setPlacing(false); setSelectedId(result.id);
      setToast("새로운 별이 밤하늘에 도착했습니다. 이곳이 조금 더 밝아졌어요.");
      await refresh();
      api({ action: "ping", token: tokenRef.current }, roomRef.current).catch(() => {});
    } catch (error) { setToast(error instanceof Error ? error.message : "다시 시도해 주세요."); }
    finally { setBusy(false); }
  };

  const sendGlow = async () => {
    if (!selected) return;
    if (!myStarId) { setToast("먼저 자신의 별을 만들어 주세요."); setSelectedId(null); setShowCreate(true); return; }
    if (selected.id === myStarId) return;
    setBusy(true);
    try {
      await api({ action: "glow", token: tokenRef.current, targetId: selected.id }, roomRef.current);
      setToast("작은 빛을 보냈습니다. 친구가 다시 방문하면 그 빛을 발견할 거예요.");
      refresh();
    } catch (error) { setToast(error instanceof Error ? error.message : "빛을 보내지 못했습니다."); }
    finally { setBusy(false); }
  };

  const sendReport = async () => {
    if (!selected || busy || !tokenRef.current) return;
    setBusy(true);
    try {
      await api({ action: "report-star", token: tokenRef.current, targetId: selected.id, reason: reportReason }, roomRef.current);
      setReportingId(null); setToast("신고가 접수되었습니다. 확인 후 필요한 조치를 진행하겠습니다.");
    } catch (error) { setToast(error instanceof Error ? error.message : "신고하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const deleteStar = async () => {
    if (!selected || busy) return;
    const mine = selected.id === myStarId;
    if (!window.confirm(mine ? "내 별을 삭제하시겠습니까? 받은 빛도 함께 삭제되며 되돌릴 수 없습니다." : "방장 권한으로 이 별을 삭제하시겠습니까? 받은 빛도 함께 삭제됩니다.")) return;
    setBusy(true);
    try {
      await api({ action: "delete-star", token: tokenRef.current, targetId: selected.id }, roomRef.current);
      if (mine) {
        myStarRef.current = null; setMyStarId(null);
        try { localStorage.removeItem(storageKey("our-sky-star-id-v1", roomRef.current?.id)); localStorage.removeItem(storageKey("our-sky-star-name-v1", roomRef.current?.id)); localStorage.removeItem(storageKey("our-sky-private-wish-v1", roomRef.current?.id)); } catch {}
      }
      setSelectedId(null); setReportingId(null);
      await refresh(); setToast("별이 삭제되었습니다.");
    } catch (error) { setToast(error instanceof Error ? error.message : "별을 삭제하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const downloadScene = () => {
    const sky = skyCanvas.current;
    if (!sky) return;
    const image = document.createElement("canvas");
    image.width = sky.width; image.height = sky.height;
    const painter = image.getContext("2d");
    if (!painter) return;
    painter.drawImage(sky, 0, 0, image.width, image.height);
    if (particleCanvas.current) painter.drawImage(particleCanvas.current, 0, 0, image.width, image.height);
    if (meteorCanvas.current) painter.drawImage(meteorCanvas.current, 0, 0, image.width, image.height);
    image.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `우리가-같은-하늘-아래-${new Date().toISOString().slice(0,10)}.png`;
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      setToast("지금 이 밤의 풍경을 사진으로 남겼습니다.");
    }, "image/png");
  };

  const toggleAudio = async () => {
    if (audioRef.current) { await audioRef.current.close(); audioRef.current = null; setSoundOn(false); return; }
    try {
      const context = new AudioContext();
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * .25;
      const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
      const lowpass = context.createBiquadFilter(); lowpass.type = "lowpass"; lowpass.frequency.value = 290;
      const gain = context.createGain(); gain.gain.value = .10;
      source.connect(lowpass); lowpass.connect(gain); gain.connect(context.destination); source.start();
      const tone = context.createOscillator(); tone.type = "sine"; tone.frequency.value = 110;
      const lowGain = context.createGain(); lowGain.gain.value = .011;
      tone.connect(lowGain); lowGain.connect(context.destination); tone.start();
      audioRef.current = context; setSoundOn(true);
    } catch { setToast("이 기기에서는 소리를 재생하지 못했습니다."); }
  };
  useEffect(() => () => { audioRef.current?.close().catch(() => {}); }, []);

  return <main className="observatory">
    <NightSky stars={sky.stars} glows={sky.glows} liveStarIds={sky.liveStarIds} myStarId={myStarId} selectedId={selectedId} placing={placing} showerKey={showerKey} showConstellations={showConstellations} showStarNames={showStarNames} intro={intro} theme={activeRoom?.theme || "forest"} canvasRef={skyCanvas} meteorCanvasRef={meteorCanvas} onSpot={createAt} onSelectStar={(id) => { setIntro(false); setSelectedId(id); }} />
    <StellarParticles theme={activeRoom?.theme || "forest"} canvasRef={particleCanvas} />
    <div className="film-grain" aria-hidden="true" /><div className="top-vignette" aria-hidden="true" />
    <header className="topbar">
      <button className="identity" onClick={() => { setIntro(true); setSelectedId(null); setPlacing(false); }} aria-label="처음 화면으로">
        <span className="brand-orbit"><Sparkles size={19} strokeWidth={1.3} /></span>
        <span className="brand-text"><b>우리가 서로의 별이 될 때</b><em>WE BECOME EACH OTHER&apos;S STARS</em></span>
      </button>
      <div className="top-actions">
        <span className="season-tag">NOV. 2026 <span>✦</span> JAN. 2027</span>
        <button className="round-button" onClick={toggleAudio} aria-label={soundOn ? "소리 끄기" : "자연의 소리 켜기"}>{soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
        <button className="round-button" onClick={() => setShowGuide(true)} aria-label="이용 안내"><CircleHelp size={18} /></button>
      </div>
    </header>

    <div className="sky-room-nav">
      <button className="current-sky" onClick={openRooms}><span className="room-nav-star">✧</span><span>{activeRoom?.name || "또래상담 별자리"}</span><span className="nav-chevron">⌄</span></button>
      {activeRoom && <button className="room-link" onClick={copyRoomLink} title="이 방의 초대 링크 복사" aria-label="초대 링크 복사"><Link2 size={15} /> <span>초대</span></button>}
    </div>

    {intro && !placing && <section className="hero">
      <h1>멀리 있어도,<br />우리는 <i>같은 하늘</i><br /><span className="hero-ending">아래에 있어요.</span></h1>
      <p className="intro-copy">서로 다른 하루를 보낸 우리가<br />밤이 되면 하나의 별자리가 되는 곳입니다.<br />당신의 작은 빛도 이곳에 남겨 주세요.</p>
      <div className="hero-buttons">
        <button className="primary-cta" onClick={startCreate}><Sparkles size={16} /> {myStarId ? "내 별 찾아가기" : "나의 별 남기기"} <ArrowUpRight size={15} /></button>
        <button className="quiet-cta" onClick={openRooms}>다른 하늘 둘러보기 <ArrowUpRight size={15} /></button>
      </div>
      <div className="hero-footnote"><span className="little-dot" /> 누군가의 이야기를 들어주는 당신도 잠시 쉬어가세요</div>
    </section>}

    {!intro && !placing && <>
      {sky.stars.length === 0 && <div className="resting-caption"><span className="script-star">✧</span> 이곳에 머문 빛은 사라지지 않아요</div>}
      <section className="scene-controls" aria-label="밤하늘 기능">
        <button className="scene-pill warm" onClick={startCreate}><Sparkles size={17} /> {myStar ? "나의 별" : "별 남기기"}</button>
        <div className="sky-display-wrap" ref={skyDisplayRef}>
          <button className={`scene-pill line-switch ${showConstellations || showStarNames ? "on" : ""}`} onClick={() => setSkyDisplayOpen(v => !v)} aria-label="별자리 표시 설정" aria-expanded={skyDisplayOpen} aria-controls="sky-display-options"><Waypoints size={17} strokeWidth={1.4} /> <span>별자리<span className="line-state"> 설정</span></span></button>
          {skyDisplayOpen && <div id="sky-display-options" className="sky-display-popover" role="group" aria-label="별자리 표시 설정">
            <span className="display-heading">밤하늘 표시</span>
            <button type="button" aria-pressed={showConstellations} onClick={() => setShowConstellations(v => { try { localStorage.setItem("our-sky-constellations-v1", v ? "off" : "on"); } catch {} return !v; })}><Waypoints size={15} /> <span>별자리 연결선</span><span className={`display-check ${showConstellations ? "enabled" : ""}`}>{showConstellations ? "켜짐" : "꺼짐"}</span></button>
            <button type="button" aria-pressed={showStarNames} onClick={() => setShowStarNames(v => { try { localStorage.setItem("our-sky-star-labels-v1", v ? "off" : "on"); } catch {} return !v; })}><Tags size={15} /> <span>별 이름 표시</span><span className={`display-check ${showStarNames ? "enabled" : ""}`}>{showStarNames ? "켜짐" : "꺼짐"}</span></button>
            <p>이름을 누르면 그 별의 이야기를 볼 수 있습니다.</p>
          </div>}
        </div>
        <button className="scene-pill" onClick={() => { setShowerKey(v => v+1); setToast("잠시 하늘을 바라봐 주세요. 유성우가 시작됩니다."); }}><Sparkles size={17} /> 유성우</button>
        <button className="scene-pill icon-only" onClick={downloadScene} aria-label="밤하늘 사진 저장"><Camera size={18} /><span className="photo-label">사진</span></button>
      </section>
      <div className="bottom-annotation"><span className="signal-beam" /> {liveOther ? "지금 이 하늘을 함께 바라보는 친구가 있어요" : "언제든 돌아오실 수 있는 우리의 작은 밤하늘입니다"}</div>
    </>}

    {placing && <section className="placement-banner">
      <div className="placing-symbol">✧</div><b>별이 머물 자리를 골라 주세요</b>
      <p>하늘에서 원하는 곳을 터치해 보세요. 그곳이 나만의 별자리가 됩니다.</p>
      <div className="placement-actions"><button onClick={() => createAt(.23 + Math.random() * .5, .16 + Math.random() * .34)} disabled={busy}>자리 추천받기</button><button onClick={() => { setPlacing(false); setShowCreate(true); }}>돌아가기</button></div>
    </section>}

    {selected && !placing && !intro && <aside className="star-card" aria-label="선택한 별">
      <button className="close-card" onClick={() => setSelectedId(null)} aria-label="별 정보 닫기"><X size={16} /></button>
      <div className="star-card-mark" style={{ color: `hsl(${selected.hue} 100% 82%)` }}>✦</div>
      <div className="star-card-label">{selected.id === myStarId ? "MY LITTLE STAR" : "A STAR IN OUR SKY"}</div>
      <h2>{selected.name}</h2>
      {selected.id === myStarId ? <><p>이 하늘에 직접 남기신 별입니다.</p>{privateWish(activeRoom?.id) && <div className="private-wish"><span>나에게만 보이는 소원</span><p>{privateWish(activeRoom?.id)}</p></div>}</> : <><p>서로 다른 곳에서 같은 밤을 바라보고 있는 누군가의 별입니다.</p><button className="glow-button" disabled={busy} onClick={sendGlow}><Heart size={15} /> 작은 빛 보내기 <ArrowUpRight size={14} /></button></>}
      <div className="star-card-moderation">
        {selected.id !== myStarId && <button className="quiet-report" onClick={() => setReportingId(current => current === selected.id ? null : selected.id)}><Flag size={13} /> 신고하기</button>}
        {(selected.id === myStarId || ownsCurrentRoom) && <button className="quiet-report" disabled={busy} onClick={deleteStar}><Trash2 size={13} /> {selected.id === myStarId ? "내 별 삭제" : "방장 권한으로 삭제"}</button>}
      </div>
      {reportingId === selected.id && <div className="star-report-form">
        <label htmlFor="report-reason">신고 사유</label>
        <select id="report-reason" value={reportReason} onChange={e => setReportReason(e.target.value)}>{reportReasons.map(reason => <option value={reason.value} key={reason.value}>{reason.label}</option>)}</select>
        <button onClick={sendReport} disabled={busy}>신고 접수하기</button>
      </div>}
    </aside>}

    {!intro && !placing && sky.stars.length > 0 && <div className="star-index" aria-label="친구들의 별 목록">
      <span>STAR ATLAS</span><div className="atlas-scroll">{sky.stars.slice(-16).map(s => <button key={s.id} onClick={() => setSelectedId(s.id)} className={s.id === selectedId ? "active" : ""}><span style={{ color: `hsl(${s.hue} 98% 82%)` }}>✦</span>{s.name}</button>)}</div>
    </div>}

    {!online && <div className="network-note" role="status">지금은 별들을 불러오지 못하고 있습니다. 연결을 다시 시도하고 있어요.</div>}
    {toast && <div className="toast" role="status">✧ &nbsp;{toast}</div>}

    {roomPanel && <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setRoomPanel(null); }}>
      <section className="room-sheet" role="dialog" aria-modal="true" aria-label="밤하늘 둘러보기">
        <div className="sheet-top"><span>WE BECOME EACH OTHER&apos;S STARS</span><button onClick={() => setRoomPanel(null)} aria-label="닫기"><X size={19} /></button></div>
        {roomPanel === "directory" ? <>
          <h2>어느 하늘에서<br />만날까요?</h2>
          <p className="sheet-description">방마다 별자리는 다르게 이어집니다.<br />같은 곳을 바라보는 것만으로도 괜찮아요.</p>
          <div className="room-list">
            <button className={!activeRoom ? "room-row chosen" : "room-row"} onClick={() => switchRoom(null)}>
              <span className="room-figure">✦</span><span className="room-row-text"><b>또래상담 별자리</b><small>부원들을 위한 첫 번째 하늘</small></span><span className="room-row-end">↗</span>
            </button>
            {myRooms.length > 0 && <div className="room-list-heading">내가 만든 하늘 <span>{myRooms.length} / 3</span></div>}
            {myRooms.map(room => <div className="room-list-item" key={room.id}>
              <button className={activeRoom?.id === room.id ? "room-row chosen" : "room-row"} onClick={() => enterRoom(room)}><span className="room-figure">{room.visibility === "private" ? "◌" : "✧"}</span><span className="room-row-text"><b>{room.name}</b><small>{room.visibility === "private" ? "초대받은 분만 입장할 수 있습니다" : "누구나 입장할 수 있습니다"}</small></span><span className="room-row-end">↗</span></button>
              <div className="room-owner-actions"><button onClick={() => openModeration(room)} disabled={busy} aria-label={`${room.name} 신고 관리`}><ShieldCheck size={13} /> 관리</button><button onClick={() => deleteRoom(room)} disabled={busy} aria-label={`${room.name} 방 삭제`}>삭제</button></div>
            </div>)}
            {publicRooms.filter(room => !myRooms.some(mine => mine.id === room.id)).length > 0 && <div className="room-list-heading">열려 있는 하늘</div>}
            {publicRooms.filter(room => !myRooms.some(mine => mine.id === room.id)).map(room => <div className="room-list-item" key={room.id}><button className={activeRoom?.id === room.id ? "room-row chosen" : "room-row"} onClick={() => enterRoom(room)}><span className="room-figure">✧</span><span className="room-row-text"><b>{room.name}</b><small>누구나 입장할 수 있습니다</small></span><span className="room-row-end">↗</span></button><button className="room-delete" onClick={() => setReportingRoomId(current => current === room.id ? null : room.id)} disabled={busy} aria-label={`${room.name} 방 신고`}>신고</button>{reportingRoomId === room.id && <div className="room-report-inline"><label htmlFor="room-report-reason">신고 사유</label><select id="room-report-reason" value={roomReportReason} onChange={e => setRoomReportReason(e.target.value)}>{reportReasons.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select><button disabled={busy} onClick={() => reportRoom(room)}>접수</button></div>}</div>)}
          </div>
          <button className="sheet-action" onClick={() => { setRoomName(""); setRoomPanel("create"); }}><Plus size={16} strokeWidth={1.5} /> 새로운 하늘 만들기 <span>↗</span></button>
          <p className="sheet-small-note">회원가입 없이 한 기기에서 최대 세 개의 방을 만들 수 있습니다.</p>
        </> : roomPanel === "moderation" ? <>
          <button className="sheet-back" onClick={() => { setRoomPanel("directory"); loadRooms(); }}>← 돌아가기</button>
          <h2>방의 별 관리</h2>
          <p className="sheet-description">{moderationRoom?.name}에 접수된 신고입니다. 신고가 곧 위반을 뜻하지는 않습니다. 이름을 확인하고 필요한 경우에만 삭제해 주세요.</p>
          {moderationItems.length === 0 ? <p className="sheet-small-note">현재 접수된 별 신고가 없습니다.</p> : <div className="moderation-list">{moderationItems.map((item, index) => <div className="moderation-row" key={`${item.starId}-${index}`}><span><b>{item.name}</b><small>{reportReasons.find(reason => reason.value === item.reason)?.label || "기타"} · {new Date(item.createdAt).toLocaleDateString("ko-KR")}</small></span><button disabled={busy || !moderationRoom} onClick={() => moderationRoom && removeReportedStar(moderationRoom, item)}>별 삭제</button></div>)}</div>}
        </> : <>
          <button className="sheet-back" onClick={() => { setRoomPanel("directory"); loadRooms(); }}>← 돌아가기</button>
          <h2>우리만의<br />작은 하늘.</h2>
          <label className="room-field-label" htmlFor="room-title">이 하늘의 이름</label>
          <input id="room-title" className="room-name-input" value={roomName} maxLength={20} onChange={e => setRoomName(e.target.value)} placeholder="예: 오늘의 작은 숲" autoComplete="off" />
          <div className="room-field-label">누가 들어올 수 있을까요?</div>
          <div className="visibility-choices" role="group" aria-label="방 공개 설정">
            <button className={roomVisibility === "public" ? "picked" : ""} onClick={() => setRoomVisibility("public")} aria-pressed={roomVisibility === "public"}><b>공개</b><span>누구나 찾을 수 있습니다</span></button>
            <button className={roomVisibility === "private" ? "picked" : ""} onClick={() => setRoomVisibility("private")} aria-pressed={roomVisibility === "private"}><b>비공개</b><span>링크를 받은 분만 입장합니다</span></button>
          </div>
          <div className="room-field-label">밤하늘의 분위기</div>
          <div className="theme-choices" role="group" aria-label="밤하늘 배경 선택">
            {themes.map(theme => <button key={theme.id} className={`theme-choice ${theme.id} ${roomTheme === theme.id ? "picked" : ""}`} onClick={() => setRoomTheme(theme.id)} aria-pressed={roomTheme === theme.id}><span className="theme-preview"><span className="theme-ridge"><svg viewBox="0 0 120 60" preserveAspectRatio="none" aria-hidden="true"><path className="far-hills" d="M0 42 C9 40 13 34 21 33 C30 32 33 36 40 36 C48 34 53 20 62 21 C71 22 77 31 84 33 C95 34 99 29 108 34 C114 36 118 39 120 39 L120 60 L0 60 Z" /><path className="near-hills" d="M0 49 C12 45 17 44 25 47 C35 49 39 45 46 41 C53 38 58 45 66 46 C76 48 83 39 92 40 C102 40 109 47 120 47 L120 60 L0 60 Z" /></svg></span></span><b>{theme.label}</b><small>{theme.note}</small></button>)}
          </div>
          <p className="sheet-small-note">비공개 방도 초대 링크를 가진 분은 들어올 수 있습니다. 민감한 이야기는 남기지 말아 주세요.</p>
          <button className="sheet-action" disabled={busy} onClick={createRoom}>하늘 열기 <span>↗</span></button>
        </>}
      </section>
    </div>}

    {showCreate && <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
      <section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <button className="dialog-x" onClick={() => setShowCreate(false)} aria-label="닫기"><X size={20} /></button>
        <div className="dialog-symbol">✦</div><div className="dialog-overline">YOUR LITTLE CONSTELLATION</div>
        <h2 id="create-title">나만의 별을 만들어 보세요</h2><p className="dialog-description">완벽한 소원일 필요는 없습니다.<br />지금의 마음을 이곳에 조금 남겨 주세요.</p>
        <label className="field-label" htmlFor="star-name">별의 이름 <small>다른 친구들에게 보입니다</small></label>
        <input id="star-name" type="text" value={name} maxLength={12} onChange={e => setName(e.target.value)} placeholder="예: 작은 용기, 11월의 밤" autoComplete="off" />
        <div className="field-label">별빛의 색</div>
        <div className="color-list">{colors.map(c => <button key={c.hue} title={c.label} aria-label={c.label} aria-pressed={hue === c.hue} className={hue === c.hue ? "selected" : ""} onClick={() => setHue(c.hue)}><span style={{ background: c.hex, boxShadow: `0 0 18px ${c.hex}77` }} />{hue === c.hue && <Check size={11} />}</button>)}</div>
        <label className="field-label" htmlFor="star-wish">2027년의 작은 소원 <small>선택 · 나에게만 보입니다</small></label>
        <textarea id="star-wish" value={wish} onChange={e => setWish(e.target.value.slice(0,160))} maxLength={160} placeholder="말하지 못했던 바람도 괜찮습니다..." rows={3} />
        <p className="privacy-note">소원은 이 기기에만 저장되며 서버나 다른 친구에게 전송되지 않습니다. 기기 데이터를 삭제하면 함께 사라집니다. 이 하늘에는 별을 최대 {skyCapacity}개까지 남길 수 있습니다.</p>
        <button className="dialog-main" onClick={beginPlacing}>밤하늘에서 자리 정하기 <ArrowUpRight size={17} /></button>
      </section>
    </div>}

    {showGuide && <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setShowGuide(false); }}>
      <section className="create-dialog guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <button className="dialog-x" onClick={() => setShowGuide(false)} aria-label="닫기"><X size={20} /></button>
        <div className="dialog-symbol">✧</div><div className="dialog-overline">THE STORY OF OUR SKY</div><h2 id="guide-title">이 밤하늘의 약속</h2>
        <div className="guide-row"><span>01</span><p>각자의 별을 남길 수 있습니다. 누구에게도 참여를 강요하지 않습니다.</p></div>
        <div className="guide-row"><span>02</span><p>별들은 서로의 곁에서 별자리가 되고, 작은 빛을 주고받을 수 있습니다.</p></div>
        <div className="guide-row"><span>03</span><p>같은 시간에 바라보는 별은 조금 더 밝게 빛납니다. 채팅하지 않아도 괜찮습니다.</p></div>
        <div className="guide-row"><span>04</span><p>소원은 본인 기기에만 저장됩니다. 별 이름은 모두에게 보입니다.</p></div>
        <div className="guide-row"><span>05</span><p>다른 분의 별에 욕설·괴롭힘·광고가 있다면 별을 선택해 신고해 주세요. 신고 내용은 공개되지 않으며, 방장은 자신의 방에서 신고 내역을 확인할 수 있습니다.</p></div>
        <p className="guide-outro">모두의 마음이 같은 속도로 움직일 필요는 없습니다.<br />이곳에서는 그저 함께 빛나 주세요.</p>
        <button className="dialog-main" onClick={() => setShowGuide(false)}>밤하늘로 돌아가기 <ArrowUpRight size={17} /></button>
      </section>
    </div>}
  </main>;
}
