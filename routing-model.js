window.RoutingPacketRun = class PacketRun {
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
            f.events.push({cycle:this.t,label:'An ACK carrying ECN congestion feedback reached the sender.'});
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
            if(old!==f.path){this.moves++;this.event=`Flow ${f.id+1}: After ECN feedback, new packets take path ${f.path?'B':'A'}.`;}
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
            f.events.push({cycle:this.t,label:`The switch on path ${path?'B':'A'} marked a data packet with ECN.`});
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
  };
