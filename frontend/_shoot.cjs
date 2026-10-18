const { chromium } = require('playwright');
const fs = require('fs');
const OUT = 'C:/Users/MEEGODA/AppData/Local/Temp/claude/shots';
const APP = 'http://localhost:5173';
const API = 'http://127.0.0.1:8000/api/v1';

async function login(page, email) {
  const r = await page.request.post(`${API}/auth/login`, {
    data: { email, password: 'testpass123' } });
  if (!r.ok()) throw new Error(`login ${email}: ${r.status()} ${await r.text()}`);
  const j = await r.json();
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('access_token', t);
    localStorage.setItem('user', u);
  }, [j.access_token, JSON.stringify(j.user)]);
  return j.user;
}

// contrast audit inside the page
const AUDIT = () => {
  function lum(c){const m=c.match(/\d+/g);if(!m)return null;const[r,g,b]=m.slice(0,3).map(Number);
    const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};
    return .2126*f(r)+.7152*f(g)+.0722*f(b);}
  function bgOf(el){let n=el;while(n&&n!==document.documentElement){const c=getComputedStyle(n).backgroundColor;
    if(c&&!/rgba\(0, 0, 0, 0\)|transparent/.test(c))return c;n=n.parentElement;}return 'rgb(244,246,250)';}
  const bad=[];
  document.querySelectorAll('*').forEach(el=>{
    if(!el.childNodes.length)return;
    const txt=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
    if(!txt)return;
    const st=getComputedStyle(el);
    if(st.visibility==='hidden'||st.display==='none'||+st.opacity===0)return;
    const fg=lum(st.color), bg=lum(bgOf(el));
    if(fg===null||bg===null)return;
    const hi=Math.max(fg,bg),lo=Math.min(fg,bg),ratio=(hi+.05)/(lo+.05);
    const size=parseFloat(st.fontSize), bold=+st.fontWeight>=700;
    const large=size>=24||(size>=18.66&&bold);
    const need=large?3:4.5;
    if(ratio<need) bad.push({t:txt.slice(0,42),ratio:+ratio.toFixed(2),size,color:st.color,bg:bgOf(el)});
  });
  const small=[...document.querySelectorAll('*')].filter(el=>{
    const t=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
    if(!t)return false; const s=getComputedStyle(el);
    return s.display!=='none'&&parseFloat(s.fontSize)<13;
  }).map(el=>({t:el.textContent.trim().slice(0,32),size:getComputedStyle(el).fontSize}));
  return {bad:bad.slice(0,12), badCount:bad.length, small:small.slice(0,8), smallCount:small.length};
};

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const shot = async (page, name) => {
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    const a = await page.evaluate(AUDIT);
    results.push({ name, ...a });
    console.log(`${name.padEnd(26)} contrast-fails=${String(a.badCount).padEnd(4)} sub13px=${a.smallCount}`);
  };

  // ---- public pages (no auth)
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await shot(page, '01-home');
  await page.getByText('Login', { exact: false }).first().click().catch(()=>{});
  await page.waitForTimeout(600);
  await shot(page, '02-login');
  await page.getByText(/Don't have an account/i).click().catch(()=>{});
  await page.waitForTimeout(500);
  await shot(page, '03-register');
  await ctx.close();

  // ---- dashboard per role
  const stamp = fs.readFileSync('C:/Users/MEEGODA/AppData/Local/Temp/claude/email_admin.txt','utf8').trim();
  const roles = ['admin','teacher','counselor','student','parent'];
  for (const role of roles) {
    const email = fs.readFileSync(`C:/Users/MEEGODA/AppData/Local/Temp/claude/email_${role}.txt`,'utf8').trim();
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    await login(p, email);
    await p.goto(APP, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    // click the avatar chip to enter dashboard
    await p.locator('button').filter({ hasText: /QA/i }).first().click().catch(async()=>{
      await p.getByText('Dashboard').first().click().catch(()=>{});
    });
    await p.waitForTimeout(3000);
    await shot(p, `10-dash-${role}`);
    await c.close();
  }

  fs.writeFileSync(`${OUT}/audit.json`, JSON.stringify(results, null, 2));
  await browser.close();
})();
