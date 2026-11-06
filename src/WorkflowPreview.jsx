import React from 'react';
import {Lightbulb,Search,Send,BriefcaseBusiness,LayoutDashboard,Check,ArrowUpRight} from 'lucide-react';

const screens = [
  {title:'Sales diagnosis',icon:Lightbulb,label:'YOUR GROWTH PRIORITIES',heading:'Know where to focus next.',action:'View diagnosis'},
  {title:'Prospect discovery',icon:Search,label:'YOUR IDEAL CUSTOMERS',heading:'Good fit. Clear evidence.',action:'View prospects'},
  {title:'Campaign workspace',icon:Send,label:'RELEVANT CONVERSATIONS',heading:'Make every message count.',action:'View campaigns'},
  {title:'Sales pipeline',icon:BriefcaseBusiness,label:'YOUR NEXT OPPORTUNITIES',heading:'Keep your best deals moving.',action:'View pipeline'},
];

export default function WorkflowPreview({active}) {
  const screen=screens[active];
  return <div className="productPreview workflowPreview" aria-label={screen.title+' preview'}>
    <div className="previewTop"><span><screen.icon size={14}/>{screen.title}</span><span className="workflowCompany">Acme Technologies</span></div>
    <div className="previewGrid">
      <div className="previewSide" aria-hidden="true">{[LayoutDashboard,Lightbulb,Search,Send,BriefcaseBusiness].map((Icon,i)=><Icon key={i} size={16} className={i===active+1?'workflowActive':''}/>)}</div>
      <div className="previewMain">
        <div className="previewGreeting"><div><small>{screen.label}</small><strong>{screen.heading}</strong></div><ArrowUpRight size={16}/></div>
        <div className="workflowScreen" key={active}>
          {active===0&&<><div className="diagnosisSummary"><div><span>Acquisition health</span><strong>72<small>/100</small></strong></div><div className="diagnosisMeter" aria-hidden="true"><i/></div><p>A strong offer. A clearer follow-up process will help it go further.</p></div><div className="diagnosisRows">{[['01','Follow up with engaged accounts','7 conversations need a next step'],['02','Sharpen your customer profile','Focus on your two strongest segments'],['03','Keep the evidence connected','Link every opportunity to its source']].map(([n,t,d])=><div key={n}><span>{n}</span><div><b>{t}</b><small>{d}</small></div></div>)}</div></>}
          {active===1&&<><div className="prospectPreviewSearch"><Search size={13}/><span>Financial services · Nigeria</span><small>3 matches</small></div><div className="prospectPreviewHead"><span>Company / buying signal</span><span>Fit score</span></div><div className="prospectPreviewRows">{[['N','Nomba','Hiring in infrastructure','92'],['S','SeamlessHR','Expanding into new markets','89'],['M','Moniepoint','Growing operations team','86']].map(([letter,name,signal,score])=><div key={name}><span className="previewInitial">{letter}</span><div><b>{name}</b><small>{signal}</small></div><strong>{score}<small>/100</small></strong></div>)}</div><div className="workflowNote"><Check size={12}/>Ranked against your ideal customer profile</div></>}
          {active===2&&<><div className="campaignPreviewStats"><div><span>Delivered</span><b>186</b></div><div><span>Reply rate</span><b>12.4%</b></div><div><span>Meetings</span><b>8</b></div></div><div className="campaignEmail"><header><span>STEP 1 · EMAIL DRAFT</span><span>Pending review</span></header><b>A thought on Nomba’s next phase</b><p>Hi Dami,</p><p>I noticed your infrastructure team is growing. We help teams like yours keep onboarding simple as operations scale.</p><p>Worth a quick conversation next week?</p><footer><Check size={12}/>Your approval is required before sending</footer></div></>}
          {active===3&&<><div className="pipelinePreviewSummary"><span>Qualified pipeline</span><strong>₦42.8M</strong><small>6 open opportunities</small></div><div className="previewKanban">{[['Qualified',[['Nomba','₦8.4M','Review account research'],['Helium Health','₦4.2M','Confirm decision-maker']]],['In conversation',[['SeamlessHR','₦6.8M','Discovery call · Today'],['Moniepoint','₦5.6M','Share security overview']]],['Proposal',[['Meridian Cloud','₦12.4M','Follow up · Tomorrow'],['Acme Group','₦5.4M','Review proposal']]]].map(([stage,deals])=><div key={stage}><header>{stage}<span>2</span></header>{deals.map(([name,value,next])=><article key={name}><b>{name}</b><strong>{value}</strong><small>{next}</small></article>)}</div>)}</div></>}
        </div>
      </div>
    </div>
  </div>;
}
