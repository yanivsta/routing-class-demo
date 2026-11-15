
(() => {
  class PacketRun {
    constructor(caseId,policy,observation=false) {
      this.caseId=caseId;this.policy=policy;this.observation=observation;
      this.t=0;this.caps=observation?[3,3]:(caseId==='a'?[1,3]:[3,3]);
      this.flows=[];this.queues=[[],[]];this.flights=[];this.feedback=[];this.acks=[];this.peak=[0,0];this.incoming=[0,0];this.queueHistory=[[0],[0]];
      this.seed=101;this.changed=!observation;this.done=false;this.moves=0;this.attempts=0;
      this.event=observation?'הרשת תקינה: ארבע זרימות, שתיים בכל מסלול.':'זרימות חדשות מתחילות ברשת שאחרי השינוי.';
      const hashes=caseId==='b'?(observation?[.1,.2,.3,.6,.7,.9]:[.1,.2,.3,.4,.45,.9]):[.1,.4,.6,.9];
      hashes.forEach(h=>this.addFlow(h));
    }
    random(){this.seed=(1664525*this.seed+1013904223)>>>0;return this.seed/4294967296;}
    addFlow(hash,forcedPath) {
      const cutoff=this.policy==='wcmp'?this.caps[0]/(this.caps[0]+this.caps[1]):.5;
      this.flows.push({id:this.flows.length,path:forcedPath??(hash<cutoff?0:1),sent:0,received:0,finish:null,samples:0,marked:0,events:[],markedSeen:false,feedbackSeen:false});
    }
    tick() {
      if(this.done)return;
      this.t++;
      if(this.observation&&!this.healthy&&this.t===1) {
        this.changed=true;
        if(this.caseId==='a') {this.caps=[1,3];this.event='שני קישורים במסלול א׳ כבו. שיבוץ הזרימות לא השתנה.';}
        else {this.flows.forEach((f,i)=>f.path=i<5?0:1);this.event='חמש זרימות שובצו למסלול א׳ ואחת למסלול ב׳. כל הקישורים פעילים.';}
      }
      if(this.t===1)this.initialPaths=this.flows.map(f=>f.path);
      const arrived=this.flights.filter(p=>p.end<=this.t);
      this.incoming=[0,0];
      this.flights=this.flights.filter(p=>p.end>this.t);
      for(const p of arrived) {
        if(p.phase==='in') {this.queues[p.path].push(p);this.incoming[p.path]++;}
        else {
          const f=this.flows[p.flow];f.received++;
          if(f.received===48)f.finish=this.t;
          this.feedback.push({flow:p.flow,marked:p.marked,due:this.t+4});
          if(p.marked)this.acks.push({flow:p.flow,start:this.t,end:this.t+4});
        }
      }
      const ready=this.feedback.filter(a=>a.due<=this.t);
      this.feedback=this.feedback.filter(a=>a.due>this.t);
      this.acks=this.acks.filter(a=>a.end>this.t);
      for(const a of ready){
        const f=this.flows[a.flow];
        f.samples++;
        if(a.marked){
          f.marked++;
          if(!f.feedbackSeen){
            f.feedbackSeen=true;
            f.events.push({cycle:this.t,label:'אישור עם חיווי גודש הגיע לשולח.'});
          }
        }
      }
      for(const f of this.flows) {
        if(this.policy==='fb'&&this.t>f.id*2&&(this.t-f.id*2)%8===0) {
          if(f.samples&&f.marked/f.samples>.05&&f.sent<48) {
            const old=f.path;f.path=this.random()<.5?0:1;this.attempts++;
            const path=f.path?'ב׳':'א׳';
            const percentage=Math.round(100*f.marked/f.samples);
            f.events.push({cycle:this.t,label:old===f.path
              ? `${percentage}% מהאישורים בחלון העידו על גודש. השולח שינה את קלט הגיבוב, והמתג שוב בחר במסלול ${path}.`
              : `${percentage}% מהאישורים בחלון העידו על גודש. השולח שינה את קלט הגיבוב, וחבילות חדשות יוצאות למסלול ${path}.`});
            if(old!==f.path){this.moves++;this.event=`זרימה ${f.id+1}: בעקבות משוב גודש, חבילות חדשות נשלחות למסלול ${f.path?'ב׳':'א׳'}.`;}
          }
          f.samples=0;f.marked=0;
        }
        if(f.sent<48)this.flights.push({flow:f.id,seq:f.sent++,path:f.path,phase:'in',start:this.t,end:this.t+2,marked:false});
      }
      for(let path=0;path<2;path++) {
        for(let k=0;k<this.caps[path]&&this.queues[path].length;k++) {
          const marked=this.queues[path].length>=4;
          const p=this.queues[path].shift();
          const f=this.flows[p.flow];
          if(marked&&!f.markedSeen){
            f.markedSeen=true;
            f.events.push({cycle:this.t,label:`המתג במסלול ${path?'ב׳':'א׳'} סימן חבילה בגודש.`});
          }
          this.flights.push({...p,lane:k,phase:'out',start:this.t,end:this.t+4,marked:p.marked||marked});
        }
      }
      this.done=this.flows.every(f=>f.finish!==null);
      this.queues.forEach((q,i)=>{
        this.peak[i]=Math.max(this.peak[i],q.length);
        this.queueHistory[i].push(q.length);
      });
      if(this.done)this.event='כל החבילות נמסרו למקבל.';
    }
  }
  const root=document.getElementById('routing-classroom-activity');
  const $=id=>root.querySelector('#rp-'+id);
  const names={ecmp:'ECMP',wcmp:'WCMP',fb:'FlowBender'};
  const stateKey='routing-class-demo-progress';
  function loadProgress(){
    try { return JSON.parse(localStorage.getItem(stateKey)); }
    catch { return null; }
  }
  function setText(node,text){
    if(node.textContent!==text)node.textContent=text;
  }
  const colors=Array.from({length:6},(_,i)=>`var(--viz-series-${i+1})`);
  const blankAnswer=()=>({choice:null,checked:false,correct:false});
  const blankCase=()=>({diagnosis:blankAnswer(),evidence:blankAnswer(),reflection:blankAnswer(),seenHealthy:false,seenProblem:false,lastPolicy:''});
  let caseId='a',phase=0,sub=0,mode='cases',policy='',confirmed=false,speed=1;
  let records={a:blankCase(),b:blankCase()},results={a:{},b:{}},quiz=[blankAnswer(),blankAnswer(),blankAnswer()],quizIndex=0,note='';
  let model,view=null,running=false,frame=0,lastTick=0,lastPaint=0,recorded=false;
  let trackedFlow=0,chartPath=0,chartKey='',timelineKey='',prediction=null;
  const predictions=['כבר בשיבוץ ההתחלתי','אחרי שמגיע משוב גודש','השיבוץ יישאר זהה'];
  const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const headings=['הכירו את הרשת','צפו במה שהשתנה','אבחון ההאטה','בחירת שיטת ניתוב','השוואת תוצאות'];
  const quizQuestions=[
    {title:'מה מבטיח גיבוב קבוע לכל זרימה?',options:['חלוקה מאוזנת של התעבורה בכל רגע','אותו חיבור מקבל אותה בחירת מסלול כל עוד הגדרות הניתוב נשארות קבועות','שכל חבילה נשלחת למסלול אחר'],answer:1,explanation:'הגיבוב משתמש בשדות החיבור כדי לבחור יציאה. הוא אינו מודד תורים, ולכן קבוצת זרימות מסוימת יכולה להתרכז באותו מסלול. יציבות השיבוץ אינה הבטחה לאיזון עומס.',hint:'הבחינו בין יציבות הבחירה עבור חיבור מסוים לבין איזון בין חיבורים שונים.'},
    {title:'שני מסלולים בעלי קיבולת שווה, אבל נוצר תור רק באחד. איזה מידע יכול לעזור מעבר לקיבולות?',options:['משוב על הגודש שחוותה הזרימה','רק ספירה של הקישורים הפעילים','רק ידיעה שהקיבולת הכוללת ברשת מספיקה'],answer:0,explanation:'מידע על קיבולת מתאר כמה המסלול מסוגל להעביר. משוב גודש מעיד על מה שהזרימה חוותה בפועל. גם כשהקיבולות שוות, שיבוץ הזרימות יכול ליצור עומס שונה.',hint:'הטופולוגיה עשויה להישאר זהה בזמן שהתעבורה משתנה.'},
    {title:'שיטה סיימה מהר יותר בשני המקרים שניסינו. מה אפשר להסיק מכך?',options:['היא תהיה המהירה ביותר בכל רשת ובכל עומס','אין חשיבות לגודל הזרימות או לקלטי הגיבוב','היא טובה יותר במקרים שנבדקו; נדרשים ניסויים נוספים כדי להכליל'],answer:2,explanation:'המקרים כאן נבחרו כדי להמחיש שני מנגנונים. מספר הזרימות, גודלן, קלטי הגיבוב, הקיבולות והשהיית המשוב יכולים לשנות את התוצאות. גם מדד סיום כל העבודה שונה מזמן השלמה ממוצע של זרימה.',hint:'חשבו מה השתנה בניסוי ומה נשאר קבוע, ואילו תנאים עוד לא בדקנו.'}
  ];
  function caseQuestion(kind){
    const a=caseId==='a';
    if(kind==='diagnosis')return {title:'מה גרם להאטה בהרצה השנייה?',options:['חלק מהקישורים הפסיקו להעביר תעבורה','גיבוב הזרימות יצר שיבוץ לא מאוזן','המקבל מגביל את שני המסלולים'],answer:a?0:1,explanation:a?'שני קישורים במסלול א׳ כבו והקיבולת שלו ירדה מ־3 ל־1. מספר הזרימות בו נשאר שתיים, ולכן מגיעות שתי חבילות במחזור אך רק אחת יכולה לצאת. העודף ממתין בתור.':'אותם שישה שולחים ואותם קישורים נשארו ברשת. בהרצה החדשה חמש זרימות שובצו למסלול א׳ ורק אחת לב׳. א׳ מקבל חמש חבילות במחזור ומעביר שלוש, בזמן שבב׳ נותרת קיבולת פנויה.',hint:'בדקו מה השתנה: מספר הקישורים הפעילים או חלוקת הזרימות.'};
    if(kind==='evidence')return {title:'איזה סימן בתצוגה תומך באבחנה?',options:['מספר השולחים גדל בין ההרצות','שני קישורים במסלול א׳ כבו','כל הקישורים פעילים, אבל חלוקת הזרימות היא 5–1'],answer:2,explanation:'זהו חוסר איזון בשיבוץ. הקיבולת הכוללת נשארה שש חבילות במחזור, אבל חמש משש הזרימות חולקות מסלול שמעביר שלוש בלבד. הקיבולת הפנויה במסלול האחר אינה עוזרת כל עוד השיבוץ קבוע.',hint:'ספרו את השולחים, הקישורים והזרימות שמשויכות לכל מסלול.'};
    return {title:a?'איזה מידע מאפשר לבחור משקלים מתאימים למקרה א׳?':'איזה מידע נוסף מאפשר לשולח להגיב לעומס במקרה ב׳?',options:a?['מספר החבילות שכבר הגיעו בלבד','הקיבולות האפקטיביות של המסלולים','הנחה שכל זרימה יודעת מהו המסלול הפנוי']:['מספר השולחים בלבד','רק העובדה שהקיבולות שוות','סימוני גודש שחוזרים לשולח דרך המקבל'],answer:a?1:2,explanation:a?'ידיעת הקיבולות מאפשרת להפחית את הסיכוי שזרימה חדשה תישלח למסלול החלש. המשקלים מבטאים יחס קיבולות; הם אינם מדידה של התור בכל רגע.':'משוב גודש מעיד שהזרימה חוותה עומס בדרך. השולח יכול לנסות גיבוב חדש, אבל אינו מקבל מפה של העומסים בכל המסלולים ואינו יודע מראש שהניסיון יצליח.',hint:'הבחינו בין מידע על מבנה הרשת לבין מידע על העומס שהזרימה חוותה.'};
  }
  function activeQuestion(){
    if(mode==='quiz')return {data:quizQuestions[quizIndex],state:quiz[quizIndex],key:'quiz'};
    if(mode!=='cases')return null;
    const kind=phase===2?(sub===1?'evidence':'diagnosis'):phase===4?'reflection':null;
    return kind?{data:caseQuestion(kind),state:records[caseId][kind],key:kind}:null;
  }
  function cleanAnswer(a){return {choice:Number.isInteger(a?.choice)&&a.choice>=0&&a.choice<3?a.choice:null,checked:!!a?.checked,correct:!!a?.correct};}
  function restore(saved){
    const s=saved?.modelContent,p=saved?.privateContent;
    if(s?.pilot!=='routing-classroom-activity'||s.version!==4)return;
    caseId=s.caseId==='b'?'b':'a';phase=Number.isInteger(s.phase)&&s.phase>=0&&s.phase<=4?s.phase:0;
    sub=s.sub===1&&caseId==='b'&&phase===2?1:0;
    mode=['cases','quiz','complete'].includes(s.mode)?s.mode:'cases';
    policy=names[s.policy]?s.policy:'';confirmed=!!s.confirmed&&!!policy;
    speed=[.25,.5,.75,1,1.25,1.5,1.75,2].includes(s.speed)?s.speed:1;
    quizIndex=Number.isInteger(s.quizIndex)&&s.quizIndex>=0&&s.quizIndex<3?s.quizIndex:0;
    for(const c of ['a','b']){
      for(const method of Object.keys(names))if(Number.isInteger(s.results?.[c]?.[method])&&s.results[c][method]>0&&s.results[c][method]<1000)results[c][method]=s.results[c][method];
      for(const k of ['diagnosis','evidence','reflection'])records[c][k]=cleanAnswer(p?.records?.[c]?.[k]);
      records[c].seenHealthy=!!p?.records?.[c]?.seenHealthy;records[c].seenProblem=!!p?.records?.[c]?.seenProblem;
      records[c].lastPolicy=names[p?.records?.[c]?.lastPolicy]?p.records[c].lastPolicy:'';
    }
    quiz=quiz.map((_,i)=>cleanAnswer(p?.quiz?.[i]));note=String(p?.note||'').slice(0,500);
    trackedFlow=p?.trackedFlow===null?null:Number.isInteger(p?.trackedFlow)&&p.trackedFlow>=0&&p.trackedFlow<6?p.trackedFlow:0;
    prediction=[0,1,2].includes(p?.prediction)?p.prediction:null;
  }
  function save(){
    const modelContent={pilot:'routing-classroom-activity',version:4,caseId,phase,sub,mode,policy,confirmed,speed,quizIndex,results};
    try {
      localStorage.setItem(stateKey,JSON.stringify({modelContent,privateContent:{records,quiz,note,trackedFlow,prediction}}));
    } catch { /* The current session can continue with browser storage disabled. */ }
  }
  function pause(){running=false;cancelAnimationFrame(frame);}
  function createRun(kind,finished=false){
    pause();const observation=kind!=='trial';
    model=new PacketRun(caseId,observation?'ecmp':(policy||records[caseId].lastPolicy||'ecmp'),observation);
    model.healthy=kind==='healthy';view=null;recorded=finished;
    if(finished)while(!model.done&&model.t<1000)model.tick();
  }
  function enter(p){
    pause();phase=p;sub=0;policy='';confirmed=false;prediction=null;mode='cases';
    createRun(p===0?'healthy':'problem',p>=2);render();save();
  }
  function reconstruct(){
    if(mode!=='cases'||phase===4){policy=records[caseId].lastPolicy||policy||'ecmp';createRun('trial',true);}
    else if(phase===0)createRun('healthy',records[caseId].seenHealthy);
    else if(phase===1)createRun('problem',records[caseId].seenProblem);
    else if(phase===3&&confirmed)createRun('trial');
    else createRun('problem',true);
    render();
  }
  function scoreTable(c){
    const rows=Object.entries(results[c]);
    return rows.length?'<table class="table table-sm"><thead><tr><th>שיטה</th><th>סיום כל העבודה</th></tr></thead><tbody>'+rows.map(([p,t])=>`<tr><td><div dir="ltr">${names[p]}</div>${p==='ecmp'?'<span class="text-small">הרצת הבסיס הבעייתית</span>':''}</td><td class="tabular-nums">${t} מחזורים</td></tr>`).join('')+'</tbody></table>':'';
  }
  const baselineRuns={};
  function getBaseline(c){
    if(!baselineRuns[c]){
      const run=new PacketRun(c,'ecmp',true);
      run.healthy=false;
      while(!run.done&&run.t<1000)run.tick();
      baselineRuns[c]=run;
    }
    return baselineRuns[c];
  }
  function renderComparison(){
    const visible=mode==='cases'&&phase===4&&model.done;
    $('comparison').hidden=!visible;
    if(!visible){chartKey='';return;}
    const key=[caseId,model.policy,chartPath].join(':');
    if(key===chartKey)return;
    chartKey=key;
    const base=getBaseline(caseId);
    const baseline=base.queueHistory[chartPath],trial=model.queueHistory[chartPath];
    const duration=Math.max(base.t,model.t);
    const peak=Math.max(...baseline,...trial);
    const maxQueue=Math.max(4,Math.ceil(peak/4)*4);
    const plot=$('chart');
    plot.replaceChildren();
    const x=t=>38+t*367/duration;
    const y=q=>116-q*94/maxQueue;
    const label=(px,py,value,anchor='middle')=>{
      make('text',{x:px,y:py,'text-anchor':anchor},plot).textContent=value;
    };
    for(let i=0;i<=4;i++){
      const q=i*maxQueue/4;
      make('line',{x1:x(0),x2:x(duration),y1:y(q),y2:y(q),stroke:'var(--border)'},plot);
      label(29,y(q)+4,q,'end');
      const t=Math.round(i*duration/4);
      label(x(t),132,t);
    }
    label(x(0),12,'חבילות בתור','start');
    label((x(0)+x(duration))/2,150,'מחזור סימולציה');
    const series=(values,color,dashed)=>{
      const points=values.map((q,t)=>`${x(t).toFixed(2)},${y(q).toFixed(2)}`).join(' ');
      make('polyline',{points,fill:'none',stroke:color,'stroke-width':dashed?2:3,
        'stroke-dasharray':dashed?'5 4':'none','stroke-linejoin':'round'},plot);
    };
    series(trial,'var(--viz-series-1)',false);
    series(baseline,'var(--muted-foreground)',true);
    $('chart-method').textContent=names[model.policy];
    const path=chartPath?'ב׳':'א׳';
    plot.setAttribute('aria-label',`אורך התור לאורך זמן במסלול ${path}`);
    const identical=trial.length===baseline.length&&trial.every((q,t)=>q===baseline[t]);
    $('chart-summary').textContent=`מסלול ${path} · שיא התור: ${base.peak[chartPath]} חבילות בבסיס, ${model.peak[chartPath]} בניסוי.`+
      (identical?' שני הקווים חופפים.':'');
  }
  function renderTracker(){
    const visible=mode==='cases'&&caseId==='b';
    $('tracker').hidden=!visible;
    $('flow-picker').hidden=!visible;
    if(!visible){timelineKey='';return;}
    const selected=model.flows[trackedFlow];
    $('flow-filter').value=selected?String(trackedFlow):'all';
    const status=selected?`זרימה ${selected.id+1} · שיבוץ נוכחי למסלול ${selected.path?'ב׳':'א׳'} · נמסרו ${selected.received}/48 חבילות`
      :'בחרו זרימה כדי להדגיש את החבילות שלה ולהציג את האירועים שלה.';
    $('track-status').textContent=status;
    const events=selected?.events??[];
    const key=JSON.stringify([selected?.id,model.done,events]);
    if(timelineKey===key)return;
    timelineKey=key;
    $('timeline').replaceChildren();
    if(!selected)return;
    const add=text=>{
      const row=document.createElement('li');row.textContent=text;$('timeline').append(row);
    };
    if(!events.length)add(model.done?'לזרימה הזאת לא היו סימוני גודש בהרצה.':'כשחבילה של הזרימה תסומן בגודש, יופיע כאן מספר המחזור.');
    else for(const event of events)add(`מחזור ${event.cycle} · ${event.label}`);
  }
  function resultExplanation(){
    const base=results[caseId].ecmp||model.t,delta=base-model.t;
    const effect=delta>0?`נחסכו ${delta} מחזורים.`:delta===0?'זמן הסיום נשאר זהה.':`נוספו ${-delta} מחזורים.`;
    const why=model.policy==='wcmp'?(caseId==='a'?'המשקלים 1:3 שיבצו במקרה הזה זרימה אחת במסלול החלש ושלוש בחזק, בהתאמה לקיבולות. זהו שיבוץ התחלתי של זרימות חדשות.':'הקיבולות שוות, ולכן גם המשקלים שווים. עם אותם קלטי גיבוב מתקבלת שוב חלוקת 5–1; המשקלים אינם מבטאים את העומס בפועל.'):model.policy==='fb'?'השולחים קיבלו משוב גודש וניסו גיבוב חדש במהלך ההעברה. המשוב מגיע אחרי השהיה, וניסיון גיבוב עשוי לבחור שוב את אותו מסלול.':'הגיבוב הקבוע שמר על אותו שיבוץ. הוא אינו משתמש במידע על גודש כדי להעביר זרימה למסלול אחר.';
    const suggestion=delta<=0?'כדאי להריץ עוד פתרון ולראות אם יש שיפור.':caseId==='a'&&model.policy!=='wcmp'?'הבחירה עזרה. אפשר לבדוק אם שיטה נוספת מקצרת עוד את זמן ההשלמה.':'הבחירה שיפרה את התוצאה במודל הזה. אפשר להשוות גם לשיטה נוספת.';
    const original=getBaseline(caseId);
    const initialChanged=model.initialPaths.some((path,i)=>path!==original.initialPaths[i]);
    const observedText=initialChanged?'השיבוץ השתנה כבר בתחילת ההרצה.'
      :model.moves?'השיבוץ השתנה לאחר שהגיע משוב גודש.':'השיבוץ נותר זהה לאורך ההרצה.';
    const forecast=prediction===null?'':`התחזית שלכם: ${predictions[prediction]}. ${observedText}`;
    return {headline:`${model.t} מחזורים לעומת ${base}. ${effect}`,why,suggestion,forecast};
  }
  function updateControls(){
    const playable=mode==='cases'&&(phase<=1||phase===3&&confirmed&&prediction!==null);
    $('play').disabled=!playable||running||model.done;
    $('pause').disabled=!running;
    $('restart').disabled=mode!=='cases'||!model.t||phase>=2&&phase!==3&&phase!==4;
    $('restart').textContent='איפוס הרצה';
    $('play').textContent=running?'מריץ…':model.t&&!model.done?'המשך':'הרצה';
    $('another').disabled=mode!=='cases'||phase!==4||running;
    $('back').disabled=running||mode==='cases'&&phase===0||mode==='complete';
  }
  function render(){
    draw();updateControls();renderComparison();renderTracker();
    const currentCase=mode==='cases'?caseId:'review';
    for(const id of ['a','b','review']){
      const element=$('case-'+id);
      if(id===currentCase)element.setAttribute('aria-current','step');
      else element.removeAttribute('aria-current');
    }
    $('steps').hidden=mode!=='cases';
    [...$('steps').children].forEach((step,i)=>{
      if(i===phase)step.setAttribute('aria-current','step');
      else step.removeAttribute('aria-current');
    });
    setText($('stage'),mode==='cases'?`שלב ${phase+1} מתוך 5`:mode==='quiz'?`שאלה ${quizIndex+1} מתוך 3`:'הפעילות הושלמה');
    const progress=mode==='complete'?13:mode==='quiz'?10+quizIndex:(caseId==='a'?0:5)+phase;
    $('stage-progress').setAttribute('aria-valuenow',progress);$('stage-fill').style.width=`${progress/13*100}%`;
    $('run-title').textContent=mode==='cases'?(phase===0?'הרצה ראשונה · מצב תקין':phase<=2?'הרצה שנייה · תנאים שהשתנו':'ניסוי תיקון · אותם תנאים ואותן זרימות חדשות'):'ההרצה האחרונה · לעיון לצד שאלות הסיכום';
    $('active-method').textContent=names[model.policy];$('speed').value=String(speed);$('speed-label').textContent=speed+'×';
    $('clock').textContent=`מחזור ${model.t} · נמסרו ${model.flows.reduce((s,f)=>s+f.received,0)}/${model.flows.length*48} חבילות`;
    $('class-note').hidden=mode!=='complete';
    $('heading').textContent=mode==='cases'?(phase===3&&confirmed?'תחזית ובדיקת השיטה':headings[phase]):mode==='quiz'?'בודקים את ההבנה':'סיימתם את שני המקרים ואת שאלות הסיכום';
    const explanation=phase===4?resultExplanation():null;
    const instruction=mode==='complete'?'הסתכלו שוב בתוצאות ובחרו ראיה אחת שתוכלו להסביר בכיתה.'
      :mode==='quiz'?'בחרו תשובה. אחרי הבדיקה יופיע ההסבר.'
      :phase===0?'בהרצה התקינה שתי היציאות יכולות להעביר שלוש חבילות במחזור כל אחת. שימו לב לכמה זרימות משובצות לכל נתיב.'
      :phase===1?'הריצו שוב וחפשו רמז להאטה. השוו בין הקיבולת של כל נתיב, מספר הזרימות ששובצו אליו והתור שנוצר.'
      :phase===2?'בחרו את ההסבר שמתאים למה שראיתם בהרצה.'
      :phase===3?(confirmed?'בחרו מה אתם מצפים לראות, ואז הריצו את הניסוי.':'בחרו שיטה כדי לבדוק אותה עם אותן זרימות ובאותם תנאי רשת.')
      :explanation.headline;
    setText($('context'),instruction);
    const event=mode==='cases'&&phase===4?explanation.suggestion
      :phase===3&&!running&&model.t===0?''
      :model.observation?(model.done?`ההרצה הסתיימה אחרי ${model.t} מחזורים. בתרשים מופיע עכשיו שיא התור בכל נתיב.`:''):model.event;
    setText($('event'),event);
    $('event').hidden=!event;
    $('return').hidden=mode!=='cases'||!model.done||phase===3;
    if($('flow-details').open)$('flow-progress').innerHTML=model.flows.map(f=>`<div class="rp-flow"><span>${f.id+1} → ${f.path?'ב׳':'א׳'}</span><div class="rp-track" role="progressbar" aria-label="חבילות שנמסרו בזרימה ${f.id+1}" aria-valuemin="0" aria-valuemax="48" aria-valuenow="${f.received}"><span style="width:${100*f.received/48}%;background:${colors[f.id]}"></span></div><span class="tabular-nums">${f.received}/48</span></div>${f.finish!==null?`<div class="text-small">זרימה ${f.id+1}: זמן השלמה ${f.finish} מחזורים</div>`:''}`).join('');
    $('scores').innerHTML=mode==='cases'?(phase===4?scoreTable(caseId)+'<div class="text-small">'+explanation.why+'</div>':'<div class="text-small">מדד ההשוואה: מספר המחזורים עד שכל החבילות נמסרות. הזמן של כל זרימה זמין בפירוט.</div>'):'<div>מקרה א׳</div>'+scoreTable('a')+'<div>מקרה ב׳</div>'+scoreTable('b');
    const q=activeQuestion(),trialSetup=mode==='cases'&&phase===3;
    const method=trialSetup&&!confirmed,forecast=trialSetup&&confirmed;
    $('question-title').textContent=q?q.data.title:method?'איזו שיטה תרצו לבדוק?':forecast?'מתי, אם בכלל, ישתנה שיבוץ הזרימות ביחס להרצת הבסיס?':'';
    const visible=!!q||trialSetup;
    $('answers').hidden=!visible;$('answers').setAttribute('aria-hidden',String(!visible));
    for(let i=0;i<3;i++){
      const value=method?Object.keys(names).indexOf(policy):forecast?prediction:q?.state.choice;
      $('option-'+i).setAttribute('aria-pressed',String(value===i));
      $('option-'+i).disabled=!visible||running;
      $('option-name-'+i).textContent=method?['ECMP','WCMP','FlowBender'][i]:'';
      $('option-name-'+i).hidden=!method;
      $('option-text-'+i).textContent=forecast?predictions[i]:method?['גיבוב קבוע לכל זרימה, עם הסתברויות בחירה שוות.','שיבוץ התחלתי בהסתברויות המתאימות לקיבולות המעודכנות.','ניסיון גיבוב חדש במהלך הזרימה בעקבות משוב גודש.'][i]:q?q.data.options[i]:'';
    }
    $('check').textContent=method?'להמשיך לתחזית':'בדיקת תשובה';
    $('check').disabled=running||(!q&&!method)||method&&!policy||!!q&&q.state.choice===null;
    let feedback='';
    if(q?.state.checked)feedback=(q.state.correct?'נכון. '+q.data.explanation:'נסו שוב. '+q.data.hint);
    else if(phase===4&&mode==='cases')feedback=explanation.forecast;
    else if(forecast)feedback=prediction===null?'בחרו תחזית כדי להתחיל.':`התחזית שלכם: ${predictions[prediction]}. בדקו אותה מול מה שקורה בהרצה.`;
    else if(phase===0&&mode==='cases')feedback=model.done
      ? 'ההרצה הסתיימה בלי תור מתמשך. קצב הכניסה לכל מסלול היה נמוך מהקיבולת שלו או שווה לה.'
      : 'זרימה שומרת על השיבוץ שלה לאורך ההרצה. צפו בכמות החבילות שמגיעות לכל מסלול.';
    if(q?.state.checked&&phase===4&&explanation.forecast)feedback+=' '+explanation.forecast;
    setText($('feedback'),feedback);
    $('feedback').hidden=!feedback;
    $('feedback').dataset.state=q?.state.checked&&!q.state.correct?'retry':'detail';
    const allowed=mode==='complete'?false:mode==='quiz'?quiz[quizIndex].correct:phase===0?model.done:phase===1?model.done:phase===2?(sub===1?records[caseId].evidence.correct:records[caseId].diagnosis.correct):phase===4?records[caseId].reflection.correct:false;
    $('next').disabled=running||!allowed;
    $('next').hidden=!allowed;
    $('next').textContent=mode==='quiz'?(quizIndex===2?'סיום והכנה לכיתה':'לשאלה הבאה')
      :phase===0?'להרצה השנייה':phase===1?'לאבחון':phase===2?(caseId==='b'&&sub===0?'לשאלת הראיה':'לבחירת שיטה')
      :caseId==='a'?'למקרה השני':'לשאלות הסיכום';
    $('check').hidden=running||allowed||(!q&&!method);
    $('guide').hidden=mode!=='cases'||running||allowed||!(phase<=1||forecast);
    $('guide').disabled=$('play').disabled;
    $('guide').textContent=model.t?'המשך הרצה':phase===0?'הרצת מצב תקין':phase===1?'הרצת מצב שהשתנה':'הרצת הניסוי';
    $('another').hidden=!(forecast&&!running||mode==='cases'&&phase===4||mode==='complete');
    $('another').disabled=$('another').hidden;
    $('another').textContent=mode==='complete'?'להתחיל את הפעילות מחדש':forecast?'בחירת שיטה אחרת':'לנסות שיטה נוספת';
    $('back').hidden=$('back').disabled;
    $('next-hint').hidden=mode==='complete'||allowed;
    setText($('next-hint'),running?'בסיום ההרצה אפשר להמשיך לשלב הבא.'
      :forecast&&prediction===null?'סמנו תחזית כדי לפתוח את כפתור ההרצה.'
      :q&&!q.state.checked?'אפשר לנסות שוב אחרי הבדיקה.':'');
    if($('note').value!==note)$('note').value=note;
  }
  function finished(){
    if(!model.done||recorded)return;
    recorded=true;pause();
    if(model.observation){if(model.healthy)records[caseId].seenHealthy=true;else{records[caseId].seenProblem=true;results[caseId].ecmp=model.t;}}
    else {results[caseId][model.policy]=model.t;records[caseId].lastPolicy=model.policy;phase=4;}
    save();
  }
  function advance(){model.tick();finished();render();}
  function animate(now){
    if(!running)return;if(!lastTick)lastTick=now;
    const duration=240/speed;
    if(now-lastTick>=duration){lastTick=now;lastPaint=now;advance();}
    else if(now-lastPaint>=33){lastPaint=now;draw(reduced()?0:(now-lastTick)/duration);}
    if(running)frame=requestAnimationFrame(animate);
  }
  $('play').addEventListener('click',()=>{if($('play').disabled)return;running=true;lastTick=0;render();frame=requestAnimationFrame(animate);});
  $('guide').addEventListener('click',()=>{
    if($('guide').disabled)return;
    $('play').click();
    if(matchMedia('(max-width: 899px)').matches)$('play').closest('.simulation').scrollIntoView({block:'start'});
  });
  $('flow-details').addEventListener('toggle',render);
  $('pause').addEventListener('click',()=>{pause();render();});
  function resetActivity(){
    pause();caseId='a';phase=0;sub=0;mode='cases';policy='';confirmed=false;
    records={a:blankCase(),b:blankCase()};results={a:{},b:{}};
    quiz=[blankAnswer(),blankAnswer(),blankAnswer()];quizIndex=0;trackedFlow=0;chartPath=0;prediction=null;
    createRun('healthy');render();save();
  }
  $('restart').addEventListener('click',()=>{
    if($('restart').disabled)return;
    if(phase===0)createRun('healthy');
    else if(phase===1||phase===2){phase=1;sub=0;createRun('problem');}
    else {phase=3;policy=model.observation?policy:model.policy;confirmed=!!policy;createRun(confirmed?'trial':'problem');}
    render();save();
  });
  $('speed').addEventListener('input',()=>{const value=Number($('speed').value);if(value>=.25&&value<=2){speed=value;lastTick=0;$('speed-label').textContent=speed+'×';save();}});
  for(let i=0;i<3;i++)$('option-'+i).addEventListener('click',()=>{
    if(mode==='cases'&&phase===3){
      if(confirmed)prediction=i;
      else {policy=Object.keys(names)[i];prediction=null;}
    }
    else {const q=activeQuestion();if(q){q.state.choice=i;q.state.checked=false;q.state.correct=false;}}
    render();save();
  });
  $('check').addEventListener('click',()=>{
    if($('check').disabled)return;
    if(mode==='cases'&&phase===3){confirmed=true;prediction=null;createRun('trial');}
    else {const q=activeQuestion();if(q){q.state.checked=true;q.state.correct=q.state.choice===q.data.answer;}}
    render();save();
  });
  $('next').addEventListener('click',()=>{
    if($('next').disabled)return;
    if(mode==='quiz'){if(quizIndex<2)quizIndex++;else mode='complete';render();save();$('heading').focus();return;}
    if(phase===2&&caseId==='b'&&sub===0){sub=1;render();save();$('heading').focus();return;}
    if(phase<3)enter(phase+1);
    else if(phase===4&&caseId==='a'){caseId='b';enter(0);}
    else if(phase===4){mode='quiz';quizIndex=0;pause();render();save();}
    $('heading').focus();
  });
  $('back').addEventListener('click',()=>{
    if($('back').disabled)return;
    if(mode==='quiz'){if(quizIndex>0)quizIndex--;else mode='cases';render();save();}
    else if(phase===2&&sub===1){sub=0;render();save();}
    else {
      const previous=phase-1;
      enter(previous);
      if(previous===0&&records[caseId].seenHealthy){createRun('healthy',true);render();}
      if(previous===1&&records[caseId].seenProblem){createRun('problem',true);render();}
    }
    $('heading').focus();
  });
  $('another').addEventListener('click',()=>{
    if($('another').disabled)return;
    if(mode==='complete')resetActivity();
    else enter(3);
    $('heading').focus();
  });
  $('note').addEventListener('input',()=>{note=$('note').value.slice(0,500);save();});
  $('flow-filter').addEventListener('change',()=>{
    trackedFlow=$('flow-filter').value==='all'?null:Number($('flow-filter').value);
    render();save();
  });
  $('chart-path').addEventListener('change',()=>{
    chartPath=Number($('chart-path').value);
    renderComparison();
  });
  restore(loadProgress());reconstruct();
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{view=null;draw();}).observe($('network'));
  function make(tag,attrs,parent) {
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [k,v]of Object.entries(attrs||{}))node.setAttribute(k,String(v));
    if(parent)parent.appendChild(node);return node;
  }
  function draw(alpha=0) {
    const svg=$('network'),w=Math.max(300,svg.clientWidth||680),sig=[w,...model.caps,model.flows.length].join(':');
    const sx=22,split=w*.22,mid=w*.46,merge=w*.75,dx=w-22,cy=150,ys=[68,232];
    if(!view||view.sig!==sig) {
      svg.setAttribute('viewBox',`0 0 ${w} 324`);
      svg.innerHTML='';
      const text=(x,y,label)=>{const n=make('text',{x,y,'text-anchor':'middle'},svg);n.textContent=label;return n;};
      const title=make('title',{},svg);title.textContent='שני מסלולים. מספר הקווים הפעילים הוא קיבולת המסלול בחבילות למחזור.';
      text(sx+8,52,'שולחים');text(dx-8,190,'מקבל');
      for(const f of model.flows) {
        const y=96+f.id*22;
        make('line',{x1:sx,y1:y,x2:split,y2:cy,class:'rp-structure'},svg);
        make('circle',{cx:sx,cy:y,r:9,fill:`color-mix(in srgb,${colors[f.id]} 25%,var(--background))`},svg);text(sx,y+4,String(f.id+1));
      }
      for(let path=0;path<2;path++) {
        const y=ys[path];
        make('path',{d:`M${split} ${cy} V${y} H${mid} M${merge} ${y} V${cy}`,class:'rp-structure'},svg);
        for(let k=0;k<3;k++)make('line',{x1:mid+15,y1:y+(k-1)*8,x2:merge-8,y2:y+(k-1)*8,stroke:k<model.caps[path]?'var(--foreground)':'var(--muted-foreground)','stroke-width':1.5,...(k>=model.caps[path]?{'stroke-dasharray':'3 4'}:{})},svg);
        text((mid+merge)/2,y-30,`מסלול ${path?'ב׳':'א׳'}`);
        text((mid+merge)/2,y-13,`קיבולת: ${model.caps[path]}`);
        make('rect',{x:mid-8,y:y-8,width:16,height:16,fill:'var(--muted)',stroke:'var(--border)'},svg);
      }
      make('line',{x1:merge,y1:cy,x2:dx,y2:cy,class:'rp-structure'},svg);
      make('circle',{cx:dx,cy:cy,r:9,fill:'var(--muted)',stroke:'var(--border)'},svg);
      make('line',{x1:dx,y1:298,x2:sx,y2:298,class:'rp-structure','stroke-dasharray':'3 4'},svg);
      text(w/2,321,'משוב גודש לשולחים ←');
      const pathInfo=ys.map((y,i)=>text((mid+merge)/2,y-46,''));
      const queues=ys.map(y=>({
        cells:Array.from({length:12},(_,i)=>make('rect',{x:mid-28+(i%6)*10,y:y+17+Math.floor(i/6)*9,width:7,height:6,visibility:'hidden'},svg)),
        label:text(mid,y+58,'')
      }));
      const packets=make('g',{},svg),acks=Array.from({length:12},()=>make('circle',{cy:298,r:4,fill:'var(--viz-series-1)',visibility:'hidden'},svg));
      const ring=make('ellipse',{cx:(mid+merge)/2,cy:68,rx:(merge-mid)/2+14,ry:24,fill:'none',stroke:'var(--viz-series-1)','stroke-width':2,visibility:'hidden','pointer-events':'none'},svg);
      view={sig,w,pathInfo,queues,packets,active:new Map(),free:[],acks,tick:-1,ring};
    }
    view.ring.setAttribute('visibility',phase===1&&model.changed&&model.t>=1&&model.t<=12?'visible':'hidden');
    const selected=caseId==='b'?trackedFlow:null;
    const changed=view.tick!==model.t||view.selected!==selected;view.tick=model.t;view.selected=selected;
    if(changed) {
      view.pathInfo.forEach((n,i)=>{const count=model.flows.filter(f=>f.path===i).length;n.textContent='זרימות: '+count+' · נכנסות: '+model.incoming[i];});
      view.queues.forEach((q,i)=>{q.label.textContent=model.done?'שיא תור: '+model.peak[i]:'ממתינות: '+model.queues[i].length;q.cells.forEach((cell,j)=>{cell.setAttribute('visibility',j<model.queues[i].length?'visible':'hidden');if(j<model.queues[i].length){
          const flow=model.queues[i][j].flow;
          cell.setAttribute('fill',colors[flow]);
          cell.setAttribute('opacity',selected===null||selected===flow?1:.25);
        }});});
      const keys=new Set(model.flights.map(p=>`${p.flow}:${p.seq}:${p.phase}`));
      for(const [key,n]of view.active)if(!keys.has(key)){n.g.setAttribute('visibility','hidden');view.free.push(n);view.active.delete(key);}
      for(const p of model.flights) {
        const key=`${p.flow}:${p.seq}:${p.phase}`;
        if(!view.active.has(key)) {
          let n=view.free.pop();
          if(!n){const g=make('g',{},view.packets);n={g,c:make('circle',{r:7},g),text:make('text',{x:0,y:4,'text-anchor':'middle'},g)};}
          n.g.setAttribute('visibility','visible');n.c.setAttribute('fill',`color-mix(in srgb,${colors[p.flow]} 30%,var(--background))`);
          n.c.setAttribute('stroke',p.marked?'var(--foreground)':'var(--border)');n.c.setAttribute('stroke-width',p.marked?2.5:1);
          n.text.textContent=String(p.flow+1);view.active.set(key,n);
        }
        view.active.get(key).g.setAttribute('opacity',selected===null||selected===p.flow?1:.22);
      }
    }
    function interpolate(points,fraction) {
      const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
      let d=lengths.reduce((a,b)=>a+b,0)*fraction;
      for(let i=0;i<lengths.length;i++){if(d<=lengths[i]||i===lengths.length-1){const v=lengths[i]?d/lengths[i]:0;return [points[i][0]+(points[i+1][0]-points[i][0])*v,points[i][1]+(points[i+1][1]-points[i][1])*v];}d-=lengths[i];}
    }
    for(const p of model.flights) {
      const y=ys[p.path],v=Math.min(1,Math.max(0,(model.t+alpha-p.start)/(p.end-p.start)));
      const laneY=y+((p.lane||0)-1)*8;
      const points=p.phase==='in'?[[sx,96+p.flow*22],[split,cy],[split,y],[mid,y]]:[[mid,y],[mid+15,laneY],[merge-8,laneY],[merge,y],[merge,cy],[dx,cy]];
      const [x,py]=interpolate(points,v);
      view.active.get(`${p.flow}:${p.seq}:${p.phase}`).g.setAttribute('transform',`translate(${x.toFixed(1)},${py.toFixed(1)})`);
    }
    const acks=model.acks.filter(a=>selected===null||a.flow===selected).slice(-12);
    view.acks.forEach((n,i)=>{n.setAttribute('visibility',i<acks.length?'visible':'hidden');if(i<acks.length)n.setAttribute('cx',dx-(dx-sx)*Math.min(1,(model.t+alpha-acks[i].start)/4));});
  }
})();
