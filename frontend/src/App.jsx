import React, { useEffect, useState } from 'react';
import { GraduationCap, LayoutDashboard, LogIn, Menu, X } from 'lucide-react';
import { api, getSession, saveSession } from './api/client.js';
import { HomePage, AboutPage, QuizPage, SyllabusPage, PartnersPage, ContactPage } from './pages/PublicPages.jsx';
import { LoginPage, SignupPage, AdminLoginPage } from './pages/AuthPages.jsx';
import StudentPortal from './pages/StudentPortal.jsx';
import AdminPortal from './pages/AdminPortal.jsx';

export function go(path) { window.history.pushState({},'',path); window.dispatchEvent(new PopStateEvent('popstate')); window.scrollTo(0,0); }
export function Logo() { return <button className="logo" onClick={()=>go('/')}><span><GraduationCap size={20}/></span><strong>danistan<small>NETWORK</small></strong></button>; }
export default function App() {
  const [path,setPath]=useState(window.location.pathname); const [session,setSession]=useState(getSession()); const [publicData,setPublicData]=useState(null); const [menu,setMenu]=useState(false);
  useEffect(()=>{const listener=()=>setPath(window.location.pathname);window.addEventListener('popstate',listener);api('/api/public').then(setPublicData).catch(()=>{});return()=>window.removeEventListener('popstate',listener);},[]);
  const login=value=>{saveSession(value);setSession(value);go(value.role==='admin'?'/admin':'/student');};
  const logout=()=>{saveSession(null);setSession(null);go('/');};
  if(path.startsWith('/student')) return session?.role==='student'?<StudentPortal session={session} setSession={value=>{saveSession(value);setSession(value);}} onLogout={logout}/>:<LoginPage onLogin={login}/>;
  if(path==='/admin'||path.startsWith('/admin/portal')) return session?.role==='admin'?<AdminPortal onLogout={logout}/>:<AdminLoginPage onLogin={login}/>;
  if(path==='/login') return <LoginPage onLogin={login}/>;
  if(path==='/signup') return <SignupPage onLogin={login}/>;
  if(path==='/admin/login') return <AdminLoginPage onLogin={login}/>;
  const Page={ '/':HomePage,'/about':AboutPage,'/quizzes':QuizPage,'/syllabus':SyllabusPage,'/partners':PartnersPage,'/contact':ContactPage }[path]||HomePage;
  return <div><header className="public-header"><Logo/><nav className={menu?'open':''}>{[['Home','/'],['About','/about'],['Quizzes','/quizzes'],['Syllabus','/syllabus'],['Privileges','/partners'],['Contact','/contact']].map(([label,url])=><button className={path===url?'active':''} key={url} onClick={()=>{go(url);setMenu(false)}}>{label}</button>)}</nav><div className="header-actions"><button className="button secondary" onClick={()=>go('/admin/login')}><LayoutDashboard size={16}/>Admin</button><button className="button secondary" onClick={()=>go('/login')}><LogIn size={16}/>Login</button><button className="button primary" onClick={()=>go('/signup')}>Sign up</button></div><button className="icon-button menu-toggle" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></header><Page data={publicData}/><footer><div><Logo/><p>{publicData?.settings?.about_text}</p></div><div><strong>Explore</strong><button onClick={()=>go('/about')}>About us</button><button onClick={()=>go('/syllabus')}>Syllabus</button><button onClick={()=>go('/partners')}>Privileges</button></div><div><strong>Contact</strong><span>hello@danistan.network</span><span>+92 300 123 4567</span><span>Mon - Sat, 9am - 6pm</span></div><div className="footer-wide">© 2026 Danistan Network <span>Privacy Policy</span><span>Terms & Conditions</span></div></footer></div>;
}
