import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser=await chromium.launch({headless:true,args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--no-sandbox"]});
const errors=[];
await mkdir("test-output",{recursive:true});
async function open(viewport){
 const context=await browser.newContext({viewport,deviceScaleFactor:1});
 const page=await context.newPage();
 page.on("pageerror",e=>{errors.push(String(e));console.error("PAGE ERROR",e.stack);});
 page.on("console",m=>{if(["error","warning"].includes(m.type())) console.log("BROWSER",m.type(),m.text());if(m.type()==="error"&&/WebGLProgram|Shader Error|THREE.*error/i.test(m.text()))errors.push(m.text());});
 page.on("requestfailed",r=>console.log("REQUEST FAILED",r.url(),r.failure()));
 page.on("response",r=>{if(r.status()>=400)console.log("HTTP",r.status(),r.url());});
 await page.goto("http://127.0.0.1:8787/",{waitUntil:"domcontentloaded"});
 try {await page.locator('canvas.sky-canvas[data-renderer="live-webgl"]').waitFor({timeout:45000});} catch(e){console.log("3D STATUS",await page.locator("canvas.sky-canvas").evaluate(el=>({dataset:{...el.dataset},width:el.width,height:el.height})).catch(()=>null));await page.screenshot({path:"test-output/failure-"+viewport.width+".png"});throw e;}
 return page;
}
try{
 const desktop=await open({width:1280,height:800});
 const mobile=await open({width:390,height:844});
 await desktop.getByRole("button",{name:"함께 하늘 바라보기"}).click();
 await mobile.getByRole("button",{name:"함께 하늘 바라보기"}).click();
 await desktop.locator('canvas.sky-canvas[data-live-visitors="2"]').waitFor({timeout:20000});
 await mobile.locator('canvas.sky-canvas[data-live-visitors="2"]').waitFor({timeout:20000});
 await desktop.screenshot({path:"test-output/desktop-3d.png"});
 await mobile.screenshot({path:"test-output/mobile-3d.png"});
 assert.deepEqual(errors,[]);
 console.log("Real 3D rendering and two synchronized seated visitors verified on desktop and portrait.");
}finally{await browser.close();}
