
(() => {
  class PacketRun {
    constructor(caseId,policy,observation=false) {
      this.caseId=caseId;this.policy=policy;this.observation=observation;
      this.t=0;this.caps=observation?[3,3]:(caseId==='a'?[1,3]:[3,3]);
      this.flows=[];this.queues=[[],[]];this.flights=[];this.feedback=[];this.acks=[];this.peak=[0,0];this.incoming=[0,0];this.queueHistory=[[0],[0]];
      this.seed=101;this.changed=!observation;this.done=false;this.moves=0;this.attempts=0;
      this.event=observation?'The network is healthy, with flows evenly split between the two paths.':'New flows start under the changed network conditions.';
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
        if(this.caseId==='a') {this.caps=[1,3];this.event='Two links on path A went down. Flow assignments stayed the same.';}
        else {this.flows.forEach((f,i)=>f.path=i<5?0:1);this.event='Five flows were assigned to path A and one to path B. All links are up.';}
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
            f.events.push({cycle:this.t,label:'A congestion-marked acknowledgment reached the sender.'});
          }
        }
      }
      for(const f of this.flows) {
        if(this.policy==='fb'&&this.t>f.id*2&&(this.t-f.id*2)%8===0) {
          if(f.samples&&f.marked/f.samples>.05&&f.sent<48) {
            const old=f.path;f.path=this.random()<.5?0:1;this.attempts++;
            const path=f.path?'B':'A';
            const percentage=Math.round(100*f.marked/f.samples);
            f.events.push({cycle:this.t,label:old===f.path
              ? `${percentage}% of acknowledgments in this window reported congestion. The sender changed the hash input, and the switch selected path ${path}.`
              : `${percentage}% of acknowledgments in this window reported congestion. The sender changed the hash input, and new packets now take path ${path}.`});
            if(old!==f.path){this.moves++;this.event=`Flow ${f.id+1}: After congestion feedback, new packets take path ${f.path?'B':'A'}.`;}
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
            f.events.push({cycle:this.t,label:`The switch on path ${path?'B':'A'} marked a packet for congestion.`});
          }
          this.flights.push({...p,lane:k,phase:'out',start:this.t,end:this.t+4,marked:p.marked||marked});
        }
      }
      this.done=this.flows.every(f=>f.finish!==null);
      this.queues.forEach((q,i)=>{
        this.peak[i]=Math.max(this.peak[i],q.length);
        this.queueHistory[i].push(q.length);
      });
      if(this.done)this.event='All packets reached the receiver.';
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
  const predictions=['At the initial assignment','After congestion feedback arrives','The assignment will stay the same'];
  const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const headings=['Meet the network','Observe what changed','Diagnose the slowdown','Choose a routing policy','Compare the results'];
  const quizQuestions=[
    {title:'What does consistent per-flow hashing guarantee?',options:['Traffic is balanced at every moment','The same flow selects the same path while routing settings stay fixed','Every packet takes a different path'],answer:1,explanation:'The hash uses header fields to choose an output port. Several flows can share one path because the hash has no information about queue lengths.',hint:'Think about one flow’s path choice and how different flows are distributed.'},
    {title:'Two paths have equal capacity, but only one develops a queue. What information would help beyond knowing their capacities?',options:['Feedback about the congestion a flow experienced','Only the number of active links','Only that the overall network capacity is sufficient'],answer:0,explanation:'Capacity tells you how much a path can carry. Congestion feedback reports what the flow experienced. Flow assignments can place different loads on paths with equal capacity.',hint:'The topology can stay the same while traffic changes.'},
    {title:'Suppose a policy finished faster in both cases we tried. What can we conclude?',options:['It will be fastest in every network and under every workload','Flow sizes and hash inputs do not matter','It was faster in the cases tested. Generalizing requires more experiments'],answer:2,explanation:'Flow count, flow sizes, hash inputs, capacities, and feedback delay may all affect the outcome. We also measured when the last flow finished, which is a different metric from average flow completion time.',hint:'Think about which conditions we tested and what else could change.'}
  ];
  function caseQuestion(kind){
    const a=caseId==='a';
    if(kind==='diagnosis')return {title:'What caused the slowdown in the second run?',options:['Some links stopped carrying traffic','Hashing assigned flows unevenly','The receiver limits both paths'],answer:a?0:1,explanation:a?'Two links on path A went down, cutting its capacity from three packets per cycle to one. Two packets still arrive per cycle, and the excess builds up in the queue.':'The same six senders and links are in use. Five flows now share path A and one uses path B. Path A receives five packets per cycle but can forward only three, while path B has spare capacity.',hint:'Check whether the number of active links or the distribution of flows changed.'};
    if(kind==='evidence')return {title:'What evidence in the diagram supports your diagnosis?',options:['There are more senders than in the first run','Two links on path A went down','All links are up, but flows are split five to one'],answer:2,explanation:'Total capacity is still six packets per cycle. Five of the six flows share a path that can carry only three packets per cycle. The spare capacity on the other path goes unused with this assignment.',hint:'Count the senders, active links, and flows assigned to each path.'};
    if(a)return {
      title:'Why did WCMP address the slowdown in Case A?',
      options:['It waited for the sender to receive congestion feedback','It used the remaining path capacities to steer more new flows toward the stronger path','It restored the links that went down'],
      answer:1,
      explanation:'WCMP used the 1:3 capacity ratio to assign one flow to path A and three to path B from the start. FlowBender can attempt to move flows after congestion feedback arrives.',
      hint:'Compare what happened at the start of the WCMP run with what had to happen before FlowBender could rehash.',
    };
    return {
      title:'Why did FlowBender address the slowdown in Case B?',
      options:['It reduced the capacity of the busiest path','It assigned larger weights to a path with more capacity','Congestion feedback let senders try a new path during the run'],
      answer:2,
      explanation:'Both paths had the same capacity, so ECMP and WCMP made the same initial assignments. FlowBender used congestion feedback to rehash ongoing flows, moving some traffic away from the overloaded path.',
      hint:'Compare what the policies know about path capacity with what senders learn from congestion feedback.',
    };
  }
  function requiredTrialPolicy(){
    if(mode!=='cases'||phase!==4)return '';
    const preferredPolicy=caseId==='a'?'wcmp':'fb';
    return results[caseId][preferredPolicy]?'':preferredPolicy;
  }
  function activeQuestion(){
    if(mode==='quiz')return {data:quizQuestions[quizIndex],state:quiz[quizIndex],key:'quiz'};
    if(mode!=='cases'||requiredTrialPolicy())return null;
    const kind=phase===2?(sub===1?'evidence':'diagnosis'):phase===4?'reflection':null;
    return kind?{data:caseQuestion(kind),state:records[caseId][kind],key:kind}:null;
  }
  function cleanAnswer(a){return {choice:Number.isInteger(a?.choice)&&a.choice>=0&&a.choice<3?a.choice:null,checked:!!a?.checked,correct:!!a?.correct};}
  function restore(saved){
    const s=saved?.modelContent,p=saved?.privateContent;
    if(s?.pilot!=='routing-classroom-activity'||![4,5].includes(s.version))return;
    caseId=s.caseId==='b'?'b':'a';phase=Number.isInteger(s.phase)&&s.phase>=0&&s.phase<=4?s.phase:0;
    sub=s.sub===1&&caseId==='b'&&phase===2?1:0;
    mode=['cases','quiz','note','complete'].includes(s.mode)?s.mode:'cases';
    policy=names[s.policy]?s.policy:'';confirmed=!!s.confirmed&&!!policy;
    speed=[.25,.5,.75,1,1.25,1.5,1.75,2].includes(s.speed)?s.speed:1;
    quizIndex=Number.isInteger(s.quizIndex)&&s.quizIndex>=0&&s.quizIndex<3?s.quizIndex:0;
    for(const c of ['a','b']){
      for(const method of Object.keys(names))if(Number.isInteger(s.results?.[c]?.[method])&&s.results[c][method]>0&&s.results[c][method]<1000)results[c][method]=s.results[c][method];
      for(const k of ['diagnosis','evidence','reflection']){
        if(s.version===4&&c==='a'&&k==='reflection')continue;
        records[c][k]=cleanAnswer(p?.records?.[c]?.[k]);
      }
      records[c].seenHealthy=!!p?.records?.[c]?.seenHealthy;records[c].seenProblem=!!p?.records?.[c]?.seenProblem;
      records[c].lastPolicy=names[p?.records?.[c]?.lastPolicy]?p.records[c].lastPolicy:'';
    }
    quiz=quiz.map((_,i)=>cleanAnswer(p?.quiz?.[i]));note=String(p?.note||'').slice(0,500);
    trackedFlow=p?.trackedFlow===null?null:Number.isInteger(p?.trackedFlow)&&p.trackedFlow>=0&&p.trackedFlow<6?p.trackedFlow:0;
    prediction=[0,1,2].includes(p?.prediction)?p.prediction:null;
  }
  function save(){
    const modelContent={pilot:'routing-classroom-activity',version:5,caseId,phase,sub,mode,policy,confirmed,speed,quizIndex,results};
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
  function enter(p,trialPolicy=''){
    phase=p;sub=0;policy=trialPolicy;confirmed=!!trialPolicy;prediction=null;mode='cases';
    createRun(confirmed?'trial':p===0?'healthy':'problem',p>=2&&!confirmed);render();save();
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
    const rows=Object.keys(names).filter(policy=>results[c][policy]).map(policy=>[policy,results[c][policy]]);
    return rows.length?'<table class="table table-sm"><thead><tr><th>Policy</th><th>Time until all flows finish</th></tr></thead><tbody>'+rows.map(([p,t])=>`<tr><td><div dir="ltr">${names[p]}</div>${p==='ecmp'?'<span class="text-small">Slow baseline run</span>':''}</td><td class="tabular-nums">${t} cycles</td></tr>`).join('')+'</tbody></table>':'';
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
    label(x(0),12,'Packets queued','start');
    label((x(0)+x(duration))/2,150,'Simulation cycle');
    const series=(values,color,dashed)=>{
      const points=values.map((q,t)=>`${x(t).toFixed(2)},${y(q).toFixed(2)}`).join(' ');
      make('polyline',{points,fill:'none',stroke:color,'stroke-width':dashed?2:3,
        'stroke-dasharray':dashed?'5 4':'none','stroke-linejoin':'round'},plot);
    };
    series(trial,'var(--viz-series-1)',false);
    series(baseline,'var(--muted-foreground)',true);
    $('chart-method').textContent=names[model.policy];
    const path=chartPath?'B':'A';
    plot.setAttribute('aria-label',`Queue length over time on path ${path}`);
    const identical=trial.length===baseline.length&&trial.every((q,t)=>q===baseline[t]);
    $('chart-summary').textContent=`Path ${path} · Peak queue: ${base.peak[chartPath]} packets in the baseline, ${model.peak[chartPath]} in the trial.`+
      (identical?' The two lines overlap.':'');
  }
  function renderTracker(){
    const visible=mode==='cases'&&caseId==='b';
    $('tracker').hidden=!visible;
    $('flow-picker').hidden=!visible;
    if(!visible){timelineKey='';return;}
    const selected=model.flows[trackedFlow];
    $('flow-filter').value=selected?String(trackedFlow):'all';
    const status=selected?`Flow ${selected.id+1} · Current path: ${selected.path?'B':'A'} · ${selected.received}/48 packets delivered`
      :'Select a flow to highlight its packets and view its events.';
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
    if(!events.length)add(model.done?'No packets in this flow were marked for congestion during the run.':'If a packet in this flow is marked for congestion, the cycle will appear here.');
    else for(const event of events)add(`Cycle ${event.cycle} · ${event.label}`);
  }
  function resultExplanation(){
    const base=results[caseId].ecmp||model.t,delta=base-model.t;
    const effect=delta>0?`Saved ${delta} cycles.`:delta===0?'Completion time stayed the same.':`Took ${-delta} extra cycles.`;
    let why;
    if(model.policy==='wcmp'){
      why=caseId==='a'
        ? 'WCMP used the remaining capacities before the run began. The 1:3 weights assigned one new flow to path A and three to path B.'
        : 'Equal capacities produce equal weights. With the same hash inputs, the flows again split five to one.';
    }else if(model.policy==='fb'){
      why='Senders received congestion feedback and tried new hash inputs during the transfer. The feedback takes time to arrive, and rehashing can select the same path again.';
      if(caseId==='a')why='FlowBender started with two flows on each path. The queue on path A had already started to grow when congestion feedback triggered rehashing. Moving traffic helped, but path A’s capacity stayed at one packet per cycle.';
    }else{
      why='Consistent hashing preserved the assignment. ECMP chooses a path from the packet headers without consulting congestion feedback.';
    }
    if(caseId==='a'&&results.a.wcmp&&results.a.fb){
      why+=` WCMP finished in ${results.a.wcmp} cycles and FlowBender in ${results.a.fb} cycles in this case.`;
    }
    if(caseId==='b'&&results.b.wcmp&&results.b.fb){
      why+=` ECMP and WCMP assigned flows the same way and finished in ${results.b.ecmp} and ${results.b.wcmp} cycles, respectively. FlowBender finished in ${results.b.fb} cycles after senders tried to move flows away from congestion.`;
    }
    const trialPolicy=requiredTrialPolicy();
    const suggestion=trialPolicy==='wcmp'
      ? 'Try WCMP next. Compare how the two policies respond to a drop in capacity on one path.'
      : trialPolicy==='fb'
        ? 'Try FlowBender next. Both paths have the same capacity. Watch what changes when senders respond to congestion during the run.'
      : delta<=0?'Try another policy and see whether it improves the result.':'You can compare another policy as well.';
    const original=getBaseline(caseId);
    const initialChanged=model.initialPaths.some((path,i)=>path!==original.initialPaths[i]);
    const observedText=initialChanged?'The assignment changed at the start of the trial.'
      :model.moves?'The assignment changed after congestion feedback arrived.':'The assignment stayed the same throughout the run.';
    const forecast=prediction===null?'':`Your prediction: ${predictions[prediction]}. ${observedText}`;
    return {headline:`${model.t} cycles compared with ${base}. ${effect}`,why,suggestion,forecast};
  }
  function updateControls(){
    const playable=mode==='cases'&&(phase<=1||phase===3&&confirmed&&prediction!==null);
    $('play').disabled=!playable||running||model.done;
    $('pause').disabled=!running;
    $('restart').disabled=mode!=='cases'||!model.t||phase>=2&&phase!==3&&phase!==4;
    $('restart').textContent='Reset run';
    $('play').textContent=running?'Running…':model.t&&!model.done?'Resume':'Run';
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
    const stage=mode==='cases'?`Step ${phase+1} of 5`
      :mode==='quiz'?`Question ${quizIndex+1} of 3`
      :mode==='note'?'Prepare for class':'Activity complete';
    setText($('stage'),stage);
    const progress=mode==='complete'?13:mode==='quiz'?10+quizIndex:(caseId==='a'?0:5)+phase;
    $('stage-progress').setAttribute('aria-valuenow',progress);$('stage-fill').style.width=`${progress/13*100}%`;
    $('run-title').textContent=mode==='cases'?(phase===0?'First run · Healthy network':phase<=2?'Second run · Changed conditions':'Trial · Same conditions and new flows'):'Most recent run · Review alongside the questions';
    $('active-method').textContent=names[model.policy];$('speed').value=String(speed);$('speed-label').textContent=speed+'×';
    $('clock').textContent=`Cycle ${model.t} · ${model.flows.reduce((s,f)=>s+f.received,0)}/${model.flows.length*48} packets delivered`;
    $('class-note').hidden=mode!=='note';
    $('heading').textContent=mode==='cases'?(phase===3&&confirmed?'Predict and test the policy':headings[phase])
      :mode==='quiz'?'Check your understanding':mode==='note'?'One last question':'Activity complete';
    const explanation=phase===4?resultExplanation():null;
    const instruction=mode==='complete'?'Thanks for completing the routing lab. See you in class!'
      :mode==='note'?'Use one observation from the simulation to answer the question. You can finish even if you leave it blank.'
      :mode==='quiz'?'Choose an answer to see an explanation.'
      :phase===0?'In the healthy run, each path can forward three packets per cycle. Watch how many flows are assigned to each path.'
      :phase===1?'Run again and look for the cause of the slowdown. Compare each path’s capacity, its flow count, and the queue that builds up.'
      :phase===2?'Choose the explanation that fits what you observed.'
      :phase===3?(confirmed?'Make a prediction, then run the trial.':'Choose how you would address the slowdown. Each policy is tested with the same flows and network conditions.')
      :explanation.headline;
    setText($('context'),instruction);
    const event=mode==='cases'&&phase===4?explanation.suggestion
      :phase===3&&!running&&model.t===0?''
      :model.observation?(model.done?`The run finished in ${model.t} cycles. The diagram now shows the peak queue on each path.`:''):model.event;
    setText($('event'),event);
    $('event').hidden=!event;
    const comparing=!$('comparison').hidden;
    $('return').hidden=mode!=='cases'||!model.done||phase>=3;
    $('view-results').hidden=!comparing;
    $('results').hidden=mode==='cases'&&!comparing;
    $('back-to-question').hidden=!comparing;
    if($('flow-details').open)$('flow-progress').innerHTML=model.flows.map(f=>`<div class="rp-flow"><span>${f.id+1} → ${f.path?'B':'A'}</span><div class="rp-track" role="progressbar" aria-label="Packets delivered for flow ${f.id+1}" aria-valuemin="0" aria-valuemax="48" aria-valuenow="${f.received}"><span style="width:${100*f.received/48}%;background:${colors[f.id]}"></span></div><span class="tabular-nums">${f.received}/48</span></div>${f.finish!==null?`<div class="text-small">Flow ${f.id+1} finished in ${f.finish} cycles</div>`:''}`).join('');
    $('scores').innerHTML=mode==='cases'?(comparing?scoreTable(caseId)+'<div class="text-small">'+explanation.why+'</div>':''):'<div>Case A</div>'+scoreTable('a')+'<div>Case B</div>'+scoreTable('b');
    const q=activeQuestion(),trialSetup=mode==='cases'&&phase===3;
    const method=trialSetup&&!confirmed,forecast=trialSetup&&confirmed;
    $('question-title').textContent=q?q.data.title:method?'Which routing policy do you expect to deliver all packets in the fewest cycles?':forecast?'When, if at all, will flow assignments differ from the baseline?':'';
    const visible=!!q||trialSetup;
    $('answers').hidden=!visible;$('answers').setAttribute('aria-hidden',String(!visible));
    for(let i=0;i<3;i++){
      const value=method?Object.keys(names).indexOf(policy):forecast?prediction:q?.state.choice;
      $('option-'+i).setAttribute('aria-pressed',String(value===i));
      $('option-'+i).disabled=!visible||running;
      $('option-name-'+i).textContent=method?['ECMP','WCMP','FlowBender'][i]:'';
      $('option-name-'+i).hidden=!method;
      $('option-text-'+i).textContent=forecast?predictions[i]:method?['Consistent per-flow hashing with equal path selection probabilities.','Initial assignment using probabilities weighted by the updated capacities.','An attempt to rehash an ongoing flow after congestion feedback.'][i]:q?q.data.options[i]:'';
    }
    $('check').textContent=method?'Continue to prediction':'Check answer';
    $('check').disabled=running||(!q&&!method)||method&&!policy||!!q&&q.state.choice===null;
    let feedback='';
    if(q?.state.checked)feedback=(q.state.correct?'Correct. '+q.data.explanation:'Try again. '+q.data.hint);
    else if(phase===4&&mode==='cases')feedback=explanation.forecast;
    else if(forecast)feedback=prediction===null?'Choose a prediction to start.':`Your prediction: ${predictions[prediction]}. Compare it with what happens during the run.`;
    else if(phase===0&&mode==='cases')feedback=model.done
      ? 'The run finished without a persistent queue. Each path could handle its incoming traffic.'
      : 'Each flow keeps its assignment during this run. Watch how many packets reach each path.';
    if(q?.state.checked&&phase===4&&explanation.forecast)feedback+=' '+explanation.forecast;
    setText($('feedback'),feedback);
    $('feedback').hidden=!feedback;
    $('feedback').dataset.state=q?.state.checked&&!q.state.correct?'retry':'detail';
    const trialPolicy=requiredTrialPolicy();
    const allowed=mode==='complete'?false:mode==='note'||trialPolicy?true:mode==='quiz'?quiz[quizIndex].correct:phase===0?model.done:phase===1?model.done:phase===2?(sub===1?records[caseId].evidence.correct:records[caseId].diagnosis.correct):phase===4?records[caseId].reflection.correct:false;
    $('next').disabled=running||!allowed;
    $('next').hidden=!allowed;
    $('next').textContent=mode==='note'?'Finish':trialPolicy?`Test ${names[trialPolicy]}`:mode==='quiz'?(quizIndex===2?'Continue to the class question':'Next question')
      :phase===0?'Go to the second run':phase===1?'Diagnose the slowdown':phase===2?(caseId==='b'&&sub===0?'Review the evidence':'Choose a policy')
      :caseId==='a'?'Go to Case B':'Go to the review questions';
    $('check').hidden=running||allowed||(!q&&!method);
    $('guide').hidden=mode!=='cases'||running||allowed||!(phase<=1||forecast);
    $('guide').disabled=$('play').disabled;
    $('guide').textContent=model.t?'Resume run':phase===0?'Run the healthy network':phase===1?'Run with changed conditions':'Run the trial';
    $('another').hidden=!(forecast&&!running||mode==='cases'&&phase===4||mode==='complete');
    $('another').disabled=$('another').hidden;
    $('another').textContent=mode==='complete'?'Do it again':forecast?'Choose another policy':'Try another policy';
    $('back').hidden=$('back').disabled;
    $('next-hint').hidden=mode==='complete'||allowed;
    setText($('next-hint'),running?'Continue to the next step when the run finishes.'
      :forecast&&prediction===null?'Select a prediction to enable Run.'
      :q&&!q.state.checked?'You can try again after checking your answer.':'');
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
    const duration=480/speed;
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
    quiz=[blankAnswer(),blankAnswer(),blankAnswer()];quizIndex=0;trackedFlow=0;chartPath=0;prediction=null;note='';speed=1;
    createRun('healthy');render();save();
  }
  $('reset-activity').addEventListener('click',resetActivity);
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
    if(mode==='quiz'){if(quizIndex<2)quizIndex++;else mode='note';render();save();$('heading').focus();return;}
    if(mode==='note'){mode='complete';render();save();$('heading').focus();return;}
    const trialPolicy=requiredTrialPolicy();
    if(trialPolicy){
      enter(3,trialPolicy);$('heading').focus();return;
    }
    if(phase===2&&caseId==='b'&&sub===0){sub=1;render();save();$('heading').focus();return;}
    if(phase<3)enter(phase+1);
    else if(phase===4&&caseId==='a'){caseId='b';enter(0);}
    else if(phase===4){mode='quiz';quizIndex=0;pause();render();save();}
    $('heading').focus();
  });
  $('back').addEventListener('click',()=>{
    if($('back').disabled)return;
    if(mode==='quiz'){if(quizIndex>0)quizIndex--;else mode='cases';render();save();}
    else if(mode==='note'){mode='quiz';render();save();}
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
      const title=make('title',{},svg);title.textContent='Two paths. The number of active links is the path’s capacity in packets per cycle.';
      text(sx+8,52,'Senders');text(dx-8,190,'Receiver');
      for(const f of model.flows) {
        const y=96+f.id*22;
        make('line',{x1:sx,y1:y,x2:split,y2:cy,class:'rp-structure'},svg);
        make('circle',{cx:sx,cy:y,r:9,fill:colors[f.id]},svg);
        text(sx,y+4,String(f.id+1)).setAttribute('class','flow-number');
      }
      for(let path=0;path<2;path++) {
        const y=ys[path];
        make('path',{d:`M${split} ${cy} V${y} H${mid} M${merge} ${y} V${cy}`,class:'rp-structure'},svg);
        for(let k=0;k<3;k++)make('line',{x1:mid+15,y1:y+(k-1)*8,x2:merge-8,y2:y+(k-1)*8,stroke:k<model.caps[path]?'var(--foreground)':'var(--muted-foreground)','stroke-width':1.5,...(k>=model.caps[path]?{'stroke-dasharray':'3 4'}:{})},svg);
        text((mid+merge)/2,y-30,`Path ${path?'B':'A'}`);
        text((mid+merge)/2,y-13,`Capacity: ${model.caps[path]}`);
        make('rect',{x:mid-8,y:y-8,width:16,height:16,fill:'var(--muted)',stroke:'var(--border)'},svg);
      }
      make('line',{x1:merge,y1:cy,x2:dx,y2:cy,class:'rp-structure'},svg);
      make('circle',{cx:dx,cy:cy,r:9,fill:'var(--muted)',stroke:'var(--border)'},svg);
      make('line',{x1:dx,y1:298,x2:sx,y2:298,class:'rp-structure','stroke-dasharray':'3 4'},svg);
      text(w/2,321,'Congestion feedback to senders ←');
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
      view.pathInfo.forEach((n,i)=>{const count=model.flows.filter(f=>f.path===i).length;n.textContent='Flows: '+count+' · arriving: '+model.incoming[i];});
      view.queues.forEach((q,i)=>{q.label.textContent=model.done?'Peak queue: '+model.peak[i]:'Queued: '+model.queues[i].length;q.cells.forEach((cell,j)=>{cell.setAttribute('visibility',j<model.queues[i].length?'visible':'hidden');if(j<model.queues[i].length){
          const flow=model.queues[i][j].flow;
          cell.setAttribute('fill',colors[flow]);
          cell.setAttribute('opacity',selected===null||selected===flow?1:.58);
        }});});
      const keys=new Set(model.flights.map(p=>`${p.flow}:${p.seq}:${p.phase}`));
      for(const [key,n]of view.active)if(!keys.has(key)){n.g.setAttribute('visibility','hidden');view.free.push(n);view.active.delete(key);}
      for(const p of model.flights) {
        const key=`${p.flow}:${p.seq}:${p.phase}`;
        if(!view.active.has(key)) {
          let n=view.free.pop();
          if(!n){const g=make('g',{},view.packets);n={g,c:make('circle',{r:7},g),text:make('text',{x:0,y:3.5,'text-anchor':'middle',class:'flow-number packet-number'},g)};}
          n.g.setAttribute('visibility','visible');n.c.setAttribute('fill',colors[p.flow]);
          n.c.setAttribute('stroke',p.marked?'var(--foreground)':'var(--background)');n.c.setAttribute('stroke-width',p.marked?2.5:1);
          n.text.textContent=String(p.flow+1);view.active.set(key,n);
        }
        view.active.get(key).g.setAttribute('opacity',selected===null||selected===p.flow?1:.58);
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
    view.acks.forEach((node,i)=>{
      const ack=acks[i];
      node.setAttribute('visibility',ack?'visible':'hidden');
      if(ack){
        node.setAttribute('fill',colors[ack.flow]);
        node.setAttribute('cx',dx-(dx-sx)*Math.min(1,(model.t+alpha-ack.start)/4));
      }
    });
  }
})();
