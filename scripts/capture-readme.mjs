import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

// Documentation data lives only in this isolated browser, never in the app defaults.
const browserPath=process.env.PUPPETEER_EXECUTABLE_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!browserPath)throw Error('Set PUPPETEER_EXECUTABLE_PATH to an installed Chrome or Chromium browser.');
const base=process.env.README_CAPTURE_URL ?? 'http://127.0.0.1:3006';
const out=path.resolve('docs/screenshots');fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:browserPath,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1050,deviceScaleFactor:1});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await page.evaluateOnNewDocument(()=>{
  const date=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const profile={gender:'male',heightCm:178,weightKg:78,bodyFatPct:20,age:28,morphValues:{Height:178,Chest:102,Neck:37,'Neck Height':12.36,Shoulders:14.5,"Shoulder's Slope":1,'Bust Girth':88,'Stomach Form':1,Waist:84,'Arm Length':26,'Upper Arm Girth':32,Wrist:16,'Hip Girth':100,'Hip Height':36,'Thigh Girth':58,'Lower Leg Length':38,Calf:38}};
  const progressEntries=Array.from({length:6},(_,i)=>({id:`docs-entry-${i}`,date:date(-35+i*7),weightKg:Math.round((81-i*.6)*10)/10,bodyFatPct:Math.round((22-i*.4)*10)/10,muscleMassPct:Math.round((45+i*.2)*10)/10,waistCm:89-i,notes:i===5?'Consistent training and better recovery.':''}));
  const workoutLogs=[-4,-2,0].map((day,i)=>({id:`docs-session-${i}`,planId:i===1?'lib-upper-body-focus':'lib-full-body-strength',planName:i===1?'Upper Body Focus':'Full Body Strength',completedAt:`${date(day)}T00:30:00`,durationSec:(35+i*5)*60,calories:290+i*40,muscles:['chest','quads','lats','abs'],setsCompleted:17,setsTotal:17}));
  const meals=[{id:'docs-meal-1',name:'Greek yogurt, oats and berries',calories:420,protein:32,carbs:54,fat:10,time:'08:30',date:date()},{id:'docs-meal-2',name:'Grilled chicken with rice and vegetables',calories:610,protein:48,carbs:72,fat:14,time:'13:00',date:date()},{id:'docs-meal-3',name:'Apple and a handful of almonds',calories:230,protein:6,carbs:28,fat:12,time:'16:00',date:date()}];
  if(!sessionStorage.getItem('docs-seeded')){
   localStorage.setItem('fittransform_state_v2',JSON.stringify({profile,goal:{type:'weight-loss',targetWeightKg:73.5,targetBodyFatPct:17,timelineWeeks:16},customPlans:[],workoutLogs,meals,waterMlByDate:{[date()]:1500},progressEntries,macroOverride:null,dailyCheckins:{[date()]:{sleepHours:8,steps:8200,energy:4,soreness:2,notes:'Good energy after an easy walk.'}}}));
   sessionStorage.setItem('docs-seeded','true');
  }
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function go(route){const response=await page.goto(base+route,{waitUntil:'networkidle2',timeout:90000});if(response.status()!==200&&response.status()!==304)throw Error(`${route}: ${response.status()}`);await page.evaluate(()=>document.fonts.ready);await new Promise(r=>setTimeout(r,650));}
 async function click(text){await page.evaluate(t=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t);if(!button)throw Error(`Missing ${t}`);button.click()},text);await new Promise(r=>setTimeout(r,350));}
 async function shot(name,fullPage=true){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,name+'.png'),fullPage});console.log('Captured',name);}
 await go('/');await page.waitForFunction(()=>!document.body.textContent.includes('SYNCHRONIZING ANATOMICAL MESH'),{timeout:60000});await new Promise(r=>setTimeout(r,1000));await shot('dashboard');
 await click('AI Coach');const answer=page.waitForResponse(r=>r.url().endsWith('/api/ai-coach')&&r.request().method()==='POST',{timeout:60000});await click('Tips for recovery and sleep');await answer;await new Promise(r=>setTimeout(r,600));await shot('ai-coach');
 await go('/workouts');await page.click('.ft-workout-row');await page.waitForFunction(()=>document.body.textContent.includes('Start workout'));await shot('workouts');
 await click('Start workout');await shot('workout-session',false);await page.keyboard.press('Escape');
 await go('/nutrition');await shot('nutrition');
 await go('/progress');await shot('progress');
 await go('/today');await shot('my-day');
 await page.setViewport({width:390,height:844,deviceScaleFactor:1});await go('/');await page.waitForFunction(()=>!document.body.textContent.includes('SYNCHRONIZING ANATOMICAL MESH'),{timeout:60000});await new Promise(r=>setTimeout(r,800));await shot('dashboard-mobile');
 if(errors.length)throw Error(errors.join('\n'));console.log('All screenshots captured without browser runtime errors.');
}finally{await browser.close()}
