import React from 'react';
import { ArrowRight, Award, BookOpen, CalendarDays, GraduationCap, HeartHandshake, Sparkles, Trophy, Users } from 'lucide-react';
import { go } from '../App.jsx';

const Button=({children,onClick=()=>go('/signup'),secondary=false})=><button className={`button ${secondary?'secondary':'primary'}`} onClick={onClick}>{children}<ArrowRight size={16}/></button>;

export function HomePage({data}) {
  const quiz=data?.quiz;
  const stats=data?.stats||{};
  const news=data?.news||[];
  const honorees=data?.honorees||[];
  const partners=data?.partners||[];
  const ticker=news.map(item=>item.message);
  return <main className="public-page">
    <section className="hero"><div>
      <span className="eyebrow"><Sparkles size={15}/> A brighter path for every learner</span>
      <h1>Learn. Compete.<br/><em>Rise together.</em></h1>
      <p>{data?.settings?.introduction_text||'Danistan Network makes quality learning, fair competition, and real opportunity accessible to every student.'}</p>
      <div className="hero-actions"><Button/><Button secondary onClick={()=>go('/syllabus')}>Preview syllabus</Button></div>
    </div><div className="hero-panel">
      <GraduationCap size={38}/><strong>One network.<br/>Every next step.</strong>
      <span>{data?.settings?.mission_text||'Structured learning, fair competition, and a community that believes every student can rise.'}</span>
    </div></section>
    <div className="ticker"><strong>LIVE UPDATES</strong><div className="homepage-news-track">{ticker.map((message,index)=><span key={index}>{message}</span>)}</div></div>
    <section className="content-band split"><div>
      <span className="eyebrow coral">NEXT LIVE QUIZ</span><h2>{quiz?.title||'Upcoming quiz'}</h2>
      <p>{quiz?.description||'Class-aware quizzes with instant feedback and transparent results.'}</p>
      <div className="detail-row"><span><CalendarDays/> {quiz?new Date(quiz.scheduled_at).toLocaleString():'Schedule coming soon'}</span><span><Award/> Rs. {quiz?.fee||200}</span></div>
      <Button onClick={()=>go('/signup')}>Register for the quiz</Button>
    </div><div className="prize-box"><span className="eyebrow gold">PRIZE POOL</span><strong>Rs. {quiz?.prize_pool?.toLocaleString()||'50,000'}</strong><p>Rewarding effort, not just rank.</p><div><b>01 Rs. 25,000</b><b>02 Rs. 15,000</b><b>03 Rs. 10,000</b></div></div></section>
    <section className="stats-row">
      <div><Users/><strong>{stats.students||0}</strong><span>Students learning</span></div>
      <div><Trophy/><strong>{stats.quizzes||0}</strong><span>Quizzes held</span></div>
      <div><BookOpen/><strong>{stats.books||0}</strong><span>Books distributed</span></div>
      <div><GraduationCap/><strong>{stats.schools||0}</strong><span>Schools visited</span></div>
    </section>
    {honorees.length>0&&<section className="homepage-honorees"><span className="eyebrow coral">CELEBRATING EXCELLENCE</span><h2>Our position holders</h2><div className="honoree-grid">{honorees.map(item=><article key={item.result_id}><Trophy/><span>POSITION {item.position||'HOLDER'}</span><strong>{item.student_name}</strong><small>{item.quiz_title} · {item.percentage}%</small></article>)}</div></section>}
    <section className="partners-callout"><div><span className="eyebrow light-eyebrow">MORE THAN MARKS</span><h2>Your effort should open <em>more doors.</em></h2><p>Explore {partners.length||'our'} partner offers across health, hospitality, and everyday categories.</p><Button secondary onClick={()=>go('/partners')}>Explore discounts</Button></div><div className="partner-icons">{partners.slice(0,4).map(partner=><span key={partner.id}>{partner.name}</span>)}</div></section>
  </main>;
}

export function PartnersPage({data}) {
  const partners=data?.partners||[];
  return <main className="public-page inner-page"><span className="eyebrow coral">STUDENT PRIVILEGES</span>
    <h1>Rewards that travel <em>with your effort.</em></h1>
    <p className="lead">Verified Danistan students can explore partner savings across everyday categories.</p>
    {partners.length?<div className="category-grid partners-grid">{partners.map(partner=><article className="public-partner-card" key={partner.id}>
      {partner.logo_url?<img src={partner.logo_url} alt={`${partner.name} logo`}/>:<HeartHandshake/>}
      <h3>{partner.name}</h3><p>{partner.category}</p><strong>{Number(partner.discount_percent)}% discount</strong>
      <button className="text-link" onClick={()=>go('/login')}>View student offer <ArrowRight size={15}/></button>
    </article>)}</div>:<div className="empty-state">Partner offers will be listed here as they become available.</div>}
  </main>;
}
