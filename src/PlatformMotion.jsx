"use client";
import React,{useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {animate,LazyMotion,domAnimation,MotionConfig,m,useReducedMotion} from 'motion/react';

export const motionTokens={duration:{instant:.08,fast:.18,normal:.35,slow:.6},easing:{smooth:[.22,1,.36,1]},distance:{xs:4,sm:8},scale:{subtle:.98,press:.97,pop:1.02}};
export const springs={snappy:{type:'spring',stiffness:300,damping:30},gentle:{type:'spring',stiffness:120,damping:20},bouncy:{type:'spring',stiffness:400,damping:18},instant:{type:'spring',stiffness:600,damping:35},release:{type:'spring',stiffness:200,damping:20,restDelta:.001}};
export function shouldAnimate(reduced,essential=false){return !reduced&&(essential||typeof navigator==='undefined'||navigator.hardwareConcurrency>4)}

export function MotionFeedback({children}){
  const reduced=useReducedMotion();const {pathname}=useLocation();
  useEffect(()=>{
    if(!shouldAnimate(reduced))return;
    const controls=[];const nodes=document.querySelectorAll('.appMain>.pageHeader,.appMain>.stats,.appMain>.panel,.appMain>.diagnosisHero,.appMain>.findingGrid,.onboardBody,.authForm>form,.homeMain>section,.heroCopy,.heroSignup');
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;observer.unobserve(entry.target);controls.push(animate(entry.target,{opacity:[.65,1],y:[motionTokens.distance.sm,0]},{duration:motionTokens.duration.normal,ease:motionTokens.easing.smooth}));}),{threshold:.08});
    nodes.forEach(node=>observer.observe(node));
    return()=>{observer.disconnect();controls.forEach(c=>c.stop());nodes.forEach(n=>{n.style.removeProperty('transform');n.style.removeProperty('opacity')})};
  },[pathname,reduced]);
  return <MotionConfig reducedMotion="user"><LazyMotion features={domAnimation}>{children}</LazyMotion></MotionConfig>;
}

export function AnimatedPreview({children,previewKey}){
  const reduced=useReducedMotion();
  return <m.div className="animatedPreview" key={previewKey} initial={false} animate={shouldAnimate(reduced,true)?{opacity:[.65,1],y:[motionTokens.distance.xs,0]}:{opacity:1,y:0}} transition={{duration:motionTokens.duration.fast,ease:motionTokens.easing.smooth}}>{children}</m.div>;
}
